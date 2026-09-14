import net from "net";
import tls from "tls";
import crypto from "crypto";
import { EmailSettings } from "../models/EmailSettings";
import { env } from "../config/env";

const key = () => crypto.createHash("sha256").update(env.EMAIL_CONFIG_ENCRYPTION_KEY || env.JWT_ACCESS_SECRET).digest();
function encrypt(value:string){ const iv=crypto.randomBytes(12); const c=crypto.createCipheriv("aes-256-gcm",key(),iv); const enc=Buffer.concat([c.update(value,"utf8"),c.final()]); return [iv.toString("base64"),c.getAuthTag().toString("base64"),enc.toString("base64")].join("."); }
function decrypt(value:string){ const [iv,tag,data]=value.split("."); const d=crypto.createDecipheriv("aes-256-gcm",key(),Buffer.from(iv,"base64")); d.setAuthTag(Buffer.from(tag,"base64")); return Buffer.concat([d.update(Buffer.from(data,"base64")),d.final()]).toString("utf8"); }
const esc=(v:string)=>v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

export async function getEmailSettings(){ const s=await EmailSettings.findOne().lean(); if(!s) return {enabled:false,host:"",port:587,secure:false,username:"",fromEmail:"",fromName:"BraTipsters",hasPassword:false}; return {enabled:s.enabled,host:s.host,port:s.port,secure:s.secure,username:s.username,fromEmail:s.fromEmail,fromName:s.fromName,hasPassword:Boolean(s.passwordEncrypted)}; }
export async function saveEmailSettings(input:{enabled:boolean;host:string;port:number;secure:boolean;username:string;password?:string;fromEmail:string;fromName:string}){
  const existing=await EmailSettings.findOne(); const host=input.host.trim() || "smtp.mx.cloudflare.net";
  const port=input.port || 465;
  const secure=host === "smtp.mx.cloudflare.net" ? true : (input.secure ?? true);
  const username=input.username.trim() || (host === "smtp.mx.cloudflare.net" ? "api_token" : "");
  const update:any={enabled:input.enabled,host,port,secure,username,fromEmail:input.fromEmail.trim().toLowerCase(),fromName:input.fromName.trim()};
  if(input.password) update.passwordEncrypted=encrypt(input.password);
  if(!existing && !input.password) throw new Error("SMTP password is required for the first configuration");
  await EmailSettings.findOneAndUpdate({},update,{upsert:true,new:true,setDefaultsOnInsert:true}); return getEmailSettings();
}

type Socket=net.Socket|tls.TLSSocket;
class SMTPClient{
  socket!:Socket; buffer="";
  constructor(private host:string,private port:number,private useTls:boolean){}
  waitCode(expected:number[]){
    return new Promise<string>((resolve,reject)=>{
      const check=()=>{
        const lines=this.buffer.split("\r\n");
        for(let i=0;i<lines.length;i++){
          const line=lines[i];
          if(/^\d{3} /.test(line)){
            const code=Number(line.slice(0,3));
            this.buffer=lines.slice(i+1).join("\r\n");
            cleanup();
            if(expected.includes(code)) resolve(line); else reject(new Error(`SMTP ${line}`));
            return;
          }
        }
      };
      const onData=(d:Buffer)=>{this.buffer+=d.toString();check();};
      const onError=(e:Error)=>{cleanup();reject(e);};
      const cleanup=()=>{this.socket.off("data",onData);this.socket.off("error",onError);};
      this.socket.on("data",onData); this.socket.once("error",onError); check();
    });
  }
  command(cmd:string,codes:number[]){this.socket.write(cmd+"\r\n");return this.waitCode(codes);}
  async startTls(){await this.command("STARTTLS",[220]); const old=this.socket; const secure=tls.connect({socket:old,host:this.host,servername:this.host}); this.socket=secure; await new Promise<void>((resolve,reject)=>{secure.once("secureConnect",()=>resolve());secure.once("error",reject);}); this.buffer=""; await this.command("EHLO bratipsters.com",[250]);}
  async auth(username:string,password:string){await this.command("AUTH LOGIN",[334]);await this.command(Buffer.from(username).toString("base64"),[334]);await this.command(Buffer.from(password).toString("base64"),[235]);}
  close(){this.socket?.end();}
}

