import json,zipfile,hashlib,sys
from pathlib import Path
def sha(b):return hashlib.sha256(b).hexdigest()
def dig(a):return sha("".join(f"{p}\0{h}\n" for p,h in sorted(a.items())).encode())
rows=[]
for p in sorted(Path("packages").glob("*.ln")):
    with zipfile.ZipFile(p) as z:
        m=json.loads(z.read("manifest.json"))
        if m.get("format")!="LNPK" or int(m.get("version",0))!=2:raise SystemExit(f"{p}: LNPK v2 required")
        files={n:sha(z.read(n)) for n in z.namelist() if n!="manifest.json" and not n.endswith("/")}
        listed={x["path"]:x for x in m.get("files",[])}
        if set(files)!=set(listed):raise SystemExit(f"{p}: files mismatch")
        if any(listed[k].get("sha256")!=v for k,v in files.items()):raise SystemExit(f"{p}: payload hash mismatch")
        if m.get("contentDigest") and m["contentDigest"]!=dig(files):raise SystemExit(f"{p}: contentDigest mismatch")
    b=p.read_bytes();rows.append({"id":m["id"],"name":m["name"],"version":m["appVersion"],"category":m.get("category","other"),
      "publisher":m.get("publisher"),"license":m.get("license"),"sourceVisibility":m.get("sourceVisibility"),
      "permissions":m.get("permissions",[]),"dependencies":m.get("dependencies",[]),"sizeBytes":len(b),"sha256":sha(b),
      "contentDigest":m.get("contentDigest"),"url":"packages/"+p.name,"signature":m.get("signature")})
Path("repository").mkdir(exist_ok=True)
Path("repository/index.json").write_text(json.dumps({"format":"LunOS App Repository","version":1,"repositoryId":"lunos-official-apps",
"name":"LunOS Official App Repository","publisher":"LunOS-Official","baseUrl":"https://raw.githubusercontent.com/LunOS-Official/lunos-apps/main/","packages":rows},indent=2)+"\n")
print("validated",len(rows),"package(s)")
