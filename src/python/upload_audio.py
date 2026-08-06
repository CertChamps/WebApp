"""
Upload scraped listening MP3s from scraped_local/_audio_cache to Firebase Storage.

Local:
  scraped_local/_audio_cache/*.mp3

Storage:
  exam-audio/{filename}.mp3

Dry-run by default. Pass --apply to upload.

Examples:
  python upload_audio.py --dir "…/scraped_local"
  python upload_audio.py --dir "…/scraped_local" --apply --skip-existing
"""

from __future__ import annotations

import argparse
import mimetypes
import sys
from pathlib import Path

import firebase_admin
from firebase_admin import credentials, storage

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CRED = SCRIPT_DIR / "firebase-credentials.json"
BUCKET_NAME = "certchamps-a7527.firebasestorage.app"
STORAGE_PREFIX = "exam-audio"
AUDIO_CACHE_NAME = "_audio_cache"


def init_firebase(cred_path: Path) -> None:
    if firebase_admin._apps:
        return
    if not cred_path.is_file():
        raise SystemExit(f"Credentials not found: {cred_path}")
    cred = credentials.Certificate(str(cred_path))
    firebase_admin.initialize_app(cred, {"storageBucket": BUCKET_NAME})


def resolve_audio_cache(root: Path) -> Path:
    """Accept scraped_local or scraped_local/_audio_cache."""
    if root.name == AUDIO_CACHE_NAME and root.is_dir():
        return root
    cache = root / AUDIO_CACHE_NAME
    if cache.is_dir():
        return cache
    raise SystemExit(
        f"No {AUDIO_CACHE_NAME}/ folder under {root}\n"
        f"Pass --dir pointing at scraped_local (or the _audio_cache folder itself)."
    )


def collect_mp3s(cache_dir: Path) -> list[tuple[Path, str]]:
    out: list[tuple[Path, str]] = []
    for path in sorted(cache_dir.glob("*.mp3")):
        if not path.is_file() or path.name.startswith("."):
            continue
        storage_path = f"{STORAGE_PREFIX}/{path.name}"
        out.append((path, storage_path))
    return out


def content_type_for(path: Path) -> str:
    guessed, _ = mimetypes.guess_type(str(path))
    return guessed or "audio/mpeg"


def main() -> None:
    parser = argparse.ArgumentParser(description="Upload exam listening MP3s to Firebase Storage")
    parser.add_argument(
        "--dir",
        required=True,
        help="Path to scraped_local (or scraped_local/_audio_cache)",
    )
    parser.add_argument(
        "--cred",
        default=str(DEFAULT_CRED),
        help=f"Firebase credentials JSON (default: {DEFAULT_CRED})",
    )
    parser.add_argument("--apply", action="store_true", help="Actually upload")
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip blobs that already exist",
    )
    parser.add_argument("--limit", type=int, default=None, help="Only first N files")
    args = parser.parse_args()

    root = Path(args.dir).expanduser().resolve()
    if not root.exists():
        raise SystemExit(f"Not found: {root}")

    cache = resolve_audio_cache(root)
    files = collect_mp3s(cache)
    if args.limit is not None:
        files = files[: max(0, args.limit)]

    if not files:
        raise SystemExit(f"No .mp3 files in {cache}")

    print(f"Audio cache : {cache}")
    print(f"Storage     : {STORAGE_PREFIX}/…")
    print(f"Files       : {len(files)}")
    print(f"Mode        : {'APPLY (upload)' if args.apply else 'DRY RUN'}")
    print()
    for local, remote in files[:8]:
        print(f"  {local.name}  ->  {remote}")
    if len(files) > 8:
        print(f"  ... and {len(files) - 8} more")
    print()

    if not args.apply:
        print("Dry run only. Re-run with --apply to upload.")
        return

    init_firebase(Path(args.cred).expanduser().resolve())
    bucket = storage.bucket()

    uploaded = skipped = failed = 0
    for i, (local, remote) in enumerate(files, start=1):
        try:
            blob = bucket.blob(remote)
            if args.skip_existing and blob.exists():
                skipped += 1
                print(f"[{i}/{len(files)}] skip (exists) {remote}")
                continue
            blob.upload_from_filename(str(local), content_type=content_type_for(local))
            uploaded += 1
            print(f"[{i}/{len(files)}] OK {remote}")
        except Exception as e:
            failed += 1
            print(f"[{i}/{len(files)}] FAIL {remote}: {e}")

    print()
    print(f"Done. uploaded={uploaded} skipped={skipped} failed={failed}")
    if uploaded or skipped:
        print(
            "\nNext: attach audio onto Firestore question docs:\n"
            f'  python attach_audio_to_questions.py --dir "{root if root.name != AUDIO_CACHE_NAME else root.parent}" '
            f'--cred "{args.cred}" --apply'
        )


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted.", file=sys.stderr)
        sys.exit(130)
