import crypto from "crypto";
import { EmailSettings } from "../models/EmailSettings";
import { env } from "../config/env";

const key = () => crypto.createHash("sha256").update(env.EMAIL_CONFIG_ENCRYPTION_KEY || env.JWT_ACCESS_SECRET).digest();
function encrypt(value:string){ const iv=crypto.randomBytes(12); const c=crypto.createCipheriv("aes-256-gcm",key(),iv); const enc=Buffer.concat([c.update(value,"utf8"),c.final()]); return [iv.toString("base64"),c.getAuthTag().toString("base64"),enc.toString("base64")].join("."); }
function decrypt(value:string){ const [iv,tag,data]=value.split("."); const d=crypto.createDecipheriv("aes-256-gcm",key(),Buffer.from(iv,"base64")); d.setAuthTag(Buffer.from(tag,"base64")); return Buffer.concat([d.update(Buffer.from(data,"base64")),d.final()]).toString("utf8"); }
const esc=(v:string)=>v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");

export async function getEmailSettings(){
  const s=await EmailSettings.findOne().lean();
  if(!s) return {
    enabled:false,
    provider:"cloudflare_rest",
    host:"api.cloudflare.com",
    port:443,
    secure:true,
    username:"Bearer API token",
    fromEmail:"",
    fromName:"BraTipsters",
    hasPassword:false,
    hasAccountId:Boolean(env.CLOUDFLARE_ACCOUNT_ID)
  };
  return {
    enabled:s.enabled,
    provider:"cloudflare_rest",
    host:"api.cloudflare.com",
    port:443,
    secure:true,
    username:"Bearer API token",
    fromEmail:s.fromEmail,
    fromName:s.fromName,
    hasPassword:Boolean(s.passwordEncrypted),
    hasAccountId:Boolean(env.CLOUDFLARE_ACCOUNT_ID)
  };
}

export async function saveEmailSettings(input:{enabled:boolean;host?:string;port?:number;secure?:boolean;username?:string;password?:string;fromEmail:string;fromName:string}){
  const existing=await EmailSettings.findOne();
  const update:any={
    enabled:input.enabled,
    // These fields are retained for compatibility with the existing Admin UI.
    // Cloudflare REST API does not use SMTP host/port/username.
    host:"api.cloudflare.com",
    port:443,
    secure:true,
    username:"Bearer API token",
    fromEmail:input.fromEmail.trim().toLowerCase(),
    fromName:input.fromName.trim()
  };
  if(input.password) update.passwordEncrypted=encrypt(input.password);
  if(!existing && !input.password) throw new Error("Cloudflare API token is required for the first configuration");
  if(input.enabled && !env.CLOUDFLARE_ACCOUNT_ID) throw new Error("CLOUDFLARE_ACCOUNT_ID is not configured on the backend");
  await EmailSettings.findOneAndUpdate({},update,{upsert:true,new:true,setDefaultsOnInsert:true});
  return getEmailSettings();
}

export async function verifyEmailConfiguration(){
  const s=await EmailSettings.findOne().lean();
  if(!s?.enabled) return {ok:false,reason:"Email sending is disabled in Admin → Settings → Email Configuration."};
  if(!s.fromEmail||!s.passwordEncrypted) return {ok:false,reason:"Email configuration is incomplete. A sender email and Cloudflare API token are required."};
  if(!env.CLOUDFLARE_ACCOUNT_ID) return {ok:false,reason:"Cloudflare REST email sending requires CLOUDFLARE_ACCOUNT_ID on the backend."};
  try{decrypt(s.passwordEncrypted);}catch{return {ok:false,reason:"The saved Cloudflare API token cannot be decrypted. Re-enter the token and save the configuration again."};}
  return {ok:true};
}

