const O="LunOS-Official",R="lunos-apps",MAX=25*1024*1024;
// The browser builds/saves locally; this worker handles Store publication only.
// Older clients can keep omitting all Lunite-specific optional metadata.
const PACK_KINDS=Object.freeze({theme:".zip",wallpaper:".zip","live-wallpaper":".zip",icon:".zip",font:".zip",cursor:".zip",sound:".zip"});
const LUNITE_CAPABILITIES=Object.freeze({schema:1,client:"Lunite",projectTypes:["gui","theme","cli","wallpaper","live-wallpaper","icon","font","cursor","widget","sound","runtime"],resourceTypes:Object.keys(PACK_KINDS),packageTypes:{resources:"zip",applications:"ln"},maxPackageBytes:MAX,font:{blendPercent:[0,100],intermediateRendering:"outline-v1",fallback:"static-outline",legacyIntermediateRendering:"COLR-v1",legacyFallback:"dominant-outline",colorModes:["monochrome","color","fixed"]},developerAPI:{filesSave:true,minVersion:"1.9",destination:"client-side LunOS picker"}});

const C=(env,req)=>{
  const o=req?.headers.get("Origin")||"";
  const hasPolicy=!!(env?.APP_ORIGIN||env?.APP_ALLOWED_ORIGINS);
  let allowOrigin="*";
  if(hasPolicy){
    const matched=o?allowedReturn(o,env):"";
    allowOrigin=matched||(env?.APP_ORIGIN?allowedReturn(env.APP_ORIGIN,env):"");
  }else if(o){
    allowOrigin=o;
  }
  const h={"Access-Control-Allow-Methods":"GET,POST,PATCH,DELETE,OPTIONS","Access-Control-Allow-Headers":"Content-Type,Authorization","Vary":"Origin"};
  if(allowOrigin)h["Access-Control-Allow-Origin"]=allowOrigin;
  return h;
};
const J=(x,s=200,env,req)=>new Response(JSON.stringify(x,null,2),{status:s,headers:{"Content-Type":"application/json",...C(env,req)}});
const H=t=>({Accept:"application/vnd.github+json",Authorization:`Bearer ${t}`,"X-GitHub-Api-Version":"2022-11-28","User-Agent":"LunOS-Publisher"});
async function gh(t,p,o={}){const r=await fetch("https://api.github.com"+p,{...o,headers:{...H(t),...(o.headers||{})}}),s=await r.text();let x;try{x=JSON.parse(s)}catch{x={message:s}}if(!r.ok)throw Error((x.message||`GitHub HTTP ${r.status}`)+` (HTTP ${r.status})`);return x}
function b64(a){let s="",u=new Uint8Array(a);for(let i=0;i<u.length;i+=32768)s+=String.fromCharCode(...u.subarray(i,i+32768));return btoa(s)}
function u64(s){const x=atob(s.replace(/\n/g,"")),u=new Uint8Array(x.length);for(let i=0;i<u.length;i++)u[i]=x.charCodeAt(i);return u.buffer}
function id(x){return typeof x==="string"&&/^[a-z0-9][a-z0-9._-]{1,63}$/.test(x)}
function ver(x){return typeof x==="string"&&/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(x)}
function vc(v){return String(v||"0").split("-")[0].split(".").map(x=>parseInt(x,10)||0)}
function cmp(a,b){a=vc(a);b=vc(b);for(let i=0;i<3;i++)if(a[i]!==b[i])return a[i]-b[i];return 0}
const hex=a=>[...new Uint8Array(a)].map(x=>x.toString(16).padStart(2,"0")).join("");
const hexBytes=s=>{if(typeof s!=="string"||s.length%2)return new Uint8Array(0);const out=new Uint8Array(s.length/2);for(let i=0;i<out.length;i++){const n=parseInt(s.slice(i*2,i*2+2),16);if(Number.isNaN(n))return new Uint8Array(0);out[i]=n}return out};
async function key(env){return crypto.subtle.importKey("raw",new TextEncoder().encode(env.SESSION_SECRET),{name:"HMAC",hash:"SHA-256"},false,["sign","verify"])}
async function mac(s,env){return hex(await crypto.subtle.sign("HMAC",await key(env),new TextEncoder().encode(s)))}
function slug(email){return (email.split("@")[0]||"developer").toLowerCase().replace(/[^a-z0-9_-]/g,"-").slice(0,48)||"developer"}
const isLunIdSession=u=>String(u?.sub||'').startsWith('lunid:')||/@lunos$/i.test(u?.email||'');
function developerId(u,env){if(env.OWNER_GOOGLE_EMAIL&&env.OWNER_DEVELOPER_ID&&u.email.toLowerCase()===env.OWNER_GOOGLE_EMAIL.toLowerCase())return env.OWNER_DEVELOPER_ID;const base=slug(u.email);return isLunIdSession(u)?("lunid-"+base).slice(0,48):base}
async function ownerKeyOf(u,env){return u?.sub&&env?.SESSION_SECRET?(await mac("publisher-owner:"+String(u.sub),env)).slice(0,24):""}
function accountLogin(u){return String(u?.email||u?.lunid||u?.username||u?.sub||"developer").trim().toLowerCase()}
const GENERIC_PUBLISHER_NAMES=new Set(["lunos","lunos official","official lunos","lunos project","lunos developer","lunos developer team","developer"]);
function safePublisherName(...values){for(const value of values){const name=String(value||"").replace(/[\x00-\x1f\x7f]/g,"").trim().slice(0,120);if(!name)continue;const key=name.toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();if(!GENERIC_PUBLISHER_NAMES.has(key))return name}return ""}
function isOfficialAccount(u,env){const email=String(u?.email||"").trim().toLowerCase(),ownerEmail=String(env?.OWNER_GOOGLE_EMAIL||"").trim().toLowerCase(),ownerId=String(env?.OWNER_DEVELOPER_ID||"").trim().toLowerCase();return !!((email&&ownerEmail&&email===ownerEmail)||(ownerId&&developerId(u,env).toLowerCase()===ownerId))}
function accountPublisherName(u,env,...values){for(const value of values){const name=String(value||"").replace(/[\x00-\x1f\x7f]/g,"").trim().slice(0,120);if(!name)continue;const key=name.toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim();if(key==="lunos official"){if(isOfficialAccount(u,env))return "LunOS Official";continue}const safe=safePublisherName(name);if(safe)return safe}return ""}

