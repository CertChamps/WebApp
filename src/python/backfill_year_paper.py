"""
Backfill `year`, `paper`, and optionally `paper type` on Leaving Cert
exam docs under:

  questions / leavingcert / subjects / {subject} / levels / {level} / papers / {paperId}
  questions / leavingcert / subjects / {subject} / levels / {level} / papers / {paperId} / questions / {qId}

Parses from document id + name/label/questionName only (never guesses).
Nested question docs may also inherit year/paper/type from their parent paper
id/label when the question itself has no markers.

By default runs in DRY RUN mode — pass --apply to write.

Usage:
  python backfill_year_paper.py --limit-papers 20
  python backfill_year_paper.py --cred "C:\\path\\to\\firebase-credentials.json"
  python backfill_year_paper.py --apply
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Optional

import firebase_admin
from firebase_admin import credentials, firestore

# ── Config ───────────────────────────────────────────────────────────────────
SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CRED_NAME = "firebase-credentials.json"

# Firestore path: questions/{ROOT_DOC}/subjects/...
QUESTIONS_COLLECTION = "questions"
ROOT_DOC_ID = "leavingcert"  # UI often shows this as "leaving-cert"; Firestore id is leavingcert

# Plausible Leaving Cert exam year window
YEAR_MIN = 1990
YEAR_MAX = 2035

# Field names written to Firestore (as requested)
FIELD_YEAR = "year"
FIELD_PAPER = "paper"
FIELD_PAPER_TYPE = "paper type"


# ── Parsing ──────────────────────────────────────────────────────────────────

YEAR_LEADING = re.compile(r"^(?:19|20)\d{2}(?!\d)")
YEAR_ANY = re.compile(r"(?<!\d)((?:19|20)\d{2})(?!\d)")

PAPER_PATTERNS = [
    # Paper 1 / Paper1 / Paper_1 / Paper-1
    re.compile(r"(?<![A-Za-z])papers?\s*[_\-\s]*([12])(?![0-9])", re.IGNORECASE),
    # P1 / P 1 / P2
    re.compile(r"(?<![A-Za-z0-9])P\s*([12])(?![A-Za-z0-9])", re.IGNORECASE),
    # Year then paper digit: 2024_1_… / 2024-p1 / 2024-1
    re.compile(
        r"(?:^|(?<!\d))(?:19|20)\d{2}\s*[_\-\s]+(?:p\s*)?([12])(?=[_\-\s]|$)",
        re.IGNORECASE,
    ),
]

# DEFERRED (correct), DEFFERED (filename misspelling), DEFFERRED
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


def _clamp_year(y: int) -> Optional[int]:
    if YEAR_MIN <= y <= YEAR_MAX:
        return y
    return None


def extract_year(text: str) -> Optional[int]:
    if not text:
        return None
    s = text.strip()
    m = YEAR_LEADING.match(s)
    if m:
        return _clamp_year(int(m.group(0)))
    m2 = YEAR_ANY.search(s)
    if m2:
        return _clamp_year(int(m2.group(1)))
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
        if m:
            pos = m.start()
            if best is None or pos < best[0]:
                best = (pos, label)
    return best[1] if best else None


def candidate_strings(doc_id: str, data: dict[str, Any], extra: Optional[list[str]] = None) -> list[str]:
    """Strings we are willing to parse — never invent values."""
    out: list[str] = []
    seen: set[str] = set()

    def add(v: Any) -> None:
        if isinstance(v, str):
            s = v.strip()
            if s and s not in seen:
                seen.add(s)
                out.append(s)

    add(doc_id)
    add(data.get("id"))
    add(data.get("name"))
    add(data.get("label"))
    add(data.get("questionName"))
    if extra:
        for e in extra:
            add(e)
    return out


@dataclass
class ParsedFields:
    year: Optional[int] = None
    paper: Optional[int] = None
    paper_type: Optional[str] = None
    year_from: Optional[str] = None
    paper_from: Optional[str] = None
    paper_type_from: Optional[str] = None


def parse_from_strings(candidates: list[str]) -> ParsedFields:
    result = ParsedFields()
    for s in candidates:
        if result.year is None:
            y = extract_year(s)
            if y is not None:
                result.year = y
                result.year_from = s
        if result.paper is None:
            p = extract_paper(s)
            if p is not None:
                result.paper = p
                result.paper_from = s
        if result.paper_type is None:
            pt = extract_paper_type(s)
            if pt is not None:
                result.paper_type = pt
                result.paper_type_from = s
        if (
            result.year is not None
            and result.paper is not None
            and result.paper_type is not None
        ):
            break
    return result


def parse_doc(
    doc_id: str,
    data: dict[str, Any],
    extra: Optional[list[str]] = None,
) -> ParsedFields:
    return parse_from_strings(candidate_strings(doc_id, data, extra=extra))


def build_update(
    data: dict[str, Any],
    parsed: ParsedFields,
    overwrite: bool,
) -> dict[str, Any]:
    update: dict[str, Any] = {}

    def should_set(key: str) -> bool:
        if overwrite:
            return True
        return key not in data or data[key] is None

    if parsed.year is not None and should_set(FIELD_YEAR):
        update[FIELD_YEAR] = parsed.year
    if parsed.paper is not None and should_set(FIELD_PAPER):
        update[FIELD_PAPER] = parsed.paper
    if parsed.paper_type is not None and should_set(FIELD_PAPER_TYPE):
        update[FIELD_PAPER_TYPE] = parsed.paper_type

    return update


# ── Firebase ─────────────────────────────────────────────────────────────────

def resolve_cred_path(explicit: Optional[str] = None) -> Path:
    candidates: list[Path] = []
    if explicit:
        candidates.append(Path(explicit).expanduser())
    env = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
    if env:
        candidates.append(Path(env).expanduser())
    candidates.append(SCRIPT_DIR / DEFAULT_CRED_NAME)
    candidates.append(Path.cwd() / DEFAULT_CRED_NAME)

    tried: list[str] = []
    for path in candidates:
        tried.append(str(path))
        if path.is_file():
            return path.resolve()

    lines = "\n".join(f"  - {t}" for t in tried)
    raise FileNotFoundError(
        "Firebase credentials JSON not found.\n"
        "Pass --cred PATH, set GOOGLE_APPLICATION_CREDENTIALS, or place "
        f"{DEFAULT_CRED_NAME} next to this script.\n"
        f"Checked:\n{lines}"
    )


def init_db(cred_path: Path):
    if not firebase_admin._apps:
        cred = credentials.Certificate(str(cred_path))
        firebase_admin.initialize_app(cred)
    return firestore.client()


@dataclass
class Stats:
    papers_scanned: int = 0
    questions_scanned: int = 0
    would_update: int = 0
    updated: int = 0
    skipped_no_parse: int = 0
    skipped_already_set: int = 0
    skipped_no_year: int = 0
    errors: int = 0
    subjects: set[str] = field(default_factory=set)


class BatchWriter:
    def __init__(self, db, dry_run: bool, batch_size: int = 400):
        self.db = db
        self.dry_run = dry_run
        self.batch_size = batch_size
        self.batch = db.batch()
        self.count = 0
        self.committed = 0

    def update(self, ref, data: dict[str, Any]) -> None:
        if self.dry_run:
            return
        self.batch.update(ref, data)
        self.count += 1
        if self.count >= self.batch_size:
            self.flush()

    def flush(self) -> None:
        if self.dry_run or self.count == 0:
            return
        self.batch.commit()
        self.committed += self.count
        self.batch = self.db.batch()
        self.count = 0


def format_summary(path: str, update: dict[str, Any], parsed: ParsedFields) -> str:
    return (
        f"{path}: {update}"
        f"  [year←{(parsed.year_from or '')[:50]!r}"
        f" paper←{(parsed.paper_from or '')[:30]!r}"
        f" type←{(parsed.paper_type_from or '')[:30]!r}]"
    )


def consider_update(
    *,
    stats: Stats,
    writer: BatchWriter,
    dry_run: bool,
    overwrite: bool,
    ref,
    path: str,
    data: dict[str, Any],
    parsed: ParsedFields,
) -> None:
    if parsed.year is None and parsed.paper is None and parsed.paper_type is None:
        stats.skipped_no_parse += 1
        return

    if parsed.year is None:
        stats.skipped_no_year += 1

    update = build_update(data, parsed, overwrite=overwrite)
    if not update:
        stats.skipped_already_set += 1
        return

    stats.would_update += 1
    print(("DRY  " if dry_run else "SET  ") + format_summary(path, update, parsed))
    try:
        writer.update(ref, update)
        if not dry_run:
            stats.updated += 1
    except Exception as e:
        stats.errors += 1
        print(f"ERROR {path}: {e}", file=sys.stderr)


def run(
    dry_run: bool,
    overwrite: bool,
    limit_papers: Optional[int],
    cred_path: Path,
    root_doc: str,
    subjects_filter: Optional[set[str]],
    update_papers: bool,
    update_questions: bool,
) -> Stats:
    db = init_db(cred_path)
    stats = Stats()
    writer = BatchWriter(db, dry_run=dry_run)

    subjects_ref = db.collection(QUESTIONS_COLLECTION).document(root_doc).collection("subjects")
    subject_snaps = list(subjects_ref.stream())

    if not subject_snaps:
        print(
            f"No subjects found under {QUESTIONS_COLLECTION}/{root_doc}/subjects. "
            f"If your console shows a different root doc id, pass --root-doc <id>.",
            file=sys.stderr,
        )

    papers_seen = 0

    for subject_snap in subject_snaps:
        subject_id = subject_snap.id
        if subjects_filter and subject_id not in subjects_filter:
            continue
        stats.subjects.add(subject_id)

        levels_ref = subject_snap.reference.collection("levels")
        for level_snap in levels_ref.stream():
            level_id = level_snap.id
            papers_ref = level_snap.reference.collection("papers")

            for paper_snap in papers_ref.stream():
                if limit_papers is not None and papers_seen >= limit_papers:
                    writer.flush()
                    return stats
                papers_seen += 1
                stats.papers_scanned += 1

                paper_data = paper_snap.to_dict() or {}
                paper_path = (
                    f"{QUESTIONS_COLLECTION}/{root_doc}/subjects/{subject_id}"
                    f"/levels/{level_id}/papers/{paper_snap.id}"
                )
                paper_parsed = parse_doc(paper_snap.id, paper_data)

                if update_papers:
                    consider_update(
                        stats=stats,
                        writer=writer,
                        dry_run=dry_run,
                        overwrite=overwrite,
                        ref=paper_snap.reference,
                        path=paper_path,
                        data=paper_data,
                        parsed=paper_parsed,
                    )

                # Parent paper strings — for nested questions that don't encode year/paper
                parent_extra = candidate_strings(paper_snap.id, paper_data)

                if update_questions:
                    questions_ref = paper_snap.reference.collection("questions")
                    for q_snap in questions_ref.stream():
                        stats.questions_scanned += 1
                        q_data = q_snap.to_dict() or {}
                        q_path = f"{paper_path}/questions/{q_snap.id}"
                        # Prefer markers on the question; fall back to parent paper strings
                        q_parsed = parse_doc(q_snap.id, q_data, extra=parent_extra)
                        consider_update(
                            stats=stats,
                            writer=writer,
                            dry_run=dry_run,
                            overwrite=overwrite,
                            ref=q_snap.reference,
                            path=q_path,
                            data=q_data,
                            parsed=q_parsed,
                        )

    writer.flush()
    return stats


def main() -> None:
    parser = argparse.ArgumentParser(
        description=(
            "Backfill year / paper / paper type under "
            "questions/leavingcert/subjects/.../papers[/.../questions]."
        )
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually write to Firestore. Without this flag, dry-run only.",
    )
    parser.add_argument(
        "--overwrite",
        action="store_true",
        help="Overwrite year/paper/paper type even if already set.",
    )
    parser.add_argument(
        "--limit-papers",
        type=int,
        default=None,
        help="Only process the first N paper documents (smoke test).",
    )
    parser.add_argument(
        "--cred",
        type=str,
        default=None,
        help="Path to Firebase service-account JSON.",
    )
    parser.add_argument(
        "--root-doc",
        type=str,
        default=ROOT_DOC_ID,
        help=f"Document id under 'questions' (default: {ROOT_DOC_ID}).",
    )
    parser.add_argument(
        "--subject",
        action="append",
        default=None,
        help="Only process this subject id (repeatable), e.g. --subject maths",
    )
    parser.add_argument(
        "--papers-only",
        action="store_true",
        help="Only update paper docs (skip nested questions).",
    )
    parser.add_argument(
        "--questions-only",
        action="store_true",
        help="Only update nested question docs (skip paper docs).",
    )
    args = parser.parse_args()

    if args.papers_only and args.questions_only:
        print("Use only one of --papers-only / --questions-only.", file=sys.stderr)
        sys.exit(2)

    update_papers = not args.questions_only
    update_questions = not args.papers_only

    try:
        cred_path = resolve_cred_path(args.cred)
    except FileNotFoundError as e:
        print(str(e), file=sys.stderr)
        sys.exit(1)

    dry_run = not args.apply
    mode = "DRY RUN" if dry_run else "APPLY"
    subjects_filter = set(args.subject) if args.subject else None

    print(f"=== backfill_year_paper ({mode}) ===")
    print(f"Path: {QUESTIONS_COLLECTION}/{args.root_doc}/subjects/…/levels/…/papers[/…/questions]")
    print(f"Credentials: {cred_path}")
    print(f"Update papers: {update_papers} | Update nested questions: {update_questions}")
    print(f"Overwrite existing: {args.overwrite}")
    if subjects_filter:
        print(f"Subjects filter: {sorted(subjects_filter)}")
    if args.limit_papers:
        print(f"Limit papers: {args.limit_papers}")
    print()

    stats = run(
        dry_run=dry_run,
        overwrite=args.overwrite,
        limit_papers=args.limit_papers,
        cred_path=cred_path,
        root_doc=args.root_doc,
        subjects_filter=subjects_filter,
        update_papers=update_papers,
        update_questions=update_questions,
    )

    print()
    print("── Summary ──")
    print(f"  subjects touched:         {len(stats.subjects)} ({', '.join(sorted(stats.subjects)[:12])}{'…' if len(stats.subjects) > 12 else ''})")
    print(f"  papers scanned:           {stats.papers_scanned}")
    print(f"  nested questions scanned: {stats.questions_scanned}")
    print(f"  updates planned:          {stats.would_update}")
    if not dry_run:
        print(f"  updated:                  {stats.updated}")
    print(f"  skipped (nothing parsed): {stats.skipped_no_parse}")
    print(f"  skipped (already set):    {stats.skipped_already_set}")
    print(f"  docs with no year found:  {stats.skipped_no_year}")
    print(f"  errors:                   {stats.errors}")
    if dry_run:
        print()
        print("No writes performed. Re-run with --apply when the sample lines look right.")


if __name__ == "__main__":
    main()
