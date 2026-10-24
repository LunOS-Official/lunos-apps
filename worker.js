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
async function authCallback(req,env){const u=new URL(req.url),code=u.searchParams.get("code"),state=u.searchParams.get("state"),cookie=req.headers.get("Cookie")||"",m=cookie.match(/lunos_oauth_state=([^;]+)/),rm=cookie.match(/lunos_oauth_return=([^;]+)/),mm=cookie.match(/lunos_oauth_mode=([^;]+)/);if(!code||!state||!m||m[1]!==state)return J({error:"Invalid OAuth state"},400,env,req);const redirect=env.GOOGLE_REDIRECT_URI||u.origin+"/auth/google/callback";const t=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code,client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,redirect_uri:redirect,grant_type:"authorization_code"})}),tx=await t.json();if(!t.ok)return J({error:tx.error_description||"Google token exchange failed"},502,env,req);const r=await fetch("https://openidconnect.googleapis.com/v1/userinfo",{headers:{Authorization:"Bearer "+tx.access_token}}),g=await r.json();if(!r.ok||!g.sub||!g.email)return J({error:"Google account verification failed"},502,env,req);const sessionToken=await session(g,env);let back=env.APP_ORIGIN||"/";if(rm){try{const x=decodeURIComponent(rm[1]);const z=new URL(x);if(["file:","http:","https:"].includes(z.protocol))back=x}catch{}}if(mm?.[1]==="popup"){const safe=JSON.stringify(sessionToken).replace(/</g,"\\u003c");let backForJs="";try{const x=rm?decodeURIComponent(rm[1]):env.APP_ORIGIN||"/";const z=new URL(x);if(["file:","http:","https:"].includes(z.protocol)){z.hash="lunos_session="+encodeURIComponent(sessionToken);backForJs=z.toString()}}catch{}const safeBack=JSON.stringify(backForJs).replace(/</g,"\\u003c");const html=`<!doctype html><meta charset="utf-8"><title>LunOS sign-in</title><p>Signing in to LunOS…</p><script>const t=${safe},back=${safeBack};if(window.opener){window.opener.postMessage({type:"LunOS_AUTH_SESSION",token:t},"*");setTimeout(()=>window.close(),100)}else if(back){location.replace(back)}else{document.body.innerHTML="<p>Signed in. You can close this window.</p>"}</script>`;const h=new Headers({"Content-Type":"text/html;charset=utf-8","Cache-Control":"no-store"});h.append("Set-Cookie","lunos_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");h.append("Set-Cookie","lunos_oauth_return=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");h.append("Set-Cookie","lunos_oauth_mode=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");return new Response(html,{status:200,headers:h})}const safe=JSON.stringify(sessionToken).replace(/</g,"\\u003c");let backForJs="";try{const x=rm?decodeURIComponent(rm[1]):env.APP_ORIGIN||"/";const z=new URL(x);if(["file:","http:","https:"].includes(z.protocol)){z.hash="lunos_session="+encodeURIComponent(sessionToken);backForJs=z.toString()}}catch{}const safeBack=JSON.stringify(backForJs).replace(/</g,"\\u003c");const html=`<!doctype html><meta charset="utf-8"><title>LunOS sign-in</title><p>Signing in to LunOS…</p><script>const t=${safe},back=${safeBack};if(window.opener){window.opener.postMessage({type:"LunOS_AUTH_SESSION",token:t},"*");setTimeout(()=>window.close(),150)}else if(back){location.replace(back)}else{document.body.innerHTML="<p>Signed in to LunOS. You can close this window.</p>"}</script>`;const h=new Headers({"Content-Type":"text/html;charset=utf-8","Cache-Control":"no-store"});h.append("Set-Cookie","lunos_oauth_state=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");h.append("Set-Cookie","lunos_oauth_return=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");h.append("Set-Cookie","lunos_oauth_mode=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");return new Response(html,{status:200,headers:h})}

