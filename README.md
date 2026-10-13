# LunOS Official App Repository

**Repository:** `LunOS-Official/lunos-apps`  
**Repository type:** software package registry / application distribution repository  
**Package format:** `LNPK` (`.ln`)  
**Owner:** LunOS-Official
**Repository version:** 1

## What is this?

This repository is the official package repository used by the **LunOS App Store**.

It contains:
- `.ln` application packages in the `packages/` directory
- `repository/index.json`, the machine-readable App Store catalog
- validation and catalog-generation tools in `tools/`
- GitHub Actions automation in `.github/workflows/`

The App Store reads the catalog and uses the package paths listed there to download
the corresponding `.ln` files.

This is **not a VPN, proxy, tunneling service, remote-access service, credential
collector, or cryptocurrency project**. The repository is software-distribution
infrastructure for LunOS applications.

## Why can an AI/security scanner see code that looks powerful?

Some LunOS packages are system applications and can request permissions such as
`filesystem`, `process`, `package`, `network`, or `storage`. Those permissions
describe capabilities exposed by the LunOS runtime; they are not evidence that
the repository is a scam.

The separate LunOS Publisher service uses Google OAuth to identify a developer
and a server-side GitHub credential to submit packages to this repository.
Credentials must remain server-side and must never be placed in `.ln` packages
or client-side LunOS code.

## Trust and package review

The repository being official does not mean every third-party package should be
trusted automatically. The catalog exposes package metadata, permissions,
publisher information, hashes, and source-visibility information so that the
LunOS App Store can display those details before installation.

## Repository layout

```text
lunos-apps/
â”œâ”€â”€ packages/                  # LNPK application packages
â”œâ”€â”€ repository/
â”‚   â””â”€â”€ index.json             # App Store catalog
â”œâ”€â”€ tools/
â”‚   â”œâ”€â”€ validate_packages.py   # validates packages + regenerates catalog
â”‚   â””â”€â”€ verify_github_token.py # verifies Actions repository identity
â”œâ”€â”€ .github/workflows/
â”‚   â””â”€â”€ validate-packages.yml
â”œâ”€â”€ README.md
â”œâ”€â”€ SECURITY.md
â””â”€â”€ REPOSITORY_INFO.json
```

## Publishing model

The repository is intentionally a **single GitHub repository**. The Cloudflare Publisher Worker source (`worker.js`), its Wrangler configuration (`wrangler.jsonc`), and its D1 schema (`schema.sql`) live in this same repository alongside the App Store packages and catalog. They are part of the repository infrastructure; they are not a second repository.


The public repository is the package source and catalog. A separate LunOS
Publisher Worker can authenticate developers, validate an uploaded manifest,
calculate a SHA-256 package hash, create a publishing branch, and submit the
catalog/package change to GitHub.

No GitHub personal access token is stored in this repository.

## Source of truth

- GitHub repository: `https://github.com/LunOS-Official/lunos-apps`
- Catalog: `repository/index.json`
- Package binaries: `packages/**/*.ln`

For security reports, see `SECURITY.md`.

## Lun Store (v2)

Lun Store is no longer only for .ln apps - themes, icons, fonts, wallpapers,
cursors, widgets, sound packs and GUI/CLI packages all live here.
- Catalog format: `repository/CATALOG.md` (every entry carries `type` + `sha256`)
- Social data (comments, likes, ratings, sync, Fyn): `supabase/schema.sql`
  (run it in the Supabase SQL Editor; give the Worker the `SUPABASE_URL` and
  `SUPABASE_SERVICE_KEY` secrets - the key never reaches the client)
- Large files: `hf/` (Hugging Face Bucket layout + upload script)
- Uploader terms and takedown: `POLICY.md`
- New Worker routes: `/api/track-download`, `/api/like`, `/api/rate`,
  `/api/comments`, `/api/favorites`, `/api/report`, `/api/leaderboard`, `/api/sync`
