"""
Upload local marking-scheme files to Firebase Storage.

Target layout (what the app expects):
  marking-schemes/junior-cycle/{subject}/{level}-level/{topic}/{filename}
  marking-schemes/leaving-cert/{subject}/{level}-level/{topic}/{filename}

Your local folder should already be organised as:
  {subject}/{level}/{topic}/{files...}
  (level may be bare "higher"/"ordinary"/"common" — script adds "-level")
or already Storage-shaped:
  {subject}/{level}-level/{topic}/{files...}

Dry-run by default. Pass --apply to upload.

Examples:
  python upload_marking_schemes.py --dir "D:/ms/junior" --cycle junior
  python upload_marking_schemes.py --dir "D:/ms/junior" --cycle junior --apply
  python upload_marking_schemes.py --dir ".../leaving-cert" --cycle leaving --apply
  python upload_marking_schemes.py --dir ".../leaving-cert" --cycle leaving --subject mathematics --apply
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

CYCLES = {
    "junior": "marking-schemes/junior-cycle",
    "leaving": "marking-schemes/leaving-cert",
}

# Images + PDF (topic MS are usually images; past-paper MS are PDFs)
ALLOWED_EXTENSIONS = {
    ".png",
    ".jpg",
    ".jpeg",
    ".webp",
    ".gif",
    ".bmp",
    ".tif",
    ".tiff",
    ".pdf",
}


def normalize_prefix(p: str) -> str:
    return p.strip().strip("/")


def init_firebase(cred_path: Path) -> None:
    if firebase_admin._apps:
        return
    if not cred_path.is_file():
        raise SystemExit(f"Credentials not found: {cred_path}")
    cred = credentials.Certificate(str(cred_path))
    firebase_admin.initialize_app(cred, {"storageBucket": BUCKET_NAME})


def strip_leading_cycle_folder(rel: Path, cycle: str) -> Path:
    """If the first segment is junior-cycle / leaving-cert / marking-schemes, drop it."""
    parts = list(rel.parts)
    if not parts:
        return rel

    aliases = {
        "junior": {"junior-cycle", "juniorcycle", "junior-cert", "juniorcert", "jc"},
        "leaving": {"leaving-cert", "leavingcert", "leaving-cycle", "lc"},
    }
    skip = aliases.get(cycle, set()) | {"marking-schemes", "markingschemes"}

    while parts and parts[0].lower().replace("_", "-") in skip:
        parts = parts[1:]
    return Path(*parts) if parts else Path()


def normalize_level_segment(segment: str) -> str:
    """
    Storage expects '{level}-level' (e.g. higher-level).
    Local scrapes often use bare 'higher' / 'ordinary' / 'common'.
    """
    s = segment.strip().lower().replace("_", "-")
    if s.endswith("-level"):
        return s
    known = {"higher", "ordinary", "common", "foundation"}
    if s in known:
        return f"{s}-level"
    return segment


def to_storage_relative(rel: Path) -> Path:
    """Expected: subject / {level}-level / topic / file — normalize the level segment."""
    parts = list(rel.parts)
    if len(parts) >= 2:
        parts[1] = normalize_level_segment(parts[1])
    return Path(*parts)


def collect_files(
    local_dir: Path,
    cycle: str,
    subjects: set[str] | None = None,
) -> list[tuple[Path, str]]:
    """
    Returns list of (local_path, storage_path).
    If subjects is set, only include those subject folder names (case-insensitive).
    """
    storage_root = normalize_prefix(CYCLES[cycle])
    subject_filter = {s.lower() for s in subjects} if subjects else None
    out: list[tuple[Path, str]] = []

    for path in sorted(local_dir.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() not in ALLOWED_EXTENSIONS:
            continue
        # skip junk
        if path.name.startswith(".") or path.name.startswith("~$"):
            continue

        rel = strip_leading_cycle_folder(path.relative_to(local_dir), cycle)
        if not rel.parts:
            continue

        if subject_filter is not None and rel.parts[0].lower() not in subject_filter:
            continue

        rel = to_storage_relative(rel)
        storage_path = f"{storage_root}/{'/'.join(rel.parts)}"
        out.append((path, storage_path))

    return out


def content_type_for(path: Path) -> str:
    guessed, _ = mimetypes.guess_type(str(path))
    return guessed or "application/octet-stream"


def main() -> None:
    parser = argparse.ArgumentParser(description="Upload marking schemes to Firebase Storage")
    parser.add_argument(
        "--dir",
        required=True,
        help="Local folder of marking schemes (subject/level-level/topic/...)",
    )
    parser.add_argument(
        "--cycle",
        choices=sorted(CYCLES.keys()),
        default="junior",
        help="Exam cycle → Storage prefix (default: junior)",
    )
    parser.add_argument(
        "--cred",
        default=str(DEFAULT_CRED),
        help=f"Path to firebase credentials JSON (default: {DEFAULT_CRED})",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually upload. Without this flag, dry-run only.",
    )
    parser.add_argument(
        "--skip-existing",
        action="store_true",
        help="Skip blobs that already exist in Storage (same path).",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Only process the first N files (smoke test).",
    )
    parser.add_argument(
        "--subject",
        action="append",
        default=None,
        help="Only upload this subject folder (repeatable), e.g. --subject mathematics",
    )
    args = parser.parse_args()

    local_dir = Path(args.dir).expanduser().resolve()
    if not local_dir.is_dir():
        raise SystemExit(f"Not a directory: {local_dir}")

    subjects = set(args.subject) if args.subject else None
    files = collect_files(local_dir, args.cycle, subjects=subjects)
    if args.limit is not None:
        files = files[: max(0, args.limit)]

    if not files:
        raise SystemExit(
            f"No uploadable files found under {local_dir}\n"
            f"Allowed extensions: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
        )

    print(f"Local dir : {local_dir}")
    print(f"Cycle     : {args.cycle} -> {CYCLES[args.cycle]}/...")
    if subjects:
        print(f"Subjects  : {sorted(subjects)}")
    print(f"Files     : {len(files)}")
    print(f"Mode      : {'APPLY (upload)' if args.apply else 'DRY RUN'}")
    print()

    # Preview a few
    preview = files[:8]
    for local, remote in preview:
        print(f"  {local.relative_to(local_dir)}  ->  {remote}")
    if len(files) > len(preview):
        print(f"  ... and {len(files) - len(preview)} more")
    print()

    if not args.apply:
        print("Dry run only. Re-run with --apply to upload.")
        return

    init_firebase(Path(args.cred).expanduser().resolve())
    bucket = storage.bucket()

    uploaded = 0
    skipped = 0
    failed = 0

    for i, (local, remote) in enumerate(files, start=1):
        try:
            blob = bucket.blob(remote)
            if args.skip_existing and blob.exists():
                skipped += 1
                print(f"[{i}/{len(files)}] skip (exists) {remote}")
                continue

            blob.upload_from_filename(
                str(local),
                content_type=content_type_for(local),
            )
            uploaded += 1
            print(f"[{i}/{len(files)}] OK {remote}")
        except Exception as e:
            failed += 1
            print(f"[{i}/{len(files)}] FAIL {remote}: {e}")

    print()
    print(f"Done. uploaded={uploaded} skipped={skipped} failed={failed}")
    if uploaded:
        print(
            "\nNext (optional): link schemes onto Firestore question docs:\n"
            f'  python migrate_images_to_firestore.py --cred "{args.cred}" '
            f"--mode marking-schemes --cycle {args.cycle} --apply"
        )


if __name__ == "__main__":
    # Fix accidental typo guard if someone edits collect_files badly
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted.", file=sys.stderr)
        sys.exit(130)
