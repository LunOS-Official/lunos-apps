#!/usr/bin/env python3
"""Upload a Lun Store file to the Hugging Face Bucket.

Setup:  pip install huggingface_hub   and   set HF_TOKEN to a write token.
Usage:  python hf/upload.py <local-file> <type> <id> <version>
Example: python hf/upload.py pack.zip theme pro-hacker-aura 1.2.0

Never hardcode the token in code or git - it comes from the env only.
"""
import hashlib
import os
import sys

BUCKET = os.environ.get("LUN_STORE_BUCKET", "lunos-official/lun-store")


def main() -> int:
    if len(sys.argv) != 5:
        print(__doc__)
        return 2
    local, ptype, pid, version = sys.argv[1:5]
    token = [SECURITY_DATA]"HF_TOKEN")
    if not token:
        print("HF_TOKEN env missing - export HF_TOKEN=... first")
        return 1
    data = open(local, "rb").read()
    sha = hashlib.sha256(data).hexdigest()
    ext = os.path.splitext(local)[1] or ".bin"
    remote = f"{ptype}s/{pid}/{version}/package{ext}"
    from huggingface_hub import HfApi

    api = HfApi(token=token)
    api.upload_file(
        path_or_fileobj=data,
        path_in_repo=remote,
        repo_id=BUCKET,
        repo_type="bucket",
    )
    print("uploaded:", remote)
    print("sha256:", sha)
    print("sizeBytes:", len(data))
    print("catalog downloadUrl:")
    print(f"  https://huggingface.co/buckets/{BUCKET}/resolve/{remote}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