const SESSION_TTL=604800000;
async function session(u,env,now=Date.now()){const p=b64(new TextEncoder().encode(JSON.stringify({sub:u.sub,email:u.email,name:u.name||"",pic:u.picture||"",iat:now,exp:now+SESSION_TTL})));return p+"."+await mac(p,env)}
const subjectKey=(subject,env)=>mac('account-revocation:'+subject,env);
async function user(req,env,strict=false){
  const a=req.headers.get("Authorization")||"";
  const raw=a.startsWith("Bearer ")?a.slice(7):"";
  if(!raw||!env.SESSION_SECRET)return null;
  const parts=raw.split('.');if(parts.length!==2)return null;
  const [p,s]=parts;
  try{
    if(!await crypto.subtle.verify('HMAC',await key(env),hexBytes(s),new TextEncoder().encode(p)))return null;
    const u=JSON.parse(new TextDecoder().decode(u64(p)));
    if(!u?.sub||!u?.email||!(u.exp>Date.now()))return null;
    let cutoff;
    try{cutoff=await sb(env,`account_session_revocations?subject_key=eq.${await subjectKey(u.sub,env)}&select=revoked_at`)}catch(error){
      if(strict)throw Object.assign(Error('Session verification unavailable'),{code:error.code,stage:'session'});
      return null;
    }
    if((u.iat??u.exp-SESSION_TTL)<=Number(cutoff?.[0]?.revoked_at||0))return null;
    return u;
  }catch(error){if(strict&&error.stage)throw error;return null}
}
function allowedReturn(value,env){
  try{
    const target=new URL(value);
    const allowed=[env.APP_ORIGIN,...String(env.APP_ALLOWED_ORIGINS||'').split(',')].filter(Boolean).map(x=>{try{return new URL(x.trim()).origin}catch{return ''}});
    return ['http:','https:'].includes(target.protocol)&&allowed.includes(target.origin)?target.origin:'';
  }catch{return ''}
}
async function authStart(req,env){
  if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET||!env.SESSION_SECRET)return J({error:'Google authentication is not configured'},503,env,req);
  const u=new URL(req.url),back=allowedReturn(u.searchParams.get('return_to')||env.APP_ORIGIN,env);
  if(!back)return J({error:'This LunOS origin is not configured for Google sign-in'},403,env,req);
  const redirect=env.GOOGLE_REDIRECT_URI||u.origin+'/auth/google/callback',state=crypto.randomUUID();
  const q=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:redirect,response_type:'code',scope:'openid email profile',state,access_type:'online',prompt:'select_account'});
  const h=new Headers({Location:'https://accounts.google.com/o/oauth2/v2/auth?'+q,'Cache-Control':'no-store'});
  h.append('Set-Cookie',`lunos_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);
  h.append('Set-Cookie',`lunos_oauth_return=${encodeURIComponent(back)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`);
  return new Response(null,{status:302,headers:h})
}
async function authCallback(req,env){
  const u=new URL(req.url),code=u.searchParams.get('code'),state=u.searchParams.get('state'),cookie=req.headers.get('Cookie')||'';
  const savedState=cookie.match(/lunos_oauth_state=([^;]+)/)?.[1],savedReturn=cookie.match(/lunos_oauth_return=([^;]+)/)?.[1];
  let back='';try{back=allowedReturn(decodeURIComponent(savedReturn||''),env)}catch{}
  if(!code||!state||savedState!==state||!back)return J({error:'Invalid OAuth state or return origin'},400,env,req);
  const redirect=env.GOOGLE_REDIRECT_URI||u.origin+'/auth/google/callback';
  const txReq=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:redirect,grant_type:'authorization_code'})});
  const tx=await txReq.json();if(!txReq.ok||!tx.access_token)return J({error:'Google token exchange failed'},502,env,req);
  const r=await fetch('https://openidconnect.googleapis.com/v1/userinfo',{headers:{Authorization:'Bearer '+tx.access_token}}),profile=await r.json();
  if(!r.ok||!profile.sub||!profile.email||profile.email_verified!==true)return J({error:'Google account verification failed'},502,env,req);
  const payload=JSON.stringify({type:'LunOS_AUTH_SESSION',token:await session(profile,env)}).replace(/</g,'\\u003c');
  const target=JSON.stringify(back).replace(/</g,'\\u003c');
  const html=`<!doctype html><meta charset="utf-8"><title>LunOS sign-in</title><p>Return to the LunOS window to finish signing in.</p><script>if(window.opener){window.opener.postMessage(${payload},${target});setTimeout(()=>window.close(),150)}</script>`;
  const h=new Headers({'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer'});
  for(const name of ['state','return','mode'])h.append('Set-Cookie',`lunos_oauth_${name}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`);
  return new Response(html,{headers:h})
}

// Stable account subject for LunOS Data authorization. The bearer is verified
// by the same session verifier as /api/me; display names and emails are not ACLs.
async function dataIdentity(req,env){
 const u=await user(req,env);if(!u||!u.sub)return J({authenticated:false},401,env,req);
 try{const profile=await sbProfile(env,u);if(!profile?.id||profile.is_banned)return J({authenticated:false},401,env,req);
 const digest=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("lunos-data-account-v1\0"+String(profile.id)));
 return J({authenticated:true,accountId:"acc_"+hex(digest).slice(0,32),name:String(u.name||"").slice(0,120)},200,env,req)}
 catch{return J({error:"Identity verification is unavailable"},503,env,req)}
}
// Publisher profile storage is shared by /api/me, PATCH /api/profile and upload.
// Prefer the explicitly bound D1 database; Supabase-only identity deployments use
// public.developers instead. A broken configured store never silently switches stores.
function profileStorageError(env,error){const d1=!!env.LUNOS_DB;return Object.assign(Error(d1?'Publisher profile storage is unavailable. Check the LUNOS_DB binding and apply the developers profile and 0004 publisher name reservation migrations.':'Publisher profile storage is unavailable. Configure SUPABASE_URL and SUPABASE_SERVICE_KEY, then run publisher-service/supabase/0002_publisher_profiles.sql and 0003_publisher_name_reservations.sql and deploy the updated Worker.'),{status:503,code:'PROFILE_STORAGE_UNAVAILABLE'})}
const OAUTH_STATE_COOKIE="lunos_oauth_state";
const OAUTH_RETURN_COOKIE="lunos_oauth_return";
function oauthCookie(req,name){const m=(req.headers.get("Cookie")||"").match(new RegExp("(?:^|;\\s*)"+name+"=([^;]+)"));return m?decodeURIComponent(m[1]):""}
function oauthStateCookie(v,max){return `${OAUTH_STATE_COOKIE}=${encodeURIComponent(v)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${max===undefined?600:max}`}
function oauthReturnCookie(v,max){return `${OAUTH_RETURN_COOKIE}=${encodeURIComponent(v)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${max===undefined?600:max}`}
function oauthClosePage(title,payload,targetOrigin){const safe=JSON.stringify(payload).replace(/</g,"\\u003c");const target=JSON.stringify(targetOrigin).replace(/</g,"\\u003c");const html=`<!doctype html><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>${title}</title><body style="font-family:system-ui;padding:24px"><p>${title}: connected. Closingâ€¦</p><script>const payload=${safe};if(window.opener){try{window.opener.postMessage(payload,${target})}catch(e){}setTimeout(()=>window.close(),120)}else{document.body.innerHTML="<p>Connected. You can close this window.</p>"}</script></body>`;const h=new Headers({"Content-Type":"text/html;charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer"});h.append("Set-Cookie",oauthStateCookie("",0));h.append("Set-Cookie",oauthReturnCookie("",0));return new Response(html,{status:200,headers:h})}
const OAUTH_PROVIDERS={
  google:{
    configured:env=>!!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET),
    redirect:(u,env)=>env.GOOGLE_REDIRECT_URI||u.origin+"/auth/google/callback",
    token:"https://oauth2.googleapis.com/token",
    authUrl:"https://accounts.google.com/o/oauth2/v2/auth",
    client:(env)=>({id:env.GOOGLE_CLIENT_ID,secret:env.GOOGLE_CLIENT_SECRET}),
    params:(env,redirect,state)=>new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:redirect,response_type:"code",scope:"https://www.googleapis.com/auth/drive.file",state,access_type:"offline",prompt:"consent select_account"}),
    statePrefix:"gdrive",message:"LunOS_GDRIVE_TOKEN",label:"Google Drive"
  },
  dropbox:{
    configured:env=>!!(env.DROPBOX_APP_KEY&&env.DROPBOX_APP_SECRET),
    redirect:(u,env)=>env.DROPBOX_REDIRECT_URI||u.origin+"/auth/dropbox/callback",
    token:"https://api.dropboxapi.com/oauth2/token",
    authUrl:"https://www.dropbox.com/oauth2/authorize",
    client:(env)=>({id:env.DROPBOX_APP_KEY,secret:env.DROPBOX_APP_SECRET}),
    params:(env,redirect,state)=>new URLSearchParams({client_id:env.DROPBOX_APP_KEY,redirect_uri:redirect,response_type:"code",state,token_access_type:"offline"}),
    message:"LunOS_DROPBOX_TOKEN",label:"Dropbox"
  }
};
function providerForState(state){const key=String(state||"").split(":")[0];if(key==="gdrive")return "google";return OAUTH_PROVIDERS[key]?key:""}
async function cloudOAuthStart(req,env,provider){
  const cfg=OAUTH_PROVIDERS[provider];
  if(!cfg||!cfg.configured(env))return J({error:(cfg?cfg.label:provider)+" OAuth is not configured on this service"},503,env,req);
  const u=new URL(req.url),back=allowedReturn(u.searchParams.get("return_to")||env.APP_ORIGIN,env);
  if(!back)return J({error:"This LunOS origin is not configured for cloud sign-in"},403,env,req);
  const prefix=cfg.statePrefix||provider,state=prefix+":"+crypto.randomUUID(),redirect=cfg.redirect(u,env);
  const h=new Headers({Location:cfg.authUrl+"?"+cfg.params(env,redirect,state),"Cache-Control":"no-store"});
  h.append("Set-Cookie",oauthStateCookie(state));
  h.append("Set-Cookie",oauthReturnCookie(back));
  return new Response(null,{status:302,headers:h});
}
async function cloudOAuthCallback(req,env){
  const u=new URL(req.url),code=u.searchParams.get("code"),state=u.searchParams.get("state")||"",provider=providerForState(state);
  const saved=oauthCookie(req,OAUTH_STATE_COOKIE),back=allowedReturn(oauthCookie(req,OAUTH_RETURN_COOKIE),env);
  if(!code||!state||!saved||saved!==state||!provider||!back)return J({error:"Invalid OAuth state or return origin",detail:"Restart the connection from LunOS."},400,env,req);
  const cfg=OAUTH_PROVIDERS[provider];
  if(!cfg.configured(env))return J({error:cfg.label+" OAuth is not configured"},503,env,req);
  const redirect=cfg.redirect(u,env),client=cfg.client(env);
  const tokenRes=await fetch(cfg.token,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:client.id,client_secret:client.secret,redirect_uri:redirect,grant_type:"authorization_code"})});
  const tx=await tokenRes.json().catch(()=>({}));
  if(!tokenRes.ok||!tx.access_token)return J({error:tx.error_description||tx.error||(cfg.label+" token exchange failed")},502,env,req);
  return oauthClosePage(cfg.label,{type:cfg.message,access_token:tx.access_token,expires_in:Number(tx.expires_in||3600),refresh_token:tx.refresh_token||""},back);
}
async function cloudOAuthRefresh(req,env){
  let body={};try{body=await req.json()}catch{}
  const provider=String(body.provider||""),refreshToken=String(body.refresh_token||"");
  const cfg=OAUTH_PROVIDERS[provider];
  if(!cfg)return J({error:"Unknown provider"},400,env,req);
  if(!cfg.configured(env))return J({error:cfg.label+" OAuth is not configured"},503,env,req);
  if(!refreshToken)return J({error:"refresh_token is required"},400,env,req);
  const client=cfg.client(env);
  const form=new URLSearchParams({grant_type:"refresh_token",refresh_token:refreshToken,client_id:client.id,client_secret:client.secret});
  const tokenRes=await fetch(cfg.token,{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:form});
  const tx=await tokenRes.json().catch(()=>({}));
  if(!tokenRes.ok||!tx.access_token)return J({error:tx.error_description||tx.error||"Token refresh failed"},401,env,req);
  return J({access_token:tx.access_token,expires_in:Number(tx.expires_in||3600),refresh_token:tx.refresh_token||refreshToken},200,env,req);
}
async function cloudOAuthStatus(req,env){
  const out={};
  for(const [name,cfg] of Object.entries(OAUTH_PROVIDERS))out[name]={configured:cfg.configured(env)};
  return J({providers:out},200,env,req);
}
async function readDeveloperProfile(u,env){try{if(env.LUNOS_DB)return await env.LUNOS_DB.prepare('SELECT display_name,company_name,updated_at FROM developers WHERE google_sub=?1').bind(u.sub).first()||{};const rows=await sb(env,`developers?google_sub=eq.${encodeURIComponent(u.sub)}&select=display_name,company_name,updated_at`);return rows?.[0]||{}}catch(error){throw profileStorageError(env,error)}}
function publisherNameKey(value){return String(value||'').normalize('NFKC').replace(/\s+/gu,' ').trim().toLowerCase()}
function nameTaken(){return Object.assign(Error('This publisher name is already taken. Choose a different name.'),{status:409,code:'PUBLISHER_NAME_TAKEN'})}
async function reserveD1PublisherName(env,u,name){const db=env.LUNOS_DB,k=publisherNameKey(name);if(!k)throw Error('Publisher name is required.');const prior=await db.prepare("SELECT google_sub,company_name FROM developers WHERE TRIM(company_name)<>''").all();for(const row of prior.results||[])if(row.google_sub!==u.sub&&publisherNameKey(row.company_name)===k)throw nameTaken();await db.prepare('INSERT INTO publisher_names (name_key,owner_subject,display_name,reserved_at) VALUES (?1,?2,?3,?4) ON CONFLICT(name_key) DO NOTHING').bind(k,u.sub,name,Date.now()).run();const booked=await db.prepare('SELECT owner_subject FROM publisher_names WHERE name_key=?1').bind(k).first();if(!booked||booked.owner_subject!==u.sub)throw nameTaken();}
async function verifiedPublisherName(u,env,data){const name=accountPublisherName(u,env,data.company_name);if(!name)throw Object.assign(Error('Set and verify your company / publisher name before publishing.'),{status:409,code:'PUBLISHER_NAME_REQUIRED'});if(env.LUNOS_DB)await reserveD1PublisherName(env,u,name);else{let owned;try{owned=await sb(env,'rpc/publisher_name_is_owned',{method:'POST',body:JSON.stringify({p_subject:u.sub,p_name:name})})}catch(error){throw profileStorageError(env,error)}if(owned!==true)throw Object.assign(Error('Your publisher name is not reserved to this account. Save your company profile before publishing.'),{status:409,code:'PUBLISHER_NAME_REQUIRED'})}return name;}
async function saveDeveloperProfile(u,env,patch){try{if(env.LUNOS_DB){await recordDeveloper(u,env);const old=await readDeveloperProfile(u,env);if(patch.company_name!==undefined){if(old.company_name)await reserveD1PublisherName(env,u,old.company_name);await reserveD1PublisherName(env,u,patch.company_name)}await env.LUNOS_DB.prepare('UPDATE developers SET display_name=?1,company_name=?2,updated_at=?3 WHERE google_sub=?4').bind(patch.display_name??old.display_name??u.name??'',patch.company_name??old.company_name??'',Date.now(),u.sub).run()}else{if(patch.company_name!==undefined){const ready=await sb(env,'rpc/publisher_name_policy_version',{method:'POST',body:'{}'});if(ready!==1)throw Error('Publisher name reservation policy is not installed.')}const rows=await sb(env,'developers?on_conflict=google_sub&select=display_name,company_name,updated_at',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:JSON.stringify({google_sub:u.sub,email:u.email||'',name:u.name||'',picture:u.picture||'',developer_id:developerId(u,env),updated_at:Date.now(),...patch})});if(!Array.isArray(rows)||!rows.length)throw Error('Profile write was not confirmed.')}const saved=await readDeveloperProfile(u,env);for(const [key,value]of Object.entries(patch))if(saved[key]!==value)throw Error('Profile read-back did not match the saved value.');return saved}catch(error){if(error.status===409||/PUBLISHER_NAME_TAKEN/.test(error.message||''))throw nameTaken();throw profileStorageError(env,error)}}

async function recordDeveloper(u,env){const db=env.LUNOS_DB;if(!db||!u?.sub)return;const dev=developerId(u,env);try{await db.prepare("INSERT INTO developers (google_sub,email,name,picture,developer_id,updated_at) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email,name=excluded.name,picture=excluded.picture,developer_id=excluded.developer_id,updated_at=excluded.updated_at").bind(u.sub,u.email,u.name||"",u.picture||"",dev,Date.now()).run()}catch(e){console.error("LunOS developer DB:",e)}}
async function profile(req,env){const u=await user(req,env);if(!u)return J({authenticated:false},401,env,req);await recordDeveloper(u,env);try{const p=await sbEnsureProfile(env,u);if(!p)return J({error:"Profile unavailable"},503,env,req);if(p.is_banned)return J({authenticated:false,error:"Account banned"},403,env,req);let row={},storageError=null;try{row=await readDeveloperProfile(u,env)}catch(error){storageError=error}const displayName=String(row.display_name||u.name||u.email||"");const companyName=accountPublisherName(u,env,row.company_name)||"";return J({authenticated:true,accountId:String(p.id),developerId:developerId(u,env),name:displayName,displayName,email:u.email||p.lunid||"",lunid:p.lunid||u.email||"",picture:u.picture||"",authType:isLunIdSession(u)?"lunid":"google",companyName,companyNameSet:!!companyName,profileStorageReady:!storageError,...(storageError?{profileStorageError:storageError.message}:{}),recoveryEmail:"",memberSince:"",hasPassword:isLunIdSession(u)},200,env,req)}catch(e){return J({error:e.message||"Profile unavailable"},503,env,req)}}
function versionsOf(p){const a=Array.isArray(p?.versions)?p.versions.slice():[];if(p?.package)a.push({...p,versions:undefined});const m=new Map();for(const x of a){const v=x.version||x.appVersion;if(v)m.set(v,x)}return [...m.values()].sort((a,b)=>cmp(a.version||a.appVersion,b.version||b.appVersion))}
function mergePackage(old,entry){const vs=versionsOf(old);vs.push(entry);const m=new Map(vs.map(x=>[x.version||x.appVersion,x]));const all=[...m.values()].sort((a,b)=>cmp(a.version||a.appVersion,b.version||b.appVersion));const latest=all[all.length-1];const first=all.find(x=>x.firstPublishedAt)?.firstPublishedAt||all[0]?.publishedAt||entry.publishedAt;return {...latest,firstPublishedAt:first,versions:all}}
function safeText(x){return typeof x==="string"?x.toLowerCase():""}
function catalogMatches(p,q){if(!q)return true;const hay=[p.id,p.name,p.description,p.shortDescription,p.category,p.publisher?.id,p.publisher?.name,...(p.keywords||[]),...(p.features||[]),...(p.targets||[])].map(safeText).join(" ");return hay.includes(q)}
async function getCatalog(env){if(!env.GITHUB_TOKEN)throw Error("Publisher service is not configured");const repo=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}`),base=repo.default_branch||"main",cf=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/contents/repository/index.json?ref=${base}`);return {base,cf,cat:JSON.parse(new TextDecoder().decode(new Uint8Array(u64(cf.content))))}}
function entryOwners(x){const s=new Set();const push=v=>{v=String(v||"").toLowerCase().replace(/^lunos-apps\//,"").replace(/^packages\//,"").replace(/^packs\//,"").split("/")[0];if(v&&v!=="packages"&&v!=="packs")s.add(v)};if(x){push(x.publisher?.id);push(x.developer?.id);push(x.developerId);push(x.publisherId);push(x.package);if(Array.isArray(x.versions))x.versions.forEach(v=>{push(v.publisher?.id);push(v.package||v.url)})}return s}
function isOwnedEntry(x,u,dev,ownerKey,env){const s=entryOwners(x);if(!s.size||s.has("lunos-official"))return isOfficialAccount(u,env);if(!s.has(String(dev).toLowerCase()))return false;if(x?.publisher?.ownerKey&&ownerKey&&x.publisher.ownerKey!==ownerKey)return false;return true}

async function updateCatalogPublisherName(u,env,companyName){const dev=developerId(u,env),oKey=await ownerKeyOf(u,env);if(!env.GITHUB_TOKEN)throw Error("Publisher service is not configured");const {base,cf,cat}=await getCatalog(env);if(!Array.isArray(cat.packages))cat.packages=[];let changed=0;for(const p of cat.packages){if(!isOwnedEntry(p,u,dev,oKey,env))continue;const pub=typeof p.publisher==="object"&&p.publisher?{...p.publisher}:{id:dev};delete pub.email;p.publisher={...pub,id:pub.id||dev,name:companyName,...(oKey?{ownerKey:pub.ownerKey||oKey}:{})};if(p.developer&&typeof p.developer==="object")p.developer={...p.developer,name:companyName};if(Object.prototype.hasOwnProperty.call(p,"publisherName"))p.publisherName=companyName;if(Object.prototype.hasOwnProperty.call(p,"developerName"))p.developerName=companyName;if(Array.isArray(p.versions))p.versions=p.versions.map(v=>{const old=typeof v.publisher==="object"&&v.publisher?{...v.publisher}:{...p.publisher};delete old.email;return{...v,publisher:{...old,id:old.id||dev,name:companyName,...(oKey?{ownerKey:old.ownerKey||oKey}:{})}}});changed++}if(!changed)return 0;const ref=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/git/ref/heads/${base}`),branch=`lunos-profile/${dev}-${Date.now()}`;await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/git/refs`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ref:`refs/heads/${branch}`,sha:ref.object.sha})});await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/contents/repository/index.json`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:`update publisher name ${dev}`,content:b64(new TextEncoder().encode(JSON.stringify(cat,null,2)+"\n")),branch,sha:cf.sha})});const pr=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/pulls`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:`Update publisher name Â· ${dev}`,head:branch,base,body:`Account profile update.\nDeveloper: ${dev}\nPublisher name refreshed in ${changed} existing catalog app(s).`})});const merged=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/pulls/${pr.number}/merge`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({merge_method:"squash"})});if(!merged.merged)throw Error("Existing listing-name update was not merged.");return changed}
async function developerApps(req,env){const u=await user(req,env);if(!u)return J({error:"Sign-in required"},401,env,req);const dev=developerId(u,env),oKey=await ownerKeyOf(u,env);try{const {cat}=await getCatalog(env),apps=(cat.packages||[]).filter(x=>isOwnedEntry(x,u,dev,oKey,env)).map(p=>{const vs=versionsOf(p),latest=vs[vs.length-1]||p;return{id:p.id,name:p.name,type:p.type||latest.type||"gui",description:p.description||"",publisher:p.publisher||{},version:latest.version||latest.appVersion||p.version||p.appVersion||"",publishedAt:latest.publishedAt||p.publishedAt||null,packagePath:latest.package||latest.url||latest.file||p.package||p.url||"",versions:vs.map(v=>({version:v.version||v.appVersion,publishedAt:v.publishedAt||null,packagePath:v.package||v.url||v.file||""}))}});return J({developer:dev,count:apps.length,apps},200,env,req)}catch(e){return J({error:e.message||"Could not load developer apps"},502,env,req)}}
async function manageDeveloperApp(req,env,appId,action){const u=await user(req,env);if(!u)return J({error:"Sign in first."},401,env,req);if(!id(appId)||!["unpublish","delete"].includes(action))return J({error:"Invalid app action"},400,env,req);if(!env.GITHUB_TOKEN)return J({error:"Publisher service is not configured"},503,env,req);const dev=developerId(u,env),oKey=await ownerKeyOf(u,env),prefix=`packages/${dev}/${appId}/`,packPrefix=`packs/${dev}/${appId}/`,ownedPackage=path=>!path.split("/").some(x=>!x||x==="."||x==="..")&&((path.startsWith(prefix)&&path.endsWith(".ln"))||(path.startsWith(packPrefix)&&path.endsWith(".zip")));try{const {base,cat}=await getCatalog(env);if(!Array.isArray(cat.packages))cat.packages=[];const index=cat.packages.findIndex(p=>p.id===appId);if(index<0)return J({error:"Published app not found"},404,env,req);const app=cat.packages[index];if(!isOwnedEntry(app,u,dev,oKey,env))return J({error:"This app does not belong to the signed-in developer"},403,env,req);const paths=new Set(),addPath=value=>{const path=String(value||"").replace(/^lunos-apps\//,"").replace(/^\/+/,"");if(ownedPackage(path))paths.add(path)};for(const v of versionsOf(app))addPath(v.package||v.url||v.file);addPath(app.package||app.url||app.file);const ref=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/git/ref/heads/${base}`),head=ref.object.sha;let tree=null;if(action==="delete"){try{tree=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/git/trees/${head}?recursive=1`)}catch{}if(tree&&!tree.truncated)for(const item of tree.tree||[])if(item.type==="blob"&&ownedPackage(item.path))paths.add(item.path);if(!paths.size)return J({error:"No current package files were found; nothing was changed"},409,env,req)}cat.packages.splice(index,1);const branch=`lunos-${action}-${dev}-${Date.now()}`;await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/git/refs`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ref:`refs/heads/${branch}`,sha:head})});let commitSha;if(action==="delete"){const blob=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/git/blobs`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({content:b64(new TextEncoder().encode(JSON.stringify(cat,null,2)+"\n")),encoding:"base64"})}),changes=[{path:"repository/index.json",mode:"100644",type:"blob",sha:blob.sha},...[...paths].map(path=>({path,mode:"100644",type:"blob",sha:null}))],next=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/git/trees`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({base_tree:head,tree:changes})}),c=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/git/commits`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:`delete ${appId} by ${dev}`,tree:next.sha,parents:[head]})});commitSha=c.sha;await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/git/refs/heads/${branch}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify({sha:commitSha,force:true})})}else{const {cf}=await getCatalog(env);await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/contents/repository/index.json`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:`unpublish ${appId} by ${dev}`,content:b64(new TextEncoder().encode(JSON.stringify(cat,null,2)+"\n")),branch,sha:cf.sha})});commitSha=(await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/git/ref/heads/${branch}`)).object.sha}const pr=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/pulls`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:`${action==="delete"?"Delete":"Unpublish"} ${app.name||appId}`,head:branch,base,body:`Developer-requested ${action}.\nDeveloper: ${dev}\nApp ID: ${appId}\nGit history may retain previous versions.`})});let merged=false;try{merged=!!(await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/pulls/${pr.number}/merge`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({merge_method:"squash"})})).merged}catch(e){return J({accepted:true,published:false,stage:"awaiting-merge",pullRequest:pr.html_url,mergeError:e.message,historyRetained:true},202,env,req)}return J({accepted:true,published:false,stage:merged?action:"awaiting-merge",pullRequest:pr.html_url,removedPackages:paths.size,historyRetained:true,action},merged?200:202,env,req)}catch(e){return J({error:e.message||"Could not update the app listing"},502,env,req)}}

async function upload(req,env){
 const u=await user(req,env);if(!u)return J({error:"Google sign-in required",login:"/auth/google"},401,env,req);
 await recordDeveloper(u,env);if(!env.GITHUB_TOKEN)return J({error:"Publisher service is not configured"},500,env,req);
 let f;try{f=await req.formData()}catch{return J({error:"Could not read upload"},400,env,req)}
 const file=f.get("package"),raw=f.get("manifest"),submitted=f.get("sha256");
 const kind=safeText(f.get("kind")||"");
 if(!(file instanceof File))return J({error:"A package file is required"},400,env,req);
 if(kind?(!PACK_KINDS[kind]||!file.name.toLowerCase().endsWith(PACK_KINDS[kind])):!file.name.toLowerCase().endsWith(".ln"))return J({error:kind?"A .zip pack is required for this listing type":"A .ln package is required"},400,env,req);
 if(file.size<=0||file.size>MAX)return J({error:"Invalid package size",maxBytes:MAX},413,env,req);
 let m;try{m=JSON.parse(raw||"")}catch{return J({error:"Invalid manifest JSON"},400,env,req)}
 if(kind&&m.type&&m.type!==kind)return J({error:"Pack type does not match kind"},400,env,req);
 if(kind==="font"&&m.studio?.blendPercent!=null){const n=Number(m.studio.blendPercent);if(!Number.isFinite(n)||n<0||n>100)return J({error:"Font blend must be between 0 and 100 percent"},400,env,req)}
 if(kind==="font"&&m.studio?.colorFont!=null&&!['monochrome','color','fixed'].includes(m.studio.colorFont))return J({error:"Unsupported Lunite font color mode"},400,env,req);
 if(kind==="font"&&m.studio?.interpolationMethod!=null&&!['outline-v1','COLR-v1','custom'].includes(m.studio.interpolationMethod))return J({error:"Unsupported Lunite font interpolation method"},400,env,req);
 if(kind==="font"&&m.studio?.interpolationMethod==='outline-v1'&&(!m.license?.id||/^unspecified$/i.test(String(m.license.id).trim())))return J({error:"A specific output font license is required for publication"},400,env,req);
 if(kind?(!id(m.id)||!ver(m.appVersion)||!m.name):(m.format!=="LNPK"||!id(m.id)||!ver(m.appVersion)||!m.name||!m.license?.id))return J({error:kind?"Invalid pack manifest: id, appVersion and name are required":"Invalid manifest: format, id, appVersion, name and license.id are required"},400,env,req);
 try{
  const bytes=await file.arrayBuffer(),sha=hex(await crypto.subtle.digest("SHA-256",bytes)),now=new Date().toISOString();
  if(submitted&&submitted.toLowerCase()!==sha)return J({error:"SHA-256 mismatch"},400,env,req);
  const {base,cf,cat}=await getCatalog(env);if(!Array.isArray(cat.packages))cat.packages=[];
  const canonicalizePackage=x=>{if(x&&typeof x.package==="string"&&x.package.startsWith("lunos-apps/"))x.package=x.package.slice(10);if(Array.isArray(x?.versions))x.versions.forEach(canonicalizePackage);return x};
  cat.packages.forEach(canonicalizePackage);
  const dev=developerId(u,env),oKey=await ownerKeyOf(u,env),profile=await sbEnsureProfile(env,u),profileData=await readDeveloperProfile(u,env),publisherName=await verifiedPublisherName(u,env,profileData),folder=kind?`packs/${dev}/${m.id}`:`packages/${dev}/${m.id}`,path=`${folder}/${m.appVersion}${kind?".zip":".ln"}`,catalogPackage=path,owner=cat.packages.find(x=>x.id===m.id);
  if(owner&&!isOwnedEntry(owner,u,dev,oKey,env))return J({error:"App ID belongs to another developer",owner:owner.publisher?.id||"lunos-official"},403,env,req);
  if(owner&&versionsOf(owner).some(x=>String(x.version||x.appVersion)===String(m.appVersion)))return J({error:"This app version already exists"},409,env,req);
  const ref=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/git/ref/heads/${base}`),branch=`lunos-publish/${dev}-${m.id}-${Date.now()}`;
  await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/git/refs`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ref:`refs/heads/${branch}`,sha:ref.object.sha})});
  await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/contents/${path}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:`publish ${m.id} ${m.appVersion}`,content:b64(bytes),branch})});
  const existingVersions=owner?versionsOf(owner):[],firstPublishedAt=existingVersions.find(x=>x.firstPublishedAt)?.firstPublishedAt||existingVersions[0]?.publishedAt||now;
  const entry={
   ...m,id:m.id,name:m.name,version:m.appVersion,appVersion:m.appVersion,
   type:kind||m.type||undefined,publisher:{id:dev,name:publisherName,...(oKey?{ownerKey:oKey}:{})},license:m.license||{id:"unspecified",name:"See package"},
   sourceVisibility:m.sourceVisibility||"private-source",description:m.description||"",
   screenshots:Array.isArray(m.screenshots)?m.screenshots:[],iconUrl:m.iconUrl||null,
   featureGraphic:m.featureGraphic||null,permissions:Array.isArray(m.permissions)?m.permissions:[],
   dependencies:Array.isArray(m.dependencies)?m.dependencies:[],keywords:Array.isArray(m.keywords)?m.keywords:[],
   targets:Array.isArray(m.targets)?m.targets:[],features:Array.isArray(m.features)?m.features:[],
   sizeBytes:file.size,sha256:sha,package:catalogPackage,url:catalogPackage,
   manifestFormat:m.format,manifestVersion:kind??m.version,
   luniteFont:kind==="font"&&m.studio&&m.studio.blendPercent!=null?{blendPercent:Number(m.studio.blendPercent),colorMode:m.studio.colorFont||"monochrome",intermediateRendering:Number(m.studio.blendPercent)>0&&Number(m.studio.blendPercent)<100?(m.studio.interpolationMethod==="outline-v1"?"outline-v1":m.studio.interpolationMethod==="custom"?null:"COLR-v1"):null}:undefined,
   firstPublishedAt, publishedAt:now, versionReleaseDate:m.releaseDate||m.versionReleaseDate||now,
   releaseDate:m.releaseDate||now,uploadedAt:now
  };
  const i=cat.packages.findIndex(x=>x.id===m.id);if(i<0)cat.packages.push({...entry,versions:[entry]});else cat.packages[i]=mergePackage(cat.packages[i],entry);
  cat.packages.sort((a,b)=>a.id.localeCompare(b.id));
  await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/contents/repository/index.json`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:`catalog ${m.id} ${m.appVersion}`,content:b64(new TextEncoder().encode(JSON.stringify(cat,null,2)+"\n")),branch,sha:cf.sha})});
  const pr=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/pulls`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:`Publish ${m.name} ${m.appVersion}`,head:branch,base,body:`Automated LunOS package submission.\nDeveloper: ${dev}\nPublisher: ${publisherName}\nPackage SHA-256: ${sha}\nPackage type: ${kind?`${kind} ZIP pack`:"LNPK application package"}.`})});
  let mr;try{mr=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/pulls/${pr.number}/merge`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({merge_method:"squash"})})}catch(e){return J({accepted:true,stage:"awaiting-merge",published:false,pullRequest:pr.html_url,mergeError:e.message},202,env,req)}
  return J({accepted:true,stage:mr.merged?"published":"awaiting-merge",published:!!mr.merged,pullRequest:pr.html_url,packagePath:path,version:m.appVersion,developer:dev,publishedAt:now},mr.merged?201:202,env,req)
 }catch(e){return J({accepted:false,error:e.message||String(e),...(e.code?{code:e.code}:{})},e.status||400,env,req)}
}

async function catalogApi(req,env,u){
 try{
  const {cat}=await getCatalog(env);const q=safeText(u.searchParams.get("q")||"").trim(),appId=u.searchParams.get("appId")||"",developer=u.searchParams.get("developer")||"";
  let list=Array.isArray(cat.packages)?cat.packages:[];
  if(appId)list=list.filter(x=>x.id===appId);
  if(developer)list=list.filter(x=>x.publisher?.id===developer);
  if(q)list=list.filter(x=>catalogMatches(x,q));
  if(u.pathname==="/api/search")return J({query:q,count:list.length,results:list},200,env,req);
  if(u.pathname==="/api/developer")return J({developer:developer,apps:list,count:list.length},200,env,req);
  return J({repository:cat,results:list},200,env,req);
 }catch(e){return J({error:e.message||String(e)},502,env,req)}
}

async function download(req,env,u){
 const path=u.searchParams.get("path")||"";if(!/^(?:packages\/[A-Za-z0-9._\/-]+\.ln|packs\/[A-Za-z0-9._\/-]+\.zip)$/.test(path)||path.split("/").some(x=>!x||x==="."||x===".."))return J({error:"Invalid package path"},400,env,req);
 try{
  const r=await fetch(`https://raw.githubusercontent.com/${O}/${R}/main/${path}`,{redirect:"follow"});
  if(!r.ok)return J({error:"Package not found",status:r.status},404,env,req);
  const h=new Headers(r.headers);h.set("Content-Disposition",`attachment; filename="${path.split("/").pop()}"`);h.set("Cache-Control","public, max-age=300");return new Response(r.body,{status:200,headers:h});
 }catch(e){return J({error:e.message||String(e)},502,env,req)}
}

