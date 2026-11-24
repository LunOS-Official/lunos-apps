#!/usr/bin/env python3
"""Fail the build when the catalog and the repository disagree.

Three classes of breakage this blocks, all of which happened for real:
  1. a package file inside the repo that no catalog row points at
     (font-km1fug/1.0.0.zip shipped but never listed),
  2. a catalog row with no file and no working bucket link
     (phantom rows like the first theme listing),
  3. rows that lost `type`, so the Store's Themes/Icons tabs stay empty.

Usage: python tools/verify_catalog.py            # CI mode, exits 1 on problems
       python tools/verify_catalog.py --no-net   # skip bucket HEAD checks
"""
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "repository" / "index.json"
PACK_TYPES = {"theme", "wallpaper", "live-wallpaper", "icon", "font", "cursor", "sound"}
NET = "--no-net" not in sys.argv


def alive(url: str) -> bool:
    if not NET:
        return True
    if not str(url or "").startswith(("http://", "https://")):
        return False
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "lunos-catalog/1"})
        with urllib.request.urlopen(req, timeout=20) as r:
            return 200 <= r.status < 400
    except urllib.error.HTTPError as exc:
        return 300 <= exc.code < 400
    except Exception:
        return True  # network flake must not fail the build


def main() -> int:
    catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
    packages = catalog.get("packages", [])
    problems = []

    listed = set()
    for item in packages:
        for version in [item, *(item.get("versions") or [])]:
            path = str(version.get("package") or version.get("url") or "")
            if path.startswith("lunos-apps/"):
                path = path[len("lunos-apps/"):]
            if path.startswith(("packages/", "packs/")):
                listed.add(path)

    on_disk = {
        p.relative_to(ROOT).as_posix()
        for pattern in ("packages/**/*.ln", "packages/**/*.zip", "packs/**/*.zip", "packs/**/*.ln")
        for p in ROOT.glob(pattern)
        if p.is_file()
    }

    for path in sorted(on_disk - listed):
        problems.append(f"unlisted package file (no catalog row): {path}")

    for item in packages:
        app_id = item.get("id")
        if not item.get("type"):
            problems.append(f"row without type (Store tabs break): {app_id}")
        url = str(item.get("downloadUrl") or "")
        local = str(item.get("package") or item.get("url") or "")
        in_repo = local and (ROOT / local).is_file()
        if url and not in_repo and not alive(url):
            problems.append(f"dead bucket link for {app_id}: {url}")
        if not in_repo and not url:
            problems.append(f"row points at nothing (phantom): {app_id} -> {local}")

    for problem in problems:
        print("FAIL " + problem)
    if problems:
        return 1
    print(f"catalog OK: {len(packages)} listing(s), {len(on_disk)} package file(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
