#!/usr/bin/env python3
"""Verify the GitHub Actions repository credential without exposing its value."""
import os, sys, urllib.request, urllib.error, json

EXPECTED_REPO = "LunOS-Official/lunos-apps"
token = os.environ.get("GITHUB_TOKEN")
if not token:
    raise SystemExit("ERROR: GITHUB_TOKEN is not available.")

repo = os.environ.get("GITHUB_REPOSITORY", "")
if repo != EXPECTED_REPO:
    raise SystemExit(f"ERROR: unexpected repository: {repo or '(unknown)'}")

def get(url):
    req = urllib.request.Request(url, headers={
        "Accept": "application/vnd.github+json",
        "Authorization": f"Bearer {token}",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "LunOS-package-validator"
    })
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        try:
            body = json.loads(e.read().decode("utf-8", "replace"))
            message = body.get("message", "HTTP error")
        except Exception:
            message = "HTTP error"
        raise SystemExit(f"ERROR: GitHub API returned HTTP {e.code}: {message}")
    except urllib.error.URLError as e:
        raise SystemExit(f"ERROR: GitHub API connection failed: {e.reason}")

# GITHUB_TOKEN is a repository-scoped Actions token. Verify the repository
# endpoint directly; /user is not required and may be unavailable to this token type.
repository = get(f"https://api.github.com/repos/{EXPECTED_REPO}")

if repository.get("full_name") != EXPECTED_REPO:
    raise SystemExit("ERROR: repository identity check failed.")

print("GitHub credential: VERIFIED")
print("Repository: VERIFIED (LunOS-Official/lunos-apps)")
print("Token value: NOT PRINTED")
