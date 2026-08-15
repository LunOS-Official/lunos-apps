#!/usr/bin/env python3
"""Verify the GitHub Actions credential without exposing its value."""
import os, sys, urllib.request, json

token = os.environ.get("GITHUB_TOKEN")
if not token:
    raise SystemExit("ERROR: GITHUB_TOKEN is not available.")

repo = os.environ.get("GITHUB_REPOSITORY", "")
if repo != "LunOS-Official/lunos-apps":
    raise SystemExit(f"ERROR: unexpected repository: {repo or '(unknown)'}")

def get(url):
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2026-03-10",
        "User-Agent": "LunOS-package-validator"
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.load(r)

try:
    get("https://api.github.com/user")
    repository = get("https://api.github.com/repos/LunOS-Official/lunos-apps")
except Exception:
    raise SystemExit("ERROR: GitHub credential verification failed.")

if repository.get("full_name") != "LunOS-Official/lunos-apps":
    raise SystemExit("ERROR: repository identity check failed.")

print("GitHub credential: VERIFIED")
print("Repository: VERIFIED (LunOS-Official/lunos-apps)")
print("Token value: NOT PRINTED")
