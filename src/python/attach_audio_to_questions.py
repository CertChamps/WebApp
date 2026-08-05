"""
Attach listening audio (Storage path + start timestamp) onto Firestore image questions.

Reads per-question sidecars written by the StikLeaf scrape:
  scraped_local/{junior-cycle|leaving-cert}/{subject}/{level}/{topic}/*.audio.json
  scraped_local/{…}/audio_manifest.json  (optional; *.audio.json is enough)

Uploads are expected at:
  exam-audio/{mp3_filename}   (see upload_audio.py)

Firestore fields written (merge):
  audioPath       — Storage path
  audioStartSec   — number (0 when scrape had null)
  audioStartLabel — string | omitted when absent

Matching:
  Same subject + level; prefer same topic folder.
  Match fileName stem to question_slug (exact, multipart _N suffix, or strip-suffix group).

Dry-run by default. Pass --apply to write.

Examples:
  python attach_audio_to_questions.py --dir "…/scraped_local" --cycle all --report-unmatched
  python attach_audio_to_questions.py --dir "…/scraped_local" --cycle junior --apply
  python attach_audio_to_questions.py --dir "…/scraped_local" --cycle leaving --subject french --apply
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import firebase_admin
from firebase_admin import credentials, firestore, storage

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CRED_NAME = "firebase-credentials.json"
BUCKET_NAME = "certchamps-a7527.firebasestorage.app"
QUESTIONS_COLLECTION = "questions"
STORAGE_AUDIO_PREFIX = "exam-audio"

FIELD_AUDIO_PATH = "audioPath"
FIELD_AUDIO_START_SEC = "audioStartSec"
FIELD_AUDIO_START_LABEL = "audioStartLabel"

CYCLES = {
    "junior": {
        "folder": "junior-cycle",
        "root_doc": "juniorcert",
    },
    "leaving": {
        "folder": "leaving-cert",
        "root_doc": "leavingcert",
    },
}


@dataclass
class AudioLink:
    cycle: str  # junior | leaving
    subject: str
    level: str
    topic: str
    question_slug: str
    question_label: str
    audio_relpath: str
    start_sec: Optional[float]
    start_label: Optional[str]
    sidecar_path: str

    @property
    def mp3_name(self) -> str:
        return Path(self.audio_relpath.replace("\\", "/")).name

    @property
    def storage_path(self) -> str:
        return f"{STORAGE_AUDIO_PREFIX}/{self.mp3_name}"


@dataclass
class Stats:
    sidecars: int = 0
    matched_links: int = 0
    unmatched_links: int = 0
    docs_updated: int = 0
    docs_would_update: int = 0
    missing_mp3_in_storage: int = 0
    reasons: Counter = field(default_factory=Counter)
    samples: dict[str, list[str]] = field(default_factory=dict)


def resolve_cred_path(explicit: Optional[str] = None) -> Path:
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit).expanduser())
    env = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if env:
        candidates.append(Path(env).expanduser())
    candidates.append(SCRIPT_DIR / DEFAULT_CRED_NAME)
    candidates.append(Path.cwd() / DEFAULT_CRED_NAME)
    tried = []
    for path in candidates:
        tried.append(str(path))
        if path.is_file():
            return path.resolve()
    raise FileNotFoundError(
        "Firebase credentials JSON not found.\nChecked:\n"
        + "\n".join(f"  - {t}" for t in tried)
    )


def init_firebase(cred_path: Path):
    if not firebase_admin._apps:
        cred = credentials.Certificate(str(cred_path))
        firebase_admin.initialize_app(cred, {"storageBucket": BUCKET_NAME})
    return firestore.client(), storage.bucket()


def try_strip_suffix(name_without_ext: str) -> str:
    return re.sub(r"[\s_-]+\d+$", "", name_without_ext)


def stem_matches_slug(stem: str, slug: str) -> bool:
    if not stem or not slug:
        return False
    if stem == slug or stem.startswith(slug + "_"):
        return True
    if try_strip_suffix(stem) == slug:
        return True
    return False


def cycle_from_folder(name: str) -> Optional[str]:
    n = name.lower().replace("_", "-")
    if n in ("junior-cycle", "juniorcycle", "junior-cert", "juniorcert", "jc"):
        return "junior"
    if n in ("leaving-cert", "leavingcert", "leaving-cycle", "lc"):
        return "leaving"
    return None


def parse_sidecar(path: Path, scraped_root: Path) -> Optional[AudioLink]:
    try:
        rel = path.relative_to(scraped_root)
    except ValueError:
        return None
    parts = rel.parts
    # {cycle}/{subject}/{level}/{topic}/{file}.audio.json
    if len(parts) < 5:
        return None
    cycle = cycle_from_folder(parts[0])
    if cycle is None:
        return None
    subject, level, topic = parts[1], parts[2], parts[3]

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"  warn: bad json {path}: {e}", file=sys.stderr)
        return None

    slug = (data.get("question_slug") or path.name.replace(".audio.json", "")).strip()
    if not slug:
        return None
    audio_relpath = (data.get("audio_relpath") or "").strip().replace("\\", "/")
    if not audio_relpath:
        return None

    start_sec = data.get("start_sec")
    if start_sec is not None:
        try:
            start_sec = float(start_sec)
        except (TypeError, ValueError):
            start_sec = None

    label = data.get("start_label")
    if label is not None:
        label = str(label).strip() or None

    return AudioLink(
        cycle=cycle,
        subject=subject,
        level=level,
        topic=topic,
        question_slug=slug,
        question_label=str(data.get("question") or slug),
        audio_relpath=audio_relpath,
        start_sec=start_sec,
        start_label=label,
        sidecar_path=str(path),
    )


def collect_audio_links(
    scraped_root: Path,
    cycles: list[str],
    subject_filter: Optional[set[str]],
) -> list[AudioLink]:
    folder_names = {CYCLES[c]["folder"] for c in cycles}
    links: list[AudioLink] = []
    seen_keys: set[tuple[str, str, str, str, str]] = set()

    for path in sorted(scraped_root.rglob("*.audio.json")):
        link = parse_sidecar(path, scraped_root)
        if link is None:
            continue
        if link.cycle not in cycles:
            continue
        # also ensure under expected cycle folder
        if path.relative_to(scraped_root).parts[0] not in folder_names and cycle_from_folder(
            path.relative_to(scraped_root).parts[0]
        ) not in cycles:
            continue
        if subject_filter and link.subject not in subject_filter:
            continue
        key = (link.cycle, link.subject, link.level, link.topic, link.question_slug)
        if key in seen_keys:
            continue
        seen_keys.add(key)
        links.append(link)
    return links


def load_questions_index(db, root_doc: str, subject_filter: Optional[set[str]]):
    """
    Returns:
      by_sl_topic: (subject, level, topic) -> list[(ref, stem, fileName)]
      by_sl: (subject, level) -> list[(ref, stem, fileName, topic)]
    """
    by_sl_topic: dict[tuple[str, str, str], list[tuple[Any, str, str]]] = defaultdict(list)
    by_sl: dict[tuple[str, str], list[tuple[Any, str, str, str]]] = defaultdict(list)

    root_ref = db.collection(QUESTIONS_COLLECTION).document(root_doc)
    for subj_snap in root_ref.collection("subjects").stream():
        subject = subj_snap.id
        if subject_filter and subject not in subject_filter:
            continue
        for level_snap in subj_snap.reference.collection("levels").stream():
            level = level_snap.id
            for q_snap in level_snap.reference.collection("questions").stream():
                data = q_snap.to_dict() or {}
                file_name = str(data.get("fileName") or data.get("id") or q_snap.id)
                stem = Path(file_name).stem
                topic = str(data.get("topic") or "")
                by_sl_topic[(subject, level, topic)].append((q_snap.reference, stem, file_name))
                by_sl[(subject, level)].append((q_snap.reference, stem, file_name, topic))
    return by_sl_topic, by_sl


def find_matching_docs(
    link: AudioLink,
    by_sl_topic,
    by_sl,
) -> list[Any]:
    slug = link.question_slug
    topic_pool = by_sl_topic.get((link.subject, link.level, link.topic), [])
    level_pool = by_sl.get((link.subject, link.level), [])

    def from_topic_pool(pool):
        return [ref for ref, stem, _fn in pool if stem_matches_slug(stem, slug)]

    def from_level_pool(pool):
        return [ref for ref, stem, _fn, _t in pool if stem_matches_slug(stem, slug)]

    hit = from_topic_pool(topic_pool)
    if hit:
        return hit
    return from_level_pool(level_pool)


def note_reason(stats: Stats, reason: str, sample: str) -> None:
    stats.reasons[reason] += 1
    samples = stats.samples.setdefault(reason, [])
    if len(samples) < 5:
        samples.append(sample)


def run_attach(
    *,
    db,
    bucket,
    scraped_root: Path,
    cycles: list[str],
    dry_run: bool,
    subject_filter: Optional[set[str]],
    report_unmatched: bool,
    check_storage: bool,
    limit: Optional[int],
) -> Stats:
    stats = Stats()
    links = collect_audio_links(scraped_root, cycles, subject_filter)
    if limit is not None:
        links = links[: max(0, limit)]
    stats.sidecars = len(links)

    print(f"Sidecars: {len(links)}")
    if not links:
        return stats

    # Preload question indexes per root_doc
    indexes: dict[str, tuple] = {}
    for cycle in cycles:
        root_doc = CYCLES[cycle]["root_doc"]
        print(f"Loading Firestore questions for {root_doc}…")
        indexes[cycle] = load_questions_index(db, root_doc, subject_filter)
        n = sum(len(v) for v in indexes[cycle][1].values())
        print(f"  indexed {n} question doc(s)")

    existing_audio: Optional[set[str]] = None
    if check_storage:
        print(f"Listing Storage {STORAGE_AUDIO_PREFIX}/…")
        existing_audio = set()
        for blob in bucket.list_blobs(prefix=STORAGE_AUDIO_PREFIX + "/"):
            if blob.name and not blob.name.endswith("/"):
                existing_audio.add(blob.name)

    BATCH = 400
    batch = db.batch()
    batch_count = 0
    preview_left = 30

    for link in links:
        by_sl_topic, by_sl = indexes[link.cycle]
        refs = find_matching_docs(link, by_sl_topic, by_sl)
        sample = (
            f"{link.cycle}/{link.subject}/{link.level}/{link.topic}/"
            f"{link.question_slug} -> {link.storage_path}"
        )

        if check_storage and existing_audio is not None and link.storage_path not in existing_audio:
            stats.missing_mp3_in_storage += 1
            if report_unmatched:
                note_reason(stats, "mp3_not_in_storage", sample)

        if not refs:
            stats.unmatched_links += 1
            if report_unmatched:
                if not by_sl.get((link.subject, link.level)):
                    note_reason(stats, "no_questions_subject_level", sample)
                else:
                    note_reason(stats, "no_question_slug_match", sample)
            continue

        stats.matched_links += 1
        start_sec = 0.0 if link.start_sec is None else float(link.start_sec)
        payload: dict[str, Any] = {
            FIELD_AUDIO_PATH: link.storage_path,
            FIELD_AUDIO_START_SEC: start_sec,
        }
        if link.start_label:
            payload[FIELD_AUDIO_START_LABEL] = link.start_label

        for ref in refs:
            stats.docs_would_update += 1
            if dry_run:
                if preview_left > 0:
                    print(f"DRY  {ref.path}")
                    print(
                        f"       slug={link.question_slug!r} "
                        f"audioPath={link.storage_path!r} startSec={start_sec}"
                    )
                    preview_left -= 1
                continue

            batch.set(ref, payload, merge=True)
            batch_count += 1
            stats.docs_updated += 1
            if batch_count >= BATCH:
                batch.commit()
                batch = db.batch()
                batch_count = 0
                print(f"  updated batch… total {stats.docs_updated}")

    if not dry_run and batch_count:
        batch.commit()

    if dry_run and stats.docs_would_update > 30:
        print(f"DRY  … {stats.docs_would_update - 30} more doc updates")

    print()
    print("── Audio attach summary ──")
    print(f"  sidecars:              {stats.sidecars}")
    print(f"  links matched:         {stats.matched_links}")
    print(f"  links unmatched:       {stats.unmatched_links}")
    print(f"  docs to update:        {stats.docs_would_update}")
    if not dry_run:
        print(f"  docs updated:          {stats.docs_updated}")
    if check_storage:
        print(f"  mp3 missing in Storage:{stats.missing_mp3_in_storage}")
    if report_unmatched and stats.reasons:
        print("  unmatched reasons:")
        for reason, count in stats.reasons.most_common():
            print(f"    {reason}: {count}")
            for s in stats.samples.get(reason, []):
                print(f"      e.g. {s}")
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Attach exam-audio Storage paths onto Firestore question docs"
    )
    parser.add_argument(
        "--dir",
        required=True,
        help="Path to scraped_local (contains junior-cycle/, leaving-cert/, _audio_cache/)",
    )
    parser.add_argument("--cred", type=str, default=None, help="Service account JSON path")
    parser.add_argument(
        "--cycle",
        type=str,
        default="all",
        help="junior | leaving | all (default: all)",
    )
    parser.add_argument(
        "--subject",
        action="append",
        default=None,
        help="Only this subject folder (repeatable)",
    )
    parser.add_argument("--apply", action="store_true", help="Write to Firestore")
    parser.add_argument(
        "--report-unmatched",
        action="store_true",
        help="Print unmatched reason counts",
    )
    parser.add_argument(
        "--check-storage",
        action="store_true",
        help="Warn when referenced MP3 is not in Storage yet",
    )
    parser.add_argument("--limit", type=int, default=None, help="Only first N sidecars")
    args = parser.parse_args()

    scraped_root = Path(args.dir).expanduser().resolve()
    if not scraped_root.is_dir():
        raise SystemExit(f"Not a directory: {scraped_root}")

    cycle_arg = (args.cycle or "all").lower().strip()
    if cycle_arg == "all":
        cycles = list(CYCLES.keys())
    elif cycle_arg in CYCLES:
        cycles = [cycle_arg]
    else:
        raise SystemExit(f"Unknown --cycle {cycle_arg!r}. Choose: junior, leaving, all")

    subject_filter = set(args.subject) if args.subject else None

    try:
        cred_path = resolve_cred_path(args.cred)
    except FileNotFoundError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

    dry_run = not args.apply
    print(f"=== attach_audio_to_questions ({'APPLY' if args.apply else 'DRY RUN'}) ===")
    print(f"Root: {scraped_root}")
    print(f"Cycles: {cycles}")
    if subject_filter:
        print(f"Subjects: {sorted(subject_filter)}")
    print(f"Credentials: {cred_path}")

    db, bucket = init_firebase(cred_path)
    stats = run_attach(
        db=db,
        bucket=bucket,
        scraped_root=scraped_root,
        cycles=cycles,
        dry_run=dry_run,
        subject_filter=subject_filter,
        report_unmatched=bool(args.report_unmatched),
        check_storage=bool(args.check_storage),
        limit=args.limit,
    )

    if stats.sidecars == 0:
        print("No *.audio.json sidecars found.", file=sys.stderr)
        sys.exit(1)

    if dry_run:
        print("\nNo writes performed. Re-run with --apply to update Firestore.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted.", file=sys.stderr)
        sys.exit(130)
