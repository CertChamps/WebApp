"""
Migrate Storage image questions → Firestore, replacing PDF-based papers.

Storage layout:
  temp_images/leaving-cert/{subject}/{level}/{topic}/{filename}.png
  temp_images/junior-cycle/{subject}/{level}/{topic}/{filename}.png

Marking schemes (mode=marking-schemes):
  marking-schemes/leaving-cert/{subject}/{level}-level/{topic}/{filename}
  marking-schemes/junior-cycle/{subject}/{level}-level/{topic}/{filename}

Firestore targets (PDF papers tree wiped and replaced per cycle):
  questions/leavingcert/subjects/...
  questions/juniorcert/subjects/...

Each question doc gets (only when confidently parsed / known):
  year, paper, "paper type", topic, imagePath, questionName, subject, level, fileName

Mode marking-schemes merges onto existing question docs:
  markingSchemePath, markingSchemePaths

DRY RUN by default. Destructive migrate requires BOTH --apply and --replace.
Marking-scheme backfill only needs --apply (merge, no wipe).

Usage:
  python migrate_images_to_firestore.py --cred "..." --cycle junior --limit 30
  python migrate_images_to_firestore.py --cred "..." --cycle junior --apply --replace
  python migrate_images_to_firestore.py --cred "..." --cycle all --apply --replace
  python migrate_images_to_firestore.py --cred "..." --mode marking-schemes --cycle leaving
  python migrate_images_to_firestore.py --cred "..." --mode marking-schemes --cycle all --apply
  python migrate_images_to_firestore.py --cred "..." --mode marking-schemes --cycle junior --report-unmatched
"""

from __future__ import annotations

import argparse
import hashlib
import os
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import firebase_admin
from firebase_admin import credentials, firestore, storage

# ── Config ───────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CRED_NAME = "firebase-credentials.json"
BUCKET_NAME = "certchamps-a7527.firebasestorage.app"

QUESTIONS_COLLECTION = "questions"

# Named cycles: storage prefix → Firestore root doc under questions/
CYCLES: dict[str, dict[str, str]] = {
    "leaving": {
        "storage_prefix": "temp_images/leaving-cert",
        "marking_scheme_prefix": "marking-schemes/leaving-cert",
        "root_doc": "leavingcert",
    },
    "junior": {
        "storage_prefix": "temp_images/junior-cycle",
        "marking_scheme_prefix": "marking-schemes/junior-cycle",
        "root_doc": "juniorcert",
    },
}
DEFAULT_CYCLE = "leaving"
MODES = ("migrate", "marking-schemes")

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tif", ".tiff"}
# Marking schemes are usually images too; allow PDF if present
MS_EXTENSIONS = IMAGE_EXTENSIONS | {".pdf"}

YEAR_MIN, YEAR_MAX = 1990, 2035

FIELD_YEAR = "year"
FIELD_PAPER = "paper"
FIELD_PAPER_TYPE = "paper type"
FIELD_MS_PATH = "markingSchemePath"
FIELD_MS_PATHS = "markingSchemePaths"


# ── Filename metadata parsers (same rules as backfill_year_paper.py) ─────────

YEAR_LEADING = re.compile(r"^(?:19|20)\d{2}(?!\d)")
YEAR_ANY = re.compile(r"(?<!\d)((?:19|20)\d{2})(?!\d)")

PAPER_PATTERNS = [
    re.compile(r"(?<![A-Za-z])papers?\s*[_\-\s]*([12])(?![0-9])", re.IGNORECASE),
    re.compile(r"(?<![A-Za-z0-9])P\s*([12])(?![A-Za-z0-9])", re.IGNORECASE),
    re.compile(
        r"(?:^|(?<!\d))(?:19|20)\d{2}\s*[_\-\s]+(?:p\s*)?([12])(?=[_\-\s]|$)",
        re.IGNORECASE,
    ),
]

_DEFERRED_TOKEN = r"DEFF?ERR?ED"
PAPER_TYPE_PATTERNS = [
    (
        "DEFFERED",
        re.compile(
            rf"(?:\(\s*{_DEFERRED_TOKEN}\s*\)|\[\s*{_DEFERRED_TOKEN}\s*\]|"
            rf"(?<![A-Za-z]){_DEFERRED_TOKEN}(?![A-Za-z]))",
            re.IGNORECASE,
        ),
    ),
    (
        "SAMPLE",
        re.compile(
            r"(?:\(\s*SAMPLE\s*\)|\[\s*SAMPLE\s*\]|(?<![A-Za-z])SAMPLE(?![A-Za-z]))",
            re.IGNORECASE,
        ),
    ),
]


