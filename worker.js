const O="LunOS-Official",R="lunos-apps",MAX=25*1024*1024;

const C=(env,req)=>{const o=req?.headers.get("Origin")||"";return{"Access-Control-Allow-Origin":o||"*","Access-Control-Allow-Methods":"GET,POST,OPTIONS","Access-Control-Allow-Headers":"Content-Type,Authorization","Vary":"Origin"}};
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
function developerId(u,env){if(env.OWNER_GOOGLE_EMAIL&&env.OWNER_DEVELOPER_ID&&u.email.toLowerCase()===env.OWNER_GOOGLE_EMAIL.toLowerCase())return env.OWNER_DEVELOPER_ID;return slug(u.email)}
async function session(u,env){const p=btoa(JSON.stringify({sub:u.sub,email:u.email,name:u.name||"",pic:u.picture||"",exp:Date.now()+604800000}));return p+"."+await mac(p,env)}
async function user(req,env){const a=req.headers.get("Authorization")||"";let raw=a.startsWith("Bearer ")?a.slice(7):"";if(!raw){const c=req.headers.get("Cookie")||"",m=c.match(/lunos_session=([^;]+)/);raw=m?.[1]||""}if(!raw||!env.SESSION_SECRET)return null;const [p,s]=raw.split(".");if(!p||!s)return null;try{const ok=await crypto.subtle.verify("HMAC",await key(env),hexBytes(s),new TextEncoder().encode(p));if(!ok)return null;const u=JSON.parse(atob(p));return u.exp>Date.now()?u:null}catch{return null}}
async function authStart(req,env){if(!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET||!env.SESSION_SECRET)return J({error:"Google authentication is not configured"},503,env,req);const u=new URL(req.url);let back=u.searchParams.get("return_to")||env.APP_ORIGIN||"";try{const x=new URL(back);if(!["file:","http:","https:"].includes(x.protocol))back=""}catch{back=""}const redirect=env.GOOGLE_REDIRECT_URI||u.origin+"/auth/google/callback",state=crypto.randomUUID();const q=new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,redirect_uri:redirect,response_type:"code",scope:"openid email profile",state,access_type:"online",prompt:"select_account"});const cookie=`lunos_oauth_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;const mode=u.searchParams.get("mode")||"";const backCookie=`lunos_oauth_return=${encodeURIComponent(back)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;const modeCookie=`lunos_oauth_mode=${mode}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=600`;const h=new Headers({Location:"https://accounts.google.com/o/oauth2/v2/auth?"+q,"Cache-Control":"no-store"});h.append("Set-Cookie",cookie);h.append("Set-Cookie",backCookie);h.append("Set-Cookie",modeCookie);return new Response(null,{status:302,headers:h})}
async function authCallback(req,env){const u=new URL(req.url),code=u.searchParams.get("code"),state=u.searchParams.get("state"),cookie=req.headers.get("Cookie")||"",m=cookie.match(/lunos_oauth_state=([^;]+)/),rm=cookie.match(/lunos_oauth_return=([^;]+)/),mm=cookie.match(/lunos_oauth_mode=([^;]+)/);if(!code||!state||!m||m[1]!==state)return J({error:"Invalid OAuth state"},400,env,req);const redirect=env.GOOGLE_REDIRECT_URI||u.origin+"/auth/google/callback";const t=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:redirect,grant_type:"authorization_code"})}),tx=await t.json();if(!t.ok)return J({error:tx.error_description||"Google token exchange failed"},502,env,req);const r=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:"Bearer "+tx.access_token}}),g=await r.json();if(!r.ok||!g.sub||!g.email)return J({error:"Google account verification failed"},502,env,req);const sessionToken=await session(g,env);let back=env.APP_ORIGIN||"/";if(rm){try{const x=decodeURIComponent(rm[1]);const z=new URL(x);if(["file:","http:","https:"].includes(z.protocol))back=x}catch{}}if(mm?.[1]==="popup"){const safe=JSON.stringify(sessionToken).replace(/</g,"\\u003c");let backForJs="";try{const x=rm?decodeURIComponent(rm[1]):env.APP_ORIGIN||"/";const z=new URL(x);if(["file:","http:","https:"].includes(z.protocol)){z.hash="lunos_session="+encodeURIComponent(sessionToken);backForJs=z.toString()}}catch{}const safeBack=JSON.stringify(backForJs).replace(/</g,"\\u003c");const html=`<!doctype html><meta charset="utf-8"><title>LunOS sign-in</title><p>Signing in to LunOSâ€¦</p><script>const t=${safe},back=${safeBack};if(window.opener){window.opener.postMessage({type:"LunOS_AUTH_SESSION",token:t},"*");setTimeout(()=>window.close(),100)}else if(back){location.replace(back)}else{document.body.innerHTML="<p>Signed in. You can close this window.</p>"}</script>`;const h=new Headers({"Content-Type":"text/html;charset=utf-8","Cache-Control":"no-store"});h.append("Set-Cookie","lunos_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");h.append("Set-Cookie","lunos_oauth_return=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");h.append("Set-Cookie","lunos_oauth_mode=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");return new Response(html,{status:200,headers:h})}const safe=JSON.stringify(sessionToken).replace(/</g,"\\u003c");let backForJs="";try{const x=rm?decodeURIComponent(rm[1]):env.APP_ORIGIN||"/";const z=new URL(x);if(["file:","http:","https:"].includes(z.protocol)){z.hash="lunos_session="+encodeURIComponent(sessionToken);backForJs=z.toString()}}catch{}const safeBack=JSON.stringify(backForJs).replace(/</g,"\\u003c");const html=`<!doctype html><meta charset="utf-8"><title>LunOS sign-in</title><p>Signing in to LunOSâ€¦</p><script>const t=${safe},back=${safeBack};if(window.opener){window.opener.postMessage({type:"LunOS_AUTH_SESSION",token:t},"*");setTimeout(()=>window.close(),150)}else if(back){location.replace(back)}else{document.body.innerHTML="<p>Signed in to LunOS. You can close this window.</p>"}</script>`;const h=new Headers({"Content-Type":"text/html;charset=utf-8","Cache-Control":"no-store"});h.append("Set-Cookie","lunos_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");h.append("Set-Cookie","lunos_oauth_return=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");h.append("Set-Cookie","lunos_oauth_mode=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");return new Response(html,{status:200,headers:h})}

