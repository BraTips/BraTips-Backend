import crypto from "crypto";
import { EmailSettings } from "../models/EmailSettings";
import { env } from "../config/env";

const CLOUDFLARE_SEND_URL = () => `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/email/sending/send`;
const LOGO_URL = process.env.EMAIL_LOGO_URL || `${env.WEB_URL.replace(/\/$/, "")}/logo.svg`;

const key = () => crypto.createHash("sha256").update(env.EMAIL_CONFIG_ENCRYPTION_KEY || env.JWT_ACCESS_SECRET).digest();
function encrypt(value:string){ const iv=crypto.randomBytes(12); const c=crypto.createCipheriv("aes-256-gcm",key(),iv); const enc=Buffer.concat([c.update(value,"utf8"),c.final()]); return [iv.toString("base64"),c.getAuthTag().toString("base64"),enc.toString("base64")].join("."); }
function decrypt(value:string){ const [iv,tag,data]=value.split("."); const d=crypto.createDecipheriv("aes-256-gcm",key(),Buffer.from(iv,"base64")); d.setAuthTag(Buffer.from(tag,"base64")); return Buffer.concat([d.update(Buffer.from(data,"base64")),d.final()]).toString("utf8"); }
const esc=(v:string)=>v.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/\"/g,"&quot;");
const textFromHtml=(html:string)=>html.replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/\s+/g," ").trim();

export async function getEmailSettings(){
  const s=await EmailSettings.findOne().lean();
  if(!s) return {enabled:false,host:"api.cloudflare.com",port:443,secure:true,username:"api_token",fromEmail:"",fromName:"BraTipsters",hasPassword:false,provider:"cloudflare_rest"};
  return {enabled:s.enabled,host:"api.cloudflare.com",port:443,secure:true,username:"api_token",fromEmail:s.fromEmail,fromName:s.fromName,hasPassword:Boolean(s.passwordEncrypted),provider:"cloudflare_rest"};
}

export async function saveEmailSettings(input:{enabled:boolean;host?:string;port?:number;secure?:boolean;username?:string;password?:string;fromEmail:string;fromName:string}){
  const existing=await EmailSettings.findOne();
  const update:any={enabled:input.enabled,host:"api.cloudflare.com",port:443,secure:true,username:"api_token",fromEmail:input.fromEmail.trim().toLowerCase(),fromName:input.fromName.trim()};
  if(input.password) update.passwordEncrypted=encrypt(input.password.trim());
  if(!existing && !input.password) throw new Error("Cloudflare API token is required for the first configuration");
  await EmailSettings.findOneAndUpdate({},update,{upsert:true,new:true,setDefaultsOnInsert:true});
  return getEmailSettings();
}

export async function verifyEmailConfiguration(){
  const s=await EmailSettings.findOne().lean();
  if(!s?.enabled) return {ok:false,reason:"Email sending is disabled in Admin → Settings → Email Configuration."};
  if(!s.fromEmail||!s.passwordEncrypted) return {ok:false,reason:"Email configuration is incomplete. Sender email and Cloudflare API token are required."};
  if(!env.CLOUDFLARE_ACCOUNT_ID) return {ok:false,reason:"CLOUDFLARE_ACCOUNT_ID is missing from the backend environment."};
  try{decrypt(s.passwordEncrypted);}catch{return {ok:false,reason:"The saved Cloudflare API token cannot be decrypted. Re-enter the token and save the configuration again."};}
  return {ok:true};
}

async function cloudflareSend(to:string,subject:string,html:string,text:string){
  const check=await verifyEmailConfiguration();
  if(!check.ok) throw new Error(check.reason);
  const s=await EmailSettings.findOne().lean();
  if(!s) throw new Error("Email configuration not found");
  const token=decrypt(s.passwordEncrypted);
  const response=await fetch(CLOUDFLARE_SEND_URL(),{
    method:"POST",
    headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},
    body:JSON.stringify({
      to,
      from:{address:s.fromEmail,name:s.fromName || "BraTipsters"},
      subject,
      html,
      text
    })
  });
  const body:any=await response.json().catch(()=>null);
  if(!response.ok || body?.success===false){
    const details=(body?.errors||body?.messages||[]).map((x:any)=>`${x.code??""} ${x.message??""}`.trim()).join("; ");
    throw new Error(`Cloudflare Email API rejected the email (${response.status})${details?`: ${details}`:""}`);
  }
  return body?.result || true;
}

export async function sendEmail(to:string,subject:string,html:string,text?:string){
  try{return await cloudflareSend(to,subject,html,text||textFromHtml(html));}
  catch(e){console.error("Email send failed:",e);return false;}
}