def extract_year(text: str) -> Optional[int]:
    if not text:
        return None
    s = text.strip()
    m = YEAR_LEADING.match(s)
    if m:
        y = int(m.group(0))
        return y if YEAR_MIN <= y <= YEAR_MAX else None
    m2 = YEAR_ANY.search(s)
    if m2:
        y = int(m2.group(1))
        return y if YEAR_MIN <= y <= YEAR_MAX else None
    return None


def extract_paper(text: str) -> Optional[int]:
    if not text:
        return None
    for pat in PAPER_PATTERNS:
        m = pat.search(text)
        if m:
            n = int(m.group(1))
            if n in (1, 2):
                return n
    return None


def extract_paper_type(text: str) -> Optional[str]:
    if not text:
        return None
    best: Optional[tuple[int, str]] = None
    for label, pat in PAPER_TYPE_PATTERNS:
        m = pat.search(text)
        if m and (best is None or m.start() < best[0]):
            best = (m.start(), label)
    return best[1] if best else None


def prettify_name(raw: str) -> str:
    stem = Path(raw).stem if "." in raw else raw
    return re.sub(r"[-_]+", " ", stem).strip().title()


def sanitize_doc_id(*parts: str) -> str:
    """Firestore-safe id from topic + filename (stable, unique under a level)."""
    raw = "__".join(p.strip() for p in parts if p and p.strip())
    safe = re.sub(r"[/\\]+", "-", raw)
    safe = re.sub(r"\s+", "_", safe)
    safe = re.sub(r"[^\w.\-()]+", "_", safe, flags=re.UNICODE)
    safe = safe.strip("._-") or "image"
    if len(safe.encode("utf-8")) > 700:
        digest = hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]
        safe = f"{safe[:200]}_{digest}"
    return safe


# ── Storage → records ────────────────────────────────────────────────────────

@dataclass
class ImageQuestionRecord:
    storage_path: str
    subject: str
    level: str
    topic: str
    file_name: str
    year: Optional[int] = None
    paper: Optional[int] = None
    paper_type: Optional[str] = None

    @property
    def doc_id(self) -> str:
        return sanitize_doc_id(self.topic, Path(self.file_name).stem)

    def to_firestore(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "id": self.doc_id,
            "questionName": prettify_name(self.file_name),
            "topic": self.topic,
            "subject": self.subject,
            "level": self.level,
            "fileName": self.file_name,
            "imagePath": self.storage_path,
            # Mark as image-based so the app can distinguish from legacy PDF papers
            "source": "image",
        }
        if self.year is not None:
            data[FIELD_YEAR] = self.year
        if self.paper is not None:
            data[FIELD_PAPER] = self.paper
        if self.paper_type is not None:
            data[FIELD_PAPER_TYPE] = self.paper_type
        return data


def normalize_prefix(prefix: str) -> str:
    return prefix.strip().strip("/")


def parse_storage_path(blob_name: str, prefix: str) -> Optional[ImageQuestionRecord]:
    """
    Expect: {prefix}/{subject}/{level}/{topic}/{file}
    Returns None if path shape is wrong or not an image.
    """
    prefix = normalize_prefix(prefix)
    name = blob_name.replace("\\", "/")
    if not name.startswith(prefix + "/"):
        return None

    rel = name[len(prefix) + 1 :]
    parts = [p for p in rel.split("/") if p]
    if len(parts) != 4:
        return None

    subject, level, topic, file_name = parts
    ext = Path(file_name).suffix.lower()
    if ext not in IMAGE_EXTENSIONS:
        return None

    stem = Path(file_name).stem
    return ImageQuestionRecord(
        storage_path=name,
        subject=subject,
        level=level,
        topic=topic,
        file_name=file_name,
        year=extract_year(stem),
        paper=extract_paper(stem),
        paper_type=extract_paper_type(stem),
    )


