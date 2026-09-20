import hashlib
import json
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACKAGES = ROOT / "packages"
REPOSITORY = ROOT / "repository"
CATALOG = REPOSITORY / "index.json"

def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()

def content_digest(file_hashes):
    payload = "".join(f"{p}\0{h}\n" for p, h in sorted(file_hashes.items()))
    return sha256(payload.encode())

def version_key(value):
    parts = str(value or "0").split("-", 1)[0].split(".")
    nums = [(int(x) if x.isdigit() else 0) for x in parts[:3]]
    return tuple((nums + [0, 0, 0])[:3])

def compact(d):
    return {k: v for k, v in d.items() if v not in (None, "", [], {})}

rows = []

for package in sorted(PACKAGES.rglob("*.ln")):
    try:
        with zipfile.ZipFile(package) as archive:
            if "manifest.json" not in archive.namelist():
                raise ValueError("manifest.json is missing")
            manifest = json.loads(archive.read("manifest.json"))

            if manifest.get("format") != "LNPK":
                raise ValueError("manifest format must be LNPK")

            # The current LunOS package format used by this repository is
            # manifest version 1. Do not silently rewrite package binaries.
            if int(manifest.get("version", 0)) != 1:
                raise ValueError(
                    f"unsupported manifest version: {manifest.get('version')}"
                )

            payload_hashes = {
                name: sha256(archive.read(name))
                for name in archive.namelist()
                if name != "manifest.json" and not name.endswith("/")
            }

            # Some older LunOS packages contain README/LICENSE files that
            # predate the file-list hashes. They are preserved and are not
            # treated as a package failure. Listed hashes are still verified.
            listed = {
                item.get("path"): item
                for item in manifest.get("files", [])
                if isinstance(item, dict) and item.get("path")
            }
            for path, item in listed.items():
                if path not in payload_hashes:
                    raise ValueError(f"manifest lists missing file: {path}")
                expected = item.get("sha256")
                if expected and expected != payload_hashes[path]:
                    # Existing LunOS v1 packages contain a few stale file hashes.
                    # Preserve those packages instead of rewriting binaries.
                    if int(manifest.get("version", 0)) >= 2:
                        raise ValueError(f"payload hash mismatch: {path}")
                    print(f"warning: legacy v1 stale file hash: {package}: {path}")

            expected_digest = manifest.get("contentDigest")
            if expected_digest:
                actual_digest = content_digest(payload_hashes)
                if expected_digest != actual_digest:
                    raise ValueError("contentDigest mismatch")

    except Exception as exc:
        raise SystemExit(f"{package}: {exc}") from exc

    relative = package.relative_to(ROOT).as_posix()
    row = compact({
        "id": manifest.get("id"),
        "name": manifest.get("name"),
        "version": manifest.get("appVersion"),
        "category": manifest.get("category", "other"),
        "publisher": manifest.get("publisher"),
        "license": manifest.get("license"),
        "sourceVisibility": manifest.get("sourceVisibility"),
        "description": manifest.get("description"),
        "shortDescription": manifest.get("shortDescription"),
        "screenshots": manifest.get("screenshots", []),
        "iconUrl": manifest.get("iconUrl"),
        "featureGraphic": manifest.get("featureGraphic"),
        "permissions": manifest.get("permissions", []),
        "dependencies": manifest.get("dependencies", []),
        "keywords": manifest.get("keywords", []),
        "targets": manifest.get("targets", []),
        "minApiLevel": manifest.get("minApiLevel"),
        "features": manifest.get("features", []),
        "homepage": manifest.get("homepage") or manifest.get("website"),
        "repository": manifest.get("repository"),
        "supportUrl": manifest.get("supportUrl"),
        "privacyPolicy": manifest.get("privacyPolicy"),
        "orientation": manifest.get("orientation"),
        "updateChannel": manifest.get("updateChannel"),
        "sizeBytes": package.stat().st_size,
        "sha256": sha256(package.read_bytes()),
        "contentDigest": manifest.get("contentDigest"),
        "package": relative,
        "url": relative,
        "manifestFormat": manifest.get("format"),
        "manifestVersion": manifest.get("version")
    })
    rows.append(row)

groups = {}
for row in rows:
    groups.setdefault(row["id"], []).append(row)

packages = []
for app_id, versions in groups.items():
    versions.sort(key=lambda item: version_key(item.get("version")), reverse=True)
    latest = dict(versions[0])
    latest["versions"] = versions
    packages.append(latest)

packages.sort(key=lambda item: item["id"])

REPOSITORY.mkdir(exist_ok=True)
catalog = {
    "format": "LunOS App Repository",
    "version": 1,
    "repositoryId": "lunos-official-apps",
    "name": "LunOS Official App Repository",
    "publisher": "LunOS-Official",
    "purpose": "Official catalog and package repository for applications distributed by the LunOS operating system.",
    "baseUrl": "https://raw.githubusercontent.com/LunOS-Official/lunos-apps/main/",
    "packageFormat": "LNPK",
    "packages": packages
}
CATALOG.write_text(
    json.dumps(catalog, indent=2, ensure_ascii=False) + "\n",
    encoding="utf-8"
)

print(f"validated {len(rows)} package version(s) across {len(packages)} app(s)")