async function reviews(req,env,u){
 const db=env.LUNOS_DB,appId=u.searchParams.get("appId")||"";
 if(!appId||!id(appId))return J({error:"appId is required"},400,env,req);
 if(!db)return J({enabled:false,error:"Reviews are not configured on this Worker yet"},503,env,req);
 if(req.method==="GET"){const r=await db.prepare("SELECT id,app_id,rating,review,developer_reply,created_at,updated_at FROM reviews WHERE app_id=?1 ORDER BY created_at DESC LIMIT 200").bind(appId).all();return J({enabled:true,reviews:r.results||[]},200,env,req)}
 const uo=await user(req,env);if(!uo)return J({error:"Google sign-in required",login:"/auth/google"},401,env,req);
 let body;try{body=await req.json()}catch{return J({error:"Invalid JSON"},400,env,req)}
 const rating=Number(body.rating);const review=String(body.review||"").trim();if(!Number.isInteger(rating)||rating<1||rating>5||review.length>2000)return J({error:"rating must be 1-5 and review must be 1-2000 characters"},400,env,req);
 const now=Date.now();await db.prepare("INSERT INTO reviews (app_id,google_sub,developer_id,rating,review,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?6) ON CONFLICT(app_id,google_sub) DO UPDATE SET rating=excluded.rating,review=excluded.review,updated_at=excluded.updated_at").bind(appId,uo.sub,developerId(uo,env),rating,review,now).run();return J({ok:true},201,env,req)
}