def list_image_records(bucket, prefixes: list[str], limit: Optional[int]) -> list[ImageQuestionRecord]:
    records: list[ImageQuestionRecord] = []
    seen_paths: set[str] = set()

    for prefix in prefixes:
        p = normalize_prefix(prefix)
        print(f"Listing gs://{bucket.name}/{p}/ …")
        for blob in bucket.list_blobs(prefix=p + "/"):
            if not blob.name or blob.name.endswith("/"):
                continue
            rec = parse_storage_path(blob.name, p)
            if rec is None:
                continue
            if rec.storage_path in seen_paths:
                continue
            seen_paths.add(rec.storage_path)
            records.append(rec)
            if limit is not None and len(records) >= limit:
                return records
    return records


# ── Marking scheme listing / matching ────────────────────────────────────────

@dataclass
class MarkingSchemeFile:
    storage_path: str
    subject: str
    level: str  # without "-level" suffix, e.g. "higher"
    topic: Optional[str]  # None if file sits directly under {level}-level/
    file_name: str

    @property
    def stem(self) -> str:
        return Path(self.file_name).stem


def try_strip_suffix(name_without_ext: str) -> str:
    """e.g. 2013_3_Q9_2 → 2013_3_Q9 (same rule as useImageQuestions.ts)."""
    return re.sub(r"[\s_-]+\d+$", "", name_without_ext)


# year + optional P1/P2 + Q number — ignores part letters / SAMPLE / DEFERRED markers
EXAM_CORE_RE = re.compile(
    r"(?P<year>(?:19|20)\d{2})"
    r"(?:_P(?P<paper>[12]))?"
    r".*?[_\-]?Q(?P<q>\d+)",
    re.IGNORECASE,
)


def extract_exam_core(stem: str) -> Optional[tuple[str, str, str]]:
    """
    Returns (year, paper|'', qnum) for matching across part-letter / naming variants.
    Paper is '' when absent (not P1/P2). Does not treat SAMPLE/DEFERRED as paper.
    """
    if not stem:
        return None
    m = EXAM_CORE_RE.search(stem)
    if not m:
        return None
    return (m.group("year"), m.group("paper") or "", m.group("q"))


def is_image_ms_candidate(ms: MarkingSchemeFile) -> bool:
    """Skip past-paper PDF bundles (e.g. 2007ms.pdf) when linking image questions."""
    return Path(ms.file_name).suffix.lower() != ".pdf"


def parse_marking_scheme_path(blob_name: str, prefix: str) -> Optional[MarkingSchemeFile]:
    """
    Expect either:
      {prefix}/{subject}/{level}-level/{topic}/{file}
      {prefix}/{subject}/{level}-level/{file}
    """
    prefix = normalize_prefix(prefix)
    name = blob_name.replace("\\", "/")
    if not name.startswith(prefix + "/"):
        return None

    rel = name[len(prefix) + 1 :]
    parts = [p for p in rel.split("/") if p]
    if len(parts) not in (3, 4):
        return None

    subject = parts[0]
    level_folder = parts[1]
    if not level_folder.endswith("-level"):
        return None
    level = level_folder[: -len("-level")] or level_folder

    if len(parts) == 4:
        topic, file_name = parts[2], parts[3]
    else:
        topic, file_name = None, parts[2]

    ext = Path(file_name).suffix.lower()
    if ext not in MS_EXTENSIONS:
        return None

    return MarkingSchemeFile(
        storage_path=name,
        subject=subject,
        level=level,
        topic=topic,
        file_name=file_name,
    )


def list_marking_scheme_files(
    bucket, prefixes: list[str], limit: Optional[int]
) -> list[MarkingSchemeFile]:
    files: list[MarkingSchemeFile] = []
    seen: set[str] = set()

    for prefix in prefixes:
        p = normalize_prefix(prefix)
        print(f"Listing marking schemes gs://{bucket.name}/{p}/ …")
        for blob in bucket.list_blobs(prefix=p + "/"):
            if not blob.name or blob.name.endswith("/"):
                continue
            ms = parse_marking_scheme_path(blob.name, p)
            if ms is None:
                continue
            if ms.storage_path in seen:
                continue
            seen.add(ms.storage_path)
            files.append(ms)
            if limit is not None and len(files) >= limit:
                return files
    return files