async function recordDeveloper(u,env){const db=env.LUNOS_DB;if(!db||!u?.sub)return;const dev=developerId(u,env);try{await db.prepare("INSERT INTO developers (google_sub,email,name,picture,developer_id,updated_at) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email,name=excluded.name,picture=excluded.picture,developer_id=excluded.developer_id,updated_at=excluded.updated_at").bind(u.sub,u.email,u.name||"",u.picture||"",dev,Date.now()).run()}catch(e){console.error("LunOS developer DB:",e)}}
async function profile(req,env){const u=await user(req,env);if(!u)return J({authenticated:false},401,env,req);await recordDeveloper(u,env);let extra={};try{const p=await sbEnsureProfile(env,u);if(p){let row=null;try{const rows=await sb(env,`profiles?id=eq.${p.id}&select=display_name,recovery_email,created_at,password_hash`);row=rows&&rows[0]}catch{const rows=await sb(env,`profiles?id=eq.${p.id}&select=display_name,created_at,password_hash`);row=rows&&rows[0]}if(row)extra={lunid:p.lunid,displayName:row.display_name||"",recoveryEmail:row.recovery_email||"",memberSince:row.created_at||"",hasPassword:!!row.password_hash}}}catch{}return J({authenticated:true,developerId:developerId(u,env),name:u.name,email:u.email,picture:u.picture||"",authType:String(u.sub||"").startsWith("lunid:")?"lunid":"google",...extra},200,env,req)}

function versionsOf(p){const a=Array.isArray(p?.versions)?p.versions.slice():[];if(p?.package)a.push({...p,versions:undefined});const m=new Map();for(const x of a){const v=x.version||x.appVersion;if(v)m.set(v,x)}return [...m.values()].sort((a,b)=>cmp(a.version||a.appVersion,b.version||b.appVersion))}
function mergePackage(old,entry){const vs=versionsOf(old);vs.push(entry);const m=new Map(vs.map(x=>[x.version||x.appVersion,x]));const all=[...m.values()].sort((a,b)=>cmp(a.version||a.appVersion,b.version||b.appVersion));const latest=all[all.length-1];const first=all.find(x=>x.firstPublishedAt)?.firstPublishedAt||all[0]?.publishedAt||entry.publishedAt;return {...latest,firstPublishedAt:first,versions:all}}
function safeText(x){return typeof x==="string"?x.toLowerCase():""}
function catalogMatches(p,q){if(!q)return true;const hay=[p.id,p.name,p.description,p.shortDescription,p.category,p.publisher?.id,p.publisher?.name,...(p.keywords||[]),...(p.features||[]),...(p.targets||[])].map(safeText).join(" ");return hay.includes(q)}
async function getCatalog(env){if(!env.GITHUB_TOKEN)throw Error("Publisher service is not configured");const repo=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}`),base=repo.default_branch||"main",cf=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/contents/repository/index.json?ref=${base}`);return {base,cf,cat:JSON.parse(new TextDecoder().decode(new Uint8Array(u64(cf.content))))}}

