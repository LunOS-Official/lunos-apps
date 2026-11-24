import hashlib
import json
import urllib.error
import urllib.request
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

# Keys that describe where a package really lives (the Hugging Face bucket) or
# what kind of listing it is. They must survive every catalog rebuild: before
# this list existed, a rebuild silently dropped `type` and `downloadUrl`, which
# is exactly how the first theme listing disappeared from the Store.
PRESERVED_KEYS = (
    "type", "downloadUrl", "hfBaseUrl", "hfPath",
    "storeIcon", "storeFeature", "storeScreenshots",
    "publishedAt", "updatedAt", "luniteFont", "ownerKey",
    "rating", "downloads", "likes", "verified",
)

# Pack kinds whose paylaod is a ZIP under packs/.
PACK_TYPES = {"theme", "wallpaper", "live-wallpaper", "icon", "font", "cursor", "sound"}

# Remote-only rows (file lives in the HF bucket) used to be deleted on every
# rebuild. A HEAD request decides whether the link is still alive.
REMOTE_TIMEOUT = 25


def keep_remote_download_url(url: str) -> bool:
    u = str(url or "").strip()
    if not u.startswith(("https://", "http://")):
        return False
    try:
        req = urllib.request.Request(u, method="HEAD", headers={"User-Agent": "lunos-catalog/1"})
        with urllib.request.urlopen(req, timeout=REMOTE_TIMEOUT) as r:
            return 200 <= r.status < 400
    except urllib.error.HTTPError as exc:
        return 300 <= exc.code < 400
    except Exception:
        # Network trouble during CI must never delete a live listing.
        return True


def carry_forward(previous, fresh):
    """Keep publisher/type/bucket metadata from the previous catalog row."""
    row = dict(previous)
    row.update(compact(fresh))
    for key in PRESERVED_KEYS:
        if previous.get(key) not in (None, "", [], {}):
            row.setdefault(key, previous[key])
            if key not in fresh:
                row[key] = previous[key]
    return compact(row)


def compact(d):
    return {k: v for k, v in d.items() if v not in (None, "", [], {})}


IMAGE_EXT = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".bmp", ".ico")


def media_path(archive, declared, prefixes):
    """Resolve Store artwork that actually exists inside the package.

    Catalog rows used to store manifest paths verbatim (e.g. "store/icon.png"),
    the Store rendered them against the raw repository root, and every icon
    request 404'd. Rows now only carry a path that is really in the archive, and
    the client resolves it relative to the package itself.
    """
    names = [n for n in archive.namelist() if not n.endswith("/")]
    want = str(declared or "").strip().lstrip("./")
    if want:
        if want in names and want.lower().endswith(IMAGE_EXT):
            return want
        for name in names:
            if name.lower().endswith("/" + want.lower()):
                return name
    for name in names:
        low = name.lower()
        if low.startswith(tuple(prefixes)) and low.endswith(IMAGE_EXT):
            return name
    return None


def media_list(archive, declared, folder_prefix):
    names = sorted(
        (n for n in archive.namelist()
         if n.lower().startswith(folder_prefix) and n.lower().endswith(IMAGE_EXT)),
        key=lambda n: n.lower(),
    )
    out = []
    for item in declared or []:
        want = str(item or "").strip().lstrip("./")
        if want in names:
            out.append(want)
        else:
            out.extend(n for n in names if n.lower().endswith("/" + want.lower()))
    for name in names:
        if name not in out:
            out.append(name)
    return out

rows = []

# Previous catalog is read before anything is rebuilt: publisher-owned fields
# (verified publisher, timestamps, bucket URLs) must survive regeneration.
previous_rows = []
try:
    previous_rows = json.loads(CATALOG.read_text(encoding="utf-8")).get("packages", [])
except (OSError, ValueError, TypeError):
    previous_rows = []

previous_by_id = {}
previous_by_path = {}
for _item in previous_rows:
    for _version in [_item, *(_item.get("versions") or [])]:
        _path = str(_version.get("package") or _version.get("url") or "")
        if _path.startswith("lunos-apps/"):
            _path = _path[len("lunos-apps/"):]
        if _path:
            previous_by_path[_path] = {k: v for k, v in _version.items() if k != "versions"}
        _id = str(_version.get("id") or "")
        if _id:
            previous_by_id.setdefault(_id, _item)