def ms_matches_key(ms_stem: str, key: str) -> bool:
    """Same filename match as getMarkingSchemeFilesForGroupedQuestion in TS."""
    if not key:
        return False
    return ms_stem == key or ms_stem.startswith(key + "_")


def match_marking_schemes_for_question(
    file_name: str,
    topic: Optional[str],
    candidates: list[MarkingSchemeFile],
) -> list[MarkingSchemeFile]:
    """
    Prefer same-topic matches; fall back to whole level.
    Try exact question stem first, then stripped group key (multipart),
    then year+paper+Q core (all parts/pages for that exam question).
    Skips past-paper PDF candidates.
    """
    stem = Path(file_name).stem
    group_key = try_strip_suffix(stem)
    image_cands = [m for m in candidates if is_image_ms_candidate(m)]

    def pick_exact(pool: list[MarkingSchemeFile], key: str) -> list[MarkingSchemeFile]:
        matched = [m for m in pool if ms_matches_key(m.stem, key)]
        matched.sort(key=lambda m: (m.stem, m.file_name))
        return matched

    def pick_core(pool: list[MarkingSchemeFile]) -> list[MarkingSchemeFile]:
        core = extract_exam_core(stem)
        if not core:
            return []
        matched = [m for m in pool if extract_exam_core(m.stem) == core]
        matched.sort(key=lambda m: (m.stem, m.file_name))
        return matched

    topic_pool = (
        [m for m in image_cands if m.topic == topic] if topic else []
    )
    for pool in (topic_pool, image_cands):
        if not pool:
            continue
        hit = pick_exact(pool, stem)
        if hit:
            return hit
        if group_key != stem:
            hit = pick_exact(pool, group_key)
            if hit:
                return hit
        hit = pick_core(pool)
        if hit:
            return hit
    return []


def classify_unmatched_reason(
    file_name: str,
    topic: Optional[str],
    candidates: list[MarkingSchemeFile],
) -> str:
    """Best-effort reason label for --report-unmatched."""
    image_cands = [m for m in candidates if is_image_ms_candidate(m)]
    if not image_cands:
        return "no_ms_for_subject_level"
    core = extract_exam_core(Path(file_name).stem)
    if core and any(extract_exam_core(m.stem) == core for m in image_cands):
        return "core_exists_but_unmatched"  # should be rare after core fallback
    if topic and not any(m.topic == topic for m in image_cands):
        return "no_ms_in_topic_and_no_core"
    return "no_ms_for_year_q"


# ── Firestore wipe / write ───────────────────────────────────────────────────

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
        "Firebase credentials JSON not found.\n"
        "Pass --cred PATH or place firebase-credentials.json next to this script.\n"
        "Checked:\n" + "\n".join(f"  - {t}" for t in tried)
    )


def init_firebase(cred_path: Path):
    if not firebase_admin._apps:
        cred = credentials.Certificate(str(cred_path))
        firebase_admin.initialize_app(cred, {"storageBucket": BUCKET_NAME})
    return firestore.client(), storage.bucket()


def delete_document_recursive(doc_ref) -> int:
    """Delete a document and all nested subcollections. Returns docs deleted."""
    deleted = 0
    for coll in doc_ref.collections():
        for child in coll.stream():
            deleted += delete_document_recursive(child.reference)
    doc_ref.delete()
    return deleted + 1


def wipe_subjects_tree(db, root_doc: str) -> int:
    """
    Completely remove questions/{root}/subjects/* (papers, questions, everything).
    Also clears the root `sections` array (rewritten on import).
    """
    root_ref = db.collection(QUESTIONS_COLLECTION).document(root_doc)
    subjects_ref = root_ref.collection("subjects")
    deleted = 0
    for subj in subjects_ref.stream():
        print(f"  wiping subject {subj.id} …")
        deleted += delete_document_recursive(subj.reference)
    # Reset root sections; keep the root doc itself
    root_ref.set({"sections": [], "contentMode": "image"}, merge=True)
    return deleted


@dataclass
class Stats:
    images_found: int = 0
    would_write: int = 0
    written: int = 0
    wiped_docs: int = 0
    skipped_no_topic: int = 0
    with_year: int = 0
    with_paper: int = 0
    with_paper_type: int = 0
    without_year: int = 0
    subjects: set[str] = field(default_factory=set)
    levels: set[str] = field(default_factory=set)
    topics: set[str] = field(default_factory=set)


