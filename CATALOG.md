# Lun Store Catalog Format v2

`repository/index.json` is the single source of truth for the store.
Every entry:

| Field | Meaning |
|---|---|
| `id` | Short unique slug (`a-z0-9._-`), never changes |
| `type` | `gui` - `cli` - `theme` - `icon` - `font` - `wallpaper` - `live-wallpaper` - `cursor` - `widget` - `sound` |
| `name`, `version`, `description`, `shortDescription` | Display metadata |
| `publisher.id` / `publisher.name` | Developer (the Worker developer_id) |
| `license.id` | SPDX id (MIT, Apache-2.0, CC-BY-4.0...) - entries without a license are rejected |
| `sha256` | SHA-256 of the package file - **the OS verifies this before installing** |
| `sizeBytes` | File size |
| `downloadUrl` | Direct HF Bucket CDN link (falls back to `baseUrl + package`) |
| `package` | Path inside this repo (only for files hosted on GitHub) |
| `screenshots`, `iconUrl`, `featureGraphic` | Media (HF Bucket URLs preferred) |
| `minLunOS` | Oldest OS build that can run it (optional) |

## Install behavior per type

- `gui` / `cli` / `widget` -> `.ln` (LNPK) package, installed by the kernel
  package manager. `cli` packages provide Terminal commands.
- `theme` -> `.zip` theme pack, applied by the OS theme importer.
- `icon` -> `.zip` Linux icon theme, applied by the icon engine.
- `font` -> font `.zip`, goes into Personalization font system.
- `wallpaper` / `live-wallpaper` -> image/video for the desktop wallpaper bank.
- `cursor` -> cursor pack, Personalization > Mouse Cursor.
- `sound` -> sound pack, theme sound profile.

## Example (theme)

```json
{
  "id": "pro-hacker-aura",
  "type": "theme",
  "name": "Pro Hacker Aura",
  "version": "1.2.0",
  "category": "themes",
  "publisher": { "id": "lunos-official", "name": "LunOS Official" },
  "license": { "id": "MIT", "name": "MIT License" },
  "description": "Neon hacker glass theme for LunOS.",
  "sha256": "<64 hex chars>",
  "sizeBytes": 169529,
  "downloadUrl": "https://huggingface.co/buckets/lunos-official/lun-store/resolve/themes/pro-hacker-aura/1.2.0/pack.zip",
  "iconUrl": "https://huggingface.co/buckets/lunos-official/lun-store/resolve/themes/pro-hacker-aura/icon.png",
  "screenshots": []
}
```

## Rules

1. One `id` = one product forever. Mistakes ship as a new version, not a new id.
2. Wrong `sha256` = installation is refused. Change the file, update the hash.
3. Large files (>1MB) do not belong in this repo - put them on the HF Bucket
   and reference them with `downloadUrl`.
4. Entries arrive by PR or through the Worker publish flow; never edit main by hand.