def previous_for(relative, app_id):
    return previous_by_path.get(relative) or previous_by_id.get(app_id) or {}

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
    with zipfile.ZipFile(package) as _archive:
        _icon = media_path(_archive, manifest.get("iconUrl") or manifest.get("storeIcon"), ("store/icon.", "store/app-icon.", "icon."))
        _feature = media_path(_archive, manifest.get("featureGraphic"), ("store/feature.", "store/banner.", "store/hero."))
        _shots = media_list(_archive, manifest.get("screenshots"), "store/screenshots/")
        _icon_name = _icon.split("/")[-1] if _icon else None
        _feature_name = _feature.split("/")[-1] if _feature else None
    row = compact({
        "id": manifest.get("id"),
        "name": manifest.get("name"),
        # An LNPK .ln is always a GUI application unless its manifest says
        # otherwise. The Store filters on `type`, so a missing value broke tabs.
        "type": (manifest.get("type") or "gui"),
        "version": manifest.get("appVersion"),
        "category": manifest.get("category", "other"),
        "publisher": manifest.get("publisher"),
        "license": manifest.get("license"),
        "sourceVisibility": manifest.get("sourceVisibility"),
        "description": manifest.get("description"),
        "shortDescription": manifest.get("shortDescription"),
        "screenshots": _shots,
        "iconUrl": _icon,
        "featureGraphic": _feature,
        "iconFile": _icon_name,
        "featureFile": _feature_name,
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
    rows.append(carry_forward(previous_for(relative, manifest.get("id")), row))

# Theme and resource packs are ZIPs published under packs/. Keep them when a
# later LNPK build regenerates the catalog. Publisher-owned metadata (notably
# the verified publisher, timestamps and bucket URLs) is retained from the
# previous row instead of being silently dropped.
PACKS = ROOT / "packs"
for package in sorted(PACKS.rglob("*.zip")):
    relative = package.relative_to(ROOT).as_posix()
    previous = previous_for(relative, "")
    try:
        with zipfile.ZipFile(package) as archive:
            info = archive.getinfo("manifest.json")
            if info.file_size > 1024 * 1024:
                raise ValueError("manifest.json exceeds 1 MiB")
            manifest = json.loads(archive.read(info))
            _icon = media_path(archive, manifest.get("iconUrl") or manifest.get("storeIcon"), ("store/icon.", "store/app-icon.", "icon.", "icon."))
            _feature = media_path(archive, manifest.get("featureGraphic"), ("store/feature.", "store/banner.", "store/hero.", "preview."))
            _shots = media_list(archive, manifest.get("screenshots"), "store/screenshots/")
        kind = previous.get("type") or manifest.get("type")
        if kind not in PACK_TYPES:
            raise ValueError("unknown or missing pack type; preserve the publisher catalog row or add manifest.type")
        if not manifest.get("id") or not manifest.get("name") or not manifest.get("appVersion"):
            raise ValueError("id, name and appVersion are required")
    except Exception as exc:
        raise SystemExit(f"{package}: {exc}") from exc
    row = carry_forward(previous, {
        "id": manifest.get("id"), "name": manifest.get("name"),
        "type": kind, "version": manifest.get("appVersion"),
        "appVersion": manifest.get("appVersion"),
        "category": manifest.get("category", "other"),
        "publisher": previous.get("publisher") or manifest.get("publisher"),
        "license": manifest.get("license") or previous.get("license"),
        "sourceVisibility": manifest.get("sourceVisibility"),
        "description": manifest.get("description"),
        "shortDescription": manifest.get("shortDescription"),
        "screenshots": _shots,
        "iconUrl": _icon,
        "featureGraphic": _feature,
        "iconFile": _icon.split("/")[-1] if _icon else None,
        "featureFile": _feature.split("/")[-1] if _feature else None,
        "keywords": manifest.get("keywords", []),
        "sizeBytes": package.stat().st_size,
        "sha256": sha256(package.read_bytes()),
        "package": relative, "url": relative,
        "manifestVersion": previous.get("manifestVersion") or manifest.get("version"),
    })
    rows.append(row)

# Rows that live only in the Hugging Face bucket (downloadUrl, no file in this
# repo) used to be deleted by every rebuild - that is how the first published
# theme vanished from the Store. Keep them while the bucket link still answers.
local_paths = {str(r.get("package") or "") for r in rows}
kept_remote = 0
for item in previous_rows:
    for version in [item, *([])]:
        url = str(version.get("downloadUrl") or "")
        app_id = str(version.get("id") or "")
        if not url or app_id in {str(r.get("id") or "") for r in rows}:
            continue
        local = str(version.get("package") or version.get("url") or "")
        if local and local.startswith("packs/") and local in local_paths:
            continue
        if not version.get("type"):
            continue
        if keep_remote_download_url(url):
            row = {k: v for k, v in version.items() if k != "versions"}
            row.setdefault("package", url)
            row.setdefault("url", url)
            rows.append(compact(row))
            kept_remote += 1
        else:
            print(f"warning: dropping dead remote listing {app_id} ({url})")

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
    "hfBaseUrl": "https://huggingface.co/buckets/lunos-official/lun-store/resolve/",
    "packages": packages
}
CATALOG.write_text(
    json.dumps(catalog, indent=2, ensure_ascii=False) + "\n",
    encoding="utf-8"
)

print(f"validated {len(rows)} package version(s) across {len(packages)} app(s)"
      + (f" ({kept_remote} Hugging Face bucket listing(s) kept)" if kept_remote else ""))