def write_records(
    db,
    root_doc: str,
    records: list[ImageQuestionRecord],
    dry_run: bool,
) -> Stats:
    stats = Stats(images_found=len(records))

    # Group for parent section arrays
    by_subject_level: dict[tuple[str, str], list[ImageQuestionRecord]] = defaultdict(list)
    topics_by_sl: dict[tuple[str, str], set[str]] = defaultdict(set)

    for rec in records:
        stats.subjects.add(rec.subject)
        stats.levels.add(rec.level)
        stats.topics.add(rec.topic)
        if rec.year is not None:
            stats.with_year += 1
        else:
            stats.without_year += 1
        if rec.paper is not None:
            stats.with_paper += 1
        if rec.paper_type is not None:
            stats.with_paper_type += 1
        by_subject_level[(rec.subject, rec.level)].append(rec)
        topics_by_sl[(rec.subject, rec.level)].add(rec.topic)

    root_ref = db.collection(QUESTIONS_COLLECTION).document(root_doc)
    subjects_sorted = sorted(stats.subjects)

    if dry_run:
        for rec in records[:40]:
            print(f"DRY  {root_doc}/subjects/{rec.subject}/levels/{rec.level}/questions/{rec.doc_id}")
            print(f"       {rec.to_firestore()}")
        if len(records) > 40:
            print(f"DRY  … {len(records) - 40} more")
        stats.would_write = len(records)
        return stats

    # Parent docs
    root_ref.set(
        {
            "sections": subjects_sorted,
            "contentMode": "image",
        },
        merge=True,
    )

    levels_by_subject: dict[str, set[str]] = defaultdict(set)
    for subject, level in by_subject_level:
        levels_by_subject[subject].add(level)

    for subject, levels in levels_by_subject.items():
        subj_ref = root_ref.collection("subjects").document(subject)
        subj_ref.set({"sections": sorted(levels)}, merge=True)

    for (subject, level), recs in by_subject_level.items():
        level_ref = (
            root_ref.collection("subjects")
            .document(subject)
            .collection("levels")
            .document(level)
        )
        level_ref.set(
            {
                # Replaces "papers" — image catalogue lives in questions/
                "sections": ["questions"],
                "topics": sorted(topics_by_sl[(subject, level)]),
                "contentMode": "image",
            },
            merge=True,
        )

        questions_ref = level_ref.collection("questions")
        batch = db.batch()
        batch_count = 0
        BATCH = 400

        for rec in recs:
            ref = questions_ref.document(rec.doc_id)
            batch.set(ref, rec.to_firestore())
            batch_count += 1
            stats.written += 1
            stats.would_write += 1
            if batch_count >= BATCH:
                batch.commit()
                batch = db.batch()
                batch_count = 0
                print(f"  wrote batch… total {stats.written}")

        if batch_count:
            batch.commit()

    return stats


def print_cycle_summary(stats: Stats, dry_run: bool) -> None:
    print()
    print("── Summary ──")
    print(f"  images found:     {stats.images_found}")
    print(f"  subjects:         {len(stats.subjects)}")
    print(f"  levels:           {len(stats.levels)}")
    print(f"  topics:           {len(stats.topics)}")
    print(f"  with year:        {stats.with_year}")
    print(f"  without year:     {stats.without_year}  (still written; year omitted)")
    print(f"  with paper:       {stats.with_paper}")
    print(f"  with paper type:  {stats.with_paper_type}")
    print(f"  docs to write:    {stats.would_write}")
    if not dry_run:
        print(f"  wiped old docs:   {stats.wiped_docs}")
        print(f"  written:          {stats.written}")