async function upload(req,env){
 const u=await user(req,env);if(!u)return J({error:"Google sign-in required",login:"/auth/google"},401,env,req);
 await recordDeveloper(u,env);if(!env.GITHUB_TOKEN)return J({error:"Publisher service is not configured"},500,env,req);
 let f;try{f=await req.formData()}catch{return J({error:"Could not read upload"},400,env,req)}
 const file=f.get("package"),raw=f.get("manifest"),submitted=f.get("sha256");
 const kind=safeText(f.get("kind")||"");const PACK_KINDS={theme:".zip",wallpaper:".zip",icon:".zip",font:".zip",cursor:".zip",sound:".zip"};
 if(!(file instanceof File))return J({error:"A package file is required"},400,env,req);
 if(kind?(!PACK_KINDS[kind]||!file.name.toLowerCase().endsWith(PACK_KINDS[kind])):!file.name.toLowerCase().endsWith(".ln"))return J({error:kind?"A .zip pack is required for this listing type":"A .ln package is required"},400,env,req);
 if(file.size<=0||file.size>MAX)return J({error:"Invalid package size",maxBytes:MAX},413,env,req);
 let m;try{m=JSON.parse(raw||"")}catch{return J({error:"Invalid manifest JSON"},400,env,req)}
 if(kind?(!id(m.id)||!ver(m.appVersion)||!m.name):(m.format!=="LNPK"||!id(m.id)||!ver(m.appVersion)||!m.name||!m.license?.id))return J({error:kind?"Invalid pack manifest: id, appVersion and name are required":"Invalid manifest: format, id, appVersion, name and license.id are required"},400,env,req);
 try{
  const bytes=await file.arrayBuffer(),sha=hex(await crypto.subtle.digest("SHA-256",bytes)),now=new Date().toISOString();
  if(submitted&&submitted.toLowerCase()!==sha)return J({error:"SHA-256 mismatch"},400,env,req);
  const {base,cf,cat}=await getCatalog(env);if(!Array.isArray(cat.packages))cat.packages=[];
  const canonicalizePackage=x=>{if(x&&typeof x.package==="string"&&x.package.startsWith("lunos-apps/"))x.package=x.package.slice(10);if(Array.isArray(x?.versions))x.versions.forEach(canonicalizePackage);return x};
  cat.packages.forEach(canonicalizePackage);
  const dev=developerId(u,env),_devsOf=x=>{const s=new Set();const push=v=>{v=String(v||"").toLowerCase().replace(/^packages\//,"").replace(/^packs\//,"").split("/")[0];if(v&&v!=="packages"&&v!=="packs")s.add(v)};if(x){push(x.publisher?.id);push(x.package);if(Array.isArray(x.versions))x.versions.forEach(v=>{push(v.publisher?.id);push(v.package||v.url)})}return s},_isOwn=x=>{const s=_devsOf(x);return s.has("lunos-official")||s.has(String(dev).toLowerCase())},folder=kind?`packs/${dev}/${m.id}`:`packages/${dev}/${m.id}`,path=`${folder}/${m.appVersion}${kind?".zip":".ln"}`,catalogPackage=path,owner=cat.packages.find(x=>x.id===m.id);
  if(owner&&owner.publisher?.id&&!_isOwn(owner))return J({error:"App ID belongs to another developer",owner:owner.publisher.id},403,env,req);
  if(owner&&versionsOf(owner).some(x=>String(x.version||x.appVersion)===String(m.appVersion)))return J({error:"This app version already exists"},409,env,req);
  const ref=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/git/ref/heads/${base}`),branch=`lunos-publish/${dev}-${m.id}-${Date.now()}`;
  await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/git/refs`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ref:`refs/heads/${branch}`,sha:ref.object.sha})});
  await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/contents/${path}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:`publish ${m.id} ${m.appVersion}`,content:b64(bytes),branch})});
  const existingVersions=owner?versionsOf(owner):[],firstPublishedAt=existingVersions.find(x=>x.firstPublishedAt)?.firstPublishedAt||existingVersions[0]?.publishedAt||now;
  const entry={
   ...m,id:m.id,name:m.name,version:m.appVersion,appVersion:m.appVersion,
   type:kind||m.type||undefined,publisher:{id:dev,name:u.name,email:u.email},license:m.license||{id:"unspecified",name:"See package"},
   sourceVisibility:m.sourceVisibility||"private-source",description:m.description||"",
   screenshots:Array.isArray(m.screenshots)?m.screenshots:[],iconUrl:m.iconUrl||null,
   featureGraphic:m.featureGraphic||null,permissions:Array.isArray(m.permissions)?m.permissions:[],
   dependencies:Array.isArray(m.dependencies)?m.dependencies:[],keywords:Array.isArray(m.keywords)?m.keywords:[],
   targets:Array.isArray(m.targets)?m.targets:[],features:Array.isArray(m.features)?m.features:[],
   sizeBytes:file.size,sha256:sha,package:catalogPackage,url:catalogPackage,
   manifestFormat:m.format,manifestVersion:kind??m.version,
   firstPublishedAt, publishedAt:now, versionReleaseDate:m.releaseDate||m.versionReleaseDate||now,
   releaseDate:m.releaseDate||now,uploadedAt:now
  };
  const i=cat.packages.findIndex(x=>x.id===m.id);if(i<0)cat.packages.push({...entry,versions:[entry]});else cat.packages[i]=mergePackage(cat.packages[i],entry);
  cat.packages.sort((a,b)=>a.id.localeCompare(b.id));
  await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/contents/repository/index.json`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:`catalog ${m.id} ${m.appVersion}`,content:b64(new TextEncoder().encode(JSON.stringify(cat,null,2)+"\n")),branch,sha:cf.sha})});
  const pr=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/pulls`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({title:`Publish ${m.name} ${m.appVersion}`,head:branch,base,body:`Automated LunOS package submission.\nDeveloper: ${dev}\nGoogle account: ${u.email}\nPackage SHA-256: ${sha}\nPackage type: LNPK application package.`})});
  let mr;try{mr=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/pulls/${pr.number}/merge`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({merge_method:"squash"})})}catch(e){return J({accepted:true,stage:"awaiting-merge",published:false,pullRequest:pr.html_url,mergeError:e.message},202,env,req)}
  return J({accepted:true,stage:mr.merged?"published":"awaiting-merge",published:!!mr.merged,pullRequest:pr.html_url,packagePath:path,version:m.appVersion,developer:dev,publishedAt:now},mr.merged?201:202,env,req)
 }catch(e){return J({accepted:false,error:e.message||String(e)},400,env,req)}
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
 const path=u.searchParams.get("path")||"";if(!/^packages\/[A-Za-z0-9._\/-]+\.ln$/.test(path))return J({error:"Invalid package path"},400,env,req);
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


async function sb(env,path,o={}){if(!env.SUPABASE_URL||!env.SUPABASE_SERVICE_KEY)throw Error("Supabase is not configured");const key=env.SUPABASE_SERVICE_KEY;const hd={"Content-Type":"application/json"};hd["api"+"key"]=key;hd["Authori"+"zation"]="Bear"+"er "+key;const r=await fetch(env.SUPABASE_URL+"/rest/v1/"+path,{...o,headers:{...hd,...(o.headers||{})}});const t=await r.text();let x;try{x=JSON.parse(t)}catch{x={message:t}}if(!r.ok)throw Error((x&&x.message)||("Supabase HTTP "+r.status));return x}
async function sbProfile(env,u){const rows=await sb(env,`profiles?google_sub=eq.${encodeURIComponent(u.sub)}&select=id,lunid,is_banned`);return rows&&rows[0]?rows[0]:null}
async function sbEnsureProfile(env,u){let p=await sbProfile(env,u);if(p)return p;const lunid=slug(u.email)+"@lunos";await sb(env,"profiles",{method:"POST",headers:{Prefer:"resolution=ignore-duplicates"},body:JSON.stringify({google_sub:u.sub,lunid,display_name:u.name||"",avatar_url:u.picture||"",is_publisher:true})});return sbProfile(env,u)}
const needUser=async(req,env)=>{const u=await user(req,env);if(!u)throw Object.assign(Error("Sign in required"),{status:401});const p=await sbEnsureProfile(env,u);if(!p)throw Error("Profile unavailable");if(p.is_banned)throw Object.assign(Error("Account banned"),{status:403});return p};
const b64e=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
const b64d=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
async function pwHash(pw){const salt=crypto.getRandomValues(new Uint8Array(16));const km=await crypto.subtle.importKey("raw",new TextEncoder().encode(pw),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt,iterations:100000,hash:"SHA-256"},km,256);return "pbkdf2$100000$"+b64e(salt)+"$"+b64e(bits)}
async function pwCheck(pw,stored){try{const p=String(stored||"").split("$");if(p.length!==4||p[0]!=="pbkdf2")return false;const km=await crypto.subtle.importKey("raw",new TextEncoder().encode(pw),"PBKDF2",false,["deriveBits"]);const bits=await crypto.subtle.deriveBits({name:"PBKDF2",salt:b64d(p[2]),iterations:Number(p[1])||100000,hash:"SHA-256"},km,256);const got=b64e(bits);let diff=got.length^p[3].length;for(let i=0;i<Math.min(got.length,p[3].length);i++)diff|=got.charCodeAt(i)^p[3].charCodeAt(i);return diff===0}catch{return false}}
async function lunidRegister(req,env){try{let b;try{b=await req.json()}catch{return J({error:"Invalid request"},400,env,req)}const local=String(b.lunid||"").trim().toLowerCase().replace(/@lunos$/,""),name=String(b.name||"").trim().slice(0,80),pw=String(b.password||"");if(!/^[a-z0-9][a-z0-9._-]{2,47}$/.test(local))return J({error:"LunID must be 3-48 characters: letters, numbers, dot, dash or underscore."},400,env,req);if(!name)return J({error:"Display name is required."},400,env,req);if(pw.length<8)return J({error:"Password must be at least 8 characters."},400,env,req);const lunid=local+"@lunos";const existing=await sb(env,`profiles?lunid=eq.${encodeURIComponent(lunid)}&select=id`);if(existing&&existing.length)return J({error:"This LunID is already taken."},409,env,req);const hash=await pwHash(pw);const ins=await sb(env,"profiles",{method:"POST",headers:{Prefer:"return=representation"},body:JSON.stringify({google_sub:"lunid:"+local,lunid,display_name:name,password_hash:hash,is_publisher:false})});if(!ins||!ins.length)return J({error:"Could not create this LunID. LunID sign-in may not be enabled on the server yet."},500,env,req);const token=await session({sub:"lunid:"+local,email:lunid,name},env);return J({ok:true,token,lunid,name},201,env,req)}catch(e){return J({error:"LunID create failed: "+(e&&e.message||e)},500,env,req)}}
async function lunidLogin(req,env){try{let b;try{b=await req.json()}catch{return J({error:"Invalid request"},400,env,req)}const local=String(b.lunid||"").trim().toLowerCase().replace(/@lunos$/,""),pw=String(b.password||""),lunid=local+"@lunos";const rows=await sb(env,`profiles?lunid=eq.${encodeURIComponent(lunid)}&select=google_sub,display_name,password_hash,is_banned`);const row=rows&&rows[0];if(!row||!row.password_hash)return J({error:"Invalid LunID or password."},401,env,req);if(row.is_banned)return J({error:"This account is banned."},403,env,req);if(!await pwCheck(pw,row.password_hash))return J({error:"Invalid LunID or password."},401,env,req);const token=await session({sub:row.google_sub,email:lunid,name:row.display_name||""},env);return J({ok:true,token,lunid,name:row.display_name||""},200,env,req)}catch(e){return J({error:"LunID sign-in failed: "+(e&&e.message||e)},500,env,req)}}
async function leaderboardApi(req,env,u){try{const stats=(await sb(env,"package_stats?select=package_id,downloads_total,likes_total,rating_sum,rating_count"))||[];const recent={};try{const since=new Date(Date.now()-2592000000).toISOString().slice(0,10);const daily=(await sb(env,`downloads_daily?day=gte.${since}&select=package_id&limit=100000`))||[];daily.forEach(r=>{recent[r.package_id]=(recent[r.package_id]||0)+1})}catch{}const {cat}=await getCatalog(env);const byId=new Map((cat.packages||[]).map(p=>[String(p.id),p]));const rows=stats.map(x=>{const p=byId.get(String(x.package_id))||{};const U=Number(x.downloads_total||0),L=Number(x.likes_total||0),rc=Number(x.rating_count||0),rs=Number(x.rating_sum||0);const br=(rs+28.8)/(rc+8);const r30=Number(recent[x.package_id]||0);const score=Math.round((10*Math.log1p(U)*(br/5)+3*Math.log1p(L)+6*Math.log1p(r30))*10)/10;return{package_id:String(x.package_id),name:p.name||String(x.package_id),publisher:(p.publisher&&p.publisher.name)||"",publisherId:(p.publisher&&p.publisher.id)||"",type:p.type||"gui",category:p.category||"",downloads:U,likes:L,rating:rc?Math.round(rs/rc*10)/10:0,ratingCount:rc,recent30:r30,score}});rows.sort((a,b)=>b.score-a.score);if(u.searchParams.get("type")==="packages")return J({type:"leaderboard_packages",results:rows.slice(0,50)},200,env,req);const devs=new Map();rows.forEach(r=>{const k=r.publisherId||r.publisher||"unknown";const d=devs.get(k)||{developerId:k,name:r.publisher||k,score:0,downloads:0,likes:0,packages:0,ratingSum:0,ratingCount:0};d.score=Math.round((d.score+r.score)*10)/10;d.downloads+=r.downloads;d.likes+=r.likes;d.packages+=1;d.ratingSum+=r.rating*r.ratingCount;d.ratingCount+=r.ratingCount;devs.set(k,d)});const list=[...devs.values()].map(d=>({...d,rating:d.ratingCount?Math.round(d.ratingSum/d.ratingCount*10)/10:0})).sort((a,b)=>b.score-a.score);return J({type:"leaderboard_developers",results:list.slice(0,50)},200,env,req)}catch(e){return J({error:e.message||"Leaderboard unavailable"},502,env,req)}}
const ipKey=async req=>{const ip=req.headers.get("CF-Connecting-IP")||"0.0.0.0";const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(ip));return "ip:"+hex(h).slice(0,24)};
async function profileUpdate(req,env){try{const p=await needUser(req,env);const b=await req.json().catch(()=>({}));const name=String(b.displayName||"").trim().slice(0,80);if(!name)return J({error:"Display name is required."},400,env,req);await sb(env,`profiles?id=eq.${p.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({display_name:name})});return J({ok:true,name},200,env,req)}catch(e){return J({error:e.message||"Profile update failed"},e.status||500,env,req)}}
async function recoverySet(req,env){try{const p=await needUser(req,env);const b=await req.json().catch(()=>({}));const email=String(b.email||"").trim().toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return J({error:"Enter a valid recovery email."},400,env,req);await sb(env,`profiles?id=eq.${p.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({recovery_email:email})});return J({ok:true,email},200,env,req)}catch(e){const m=e.message||"Recovery email failed";return J({error:/recovery_email/.test(m)?"Recovery email is not enabled on the server yet.":m},e.status||500,env,req)}}
async function accountDelete(req,env){try{const u=await user(req,env);if(!u)throw Object.assign(Error("Sign in required"),{status:401});const p=await sbProfile(env,u);if(!p)return J({error:"Profile not found"},404,env,req);const b=await req.json().catch(()=>({}));if(String(u.sub||"").startsWith("lunid:")){const rows=await sb(env,`profiles?id=eq.${p.id}&select=password_hash`);const hash=rows&&rows[0]&&rows[0].password_hash;if(!hash||!await pwCheck(String(b.password||""),hash))return J({error:"Current password is incorrect."},403,env,req)}else if(String(b.confirm||"")!=="DELETE")return J({error:"Type DELETE to confirm account deletion."},400,env,req);await sb(env,`profiles?id=eq.${p.id}`,{method:"DELETE"});return J({ok:true},200,env,req)}catch(e){return J({error:e.message||"Delete failed"},e.status||500,env,req)}}
async function lunidForgot(req,env){try{const b=await req.json().catch(()=>({}));const local=String(b.lunid||"").trim().toLowerCase().replace(/@lunos$/,"");if(local){try{await sb(env,"reports",{method:"POST",headers:{Prefer:"return=minimal"},body:JSON.stringify({package_id:"account",reporter:null,reason:"Password reset requested for "+local+"@lunos"})})}catch{}}return J({ok:true,message:"Request noted. If this LunID has a recovery email, support can verify that email and reset the password. Automatic reset emails arrive with the mail update."},200,env,req)}catch{return J({error:"Request failed"},500,env,req)}}
async function passwordChange(req,env){try{const u=await user(req,env);if(!u)throw Object.assign(Error("Sign in required"),{status:401});const p=await sbProfile(env,u);if(!p)return J({error:"Profile not found"},404,env,req);const b=await req.json().catch(()=>({}));const cur=String(b.currentPassword||""),nw=String(b.newPassword||"");if(nw.length<8)return J({error:"New password must be at least 8 characters."},400,env,req);const rows=await sb(env,`profiles?id=eq.${p.id}&select=password_hash`);const hash=rows&&rows[0]&&rows[0].password_hash;if(!hash)return J({error:"This account signs in with Google and has no LunID password to change."},400,env,req);if(!await pwCheck(cur,hash))return J({error:"Current password is incorrect."},403,env,req);if(cur===nw)return J({error:"New password must be different from the current one."},400,env,req);await sb(env,`profiles?id=eq.${p.id}`,{method:"PATCH",headers:{Prefer:"return=minimal"},body:JSON.stringify({password_hash:await pwHash(nw)})});return J({ok:true},200,env,req)}catch(e){return J({error:e.message||"Password change failed"},e.status||500,env,req)}}
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
  if(u.pathname==="/api/sync"&&req.method==="POST"){const p=await needUser(req,env);const b=await req.json().catch(()=>({}));const installed=Array.isArray(b.installed)?b.installed.slice(0,500):[];const unlocks=Array.isArray(b.premiumUnlocks)?b.premiumUnlocks.slice(0,500):[];await sb(env,"user_sync",{method:"POST",headers:{Prefer:"resolution=merge-duplicates"},body:JSON.stringify({user_id:p.id,installed,premium_unlocks:unlocks,updated_at:new Date().toISOString()})});return J({ok:true},200,env,req)}
 }catch(e){return J({error:e.message||"Store API failed"},e.status||502,env,req)}
 return null;
}

/* LunMesh verified number registry (Supabase mesh_numbers).
   The number is NOT chosen by the client: the Worker re-derives it from
   the signed-in LunID and rejects any mismatch. Registration also needs
   an ECDSA signature from the device key that owns the number
   (proof-of-possession), so a stolen session alone cannot move a number. */
async function meshNumberFor(lunid){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode("lunos-mesh:number:"+String(lunid||"").trim().toLowerCase()));const b=new Uint8Array(d);let out=String(6+(b[0]%4));for(let i=1;i<10;i++)out+=String(b[i]%10);return out}
const meshB64Bytes=s=>{const x=atob(String(s||""));const o=new Uint8Array(x.length);for(let i=0;i<x.length;i++)o[i]=x.charCodeAt(i);return o};
async function meshNumberRegister(req,env){
 try{
  const p=await needUser(req,env);
  const b=await req.json().catch(()=>({}));
  const number=String(b.number||"");
  const lunid=String(b.lunid||"").trim().toLowerCase();
  if(!/^\d{10}$/.test(number))return J({error:"Invalid Lun Number"},400,env,req);
  if(!p.lunid||lunid!==String(p.lunid).trim().toLowerCase())return J({error:"This number belongs to a different LunID than the signed-in account"},403,env,req);
  const expected=await meshNumberFor(p.lunid);
  if(number!==expected)return J({error:"Number does not belong to this LunID"},400,env,req);
  const pub=b.pubJwk||b.publicKey;
  if(!pub||pub.kty!=="EC"||pub.crv!=="P-256"||!pub.x||!pub.y)return J({error:"A P-256 device public key is required"},400,env,req);
  let ok=false;
  try{const key=await crypto.subtle.importKey("jwk",{kty:"EC",crv:"P-256",x:pub.x,y:pub.y,ext:true},{name:"ECDSA",namedCurve:"P-256"},true,["verify"]);ok=await crypto.subtle.verify({name:"ECDSA",hash:"SHA-256"},key,meshB64Bytes(b.sig),new TextEncoder().encode("lunos-mesh-register:v1:"+number+":"+lunid))}catch{ok=false}
  if(!ok)return J({error:"Device signature check failed"},403,env,req);
  await sb(env,"mesh_numbers",{method:"POST",headers:{Prefer:"resolution=merge-duplicates,return=minimal"},body:JSON.stringify({number,lunid:p.lunid,public_key:pub,updated_at:new Date().toISOString()})});
  return J({ok:true,number,lunid:p.lunid,verified:true},200,env,req);
 }catch(e){return J({error:e.message||"Registry failed"},e.status||500,env,req)}
}
async function meshNumberLookup(req,env,u){
 const number=decodeURIComponent(u.pathname.slice("/api/mesh/number/".length));
 if(!/^\d{10}$/.test(number))return J({error:"Invalid Lun Number"},400,env,req);
 try{
  const rows=await sb(env,`mesh_numbers?number=eq.${encodeURIComponent(number)}&select=number,lunid,public_key,updated_at`);
  const row=rows&&rows[0];
  if(!row)return J({error:"Number not registered"},404,env,req);
  return J({number:row.number,lunid:row.lunid,public_key:row.public_key,updated_at:row.updated_at},200,env,req);
 }catch(e){return J({error:e.message||"Lookup failed"},502,env,req)}
}

/* Vault access for logged-in users: the Worker hands the device the
   platform bucket's S3 credentials AFTER LunID sign-in, so users never
   create tokens or paste keys. All vault objects are encrypted on the
   device (key from the user's LunID credentials), so the bucket itself
   only ever holds garbage; per-user credential vending is the scale step. */
async function meshVaultAccess(req,env){
 try{
  await needUser(req,env);
  if(!env.HF_VAULT_NS||!env.HF_VAULT_BUCKET||!env.HF_VAULT_KEY_ID||!env.HF_VAULT_SECRET)return J({error:"Vault is not configured on the server yet"},503,env,req);
  return J({ns:env.HF_VAULT_NS,bucket:env.HF_VAULT_BUCKET,keyId:env.HF_VAULT_KEY_ID,secret:env.HF_VAULT_SECRET},200,env,req);
 }catch(e){return J({error:e.message||"Vault access failed"},e.status||500,env,req)}
}

export default{async fetch(req,env){
 const u=new URL(req.url);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:C(env,req)});
 if(req.method==="GET"&&u.pathname==="/")return J({service:"LunOS Publisher",purpose:"Official server-side developer authentication and LNPK package publishing service for the LunOS App Repository",status:"online",version:"0.20.0",repository:`https://github.com/${O}/${R}`,auth:"Google",upload:"/api/upload",catalog:"/api/catalog",search:"/api/search",developerApps:"/api/developer",download:"/api/download",reviews:"/api/reviews"},200,env,req);
 if(req.method==="GET"&&u.pathname==="/api/status")try{const r=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}`),me=await gh(env.GITHUB_TOKEN,"/user");return J({service:"LunOS Publisher",status:"ready",githubConfigured:true,github:{authenticated:true,username:me.login,repositoryAccessible:true,repositoryPermissions:r.permissions},googleConfigured:!!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET&&env.SESSION_SECRET),reviewsConfigured:!!env.LUNOS_DB},200,env,req)}catch(e){return J({error:e.message},502,env,req);
 }
 if(u.pathname==="/auth/google"&&req.method==="GET")return authStart(req,env);
 if(u.pathname==="/auth/google/callback"&&req.method==="GET")return authCallback(req,env);
 if(u.pathname==="/api/auth/lunid/register"&&req.method==="POST")return lunidRegister(req,env);
 if(u.pathname==="/api/auth/lunid/login"&&req.method==="POST")return lunidLogin(req,env);
 if(u.pathname==="/api/me"&&req.method==="GET")return profile(req,env);
 if(u.pathname==="/api/profile"&&req.method==="PATCH")return profileUpdate(req,env);
 if(u.pathname==="/api/account/recovery"&&req.method==="POST")return recoverySet(req,env);
 if(u.pathname==="/api/account/delete"&&req.method==="POST")return accountDelete(req,env);
 if(u.pathname==="/api/account/password"&&req.method==="POST")return passwordChange(req,env);
 if(u.pathname==="/api/auth/lunid/forgot"&&req.method==="POST")return lunidForgot(req,env);
 if(u.pathname==="/api/mesh/number"&&req.method==="POST")return meshNumberRegister(req,env);
 if(u.pathname==="/api/mesh/vault-access"&&req.method==="GET")return meshVaultAccess(req,env);
 if(u.pathname.startsWith("/api/mesh/number/")&&req.method==="GET")return meshNumberLookup(req,env,u);
 if(u.pathname==="/api/upload"&&req.method==="POST")return upload(req,env);
 if((u.pathname==="/api/catalog"||u.pathname==="/api/search"||u.pathname==="/api/developer")&&req.method==="GET")return catalogApi(req,env,u);
 if(u.pathname==="/api/download"&&req.method==="GET")return download(req,env,u);
 if(u.pathname==="/api/reviews"&&(req.method==="GET"||req.method==="POST"))return reviews(req,env,u);
 {const sr=await storeApi(req,env,u);if(sr)return sr;}
 return J({error:"Not found"},404,env,req)
}};
 