async function sb(env,path,o={}){if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_KEY)throw Error("Supabase is not configured");const key=env.SUPABASE_SERVICE_KEY;const hd={"Content-Type":"application/json"};hd["api"+"key"]=key;hd["Authori"+"zation"]="Bear"+"er "+key;const r=await fetch(env.SUPABASE_URL+"/rest/v1/"+path,{...o,headers:{...hd,...(o.headers||{})}});const t=await r.text();let x;try{x=JSON.parse(t)}catch{x={message:t}}if(!r.ok)throw Object.assign(Error((x&&x.message)||("Supabase HTTP "+r.status)),{code:x?.code});return x}
async function sbProfile(env,u){const rows=await sb(env,`profiles?google_sub=eq.${encodeURIComponent(u.sub)}&select=id,lunid,is_banned`);return rows&&rows[0]?rows[0]:null}
async function sbEnsureProfile(env,u){let p=await sbProfile(env,u);if(p)return p;if(String(u.sub).startsWith("lunid:"))return null;const lunid=slug(u.email)+"@lunos";await sb(env,"profiles",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates"},body:JSON.stringify({google_sub:u.sub,lunid,display_name:u.name||"",avatar_url:u.picture||"",is_publisher:true})});return sbProfile(env,u)}
const needUser=async(req,env)=>{const u=await user(req,env);if(!u)throw Object.assign(Error("Sign in required"),{status:401});const p=await sbEnsureProfile(env,u);if(!p)throw Error("Profile unavailable");if(p.is_banned)throw Object.assign(Error("Account banned"),{status:403});return p};
const b64e=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const b64d=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function pwHash(pw){const salt=crypto.getRandomValues(new Uint8Array(16));const km=await crypto.subtle.importKey("raw",new TextEncoder().encode(pw),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:100000,hash:"SHA-256"},km,256);return "pbkdf2$100000$"+b64e(salt)+"$"+b64e(bits)}
async function pwCheck(pw,stored){try{const p=String(stored||"").split("$");if(p.length!==4||p[0]!=="pbkdf2")return false;const km=await crypto.subtle.importKey("raw",new TextEncoder().encode(pw),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:b64d(p[2]),iterations:Number(p[1])||100000,hash:"SHA-256"},km,256);const got=b64e(bits);let diff=got.length^p[3].length;for(let i=0;i<Math.min(got.length,p[3].length);i++)diff|=got.charCodeAt(i)^p[3].charCodeAt(i);return diff===0}catch{return false}}
async function authRateAllow(env,req,bucket,limit){try{const ip=req.headers.get("CF-Connecting-IP")||"unknown";return await recoveryAllow(env,bucket+":"+ip,limit)}catch(e){if(['PGRST202','42883'].includes(e?.code))return true;return false}}
async function lunidRegister(req,env){try{if(!await authRateAllow(env,req,"register",10))return J({error:"Too many registration attempts. Try again later."},429,env,req);let b;try{b=await req.json()}catch{return J({error:"Invalid request"},400,env,req)}const local=String(b.lunid||"").trim().toLowerCase().replace(/@lunos$/,""),name=String(b.name||"").trim().slice(0,80),pw=String(b.password||"");if(!/^[a-z0-9][a-z0-9._-]{2,47}$/.test(local))return J({error:"LunID must be 3-48 characters: letters, numbers, dot, dash or underscore."},400,env,req);if(!name)return J({error:"Display name is required."},400,env,req);if(pw.length<8)return J({error:"Password must be at least 8 characters."},400,env,req);const lunid=local+"@lunos";const existing=await sb(env,`profiles?lunid=eq.${encodeURIComponent(lunid)}&select=id`);if(existing&&existing.length)return J({error:"This LunID is already taken."},409,env,req);const hash=await pwHash(pw),accountSubject="lunid:"+local+":"+crypto.randomUUID();const ins=await sb(env,"profiles",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({google_sub:accountSubject,lunid,display_name:name,password_hash:hash,is_publisher:false})});if(!ins||!ins.length)return J({error:"Could not create this LunID. LunID sign-in may not be enabled on the server yet."},500,env,req);const token=await session({sub:accountSubject,email:lunid,name},env);return J({ok:true,token,lunid,name},201,env,req)}catch(e){return J({error:"LunID create failed: "+(e&&e.message||e)},500,env,req)}}
async function lunidLogin(req,env){try{const started=Date.now();if(!await authRateAllow(env,req,"login",20))return J({error:"Too many sign-in attempts. Try again later."},429,env,req);let b;try{b=await req.json()}catch{return J({error:"Invalid request"},400,env,req)}const local=String(b.lunid||"").trim().toLowerCase().replace(/@lunos$/,""),pw=String(b.password||""),lunid=local+"@lunos";const rows=await sb(env,`profiles?lunid=eq.${encodeURIComponent(lunid)}&select=google_sub,display_name,password_hash,is_banned`);const row=rows&&rows[0];if(!row||!row.password_hash)return J({error:"Invalid LunID or password."},401,env,req);if(row.is_banned)return J({error:"This account is banned."},403,env,req);if(!await pwCheck(pw,row.password_hash))return J({error:"Invalid LunID or password."},401,env,req);const token=await session({sub:row.google_sub,email:lunid,name:row.display_name||""},env,started);return J({ok:true,token,lunid,name:row.display_name||""},200,env,req)}catch(e){return J({error:"LunID sign-in failed: "+(e&&e.message||e)},500,env,req)}}
async function leaderboardApi(req,env,u){try{const stats=(await sb(env,"package_stats?select=package_id,downloads_total,likes_total,rating_sum,rating_count"))||[];const recent={};try{const since=new Date(Date.now()-2592000000).toISOString().slice(0,10);const daily=(await sb(env,`downloads_daily?day=gte.${since}&select=package_id&limit=100000`))||[];daily.forEach(r=>{recent[r.package_id]=(recent[r.package_id]||0)+1})}catch{}const {cat}=await getCatalog(env);const byId=new Map((cat.packages||[]).map(p=>[String(p.id),p]));const rows=stats.map(x=>{const p=byId.get(String(x.package_id))||{};const U=Number(x.downloads_total||0),L=Number(x.likes_total||0),rc=Number(x.rating_count||0),rs=Number(x.rating_sum||0);const br=(rs+28.8)/(rc+8);const r30=Number(recent[x.package_id]||0);const score=Math.round((10*Math.log1p(U)*(br/5)+3*Math.log1p(L)+6*Math.log1p(r30))*10)/10;return{package_id:String(x.package_id),name:p.name||String(x.package_id),publisher:(p.publisher&&p.publisher.name)||"",publisherId:(p.publisher&&p.publisher.id)||"",type:p.type||"gui",category:p.category||"",downloads:U,likes:L,rating:rc?Math.round(rs/rc*10)/10:0,ratingCount:rc,recent30:r30,score}});rows.sort((a,b)=>b.score-a.score);if(u.searchParams.get("type")==="packages")return J({type:"leaderboard_packages",results:rows.slice(0,50)},200,env,req);const devs=new Map();rows.forEach(r=>{const k=r.publisherId||r.publisher||"unknown";const d=devs.get(k)||{developerId:k,name:r.publisher||k,score:0,downloads:0,likes:0,packages:0,ratingSum:0,ratingCount:0};d.score=Math.round((d.score+r.score)*10)/10;d.downloads+=r.downloads;d.likes+=r.likes;d.packages+=1;d.ratingSum+=r.rating*r.ratingCount;d.ratingCount+=r.ratingCount;devs.set(k,d)});const list=[...devs.values()].map(d=>({...d,rating:d.ratingCount?Math.round(d.ratingSum/d.ratingCount*10)/10:0})).sort((a,b)=>b.score-a.score);return J({type:"leaderboard_developers",results:list.slice(0,50)},200,env,req)}catch(e){return J({error:e.message||"Leaderboard unavailable"},502,env,req)}}
const ipKey=async req=>{const ip=req.headers.get("CF-Connecting-IP")||"0.0.0.0";const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ip));return "ip:"+hex(h).slice(0,24)};
async function profileUpdate(req,env){try{const u=await user(req,env);if(!u)return J({error:"Sign-in required"},401,env,req);await recordDeveloper(u,env);const b=await req.json().catch(()=>({}));const hasDisplay=Object.prototype.hasOwnProperty.call(b||{},"displayName"),hasCompany=Object.prototype.hasOwnProperty.call(b||{},"companyName");if(!hasDisplay&&!hasCompany)return J({error:"displayName or companyName is required"},400,env,req);const clean=(v,n)=>String(v||"").replace(/[\x00-\x1f\x7f]/g,"").trim().slice(0,n),displayName=hasDisplay?clean(b.displayName,80):"",companyName=hasCompany?String(b.companyName||'').normalize('NFKC').replace(/\s+/gu,' ').replace(/[\x00-\x1f\x7f]/g,'').trim().slice(0,120):"";if(hasDisplay&&!displayName)return J({error:"Display name is required."},400,env,req);if(hasCompany&&/\p{Cf}/u.test(companyName))return J({error:"Invisible formatting characters are not allowed in publisher names."},400,env,req);if(hasCompany&&!companyName)return J({error:"Company / publisher name is required."},400,env,req);if(hasCompany&&companyName.toLowerCase().replace(/[^a-z0-9 ]/g," ").replace(/\s+/g," ").trim()==="lunos official"&&!isOfficialAccount(u,env))return J({error:"LunOS Official is reserved for the authorized official account."},403,env,req);const identity=await sbEnsureProfile(env,u);if(!identity||identity.is_banned)return J({error:"Account is unavailable or banned."},403,env,req);const old=await readDeveloperProfile(u,env),patch={};if(hasDisplay)patch.display_name=displayName;if(hasCompany){if(!accountPublisherName(u,env,companyName))return J({error:"Choose a non-generic company / publisher name."},400,env,req);patch.company_name=companyName}const saved=await saveDeveloperProfile(u,env,patch);let updatedListings=0,listingSyncError="";if(hasCompany&&companyName!==String(old.company_name||"")){try{updatedListings=await updateCatalogPublisherName(u,env,companyName)}catch(e){listingSyncError=e.message||"Existing listings could not be refreshed"}}return J({ok:true,displayName:saved.display_name||u.name||"",companyName:saved.company_name||"",companyNameSet:!!accountPublisherName(u,env,saved.company_name),updatedListings,...(listingSyncError?{listingSyncError}:{})},200,env,req)}catch(e){return J({error:e.message||"Profile update failed",...(e.code?{code:e.code}:{})},e.status||500,env,req)}}
async function recoverySet(req,env){try{const p=await needUser(req,env);const b=await req.json().catch(()=>({}));const email=String(b.email||"").trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return J({error:"Enter a valid recovery email."},400,env,req);await sb(env,`profiles?id=eq.${p.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({recovery_email:email})});return J({ok:true,email},200,env,req)}catch(e){const m=e.message||"Recovery email failed";return J({error:/recovery_email/.test(m)?"Recovery email is not enabled on the server yet.":m},e.status||500,env,req)}}
async function accountDelete(req,env){
  try{
    const u=await user(req,env,true);
    if(!u)return J({error:'Your session has expired. Sign in and try again.',code:'SIGN_IN_REQUIRED'},401,env,req);
    const b=await req.json().catch(()=>({}));
    if(String(b?.confirm||'').trim().toUpperCase()!=='DELETE')return J({error:'Type DELETE to confirm.'},400,env,req);
    const rows=await sb(env,`profiles?google_sub=eq.${encodeURIComponent(u.sub)}&select=id,password_hash`),p=rows?.[0];
    if(!p)return J({error:'This account no longer exists.',code:'ACCOUNT_NOT_FOUND'},404,env,req);
    if(isLunIdSession(u)){
      if(!b.password)return J({error:'Enter your current LunID password.'},400,env,req);
      if(!p.password_hash||!await pwCheck(String(b.password),p.password_hash))return J({error:'Current LunID password is incorrect.'},403,env,req);
    }else if(!u.iat||Date.now()-u.iat>600000){
      return J({error:'Sign in again with Google, then retry deletion.'},403,env,req);
    }
    if(env.LUNOS_DB)await env.LUNOS_DB.prepare('DELETE FROM developers WHERE google_sub=?1').bind(u.sub).run();
    const deleted=await sb(env,'rpc/delete_lunos_account',{method:'POST',body:JSON.stringify({p_subject:u.sub,p_subject_key:await subjectKey(u.sub,env),p_cutoff:Date.now()})});
    if(deleted!==true)return J({error:'Account deletion couldnâ€™t be confirmed. Sign in again to check.',code:'DELETE_NOT_CONFIRMED'},409,env,req);
    return J({ok:true},200,env,req);
  }catch(error){
    const code=['PGRST202','PGRST205','42P01','42883','42501'].includes(error.code)||error.stage==='session'?'DELETE_UNAVAILABLE':error.code==='23503'?'DELETE_BLOCKED':'DELETE_FAILED';
    const reference=crypto.randomUUID();
    console.error('Account deletion',reference,code,error.code||'',error.stage||'delete');
    const message=code==='DELETE_BLOCKED'?'This account couldnâ€™t be deleted. Contact support.':code==='DELETE_UNAVAILABLE'?'Account deletion is temporarily unavailable. Try again later.':'Account deletion couldnâ€™t be completed. Try again or contact support.';
    return J({error:message,code,reference},code==='DELETE_BLOCKED'?409:code==='DELETE_UNAVAILABLE'?503:500,env,req);
  }
}
const recoveryResponse=(req,env,data,status=200)=>{
  const response=J(data,status,env,req);
  response.headers.set('Cache-Control','no-store');
  return response;
};
async function recoveryBody(req){
  const reader=req.body?.getReader();
  if(!reader)return {};
  const decoder=new TextDecoder();let size=0,text='';
  for(;;){
    const {value,done}=await reader.read();
    if(done)break;
    if((size+=value.byteLength)>4096){await reader.cancel();return {};}
    text+=decoder.decode(value,{stream:true});
  }
  return JSON.parse(text+decoder.decode())||{};
}
const recoveryRpc=(env,name,body)=>sb(env,'rpc/lunid_recovery_'+name,{method:'POST',body:JSON.stringify(body)});
const recoveryAllow=async(env,bucket,limit)=>await recoveryRpc(env,'allow',{p_bucket_key:await mac('recovery-limit:'+bucket,env),p_limit:limit})===true;
async function lunidBackupCodes(req,env){
  const send=(data,status)=>recoveryResponse(req,env,data,status);
  try{
    const u=await user(req,env,true);
    if(!u)return send({error:'Sign in again to generate backup codes.'},401);
    if(!isLunIdSession(u))return send({error:'Backup codes are available for LunID accounts.'},403);
    const b=await recoveryBody(req).catch(()=>({}));
    if(typeof b.password!=='string'||!b.password||b.password.length>1024)return send({error:'Enter your current LunID password.'},400);
    if(!await recoveryAllow(env,'issue:'+u.sub,8))return send({error:'Too many attempts. Try again later.'},429);
    const rows=await sb(env,`profiles?google_sub=eq.${encodeURIComponent(u.sub)}&select=password_hash,is_banned`);
    const profile=rows?.[0];
    if(!profile?.password_hash||profile.is_banned||!await pwCheck(b.password,profile.password_hash))return send({error:'Current LunID password is incorrect.'},403);
    const raw=Array.from({length:8},()=>hex(crypto.getRandomValues(new Uint8Array(16))));
    const hashes=await Promise.all(raw.map(code=>mac('lunid-backup:'+code,env)));
    const issued=await recoveryRpc(env,'issue',{p_subject:u.sub,p_password_hash:profile.password_hash,p_codes:hashes,p_subject_key:await subjectKey(u.sub,env),p_session_issued:u.iat??u.exp-SESSION_TTL});
    if(issued!==true)return send({error:'Your account changed. Sign in again and try again.'},409);
    return send({ok:true,codes:raw.map(code=>code.toUpperCase().match(/.{1,8}/g).join('-'))});
  }catch(error){
    console.error('LunID backup code issuance unavailable',error.code||'');
    return send({error:'Backup codes are temporarily unavailable.'},503);
  }
}
async function lunidBackupReset(req,env){
  const send=(data,status)=>recoveryResponse(req,env,data,status);
  const invalid=()=>send({error:'The LunID or backup code is incorrect, or the code was already used.'},400);
  try{
    const b=await recoveryBody(req).catch(()=>({}));
    const local=typeof b.lunid==='string'?b.lunid.trim().toLowerCase().replace(/@lunos$/,''):'';
    const code=typeof b.code==='string'?b.code.replace(/[-\s]/g,'').toLowerCase():'';
    if(typeof b.password!=='string'||b.password.length<8||b.password.length>128)return send({error:'Use 8 to 128 characters for the new password.'},400);
    if(!/^[a-z0-9][a-z0-9._-]{2,47}$/.test(local)||!/^[a-f0-9]{32}$/.test(code))return invalid();
    if(!await recoveryAllow(env,'reset:'+(req.headers.get('CF-Connecting-IP')||'unknown'),20))return send({error:'Too many attempts. Try again later.'},429);
    const lunid=local+'@lunos';
    const rows=await sb(env,`profiles?lunid=eq.${encodeURIComponent(lunid)}&select=google_sub`);
    const subject=rows?.[0]?.google_sub;
    const newHash=await pwHash(b.password);
    if(!subject)return invalid();
    const reset=await recoveryRpc(env,'reset',{p_subject:subject,p_lunid:lunid,p_code_hash:await mac('lunid-backup:'+code,env),p_new_hash:newHash,p_subject_key:await subjectKey(subject,env)});
    return reset===true?send({ok:true}):invalid();
  }catch(error){
    console.error('LunID backup code reset unavailable',error.code||'');
    return send({error:'Password reset is temporarily unavailable.'},503);
  }
}
async function passwordChange(req,env){try{const u=await user(req,env);if(!u)throw Object.assign(Error("Sign in required"),{status:401});const p=await sbProfile(env,u);if(!p)return J({error:"Profile not found"},404,env,req);const b=await req.json().catch(()=>({}));const cur=String(b.currentPassword||""),nw=String(b.newPassword||"");if(nw.length<8||nw.length>128)return J({error:"New password must be 8 to 128 characters."},400,env,req);const rows=await sb(env,`profiles?id=eq.${p.id}&select=password_hash`);const hash=rows&&rows[0]&&rows[0].password_hash;if(!hash)return J({error:"This account signs in with Google and has no LunID password to change."},400,env,req);if(!await pwCheck(cur,hash))return J({error:"Current password is incorrect."},403,env,req);if(cur===nw)return J({error:"New password must be different from the current one."},400,env,req);const changed=await sb(env,`profiles?id=eq.${p.id}&password_hash=eq.${encodeURIComponent(hash)}`,{method:"PATCH",headers:{Prefer:"return=representation"},body:JSON.stringify({password_hash:await pwHash(nw)})});if(!changed?.length)return J({error:"Your password changed. Sign in again and retry."},409,env,req);const cutoff=Date.now();try{await sb(env,"rpc/revoke_lunos_sessions",{method:"POST",body:JSON.stringify({p_subject_key:await subjectKey(u.sub,env),p_cutoff:cutoff})})}catch(err){console.error("Session revocation after password change unavailable",err?.code||"")}const freshToken=await session({sub:u.sub,email:u.email,name:u.name||"",picture:u.pic||""},env,cutoff+1);return J({ok:true,token:freshToken},200,env,req)}catch(e){return J({error:e.message||"Password change failed"},e.status||500,env,req)}}
async function storeApi(req,env,u){
 try{
  if(u.pathname==="/api/stats"&&req.method==="GET"){const rows=await sb(env,"package_stats?select=package_id,downloads_total,likes_total,rating_sum,rating_count");return J({stats:rows||[]},200,env,req)}
  if(u.pathname==="/api/track-download"&&req.method==="POST"){const appId=u.searchParams.get("appId")||"";if(!id(appId))return J({error:"Invalid appId"},400,env,req);let key="";try{const me=await user(req,env);if(me){const p=await sbProfile(env,me);if(p)key=String(p.id)}}catch{}if(!key)key=await ipKey(req);const counted=await sb(env,"rpc/record_download",{method:"POST",body:JSON.stringify({p_package:appId,p_user_key:key})});return J({ok:true,counted:!!counted},200,env,req)}
  if(u.pathname==="/api/like"&&req.method==="POST"){const p=await needUser(req,env);const appId=u.searchParams.get("appId")||"";if(!id(appId))return J({error:"Invalid appId"},400,env,req);const liked=await sb(env,"rpc/toggle_like",{method:"POST",body:JSON.stringify({p_package:appId,p_user:p.id})});return J({ok:true,liked:!!liked},200,env,req)}
  if(u.pathname==="/api/rate"&&req.method==="POST"){const p=await needUser(req,env);const b=await req.json().catch(()=>({}));const appId=String(b.appId||u.searchParams.get("appId")||"");const stars=Math.max(1,Math.min(5,Number(b.stars)||0));if(!id(appId)||!stars)return J({error:"Invalid rating"},400,env,req);const r=await sb(env,"rpc/set_rating",{method:"POST",body:JSON.stringify({p_package:appId,p_user:p.id,p_stars:stars})});if(r&&r.ok===false)return J({error:r.error||"Rating denied"},403,env,req);return J({ok:true},200,env,req)}
  if(u.pathname==="/api/comments"&&req.method==="GET"){const appId=u.searchParams.get("appId")||"";const rows=(await sb(env,`comments?package_id=eq.${encodeURIComponent(appId)}&is_hidden=eq.false&select=id,body,created_at,author&order=created_at.desc&limit=200`))||[];try{const ids=[...new Set(rows.map(r=>r.author).filter(Boolean))];if(ids.length){const ps=await sb(env,`profiles?id=in.(${ids.join(",")})&select=id,display_name,lunid`);const mp=new Map((ps||[]).map(x=>[x.id,x]));rows.forEach(r=>{const p=mp.get(r.author);r.authorName=p?(p.display_name||p.lunid||""):"";r.authorLunid=p?p.lunid||"":""})}}catch{}return J({comments:rows},200,env,req)}
  if(u.pathname==="/api/comments"&&req.method==="POST"){const p=await needUser(req,env);const b=await req.json().catch(()=>({}));const appId=String(b.appId||"");const body=String(b.body||"").trim().slice(0,500);if(!id(appId)||!body)return J({error:"Comment empty or package invalid"},400,env,req);await sb(env,"comments",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({package_id:appId,author:p.id,body})});return J({ok:true},201,env,req)}
  if(u.pathname==="/api/favorites"&&req.method==="GET"){const p=await needUser(req,env);const rows=await sb(env,`favorites?user_id=eq.${p.id}&select=package_id,created_at&order=created_at.desc`);return J({favorites:(rows||[]).map(x=>x.package_id)},200,env,req)}
  if(u.pathname==="/api/favorites"&&req.method==="POST"){const p=await needUser(req,env);const appId=u.searchParams.get("appId")||"";if(!id(appId))return J({error:"Invalid appId"},400,env,req);const ex=await sb(env,`favorites?user_id=eq.${p.id}&package_id=eq.${encodeURIComponent(appId)}&select=package_id`);if(ex&&ex.length){await sb(env,`favorites?user_id=eq.${p.id}&package_id=eq.${encodeURIComponent(appId)}`,{method:"DELETE"});return J({ok:true,favorite:false},200,env,req)}await sb(env,"favorites",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates"},body:JSON.stringify({package_id:appId,user_id:p.id})});return J({ok:true,favorite:true},200,env,req)}
  if(u.pathname==="/api/report"&&req.method==="POST"){const b=await req.json().catch(()=>({}));const appId=String(b.appId||"");const reason=String(b.reason||"").trim().slice(0,300);if(!id(appId)||reason.length<3)return J({error:"Report needs a reason"},400,env,req);let reporter=null;try{const me=await user(req,env);if(me){const p=await sbProfile(env,me);reporter=p?p.id:null}}catch{}await sb(env,"reports",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({package_id:appId,reporter,reason})});return J({ok:true},201,env,req)}
  if(u.pathname==="/api/leaderboard"&&req.method==="GET")return leaderboardApi(req,env,u)
  if(u.pathname==="/api/sync"&&req.method==="GET"){const p=await needUser(req,env);const rows=await sb(env,`user_sync?user_id=eq.${p.id}&select=installed,premium_unlocks,updated_at`);const wal=await sb(env,`fyn_wallets?user_id=eq.${p.id}&select=balance`);return J({sync:rows&&rows[0]?rows[0]:{installed:[],premium_unlocks:[]},fyn:wal&&wal[0]?Number(wal[0].balance)||0:0,lunid:p.lunid},200,env,req)}
  if(u.pathname==="/api/sync"&&req.method==="POST"){const p=await needUser(req,env);const b=await req.json().catch(()=>({}));const installed=Array.isArray(b.installed)?b.installed.filter(x=>typeof x==="string"&&x.length<=128).slice(0,500):[];const existing=await sb(env,`user_sync?user_id=eq.${p.id}&select=premium_unlocks`);const unlocks=Array.isArray(existing?.[0]?.premium_unlocks)?existing[0].premium_unlocks:[];await sb(env,"user_sync",{method:"POST",headers:{Prefer:"resolution=merge-duplicates"},body:JSON.stringify({user_id:p.id,installed,premium_unlocks:unlocks,updated_at:new Date().toISOString()})});return J({ok:true},200,env,req)}
 }catch(e){return J({error:e.message||"Store API failed"},e.status||502,env,req)}
 return null;
}

export default{async fetch(req,env){
 const u=new URL(req.url);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:C(env,req)});
 if(req.method==="GET"&&u.pathname==="/")return J({service:"LunOS Publisher",purpose:"Official server-side developer authentication and LNPK package publishing service for the LunOS App Repository",status:"online",version:"0.27.0",capabilities:"/api/capabilities",repository:`https://github.com/${O}/${R}`,auth:"Google",upload:"/api/upload",catalog:"/api/catalog",search:"/api/search",developerApps:"/api/developer",download:"/api/download",reviews:"/api/reviews"},200,env,req);
 if(req.method==="GET"&&u.pathname==="/api/capabilities")return J(LUNITE_CAPABILITIES,200,env,req);
 if(req.method==="GET"&&u.pathname==="/api/status")return J({service:"LunOS Publisher",status:"ready",githubConfigured:!!env.GITHUB_TOKEN,googleConfigured:!!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET&&env.SESSION_SECRET),reviewsConfigured:!!env.LUNOS_DB},200,env,req);
if(u.pathname==="/privacy"&&req.method==="GET")return new Response(`<!doctype html><meta charset="utf-8"><title>LunOS Privacy Policy</title><body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px"><h1>Privacy Policy</h1><p>LunOS only accesses the Google Drive files you explicitly create or open with LunOS (drive.file scope) and your basic profile for authentication. Your data is never sold or shared with third parties.</p></body>`,{headers:{"Content-Type":"text/html;charset=utf-8"}});
if(u.pathname==="/terms"&&req.method==="GET")return new Response(`<!doctype html><meta charset="utf-8"><title>LunOS Terms of Service</title><body style="font-family:system-ui;max-width:720px;margin:40px auto;padding:0 16px"><h1>Terms of Service</h1><p>LunOS is provided as-is for personal and developer use. You retain full ownership of all files stored in your connected cloud drives.</p></body>`,{headers:{"Content-Type":"text/html;charset=utf-8"}});
if(u.pathname==="/auth/google"&&req.method==="GET")return authStart(req,env);
if(u.pathname==="/auth/google/callback"&&req.method==="GET")return providerForState(u.searchParams.get("state"))==="google"?cloudOAuthCallback(req,env):authCallback(req,env);
if(u.pathname==="/auth/gdrive"&&req.method==="GET")return cloudOAuthStart(req,env,"google");
if(u.pathname==="/auth/dropbox"&&req.method==="GET")return cloudOAuthStart(req,env,"dropbox");
if(u.pathname==="/auth/dropbox/callback"&&req.method==="GET")return cloudOAuthCallback(req,env);
if(u.pathname==="/auth/cloud/status"&&req.method==="GET")return cloudOAuthStatus(req,env);
if(u.pathname==="/auth/cloud/refresh"&&req.method==="POST")return cloudOAuthRefresh(req,env);
 if(u.pathname==="/api/auth/lunid/register"&&req.method==="POST")return lunidRegister(req,env);
 if(u.pathname==="/api/auth/lunid/login"&&req.method==="POST")return lunidLogin(req,env);
 if(u.pathname==="/api/me"&&req.method==="GET")return profile(req,env);
 if(u.pathname==="/api/identity"&&req.method==="GET")return dataIdentity(req,env);
 if(u.pathname==="/api/profile"&&req.method==="GET")return profile(req,env);
 if(u.pathname==="/api/profile"&&req.method==="PATCH")return profileUpdate(req,env);
 if(u.pathname==="/api/account/recovery"&&req.method==="POST")return recoverySet(req,env);
 if(u.pathname==="/api/account/delete"&&req.method==="POST")return accountDelete(req,env);
 if(u.pathname==="/api/account/password"&&req.method==="POST")return passwordChange(req,env);
 if(u.pathname==="/api/account/backup-codes"&&req.method==="POST")return lunidBackupCodes(req,env);
 if(u.pathname==="/api/auth/lunid/reset"&&req.method==="POST")return lunidBackupReset(req,env);
 if(u.pathname==="/api/auth/lunid/forgot"&&req.method==="POST")return recoveryResponse(req,env,{error:"Update LunOS to reset your password with a backup code."},410);
 if(u.pathname==="/api/upload"&&req.method==="POST")return upload(req,env);
 if(u.pathname==="/api/developer/apps"&&req.method==="GET")return developerApps(req,env);
 {const match=u.pathname.match(/^\/api\/developer\/apps\/([^/]+)\/(unpublish|delete)$/);if(match&&req.method==="POST")return manageDeveloperApp(req,env,decodeURIComponent(match[1]),match[2]);}
 if((u.pathname==="/api/catalog"||u.pathname==="/api/search"||u.pathname==="/api/developer")&&req.method==="GET")return catalogApi(req,env,u);
 if(u.pathname==="/api/download"&&req.method==="GET")return download(req,env,u);
 if(u.pathname==="/api/reviews"&&(req.method==="GET"||req.method==="POST"))return reviews(req,env,u);
 {const sr=await storeApi(req,env,u);if(sr)return sr;}
 return J({error:"Not found"},404,env,req)
}};
 