def run_one_cycle(
    *,
    db,
    bucket,
    cycle_name: str,
    storage_prefix: str,
    root_doc: str,
    dry_run: bool,
    limit: Optional[int],
    subject_filter: Optional[set[str]],
) -> Stats:
    print()
    print(f"======== cycle: {cycle_name} ========")
    print(f"Storage: gs://…/{storage_prefix}/")
    print(f"Firestore: {QUESTIONS_COLLECTION}/{root_doc}")
    print()

    records = list_image_records(bucket, [storage_prefix], limit=limit)
    if subject_filter:
        records = [r for r in records if r.subject in subject_filter]

    if not records:
        print(
            f"No images found under {storage_prefix}/ "
            f"(expected {{subject}}/{{level}}/{{topic}}/file).",
            file=sys.stderr,
        )
        return Stats()

    print(f"Found {len(records)} image(s) to import.\n")

    if not dry_run:
        print(f"Wiping {QUESTIONS_COLLECTION}/{root_doc}/subjects/ …")
        wiped = wipe_subjects_tree(db, root_doc)
        print(f"  deleted {wiped} document(s)\n")
    else:
        wiped = 0
        print(
            f"(dry-run) Would wipe ALL of {QUESTIONS_COLLECTION}/{root_doc}/subjects/ "
            "then rewrite image questions.\n"
        )

    stats = write_records(db, root_doc, records, dry_run=dry_run)
    stats.wiped_docs = wiped
    print_cycle_summary(stats, dry_run=dry_run)
    return stats


@dataclass
class MarkingSchemeStats:
    ms_files: int = 0
    questions_scanned: int = 0
    matched: int = 0
    unmatched: int = 0
    updated: int = 0
    would_update: int = 0
    subjects: set[str] = field(default_factory=set)
    unmatched_reasons: Counter = field(default_factory=Counter)
    unmatched_samples: dict[str, list[str]] = field(default_factory=dict)


def run_marking_schemes_cycle(
    *,
    db,
    bucket,
    cycle_name: str,
    ms_prefix: str,
    root_doc: str,
    dry_run: bool,
    limit: Optional[int],
    subject_filter: Optional[set[str]],
    question_limit: Optional[int],
    report_unmatched: bool = False,
) -> MarkingSchemeStats:
    """
    Attach markingSchemePath / markingSchemePaths onto existing image question docs.
    Non-destructive merge — does not wipe the subjects tree.
    """
    print()
    print(f"======== cycle: {cycle_name} (marking-schemes) ========")
    print(f"Marking schemes: gs://…/{ms_prefix}/")
    print(f"Firestore: {QUESTIONS_COLLECTION}/{root_doc}/subjects/…/questions")
    print()

    stats = MarkingSchemeStats()
    ms_files = list_marking_scheme_files(bucket, [ms_prefix], limit=limit)
    if subject_filter:
        ms_files = [m for m in ms_files if m.subject in subject_filter]

    stats.ms_files = len(ms_files)
    if not ms_files:
        print(f"No marking scheme files under {ms_prefix}/", file=sys.stderr)
        return stats

    by_sl: dict[tuple[str, str], list[MarkingSchemeFile]] = defaultdict(list)
    for m in ms_files:
        by_sl[(m.subject, m.level)].append(m)
        stats.subjects.add(m.subject)

    print(
        f"Found {len(ms_files)} marking scheme file(s) "
        f"across {len(by_sl)} subject/level group(s).\n"
    )

    root_ref = db.collection(QUESTIONS_COLLECTION).document(root_doc)
    subjects_ref = root_ref.collection("subjects")
    preview_left = 40
    BATCH = 400
    batch = db.batch()
    batch_count = 0

    for subj_snap in subjects_ref.stream():
        subject = subj_snap.id
        if subject_filter and subject not in subject_filter:
            continue

        for level_snap in subj_snap.reference.collection("levels").stream():
            level = level_snap.id
            candidates = by_sl.get((subject, level), [])
            questions_ref = level_snap.reference.collection("questions")

            for q_snap in questions_ref.stream():
                if question_limit is not None and stats.questions_scanned >= question_limit:
                    break
                stats.questions_scanned += 1
                data = q_snap.to_dict() or {}
                file_name = data.get("fileName") or data.get("id") or q_snap.id
                topic = data.get("topic")

                matched = match_marking_schemes_for_question(
                    str(file_name),
                    str(topic) if topic else None,
                    candidates,
                )
                if not matched:
                    stats.unmatched += 1
                    if report_unmatched:
                        reason = classify_unmatched_reason(
                            str(file_name),
                            str(topic) if topic else None,
                            candidates,
                        )
                        stats.unmatched_reasons[reason] += 1
                        samples = stats.unmatched_samples.setdefault(reason, [])
                        if len(samples) < 5:
                            samples.append(
                                f"{subject}/{level}/{topic}/{file_name}"
                            )
                    continue

                paths = [m.storage_path for m in matched]
                payload = {
                    FIELD_MS_PATH: paths[0],
                    FIELD_MS_PATHS: paths,
                }
                stats.matched += 1
                stats.would_update += 1

                if dry_run:
                    if preview_left > 0:
                        print(
                            f"DRY  {root_doc}/subjects/{subject}/levels/{level}/"
                            f"questions/{q_snap.id}"
                        )
                        print(f"       fileName={file_name!r} → {paths}")
                        preview_left -= 1
                    continue

                batch.set(q_snap.reference, payload, merge=True)
                batch_count += 1
                stats.updated += 1
                if batch_count >= BATCH:
                    batch.commit()
                    batch = db.batch()
                    batch_count = 0
                    print(f"  updated batch… total {stats.updated}")

            if question_limit is not None and stats.questions_scanned >= question_limit:
                break
        if question_limit is not None and stats.questions_scanned >= question_limit:
            break

    if not dry_run and batch_count:
        batch.commit()

    if dry_run and stats.would_update > 40:
        print(f"DRY  … {stats.would_update - 40} more matches")

    print()
    print("── Marking scheme summary ──")
    print(f"  ms files listed:     {stats.ms_files}")
    print(f"  questions scanned:   {stats.questions_scanned}")
    print(f"  matched:             {stats.matched}")
    print(f"  unmatched:           {stats.unmatched}")
    print(f"  docs to update:      {stats.would_update}")
    if not dry_run:
        print(f"  updated:             {stats.updated}")
    if report_unmatched and stats.unmatched_reasons:
        print("  unmatched reasons:")
        for reason, count in stats.unmatched_reasons.most_common():
            print(f"    {reason}: {count}")
            for sample in stats.unmatched_samples.get(reason, []):
                print(f"      e.g. {sample}")
    return stats