async function smtpSend(to:string,subject:string,html:string,text:string){
  const s=await EmailSettings.findOne().lean();
  if(!s?.enabled||!s.host||!s.passwordEncrypted||!s.fromEmail) return false;
  const password=decrypt(s.passwordEncrypted); const client=new SMTPClient(s.host,s.port,s.secure);
  client.socket=s.secure?tls.connect({host:s.host,port:s.port,servername:s.host}):net.createConnection({host:s.host,port:s.port});
  await new Promise<void>((resolve,reject)=>{let done=false;const ok=()=>{if(!done){done=true;resolve();}};client.socket.once('connect',ok);client.socket.once('secureConnect',ok);client.socket.once('error',reject);});
  await client.waitCode([220]); await client.command('EHLO bratipsters.com',[250]);
  if(!s.secure) await client.startTls();
  await client.auth(s.username || (s.host === "smtp.mx.cloudflare.net" ? "api_token" : ""),password);
  await client.command(`MAIL FROM:<${s.fromEmail}>`,[250]); await client.command(`RCPT TO:<${to}>`,[250,251]); await client.command('DATA',[354]);
  const body=[`From: ${s.fromName} <${s.fromEmail}>`,`To: ${to}`,`Subject: ${subject}`,`MIME-Version: 1.0`,`Content-Type: text/html; charset=UTF-8`,`Content-Transfer-Encoding: 8bit`,`Date: ${new Date().toUTCString()}`,'',html.replace(/^\./gm,'..'),''].join('\r\n')+'\r\n.'+'\r\n';
  client.socket.write(body); await client.waitCode([250]); await client.command('QUIT',[221]).catch(()=>{}); client.close(); return true;
}

export async function sendEmail(to:string,subject:string,html:string,text?:string){ try{return await smtpSend(to,subject,html,text||html.replace(/<[^>]+>/g,' '));}catch(e){console.error('Email send failed:',e);return false;} }
const shell=(title:string,content:string)=>`<div style="font-family:Arial,Helvetica,sans-serif;background:#f5f6f8;padding:32px"><div style="max-width:640px;margin:auto;background:#fff;border:1px solid #e7e7e7;border-radius:12px;overflow:hidden"><div style="padding:22px 26px;background:#000;color:#fff"><strong style="font-size:22px">BraTipsters</strong></div><div style="padding:28px"><h1 style="font-size:24px;color:#111;margin:0 0 18px">${title}</h1>${content}<p style="color:#777;font-size:12px;margin-top:28px">Betting involves risk. 18+ only where legally permitted. Please bet responsibly.</p></div></div></div>`;
export async function sendWelcomeEmail(to:string,name:string){return sendEmail(to,'Welcome to BraTipsters',shell('Welcome to BraTipsters',`<p>Hi ${esc(name)},</p><p>Your account has been created successfully. Welcome to BraTipsters.</p><p>You can now explore football tips, tipsters, match intelligence and transparent results tracking.</p>`));}
export async function sendTipsterApplicationSubmittedEmail(to:string,name:string){return sendEmail(to,'BraTipsters tipster application received',shell('Application received',`<p>Hi ${esc(name)},</p><p>We received your tipster application and it is now <strong>pending review</strong>.</p><p>Our team will review your profile and sample prediction. You will receive an email when the status changes.</p>`));}
export async function sendTipsterApplicationEmail(to:string,name:string,status:string,notes?:string){const label=status.replace('_',' ');return sendEmail(to,`BraTipsters tipster application: ${label}`,shell('Tipster application update',`<p>Hi ${esc(name)},</p><p>Your application status is now <strong>${esc(label)}</strong>.</p>${notes?`<p><strong>Admin note:</strong> ${esc(notes)}</p>`:''}<p>Please sign in to BraTipsters to review your account.</p>`));}
export async function sendWithdrawalEmail(to:string,name:string,status:string,amount:number){return sendEmail(to,'BraTipsters withdrawal update',shell('Withdrawal update',`<p>Hi ${esc(name)},</p><p>Your withdrawal request for <strong>GHS ${amount.toFixed(2)}</strong> is now <strong>${esc(status)}</strong>.</p><p>Approved payouts are processed manually within 1–3 business days.</p>`));}
export async function sendTestEmail(to:string){return sendEmail(to,'BraTipsters email configuration test',shell('Email configuration works',`<p>This is a test message from BraTipsters.</p><p>Your outbound email configuration is working correctly.</p>`));}