const shell=(title:string,content:string)=>`<!doctype html><html><body style="margin:0;padding:0;background:#f3f5f8;font-family:Arial,Helvetica,sans-serif;color:#172033"><div style="padding:36px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e6e9ef;border-radius:16px;overflow:hidden"><tr><td style="background:#07101f;padding:26px 32px;text-align:left"><a href="${esc(env.WEB_URL)}" style="text-decoration:none"><img src="${esc(LOGO_URL)}" width="230" alt="BraTipsters" style="display:block;width:230px;max-width:100%;height:auto;border:0"></a></td></tr><tr><td style="height:4px;background:linear-gradient(90deg,#ff4f82,#d91652)"></td></tr><tr><td style="padding:38px 36px 30px"><div style="font-size:12px;line-height:18px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:#d91652;margin-bottom:10px">BraTipsters</div><h1 style="font-size:28px;line-height:36px;color:#111827;margin:0 0 20px">${title}</h1>${content}<div style="margin-top:32px;padding-top:22px;border-top:1px solid #edf0f4;color:#667085;font-size:13px;line-height:20px"><strong style="color:#172033">BraTipsters</strong><br>Professional football tips, tipsters and match intelligence.</div></td></tr><tr><td style="background:#f8f9fb;padding:20px 36px;color:#7a8495;font-size:11px;line-height:18px">Betting involves risk. 18+ only where legally permitted. Please bet responsibly.<br><a href="${esc(env.WEB_URL)}" style="color:#596579;text-decoration:underline">Visit BraTipsters</a></td></tr></table><div style="max-width:680px;margin:14px auto 0;text-align:center;color:#98a2b3;font-size:11px">This is an automated message from BraTipsters. Please do not reply unless the message instructs you to.</div></div></body></html>`;

export async function sendWelcomeEmail(to:string,name:string){return sendEmail(to,"Welcome to BraTipsters",shell("Welcome to BraTipsters",`<p style="font-size:16px;line-height:26px;margin:0 0 16px">Hi ${esc(name)},</p><p style="font-size:15px;line-height:25px;color:#475467;margin:0 0 16px">Your account has been created successfully. Welcome to BraTipsters.</p><p style="font-size:15px;line-height:25px;color:#475467;margin:0">Explore football tips, trusted tipsters, match intelligence and transparent results tracking.</p>`));}
export async function sendTipsterApplicationSubmittedEmail(to:string,name:string){return sendEmail(to,"BraTipsters tipster application received",shell("Application received",`<p style="font-size:16px;line-height:26px;margin:0 0 16px">Hi ${esc(name)},</p><p style="font-size:15px;line-height:25px;color:#475467">We received your tipster application and it is now <strong style="color:#172033">pending review</strong>.</p><p style="font-size:15px;line-height:25px;color:#475467">Our team will review your profile and sample prediction. You will receive another email when the status changes.</p>`));}
export async function sendTipsterApplicationEmail(to:string,name:string,status:string,notes?:string){const label=status.replace(/_/g," ");return sendEmail(to,`BraTipsters tipster application: ${label}`,shell("Tipster application update",`<p style="font-size:16px;line-height:26px;margin:0 0 16px">Hi ${esc(name)},</p><p style="font-size:15px;line-height:25px;color:#475467">Your application status is now <strong style="color:#172033">${esc(label)}</strong>.</p>${notes?`<div style="margin:22px 0;padding:16px 18px;background:#f7f8fa;border-left:4px solid #d91652"><strong>Admin note</strong><p style="margin:7px 0 0;color:#475467;line-height:23px">${esc(notes)}</p></div>`:""}<p style="font-size:15px;line-height:25px;color:#475467">Please sign in to BraTipsters to review your account.</p>`));}
export async function sendWithdrawalEmail(to:string,name:string,status:string,amount:number){return sendEmail(to,"BraTipsters withdrawal update",shell("Withdrawal update",`<p style="font-size:16px;line-height:26px;margin:0 0 16px">Hi ${esc(name)},</p><p style="font-size:15px;line-height:25px;color:#475467">Your withdrawal request for <strong style="color:#172033">GHS ${amount.toFixed(2)}</strong> is now <strong style="color:#172033">${esc(status)}</strong>.</p><p style="font-size:15px;line-height:25px;color:#475467">Approved payouts are processed manually within 1–3 business days.</p>`));}
export async function sendTestEmail(to:string){return cloudflareSend(to,"BraTipsters email configuration test",shell("Email configuration works",`<p style="font-size:15px;line-height:25px;color:#475467">This is a test message from BraTipsters.</p><p style="font-size:15px;line-height:25px;color:#475467">Your Cloudflare Email Service configuration is working correctly.</p>`),"This is a test message from BraTipsters. Your Cloudflare Email Service configuration is working correctly.");}
