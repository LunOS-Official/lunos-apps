# HF Bucket - Lun Store files

Bucket: `lunos-official/lun-store` (Hugging Face > New Bucket, public read).

## Layout

```
themes/<id>/<version>/package.zip        icon.png
icons/<id>/<version>/package.zip
fonts/<id>/<version>/package.zip
wallpapers/<id>/original.jpg             preview.jpg
live-wallpapers/<id>/video.mp4
packages/<id>/<version>/package.ln
media/<id>/screenshots/01.png ...
avatars/<lunid>.png
```

## Rules

- Writes happen only from server/scripts (HF_TOKEN in env). The LunOS
  client never sees the token.
- Changing a file means a new version folder. Never overwrite silently -
  the catalog SHA-256 will catch it anyway.
- After uploading, copy the SHA-256 printed by `python hf/upload.py ...`
  into the catalog entry.
- All large media lives here; the GitHub repo keeps only the catalog and
  small official artwork.