async function recordDeveloper(u,env){const db=env.LUNOS_DB;if(!db||!u?.sub)return;const dev=developerId(u,env);try{await db.prepare("INSERT INTO developers (google_sub,email,name,picture,developer_id,updated_at) VALUES (?1,?2,?3,?4,?5,?6) ON CONFLICT(google_sub) DO UPDATE SET email=excluded.email,name=excluded.name,picture=excluded.picture,developer_id=excluded.developer_id,updated_at=excluded.updated_at").bind(u.sub,u.email,u.name||"",u.picture||"",dev,Date.now()).run()}catch(e){console.error("LunOS developer DB:",e)}}
async function profile(req,env){const u=await user(req,env);if(!u)return J({authenticated:false},401,env,req);await recordDeveloper(u,env);return J({authenticated:true,developerId:developerId(u,env),name:u.name,email:u.email,picture:u.picture||""},200,env,req)}

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
 if(!(file instanceof File)||!file.name.toLowerCase().endsWith(".ln"))return J({error:"A .ln package is required"},400,env,req);
 if(file.size<=0||file.size>MAX)return J({error:"Invalid package size",maxBytes:MAX},413,env,req);
 let m;try{m=JSON.parse(raw||"")}catch{return J({error:"Invalid manifest JSON"},400,env,req)}
 if(m.format!=="LNPK"||!id(m.id)||!ver(m.appVersion)||!m.name||!m.license?.id)return J({error:"Invalid manifest: format, id, appVersion, name and license.id are required"},400,env,req);
 try{
  const bytes=await file.arrayBuffer(),sha=hex(await crypto.subtle.digest("SHA-256",bytes)),now=new Date().toISOString();
  if(submitted&&submitted.toLowerCase()!==sha)return J({error:"SHA-256 mismatch"},400,env,req);
  const {base,cf,cat}=await getCatalog(env);if(!Array.isArray(cat.packages))cat.packages=[];
  const canonicalizePackage=x=>{if(x&&typeof x.package==="string"&&x.package.startsWith("lunos-apps/"))x.package=x.package.slice(10);if(Array.isArray(x?.versions))x.versions.forEach(canonicalizePackage);return x};
  cat.packages.forEach(canonicalizePackage);
  const dev=developerId(u,env),folder=`packages/${dev}/${m.id}`,path=`${folder}/${m.appVersion}.ln`,catalogPackage=path,owner=cat.packages.find(x=>x.id===m.id);
  if(owner&&owner.publisher?.id&&owner.publisher.id!==dev)return J({error:"App ID belongs to another developer",owner:owner.publisher.id},403,env,req);
  if(owner&&versionsOf(owner).some(x=>String(x.version||x.appVersion)===String(m.appVersion)))return J({error:"This app version already exists"},409,env,req);
  const ref=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/git/ref/heads/${base}`),branch=`lunos-publish/${dev}-${m.id}-${Date.now()}`;
  await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/git/refs`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({ref:`refs/heads/${branch}`,sha:ref.object.sha})});
  await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}/contents/${path}`,{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:`publish ${m.id} ${m.appVersion}`,content:b64(bytes),branch})});
  const existingVersions=owner?versionsOf(owner):[],firstPublishedAt=existingVersions.find(x=>x.firstPublishedAt)?.firstPublishedAt||existingVersions[0]?.publishedAt||now;
  const entry={
   ...m,id:m.id,name:m.name,version:m.appVersion,appVersion:m.appVersion,
   publisher:{id:dev,name:u.name,email:u.email},license:m.license,
   sourceVisibility:m.sourceVisibility||"private-source",description:m.description||"",
   screenshots:Array.isArray(m.screenshots)?m.screenshots:[],iconUrl:m.iconUrl||null,
   featureGraphic:m.featureGraphic||null,permissions:Array.isArray(m.permissions)?m.permissions:[],
   dependencies:Array.isArray(m.dependencies)?m.dependencies:[],keywords:Array.isArray(m.keywords)?m.keywords:[],
   targets:Array.isArray(m.targets)?m.targets:[],features:Array.isArray(m.features)?m.features:[],
   sizeBytes:file.size,sha256:sha,package:catalogPackage,url:catalogPackage,
   manifestFormat:m.format,manifestVersion:m.version,
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

export default{async fetch(req,env){
 const u=new URL(req.url);
 if(req.method==="OPTIONS")return new Response(null,{status:204,headers:C(env,req)});
 if(req.method==="GET"&&u.pathname==="/")return J({service:"LunOS Publisher",purpose:"Official server-side developer authentication and LNPK package publishing service for the LunOS App Repository",status:"online",version:"0.18.0",repository:`https://github.com/${O}/${R}`,auth:"Google",upload:"/api/upload",catalog:"/api/catalog",search:"/api/search",developerApps:"/api/developer",download:"/api/download",reviews:"/api/reviews"},200,env,req);
 if(req.method==="GET"&&u.pathname==="/api/status")try{const r=await gh(env.GITHUB_TOKEN,`/repos/${O}/${R}`),me=await gh(env.GITHUB_TOKEN,"/user");return J({service:"LunOS Publisher",status:"ready",githubConfigured:true,github:{authenticated:true,username:me.login,repositoryAccessible:true,repositoryPermissions:r.permissions},googleConfigured:!!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET&&env.SESSION_SECRET),reviewsConfigured:!!env.LUNOS_DB},200,env,req)}catch(e){return J({error:e.message},502,env,req);
 }
 if(u.pathname==="/auth/google"&&req.method==="GET")return authStart(req,env);
 if(u.pathname==="/auth/google/callback"&&req.method==="GET")return authCallback(req,env);
 if(u.pathname==="/api/me"&&req.method==="GET")return profile(req,env);
 if(u.pathname==="/api/upload"&&req.method==="POST")return upload(req,env);
 if((u.pathname==="/api/catalog"||u.pathname==="/api/search"||u.pathname==="/api/developer")&&req.method==="GET")return catalogApi(req,env,u);
 if(u.pathname==="/api/download"&&req.method==="GET")return download(req,env,u);
 if(u.pathname==="/api/reviews"&&(req.method==="GET"||req.method==="POST"))return reviews(req,env,u);
 return J({error:"Not found"},404,env,req)
}};