async function cloudflareSend(to:string,subject:string,html:string,text:string){
  const check=await verifyEmailConfiguration();
  if(!check.ok) throw new Error(check.reason);
  const s=await EmailSettings.findOne().lean();
  if(!s) throw new Error("Email configuration not found");

  const token=decrypt(s.passwordEncrypted);
  const endpoint=`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(env.CLOUDFLARE_ACCOUNT_ID!)}/email/sending/send`;
  const response=await fetch(endpoint,{
    method:"POST",
    headers:{
      Authorization:`Bearer ${token}`,
      "Content-Type":"application/json"
    },
    body:JSON.stringify({
      to,
      from:{address:s.fromEmail,name:s.fromName},
      subject,
      html,
      text
    })
  });

  let body:any=null;
  try{body=await response.json();}catch{body=null;}
  if(!response.ok || body?.success===false){
    const errors=Array.isArray(body?.errors)?body.errors.map((e:any)=>`${e?.code??"unknown"}: ${e?.message??"Unknown Cloudflare error"}`).join("; "):"No Cloudflare error details returned";
    throw new Error(`Cloudflare Email REST API rejected the email (HTTP ${response.status}). ${errors}`);
  }
  const result=body?.result;
  if(!result) throw new Error("Cloudflare Email REST API returned an unexpected response.");
  if(Array.isArray(result.permanent_bounces) && result.permanent_bounces.length){
    throw new Error(`Cloudflare permanently bounced the recipient: ${result.permanent_bounces.join(", ")}`);
  }
  return result;
}

export async function sendEmail(to:string,subject:string,html:string,text?:string){
  try{return await cloudflareSend(to,subject,html,text||html.replace(/<[^>]+>/g,' '));}
  catch(e){console.error('Email send failed:',e);return false;}
}

const shell=(title:string,content:string)=>`<div style="font-family:Arial,Helvetica,sans-serif;background:#f5f6f8;padding:32px"><div style="max-width:640px;margin:auto;background:#fff;border:1px solid #e7e7e7;border-radius:12px;overflow:hidden"><div style="padding:22px 26px;background:#000;color:#fff"><strong style="font-size:22px">BraTipsters</strong></div><div style="padding:28px"><h1 style="font-size:24px;color:#111;margin:0 0 18px">${title}</h1>${content}<p style="color:#777;font-size:12px;margin-top:28px">Betting involves risk. 18+ only where legally permitted. Please bet responsibly.</p></div></div></div>`;
export async function sendWelcomeEmail(to:string,name:string){return sendEmail(to,'Welcome to BraTipsters',shell('Welcome to BraTipsters',`<p>Hi ${esc(name)},</p><p>Your account has been created successfully. Welcome to BraTipsters.</p><p>You can now explore football tips, tipsters, match intelligence and transparent results tracking.</p>`));}
export async function sendTipsterApplicationSubmittedEmail(to:string,name:string){return sendEmail(to,'BraTipsters tipster application received',shell('Application received',`<p>Hi ${esc(name)},</p><p>We received your tipster application and it is now <strong>pending review</strong>.</p><p>Our team will review your profile and sample prediction. You will receive an email when the status changes.</p>`));}
export async function sendTipsterApplicationEmail(to:string,name:string,status:string,notes?:string){const label=status.replace('_',' ');return sendEmail(to,`BraTipsters tipster application: ${label}`,shell('Tipster application update',`<p>Hi ${esc(name)},</p><p>Your application status is now <strong>${esc(label)}</strong>.</p>${notes?`<p><strong>Admin note:</strong> ${esc(notes)}</p>`:''}<p>Please sign in to BraTipsters to review your account.</p>`));}
export async function sendWithdrawalEmail(to:string,name:string,status:string,amount:number){return sendEmail(to,'BraTipsters withdrawal update',shell('Withdrawal update',`<p>Hi ${esc(name)},</p><p>Your withdrawal request for <strong>GHS ${amount.toFixed(2)}</strong> is now <strong>${esc(status)}</strong>.</p><p>Approved payouts are processed manually within 1–3 business days.</p>`));}
export async function sendTestEmail(to:string){return cloudflareSend(to,'BraTipsters email configuration test',shell('Email configuration works',`<p>This is a test message from BraTipsters.</p><p>Your outbound email configuration is working correctly.</p>`),'This is a test message from BraTipsters. Your outbound email configuration is working correctly.');}