def resolve_jobs(args: argparse.Namespace) -> list[tuple[str, str, str, str]]:
    """
    Returns list of (cycle_name, storage_prefix, marking_scheme_prefix, root_doc).
    Custom --storage-prefix/--root-doc overrides named cycles.
    """
    if args.storage_prefix:
        root = args.root_doc or CYCLES[DEFAULT_CYCLE]["root_doc"]
        ms_default = CYCLES[DEFAULT_CYCLE]["marking_scheme_prefix"]
        ms_override = getattr(args, "marking_scheme_prefix", None)
        return [
            (
                "custom",
                normalize_prefix(p),
                normalize_prefix(ms_override) if ms_override else ms_default,
                root,
            )
            for p in args.storage_prefix
        ]

    cycle_arg = (args.cycle or DEFAULT_CYCLE).lower().strip()
    if cycle_arg == "all":
        names = list(CYCLES.keys())
    elif cycle_arg in CYCLES:
        names = [cycle_arg]
    else:
        raise SystemExit(
            f"Unknown --cycle {cycle_arg!r}. Choose: {', '.join(CYCLES)}, all"
        )

    return [
        (
            name,
            CYCLES[name]["storage_prefix"],
            CYCLES[name]["marking_scheme_prefix"],
            CYCLES[name]["root_doc"],
        )
        for name in names
    ]


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Migrate Storage image questions to Firestore, or backfill "
            "markingSchemePath onto existing question docs."
        )
    )
    parser.add_argument("--cred", type=str, default=None, help="Service account JSON path")
    parser.add_argument(
        "--mode",
        type=str,
        choices=MODES,
        default="migrate",
        help=(
            "migrate = wipe+rewrite image catalogue (default); "
            "marking-schemes = merge marking scheme paths onto existing questions"
        ),
    )
    parser.add_argument(
        "--cycle",
        type=str,
        default=DEFAULT_CYCLE,
        help=(
            "Which exam cycle to migrate: leaving | junior | all "
            f"(default: {DEFAULT_CYCLE}). Ignored if --storage-prefix is set."
        ),
    )
    parser.add_argument(
        "--storage-prefix",
        action="append",
        default=None,
        help="Override image storage folder prefix (repeatable). Implies custom job(s).",
    )
    parser.add_argument(
        "--marking-scheme-prefix",
        type=str,
        default=None,
        help=(
            "Override marking-scheme storage prefix "
            "(used with --mode marking-schemes, or custom --storage-prefix jobs)"
        ),
    )
    parser.add_argument(
        "--root-doc",
        type=str,
        default=None,
        help="Firestore doc under 'questions' when using --storage-prefix",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help=(
            "Only list the first N storage files per cycle "
            "(images for migrate; marking schemes for marking-schemes mode)"
        ),
    )
    parser.add_argument(
        "--question-limit",
        type=int,
        default=None,
        help="marking-schemes mode: stop after scanning N Firestore question docs",
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Write to Firestore",
    )
    parser.add_argument(
        "--replace",
        action="store_true",
        help="migrate mode only: REQUIRED with --apply to wipe subjects tree first",
    )
    parser.add_argument(
        "--subject",
        action="append",
        default=None,
        help="Only include this storage subject folder (repeatable)",
    )
    parser.add_argument(
        "--report-unmatched",
        action="store_true",
        help="marking-schemes mode: print unmatched reason counts (and samples)",
    )
    args = parser.parse_args()

    subject_filter = set(args.subject) if args.subject else None
    mode = (args.mode or "migrate").lower().strip()

    try:
        cred_path = resolve_cred_path(args.cred)
    except FileNotFoundError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

    dry_run = not args.apply
    if mode == "migrate" and args.apply and not args.replace:
        print(
            "Refusing to --apply without --replace.\n"
            "This migration wipes questions/{root}/subjects/* "
            "and rebuilds an image catalogue.\n"
            "Re-run with: --apply --replace",
            file=sys.stderr,
        )
        sys.exit(2)

    jobs = resolve_jobs(args)
    if args.marking_scheme_prefix and not args.storage_prefix:
        ms_p = normalize_prefix(args.marking_scheme_prefix)
        jobs = [(n, sp, ms_p, r) for n, sp, _, r in jobs]

    label = "DRY RUN" if dry_run else ("APPLY" if mode == "marking-schemes" else "APPLY + REPLACE")
    print(f"=== migrate_images_to_firestore mode={mode} ({label}) ===")
    print(f"Credentials: {cred_path}")
    print(
        f"Jobs: {', '.join(f'{n}→{QUESTIONS_COLLECTION}/{r}' for n, _, _, r in jobs)}"
    )
    if args.limit:
        print(f"Storage list limit per cycle: {args.limit}")
    if args.question_limit and mode == "marking-schemes":
        print(f"Question scan limit: {args.question_limit}")
    if subject_filter:
        print(f"Subject filter: {sorted(subject_filter)}")

    db, bucket = init_firebase(cred_path)

    any_work = False
    for cycle_name, storage_prefix, ms_prefix, root_doc in jobs:
        if mode == "marking-schemes":
            ms_stats = run_marking_schemes_cycle(
                db=db,
                bucket=bucket,
                cycle_name=cycle_name,
                ms_prefix=ms_prefix,
                root_doc=root_doc,
                dry_run=dry_run,
                limit=args.limit,
                subject_filter=subject_filter,
                question_limit=args.question_limit,
                report_unmatched=bool(args.report_unmatched),
            )
            if ms_stats.ms_files > 0 or ms_stats.questions_scanned > 0:
                any_work = True
        else:
            stats = run_one_cycle(
                db=db,
                bucket=bucket,
                cycle_name=cycle_name,
                storage_prefix=storage_prefix,
                root_doc=root_doc,
                dry_run=dry_run,
                limit=args.limit,
                subject_filter=subject_filter,
            )
            if stats.images_found > 0:
                any_work = True

    if not any_work:
        print("\nNothing found for any job.", file=sys.stderr)
        sys.exit(1)

    if dry_run:
        print()
        print("No writes performed. When ready:")
        if mode == "marking-schemes":
            print(
                '  python migrate_images_to_firestore.py --cred "…" '
                "--mode marking-schemes --cycle leaving --apply"
            )
            print(
                '  python migrate_images_to_firestore.py --cred "…" '
                "--mode marking-schemes --cycle all --apply"
            )
        else:
            print(
                '  python migrate_images_to_firestore.py --cred "…" '
                "--cycle junior --apply --replace"
            )
            print(
                '  python migrate_images_to_firestore.py --cred "…" '
                "--cycle all --apply --replace"
            )


if __name__ == "__main__":
    main()
