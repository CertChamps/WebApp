"""
Find online sources for Practice Hub questions and draft Discover listings.

For each grouped question in a subject/level, search YouTube, websites, and
PDFs that look dedicated to that exam question. Writes a JSON review file.
Nothing is posted unless you pass --apply.

Dry-run by default (same as the other scripts in this folder).

Search backends (first match wins per kind):
  YouTube  — YOUTUBE_API_KEY, else YouTube innertube/HTML, else Invidious
  Web/PDF  — GOOGLE_API_KEY + GOOGLE_CSE_ID, else Bing, else DuckDuckGo

Queries stay loose on purpose: "2015 P1 A Q5 (a)" is searched as
"Leaving Cert Maths 2015 P1 Q5" / "2015 Paper 1 Q5". Section and part
letters are dropped because videos usually cover the whole question.
Matching parts (Q4 a/b/c) are clustered onto the same Discover listing
via linkedQuestions.

Examples:
  python discover_question_sources.py --list-subjects
  python discover_question_sources.py --subject biology --level higher --limit 20
  python discover_question_sources.py --subject maths --level all
  python discover_question_sources.py --subject maths --level higher --topic Algebra --kinds youtube
  python discover_question_sources.py --from discover-drafts.json
  python discover_question_sources.py --from discover-drafts.json --apply --uid YOUR_ADMIN_UID

Edit the JSON and set "accepted": false on anything you do not want posted.
Approved listings still go through /admin/discover-moderation as pending.
"""

from __future__ import annotations

import argparse
import base64
import html as html_lib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import Counter
from dataclasses import asdict, dataclass, field, replace
from datetime import datetime, timezone
from html.parser import HTMLParser
from pathlib import Path
from typing import Any, Optional

import firebase_admin
from firebase_admin import credentials, firestore

# ── Config ───────────────────────────────────────────────────────────────────

SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CRED_NAME = "firebase-credentials.json"
BUCKET_NAME = "certchamps-a7527.firebasestorage.app"
QUESTIONS_COLLECTION = "questions"
DISCOVER_COLLECTION = "discover-notes"
DEFAULT_ADMIN_UID = "NkN9UBqoPEYpE21MC89fipLn0SP2"

CYCLES = {
    "leaving": {"root_doc": "leavingcert", "label": "Leaving Cert"},
    "junior": {"root_doc": "juniorcert", "label": "Junior Cycle"},
}

SLUG_TO_STORAGE = {
    "applied-mathematics": "applied-maths",
    "design-communication-graphics": "design-and-communication-graphics",
}
SLUG_TO_FIRESTORE = {
    "mathematics": ["maths"],
    "applied-mathematics": ["applied-maths"],
}
STORAGE_TO_PRACTICE = {
    "maths": "mathematics",
    "applied-maths": "applied-mathematics",
    "design-and-communication-graphics": "design-communication-graphics",
}
LABEL_OVERRIDES = {
    "maths": "Mathematics",
    "mathematics": "Mathematics",
    "applied-maths": "Applied Mathematics",
    "applied-mathematics": "Applied Mathematics",
    "design-and-communication-graphics": "Design & Communication Graphics",
    "design-communication-graphics": "Design & Communication Graphics",
    "history-early-modern": "History (early modern)",
    "history-later-modern": "History (later modern)",
    "link-modules": "Link Modules",
    "physics-and-chemistry": "Physics and Chemistry",
    "agricultural-science": "Agricultural Science",
    "computer-science": "Computer Science",
    "construction-studies": "Construction Studies",
    "classical-studies": "Classical Studies",
    "home-economics": "Home Economics",
    "hebrew-studies": "Hebrew Studies",
    "religious-education": "Religious Education",
    "physical-education": "Physical Education",
    "politics-and-society": "Politics and Society",
    "mandarin-chinese": "Mandarin Chinese",
}

# Short names people actually type into YouTube / Google.
SEARCH_SUBJECT = {
    "mathematics": "Maths",
    "maths": "Maths",
    "applied-mathematics": "Applied Maths",
    "applied-maths": "Applied Maths",
    "agricultural-science": "Ag Science",
    "home-economics": "Home Ec",
    "physical-education": "PE",
    "design-communication-graphics": "DCG",
    "design-and-communication-graphics": "DCG",
    "computer-science": "Computer Science",
    "construction-studies": "Construction",
    "politics-and-society": "Pol Soc",
}

SUBJECT_ALIASES = {
    "mathematics": ("maths", "math", "mathematics"),
    "maths": ("maths", "math", "mathematics"),
    "applied-mathematics": ("applied maths", "applied math", "applied mathematics"),
    "applied-maths": ("applied maths", "applied math", "applied mathematics"),
}

# Explicit exam-level mentions in titles/snippets. Bare "higher" is allowed
# because LC/JC videos almost always mean Higher Level.
LEVEL_PATTERNS: dict[str, re.Pattern[str]] = {
    "higher": re.compile(
        r"higher\s*(?:level|lvl)|leaving\s*cert\s*higher|junior\s*(?:cycle|cert)\s*higher"
        r"|\blchl\b|\blc[\s\-]*hl\b|\bhl\b|\bhigher\b",
        re.IGNORECASE,
    ),
    "ordinary": re.compile(
        r"ordinary\s*(?:level|lvl)|leaving\s*cert\s*ordinary|junior\s*(?:cycle|cert)\s*ordinary"
        r"|\blcol\b|\blc[\s\-]*ol\b|\bol\b|\bordinary\b",
        re.IGNORECASE,
    ),
    "foundation": re.compile(
        r"foundation\s*(?:level|lvl)|leaving\s*cert\s*foundation"
        r"|\blcfl\b|\blc[\s\-]*fl\b|\bfoundation\b",
        re.IGNORECASE,
    ),
    "common": re.compile(
        r"common\s*(?:level|lvl)|junior\s*(?:cycle|cert)\s*common|\bcommon\s*level\b",
        re.IGNORECASE,
    ),
}
LEVEL_QUERY = {
    "higher": "Higher Level",
    "ordinary": "Ordinary Level",
    "foundation": "Foundation Level",
    "common": "Common Level",
}

RESOURCE_TYPES = ("Notes", "Videos", "Sample Answers", "Flashcards", "Website", "Other")
RESOURCE_LEVELS = ("Higher", "Ordinary", "Foundation")
MAX_TITLE = 80
MAX_DESCRIPTION = 240
MAX_TOPICS = 8
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
)
INVIDIOUS_INSTANCES = (
    "https://inv.nadeko.net",
    "https://invidious.nerdvpn.de",
    "https://yewtu.be",
    "https://invidious.fdn.fr",
)
SKIP_HOSTS = {
    "pinterest.com",
    "facebook.com",
    "instagram.com",
    "tiktok.com",
    "twitter.com",
    "x.com",
    "reddit.com",
    "quora.com",
    "coursehero.com",
    "chegg.com",
    "scribd.com",
    "brainly.com",
    "quizlet.com",
}
EXAM_CORE_RE = re.compile(
    r"(?P<year>(?:19|20)\d{2})"
    r"(?:.*?P(?:aper)?\s*(?P<paper>[12]))?"
    r".*?Q(?P<q>\d+)",
    re.IGNORECASE,
)
EXAM_SECTION_RE = re.compile(
    r"P(?:aper)?\s*[12][-_\s]*(?P<section>[AB])(?=[-_\s]*Q)",
    re.IGNORECASE,
)
YOUTUBE_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")


# ── Models ───────────────────────────────────────────────────────────────────

@dataclass
class CatalogueQuestion:
    id: str
    question_name: str
    topic: str
    subject: str
    level: str
    file_name: str
    year: Optional[int] = None
    paper: Optional[int] = None
    paper_type: Optional[str] = None


@dataclass
class GroupedQuestion:
    key: str
    display_name: str
    topic: str
    subject: str
    level: str
    year: Optional[int] = None
    paper: Optional[int] = None
    paper_type: Optional[str] = None
    q_number: Optional[str] = None
    section: Optional[str] = None
    parts: int = 1


@dataclass
class SearchHit:
    url: str
    title: str
    snippet: str
    kind: str  # youtube | web | pdf
    source: str


@dataclass
class Draft:
    accepted: bool
    title: str
    description: str
    website_url: str
    resource_types: list[str]
    topics: list[str]
    levels: list[str]
    subject_id: str
    subject_label: str
    site_name: str
    thumbnail_url: str
    favicon_url: str
    score: int
    reason: str
    kind: str
    linked_question_id: str
    linked_question_name: str
    linked_question_practice_url: str
    linked_question_level: str
    linked_question_topic: str
    search_query: str
    linked_questions: list[dict[str, Any]] = field(default_factory=list)


@dataclass
class Stats:
    questions: int = 0
    grouped: int = 0
    clusters: int = 0
    searched: int = 0
    hits: int = 0
    drafts: int = 0
    skipped_existing: int = 0
    skipped_low_score: int = 0
    posted: int = 0
    would_post: int = 0
    search_errors: int = 0
    reasons: Counter = field(default_factory=Counter)


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
    return firestore.client()


def parse_cycle(raw: str) -> str:
    value = (raw or "leaving").strip().lower()
    if value in ("junior", "juniorcert", "junior-cycle", "jc"):
        return "junior"
    return "leaving"


def slugify_topic(topic: str) -> str:
    cleaned = re.sub(r"^#+", "", topic.strip())
    cleaned = re.sub(r"\s+", "-", cleaned)
    return cleaned[:40]


def title_case_label(value: str) -> str:
    key = value.strip().lower()
    if key in LABEL_OVERRIDES:
        return LABEL_OVERRIDES[key]
    return value.replace("-", " ").replace("_", " ").strip().title()


def search_label_for(practice_id: str) -> str:
    key = practice_id.strip().lower()
    return SEARCH_SUBJECT.get(key, title_case_label(practice_id))


def storage_subject_id(hint: str) -> str:
    key = hint.strip().lower()
    return SLUG_TO_STORAGE.get(key, key)


def practice_subject_id(hint: str) -> str:
    key = hint.strip().lower()
    if key in STORAGE_TO_PRACTICE:
        return STORAGE_TO_PRACTICE[key]
    if key in SLUG_TO_FIRESTORE:
        return key
    return key


def firestore_subject_candidates(hint: str) -> list[str]:
    key = hint.strip().lower()
    out: list[str] = []
    out.extend(SLUG_TO_FIRESTORE.get(key, []))
    out.append(practice_subject_id(key))
    out.append(storage_subject_id(key))
    out.append(key)
    out.append(key.replace(" ", "-"))
    out.append(key.replace("_", "-"))
    seen: set[str] = set()
    unique: list[str] = []
    for item in out:
        if item and item not in seen:
            seen.add(item)
            unique.append(item)
    return unique


def level_key(level: str) -> Optional[str]:
    value = (level or "").strip().lower()
    aliases = {
        "higher": "higher",
        "hl": "higher",
        "h": "higher",
        "ordinary": "ordinary",
        "ol": "ordinary",
        "o": "ordinary",
        "foundation": "foundation",
        "fl": "foundation",
        "f": "foundation",
        "common": "common",
        "cl": "common",
    }
    return aliases.get(value)


def discover_level(level: str) -> Optional[str]:
    key = level_key(level)
    if key == "higher":
        return "Higher"
    if key == "ordinary":
        return "Ordinary"
    if key == "foundation":
        return "Foundation"
    if key == "common":
        return "Common"
    return None


def mentioned_levels(blob: str) -> set[str]:
    found: set[str] = set()
    for key, pattern in LEVEL_PATTERNS.items():
        if pattern.search(blob):
            found.add(key)
    return found


def level_search_phrase(level: str) -> str:
    key = level_key(level)
    return LEVEL_QUERY.get(key or "", "")


def prettify_name(raw: str) -> str:
    stem = re.sub(r"\.[^.]+$", "", raw)
    return re.sub(r"[-_]", " ", stem).strip().title()


def try_strip_suffix(name: str) -> str:
    return re.sub(r"[\s_-]+\d+$", "", name)


def extract_exam_section(stem: str) -> Optional[str]:
    match = EXAM_SECTION_RE.search(stem or "")
    if not match:
        return None
    return match.group("section").upper()


def extract_exam_core(stem: str) -> Optional[dict[str, str]]:
    match = EXAM_CORE_RE.search(stem or "")
    if not match:
        return None
    return {
        "year": match.group("year"),
        "paper": match.group("paper") or "",
        "q": match.group("q"),
    }


def list_root_subjects(db, cycle: str) -> list[str]:
    root = CYCLES[cycle]["root_doc"]
    snap = db.collection(QUESTIONS_COLLECTION).document(root).get()
    data = snap.to_dict() or {}
    sections = data.get("sections")
    if isinstance(sections, list) and sections:
        return [s for s in sections if isinstance(s, str)]
    subjects = db.collection(QUESTIONS_COLLECTION).document(root).collection("subjects").stream()
    return [doc.id for doc in subjects]


def list_subject_levels(db, cycle: str, subject: str) -> list[str]:
    root = CYCLES[cycle]["root_doc"]
    snap = (
        db.collection(QUESTIONS_COLLECTION)
        .document(root)
        .collection("subjects")
        .document(subject)
        .get()
    )
    data = snap.to_dict() or {}
    sections = data.get("sections")
    if isinstance(sections, list) and sections:
        return [s for s in sections if isinstance(s, str)]
    levels = (
        db.collection(QUESTIONS_COLLECTION)
        .document(root)
        .collection("subjects")
        .document(subject)
        .collection("levels")
        .stream()
    )
    return [doc.id for doc in levels]


def resolve_subject(db, cycle: str, hint: str) -> str:
    available = list_root_subjects(db, cycle)
    available_l = {item.lower(): item for item in available}
    for candidate in firestore_subject_candidates(hint):
        if candidate in available_l:
            return available_l[candidate]
        if candidate.lower() in available_l:
            return available_l[candidate.lower()]
    raise SystemExit(
        f"Unknown subject {hint!r} for {cycle}. Available:\n  "
        + ", ".join(available or ["(none)"])
    )


def resolve_level(db, cycle: str, subject: str, hint: str) -> str:
    available = list_subject_levels(db, cycle, subject)
    aliases = {
        "hl": "higher",
        "ol": "ordinary",
        "fl": "foundation",
        "h": "higher",
        "o": "ordinary",
    }
    want = aliases.get(hint.strip().lower(), hint.strip().lower())
    for item in available:
        if item.lower() == want:
            return item
    raise SystemExit(
        f"Unknown level {hint!r} for {subject}. Available:\n  "
        + ", ".join(available or ["(none)"])
    )


def load_questions(db, cycle: str, subject: str, level: str) -> list[CatalogueQuestion]:
    root = CYCLES[cycle]["root_doc"]
    coll = (
        db.collection(QUESTIONS_COLLECTION)
        .document(root)
        .collection("subjects")
        .document(subject)
        .collection("levels")
        .document(level)
        .collection("questions")
    )
    out: list[CatalogueQuestion] = []
    for doc in coll.stream():
        data = doc.to_dict() or {}
        image_path = (data.get("imagePath") or "").strip()
        if not image_path:
            continue
        file_name = (data.get("fileName") or "").strip() or image_path.rsplit("/", 1)[-1]
        year = data.get("year")
        paper = data.get("paper")
        paper_type = data.get("paper type")
        out.append(
            CatalogueQuestion(
                id=doc.id,
                question_name=(data.get("questionName") or "").strip() or prettify_name(file_name),
                topic=(data.get("topic") or "").strip() or "Untagged",
                subject=(data.get("subject") or subject).strip(),
                level=(data.get("level") or level).strip(),
                file_name=file_name,
                year=year if isinstance(year, int) else None,
                paper=paper if paper in (1, 2) else None,
                paper_type=paper_type.strip() if isinstance(paper_type, str) and paper_type.strip() else None,
            )
        )
    out.sort(key=lambda q: q.file_name.lower())
    return out


def group_questions(flat: list[CatalogueQuestion]) -> list[GroupedQuestion]:
    """Mirror useImageQuestions.groupImageQuestions, grouped within each topic."""
    grouped: list[GroupedQuestion] = []
    by_topic: dict[str, list[CatalogueQuestion]] = {}
    for question in flat:
        by_topic.setdefault(question.topic, []).append(question)

    for topic, rows in by_topic.items():
        bare_names = [re.sub(r"\.[^.]+$", "", q.file_name) for q in rows]
        bare_set = set(bare_names)
        tentative_count: Counter = Counter(try_strip_suffix(name) for name in bare_names)
        buckets: dict[str, list[CatalogueQuestion]] = {}
        order: list[str] = []
        for question, bare in zip(rows, bare_names):
            tentative = try_strip_suffix(bare)
            should_group = tentative != bare and (
                tentative_count[tentative] > 1 or tentative in bare_set
            )
            key = tentative if should_group else bare
            if key not in buckets:
                buckets[key] = []
                order.append(key)
            buckets[key].append(question)
        for key in order:
            images = buckets[key]
            head = images[0]
            core = extract_exam_core(key)
            year = head.year
            paper = head.paper
            q_number = None
            section = extract_exam_section(key)
            if core:
                year = year or int(core["year"])
                if not paper and core["paper"] in ("1", "2"):
                    paper = int(core["paper"])
                q_number = core["q"]
            grouped.append(
                GroupedQuestion(
                    key=key,
                    display_name=prettify_name(key),
                    topic=topic,
                    subject=head.subject,
                    level=head.level,
                    year=year,
                    paper=paper,
                    paper_type=head.paper_type,
                    q_number=q_number,
                    section=section,
                    parts=len(images),
                )
            )
    grouped.sort(key=lambda g: (g.topic.lower(), g.key.lower()))
    return grouped


def exam_family_key(question: GroupedQuestion) -> str:
    """Cluster Q4 (a)/(b)/(c) together; keep section A/B and unmatched stems unique."""
    if question.year and question.q_number:
        return f"{question.year}|{question.paper or 0}|{question.section or ''}|{question.q_number}"
    return f"solo|{question.topic}|{question.key}"


def cluster_display_name(members: list[GroupedQuestion]) -> str:
    head = members[0]
    if head.year and head.q_number:
        paper = f" P{head.paper}" if head.paper else ""
        section = f" {head.section}" if head.section else ""
        return f"{head.year}{paper}{section} Q{head.q_number}"
    cleaned = re.sub(r"\s*\([a-z]\)\s*$", "", head.display_name, flags=re.I).strip()
    return cleaned or head.display_name


def cluster_grouped_questions(grouped: list[GroupedQuestion]) -> list[list[GroupedQuestion]]:
    buckets: dict[str, list[GroupedQuestion]] = {}
    order: list[str] = []
    for question in grouped:
        key = exam_family_key(question)
        if key not in buckets:
            buckets[key] = []
            order.append(key)
        buckets[key].append(question)
    clusters: list[list[GroupedQuestion]] = []
    for key in order:
        members = buckets[key]
        members.sort(key=lambda item: item.display_name.lower())
        clusters.append(members)
    return clusters


def cluster_search_question(members: list[GroupedQuestion]) -> GroupedQuestion:
    head = members[0]
    return replace(
        head,
        display_name=cluster_display_name(members),
        parts=sum(item.parts for item in members),
    )


def linked_question_entry(
    storage_subject: str,
    practice_id: str,
    cycle: str,
    question: GroupedQuestion,
    subject_label: str,
) -> dict[str, Any]:
    return {
        "id": discover_question_id(storage_subject, question),
        "name": question.display_name,
        "practiceUrl": practice_url(practice_id, cycle, question),
        "subjectId": practice_id,
        "subjectLabel": subject_label,
        "level": question.level,
        "topic": question.topic,
        "source": "practice",
    }


def discover_question_id(storage_subject: str, question: GroupedQuestion) -> str:
    topic = question.topic or "paper"
    return f"image_{storage_subject}_{question.level}_{topic}_{question.key}"


def practice_url(practice_id: str, cycle: str, question: GroupedQuestion) -> str:
    params = {
        "subject": practice_id,
        "level": question.level,
        "browse": "topic",
        "topic": question.topic,
        "question": question.key,
        "cycle": cycle,
    }
    if question.year:
        params["year"] = str(question.year)
    if question.paper:
        params["paper"] = str(question.paper)
    return "/practice?" + urllib.parse.urlencode(params)


def load_author(db, uid: str) -> tuple[str, Optional[str]]:
    snap = db.collection("user-data").document(uid).get()
    data = snap.to_dict() or {}
    username = (data.get("username") or "").strip() or "CertChamps"
    picture = data.get("picture")
    if isinstance(picture, str) and picture.strip():
        return username, picture.strip()
    return username, None


def load_existing_pairs(db) -> set[tuple[str, str]]:
    existing: set[tuple[str, str]] = set()
    for doc in db.collection(DISCOVER_COLLECTION).stream():
        data = doc.to_dict() or {}
        url = canonical_url(str(data.get("websiteUrl") or ""))
        if not url:
            continue
        for question_id in iter_linked_question_ids(data):
            existing.add((question_id, url))
    return existing


def iter_linked_question_ids(data: dict[str, Any]) -> list[str]:
    ids: list[str] = []
    primary = str(data.get("linkedQuestionId") or data.get("linked_question_id") or "").strip()
    if primary:
        ids.append(primary)
    raw = data.get("linkedQuestions") or data.get("linked_questions") or []
    if isinstance(raw, list):
        for item in raw:
            if not isinstance(item, dict):
                continue
            question_id = str(item.get("id") or item.get("linkedQuestionId") or "").strip()
            if question_id:
                ids.append(question_id)
    # Preserve order, drop dupes.
    seen: set[str] = set()
    unique: list[str] = []
    for question_id in ids:
        if question_id in seen:
            continue
        seen.add(question_id)
        unique.append(question_id)
    return unique


# ── HTTP / search ────────────────────────────────────────────────────────────

def http_request(
    url: str,
    *,
    data: Optional[bytes] = None,
    headers: Optional[dict[str, str]] = None,
    timeout: int = 12,
) -> tuple[int, str]:
    req_headers = {
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/json,*/*",
        "Accept-Language": "en-IE,en;q=0.9",
    }
    if headers:
        req_headers.update(headers)
    request = urllib.request.Request(url, data=data, headers=req_headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", errors="replace")
            return response.getcode() or 200, body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace") if exc.fp else ""
        return exc.code, body
    except urllib.error.URLError as exc:
        return 0, str(exc.reason if getattr(exc, "reason", None) else exc)


def extract_youtube_id(url: str) -> Optional[str]:
    try:
        parsed = urllib.parse.urlparse(url)
    except ValueError:
        return None
    host = parsed.hostname.replace("www.", "").lower() if parsed.hostname else ""
    if host == "youtu.be":
        video_id = parsed.path.strip("/").split("/")[0]
        return video_id if YOUTUBE_ID_RE.match(video_id or "") else None
    if host in {"youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"}:
        query = urllib.parse.parse_qs(parsed.query)
        if query.get("v"):
            video_id = query["v"][0]
            return video_id if YOUTUBE_ID_RE.match(video_id) else None
        parts = [p for p in parsed.path.split("/") if p]
        if parts and parts[0] in {"shorts", "embed", "live"} and len(parts) > 1:
            return parts[1] if YOUTUBE_ID_RE.match(parts[1]) else None
    return None


def canonical_url(url: str) -> str:
    raw = (url or "").strip()
    if not raw:
        return ""
    if not re.match(r"^https?://", raw, re.I):
        raw = "https://" + raw
    try:
        parsed = urllib.parse.urlparse(raw)
    except ValueError:
        return raw
    youtube_id = extract_youtube_id(raw)
    if youtube_id:
        return f"https://www.youtube.com/watch?v={youtube_id}"
    host = (parsed.hostname or "").lower()
    path = parsed.path or "/"
    if path.endswith("/") and path != "/":
        path = path[:-1]
    query = parsed.query
    if query:
        keep = []
        for key, values in urllib.parse.parse_qsl(query, keep_blank_values=False):
            if key.lower() in {"utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid"}:
                continue
            keep.append((key, values))
        query = urllib.parse.urlencode(keep)
    rebuilt = urllib.parse.urlunparse(("https" if parsed.scheme == "http" else parsed.scheme, host, path, "", query, ""))
    return rebuilt


def hostname(url: str) -> str:
    try:
        host = urllib.parse.urlparse(url).hostname or url
    except ValueError:
        return url
    return host.replace("www.", "")


def should_skip_url(url: str) -> bool:
    host = hostname(url)
    return any(host == skip or host.endswith("." + skip) for skip in SKIP_HOSTS)


def youtube_thumbnail(url: str) -> str:
    video_id = extract_youtube_id(url)
    if not video_id:
        return ""
    return f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"


def favicon_for(url: str) -> str:
    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme and parsed.hostname:
            return f"{parsed.scheme}://{parsed.hostname}/favicon.ico"
    except ValueError:
        pass
    return ""


def _walk_dicts(obj: Any):
    if isinstance(obj, dict):
        yield obj
        for value in obj.values():
            yield from _walk_dicts(value)
    elif isinstance(obj, list):
        for value in obj:
            yield from _walk_dicts(value)


def youtube_text(value: Any) -> str:
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        simple = value.get("simpleText")
        if isinstance(simple, str) and simple.strip():
            return simple.strip()
        runs = value.get("runs")
        if isinstance(runs, list):
            joined = "".join(
                str(part.get("text", "")) for part in runs if isinstance(part, dict)
            ).strip()
            if joined:
                return joined
        for nested in value.values():
            text = youtube_text(nested)
            if text:
                return text
    if isinstance(value, list):
        for nested in value:
            text = youtube_text(nested)
            if text:
                return text
    return ""


def youtube_hits_from_payload(payload: Any, limit: int) -> list[SearchHit]:
    hits: list[SearchHit] = []
    seen: set[str] = set()
    for node in _walk_dicts(payload):
        renderer = node.get("videoRenderer") or node.get("compactVideoRenderer")
        if not isinstance(renderer, dict):
            continue
        video_id = str(renderer.get("videoId") or "").strip()
        if not YOUTUBE_ID_RE.match(video_id) or video_id in seen:
            continue
        title = youtube_text(renderer.get("title"))
        if not title:
            continue
        seen.add(video_id)
        hits.append(
            SearchHit(
                url=f"https://www.youtube.com/watch?v={video_id}",
                title=html_lib.unescape(title),
                snippet=html_lib.unescape(
                    youtube_text(renderer.get("descriptionSnippet"))
                    or youtube_text(renderer.get("detailedMetadataSnippets"))
                ),
                kind="youtube",
                source="youtube",
            )
        )
        if len(hits) >= limit:
            break
    return hits


def search_youtube_innertube(query: str, limit: int) -> list[SearchHit]:
    payload = json.dumps(
        {
            "context": {
                "client": {
                    "hl": "en",
                    "gl": "IE",
                    "clientName": "WEB",
                    "clientVersion": "2.20240613.01.00",
                }
            },
            "query": query,
        }
    ).encode("utf-8")
    status, body = http_request(
        "https://www.youtube.com/youtubei/v1/search?prettyPrint=false",
        data=payload,
        headers={"Content-Type": "application/json"},
        timeout=15,
    )
    if status != 200:
        raise RuntimeError(f"YouTube innertube {status}: {body[:160]}")
    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"YouTube innertube JSON: {exc}") from exc
    hits = youtube_hits_from_payload(data, limit)
    if not hits:
        raise RuntimeError("YouTube innertube returned no videos")
    return hits


def search_youtube_html(query: str, limit: int) -> list[SearchHit]:
    params = urllib.parse.urlencode({"search_query": query, "hl": "en", "gl": "IE"})
    status, body = http_request(f"https://www.youtube.com/results?{params}", timeout=15)
    if status != 200:
        raise RuntimeError(f"YouTube HTML {status}")
    marker = body.find("ytInitialData")
    if marker < 0:
        raise RuntimeError("YouTube HTML missing ytInitialData")
    start = body.find("{", marker)
    if start < 0:
        raise RuntimeError("YouTube HTML missing ytInitialData JSON")
    try:
        data, _ = json.JSONDecoder().raw_decode(body[start:])
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"YouTube HTML JSON: {exc}") from exc
    hits = youtube_hits_from_payload(data, limit)
    if not hits:
        raise RuntimeError("YouTube HTML returned no videos")
    return hits


def search_youtube_api(query: str, api_key: str, limit: int) -> list[SearchHit]:
    params = urllib.parse.urlencode(
        {
            "part": "snippet",
            "type": "video",
            "maxResults": max(1, min(limit, 8)),
            "q": query,
            "key": api_key,
            "safeSearch": "strict",
        }
    )
    status, body = http_request(f"https://www.googleapis.com/youtube/v3/search?{params}")
    if status != 200:
        raise RuntimeError(f"YouTube API {status}: {body[:180]}")
    payload = json.loads(body)
    hits: list[SearchHit] = []
    for item in payload.get("items") or []:
        video_id = ((item.get("id") or {}).get("videoId") or "").strip()
        snippet = item.get("snippet") or {}
        if not YOUTUBE_ID_RE.match(video_id):
            continue
        hits.append(
            SearchHit(
                url=f"https://www.youtube.com/watch?v={video_id}",
                title=(snippet.get("title") or "").strip(),
                snippet=(snippet.get("description") or "").strip(),
                kind="youtube",
                source="youtube-api",
            )
        )
    return hits


def search_youtube_invidious(query: str, limit: int) -> list[SearchHit]:
    params = urllib.parse.urlencode({"q": query, "type": "video"})
    last_error = "no Invidious instance responded"
    for base in INVIDIOUS_INSTANCES:
        status, body = http_request(f"{base}/api/v1/search?{params}", timeout=6)
        if status != 200:
            last_error = f"{base} -> {status}"
            continue
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            last_error = f"{base} returned non-JSON"
            continue
        hits: list[SearchHit] = []
        if not isinstance(payload, list):
            continue
        for item in payload:
            if not isinstance(item, dict):
                continue
            video_id = str(item.get("videoId") or "").strip()
            if not YOUTUBE_ID_RE.match(video_id):
                continue
            hits.append(
                SearchHit(
                    url=f"https://www.youtube.com/watch?v={video_id}",
                    title=html_lib.unescape(str(item.get("title") or "").strip()),
                    snippet=html_lib.unescape(str(item.get("description") or "").strip()),
                    kind="youtube",
                    source="invidious",
                )
            )
            if len(hits) >= limit:
                break
        if hits:
            return hits
    raise RuntimeError(last_error)


class _AnchorParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.links: list[tuple[str, str]] = []
        self._href: Optional[str] = None
        self._text: list[str] = []
        self._in_anchor = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, Optional[str]]]) -> None:
        if tag != "a":
            return
        href = dict(attrs).get("href")
        if not href:
            return
        self._href = href
        self._text = []
        self._in_anchor = True

    def handle_data(self, data: str) -> None:
        if self._in_anchor:
            self._text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag != "a" or not self._in_anchor:
            return
        title = html_lib.unescape(" ".join("".join(self._text).split()))
        href = self._href or ""
        self._in_anchor = False
        self._href = None
        self._text = []
        if href and title:
            self.links.append((href, title))


def unwrap_redirect(url: str) -> str:
    parsed = urllib.parse.urlparse(url)
    query = urllib.parse.parse_qs(parsed.query)
    for key in ("uddg", "url"):
        if query.get(key):
            return urllib.parse.unquote(query[key][0])
    bing_u = (query.get("u") or [None])[0]
    host = (parsed.hostname or "").lower()
    if bing_u and "bing.com" in host:
        raw = bing_u[2:] if bing_u.startswith("a1") else bing_u
        try:
            padded = raw + "=" * ((4 - len(raw) % 4) % 4)
            decoded = base64.urlsafe_b64decode(padded.encode("ascii")).decode("utf-8", "replace")
            if decoded.startswith("http"):
                return decoded
        except Exception:
            pass
    if url.startswith("//"):
        return "https:" + url
    return url


def parse_html_results(body: str, kind: str, source: str) -> list[SearchHit]:
    parser = _AnchorParser()
    try:
        parser.feed(body)
    except Exception:
        return []
    hits: list[SearchHit] = []
    seen: set[str] = set()
    for href, title in parser.links:
        url = unwrap_redirect(href)
        if not url.startswith("http"):
            continue
        url = canonical_url(url)
        host = hostname(url)
        if host.endswith("duckduckgo.com") or host.endswith("bing.com") or host.endswith("microsoft.com"):
            continue
        if host in seen:
            continue
        if should_skip_url(url):
            continue
        if len(title) < 4:
            continue
        seen.add(host + url)
        hit_kind = kind
        if extract_youtube_id(url):
            hit_kind = "youtube"
        elif url.lower().endswith(".pdf") or "/pdf" in url.lower():
            hit_kind = "pdf"
        hits.append(SearchHit(url=url, title=title, snippet="", kind=hit_kind, source=source))
    return hits


def search_google_cse(query: str, api_key: str, cse_id: str, limit: int, kind: str) -> list[SearchHit]:
    params = {
        "q": query,
        "key": api_key,
        "cx": cse_id,
        "num": max(1, min(limit, 8)),
        "safe": "active",
    }
    if kind == "pdf":
        params["fileType"] = "pdf"
    status, body = http_request("https://www.googleapis.com/customsearch/v1?" + urllib.parse.urlencode(params))
    if status != 200:
        raise RuntimeError(f"Google CSE {status}: {body[:180]}")
    payload = json.loads(body)
    hits: list[SearchHit] = []
    for item in payload.get("items") or []:
        url = canonical_url(str(item.get("link") or ""))
        if not url or should_skip_url(url):
            continue
        hit_kind = kind
        if extract_youtube_id(url):
            hit_kind = "youtube"
        elif url.lower().endswith(".pdf"):
            hit_kind = "pdf"
        hits.append(
            SearchHit(
                url=url,
                title=html_lib.unescape(str(item.get("title") or "").strip()),
                snippet=html_lib.unescape(str(item.get("snippet") or "").strip()),
                kind=hit_kind,
                source="google-cse",
            )
        )
    return hits


def search_duckduckgo(query: str, kind: str) -> list[SearchHit]:
    params = urllib.parse.urlencode({"q": query})
    status, body = http_request(f"https://html.duckduckgo.com/html/?{params}", timeout=6)
    if status != 200 or "anomaly" in body.lower():
        status, body = http_request(f"https://lite.duckduckgo.com/lite/?{params}", timeout=6)
    if status != 200:
        raise RuntimeError(f"DuckDuckGo {status}: {body[:80]}")
    hits = parse_html_results(body, kind, "duckduckgo")
    if hits:
        return hits
    raise RuntimeError("DuckDuckGo returned no parseable results")


def search_bing(query: str, kind: str) -> list[SearchHit]:
    params = urllib.parse.urlencode({"q": query, "setlang": "en", "cc": "IE"})
    status, body = http_request(f"https://www.bing.com/search?{params}", timeout=12)
    if status != 200:
        raise RuntimeError(f"Bing {status}")
    hits = parse_html_results(body, kind, "bing")
    if hits:
        return hits
    raise RuntimeError("Bing returned no parseable results")


def search_web(query: str, kind: str, limit: int, google_key: str, cse_id: str) -> list[SearchHit]:
    errors: list[str] = []
    if google_key and cse_id:
        try:
            return search_google_cse(query, google_key, cse_id, limit, kind)[:limit]
        except Exception as exc:
            errors.append(f"google-cse: {exc}")
    for fn in (search_bing, search_duckduckgo):
        try:
            return fn(query, kind)[:limit]
        except Exception as exc:
            errors.append(f"{fn.__name__}: {exc}")
    raise RuntimeError("; ".join(errors) or "no web search backend")


def search_youtube(query: str, limit: int, youtube_key: str) -> list[SearchHit]:
    errors: list[str] = []
    if youtube_key:
        try:
            return search_youtube_api(query, youtube_key, limit)
        except Exception as exc:
            errors.append(f"youtube-api: {exc}")
    for fn in (search_youtube_innertube, search_youtube_html, search_youtube_invidious):
        try:
            return fn(query, limit)
        except Exception as exc:
            errors.append(f"{fn.__name__}: {exc}")
    raise RuntimeError("; ".join(errors))


# ── Scoring / drafts ─────────────────────────────────────────────────────────

def clip(text: str, limit: int) -> str:
    value = " ".join((text or "").split())
    if len(value) <= limit:
        return value
    return value[: max(0, limit - 1)].rstrip() + "…"


def build_queries(cycle: str, search_label: str, question: GroupedQuestion) -> dict[str, str]:
    """Vague exam queries. Drop section A/B and part (a)/(b) — videos cover the whole Q."""
    cycle_short = "LC" if cycle == "leaving" else "JC"
    year = str(question.year) if question.year else ""
    paper_short = f"P{question.paper}" if question.paper else ""
    paper_long = f"Paper {question.paper}" if question.paper else ""
    q_num = f"Q{question.q_number}" if question.q_number else ""

    compact = " ".join(part for part in (year, paper_short, q_num) if part)
    long_form = " ".join(part for part in (year, paper_long, q_num) if part)
    if not compact:
        cleaned = re.sub(r"\([^)]*\)", "", question.display_name)
        cleaned = re.sub(r"(P(?:aper)?\s*[12])\s*[AB]\s*(Q)", r"\1 \2", cleaned, flags=re.I)
        compact = re.sub(r"[\s_-]+", " ", cleaned).strip()
        long_form = compact

    level_phrase = level_search_phrase(question.level)
    primary = re.sub(
        r"\s+", " ", f"{CYCLES[cycle]['label']} {search_label} {level_phrase} {compact}"
    ).strip()
    alt = re.sub(
        r"\s+", " ", f"{cycle_short} {search_label} {level_phrase} {long_form}"
    ).strip()
    return {
        "youtube": primary,
        "web": alt or primary,
        "pdf": f"{primary} pdf",
    }


def score_hit(hit: SearchHit, cycle: str, search_label: str, question: GroupedQuestion) -> tuple[int, str]:
    blob = f"{hit.title} {hit.snippet} {hit.url}".lower()
    score = 0
    reasons: list[str] = []
    subject_key = search_label.lower()
    aliases = SUBJECT_ALIASES.get(subject_key, (subject_key,))
    cycle_tokens = (
        "leaving cert",
        "junior cycle",
        "junior cert",
        "lchl",
        "lcol",
        "lcfl",
        "lc hl",
        "lc ol",
        "lc fl",
        " lc ",
        "jc hl",
        "jc ol",
    )

    if any(token in blob for token in cycle_tokens):
        score += 16
        reasons.append("exam cycle")
    if any(alias in blob for alias in aliases if alias):
        score += 12
        reasons.append("subject")
    want_level = level_key(question.level)
    found_levels = mentioned_levels(blob)
    if want_level:
        if want_level in found_levels:
            score += 20
            reasons.append("level")
        conflicting = found_levels - {want_level}
        if conflicting and want_level not in found_levels:
            score -= 40
            reasons.append("wrong level")
    if question.year and str(question.year) in blob:
        score += 22
        reasons.append("year")
    if question.paper and re.search(rf"\bp(?:aper)?\s*{question.paper}\b", blob):
        score += 16
        reasons.append("paper")
    if question.q_number and re.search(rf"\bq(?:uestion)?\s*{question.q_number}\b", blob):
        score += 18
        reasons.append("question")
    if hit.kind == "youtube":
        score += 8
    if hit.kind == "pdf":
        score += 4
        reasons.append("pdf")
    # Topic is a bonus only — most video titles omit it.
    topic_l = question.topic.replace("-", " ").lower()
    if topic_l and topic_l != "untagged" and topic_l in blob:
        score += 6
        reasons.append("topic")
    if question.year and question.q_number and str(question.year) in blob and re.search(
        rf"\bq(?:uestion)?\s*{question.q_number}\b", blob
    ):
        score += 8
        reasons.append("year+q")
    generic = ("full course", "entire playlist", "subscribe", "hour compilation")
    if any(word in blob for word in generic):
        score -= 12
        reasons.append("generic")
    if not reasons:
        reasons.append("weak match")
    return score, ", ".join(reasons)


def resource_types_for(kind: str) -> list[str]:
    if kind == "youtube":
        return ["Videos"]
    if kind == "pdf":
        return ["Notes"]
    return ["Website"]


def make_draft(
    hit: SearchHit,
    *,
    cycle: str,
    practice_id: str,
    subject_label: str,
    storage_subject: str,
    question: GroupedQuestion,
    score: int,
    reason: str,
    min_score: int,
    query: str,
    members: Optional[list[GroupedQuestion]] = None,
) -> Draft:
    linked = members or [question]
    entries = [
        linked_question_entry(storage_subject, practice_id, cycle, item, subject_label)
        for item in linked
    ]
    primary = entries[0]
    level = discover_level(question.level)
    levels = [level] if level else []
    title = clip(hit.title or question.display_name, MAX_TITLE)
    part_hint = f" ({len(linked)} parts)" if len(linked) > 1 else ""
    topics: list[str] = []
    for item in linked:
        if item.topic and item.topic.lower() != "untagged":
            slug = slugify_topic(item.topic)
            if slug and slug not in topics:
                topics.append(slug)
    description = clip(
        f"{CYCLES[cycle]['label']} {question.level} {subject_label} resource for "
        f"{question.display_name}{part_hint}"
        + (f" ({', '.join(topics)}). " if topics else ". ")
        + (hit.snippet or reason),
        MAX_DESCRIPTION,
    )
    thumbnail = youtube_thumbnail(hit.url) if hit.kind == "youtube" else ""
    wrong_level = "wrong level" in reason
    accepted = (not wrong_level) and (
        score >= min_score or (hit.kind == "youtube" and score >= 8)
    )
    return Draft(
        accepted=accepted,
        title=title,
        description=description,
        website_url=hit.url,
        resource_types=resource_types_for(hit.kind),
        topics=topics[:MAX_TOPICS],
        levels=levels,
        subject_id=practice_id,
        subject_label=subject_label,
        site_name=hostname(hit.url),
        thumbnail_url=thumbnail,
        favicon_url=favicon_for(hit.url),
        score=score,
        reason=reason,
        kind=hit.kind,
        linked_question_id=str(primary.get("id") or ""),
        linked_question_name=question.display_name,
        linked_question_practice_url=str(primary.get("practiceUrl") or ""),
        linked_question_level=str(primary.get("level") or question.level),
        linked_question_topic=str(primary.get("topic") or question.topic),
        search_query=query,
        linked_questions=entries,
    )


def pick_hits(
    hits: list[SearchHit],
    *,
    cycle: str,
    search_label: str,
    question: GroupedQuestion,
    per_question: int,
    min_score: int,
    seen_urls: set[str],
) -> list[tuple[SearchHit, int, str]]:
    ranked: list[tuple[int, str, SearchHit]] = []
    for hit in hits:
        url = canonical_url(hit.url)
        hit.url = url
        if not url or url in seen_urls or should_skip_url(url):
            continue
        score, reason = score_hit(hit, cycle, search_label, question)
        ranked.append((score, reason, hit))
    ranked.sort(key=lambda row: row[0], reverse=True)
    picked: list[tuple[SearchHit, int, str]] = []
    used_hosts: set[str] = set()
    for score, reason, hit in ranked:
        host = hostname(hit.url)
        if host in used_hosts:
            continue
        if score < min_score or "wrong level" in reason:
            continue
        picked.append((hit, score, reason))
        used_hosts.add(host)
        if len(picked) >= per_question:
            break
    youtube_ranked = [
        (score, reason, hit)
        for score, reason, hit in ranked
        if hit.kind == "youtube" and "wrong level" not in reason
    ]
    has_youtube = any(hit.kind == "youtube" for hit, _, _ in picked)
    if youtube_ranked and not has_youtube:
        score, reason, hit = youtube_ranked[0]
        picked.append((hit, score, reason))
        used_hosts.add(hostname(hit.url))
    elif not picked:
        loose = [
            (score, reason, hit)
            for score, reason, hit in ranked
            if "wrong level" not in reason
        ]
        if loose:
            score, reason, hit = loose[0]
            if hit.kind == "youtube" or score >= 8:
                picked.append((hit, score, reason))
    return picked


# ── JSON / Firestore ─────────────────────────────────────────────────────────

def default_out_path(subject: str, level: str) -> Path:
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    folder = SCRIPT_DIR / "discover-drafts"
    folder.mkdir(exist_ok=True)
    return folder / f"{subject}-{level}-{stamp}.json"


def dump_drafts(path: Path, payload: dict[str, Any]) -> None:
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def parse_draft_linked_questions(item: dict[str, Any]) -> list[dict[str, Any]]:
    raw = item.get("linked_questions") or item.get("linkedQuestions") or []
    out: list[dict[str, Any]] = []
    if isinstance(raw, list):
        for entry in raw:
            if not isinstance(entry, dict):
                continue
            question_id = str(entry.get("id") or entry.get("linkedQuestionId") or "").strip()
            name = str(entry.get("name") or entry.get("linkedQuestionName") or "").strip()
            if not question_id and not name:
                continue
            out.append(
                {
                    "id": question_id or name,
                    "name": name or question_id,
                    "practiceUrl": str(entry.get("practiceUrl") or entry.get("linkedQuestionPracticeUrl") or "").strip(),
                    "subjectId": str(entry.get("subjectId") or entry.get("linkedQuestionSubjectId") or "").strip(),
                    "subjectLabel": str(entry.get("subjectLabel") or entry.get("linkedQuestionSubjectLabel") or "").strip(),
                    "level": str(entry.get("level") or entry.get("linkedQuestionLevel") or "").strip(),
                    "topic": str(entry.get("topic") or entry.get("linkedQuestionTopic") or "").strip(),
                    "source": str(entry.get("source") or entry.get("linkedQuestionSource") or "practice").strip() or "practice",
                }
            )
    if out:
        return out
    question_id = str(item.get("linked_question_id") or item.get("linkedQuestionId") or "").strip()
    name = str(item.get("linked_question_name") or item.get("linkedQuestionName") or "").strip()
    if not question_id and not name:
        return []
    return [
        {
            "id": question_id or name,
            "name": name or question_id,
            "practiceUrl": str(item.get("linked_question_practice_url") or item.get("linkedQuestionPracticeUrl") or "").strip(),
            "subjectId": str(item.get("subject_id") or item.get("subjectId") or "").strip(),
            "subjectLabel": str(item.get("subject_label") or item.get("subjectLabel") or "").strip(),
            "level": str(item.get("linked_question_level") or item.get("linkedQuestionLevel") or "").strip(),
            "topic": str(item.get("linked_question_topic") or item.get("linkedQuestionTopic") or "").strip(),
            "source": "practice",
        }
    ]


def load_drafts(path: Path) -> tuple[dict[str, Any], list[Draft]]:
    raw = json.loads(path.read_text(encoding="utf-8"))
    items = raw.get("drafts") if isinstance(raw, dict) else raw
    if not isinstance(items, list):
        raise SystemExit(f"No drafts array in {path}")
    drafts: list[Draft] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        drafts.append(
            Draft(
                accepted=bool(item.get("accepted", True)),
                title=str(item.get("title") or "").strip(),
                description=str(item.get("description") or "").strip(),
                website_url=canonical_url(str(item.get("website_url") or item.get("websiteUrl") or "")),
                resource_types=[t for t in (item.get("resource_types") or item.get("resourceTypes") or ["Website"]) if t in RESOURCE_TYPES] or ["Website"],
                topics=[slugify_topic(t) for t in (item.get("topics") or []) if str(t).strip()][:MAX_TOPICS],
                levels=[lv for lv in (item.get("levels") or []) if lv in RESOURCE_LEVELS],
                subject_id=str(item.get("subject_id") or item.get("subjectId") or "").strip(),
                subject_label=str(item.get("subject_label") or item.get("subjectLabel") or "").strip(),
                site_name=str(item.get("site_name") or item.get("siteName") or "").strip(),
                thumbnail_url=str(item.get("thumbnail_url") or item.get("thumbnailUrl") or "").strip(),
                favicon_url=str(item.get("favicon_url") or item.get("faviconUrl") or "").strip(),
                score=int(item.get("score") or 0),
                reason=str(item.get("reason") or ""),
                kind=str(item.get("kind") or "web"),
                linked_question_id=str(item.get("linked_question_id") or item.get("linkedQuestionId") or "").strip(),
                linked_question_name=str(item.get("linked_question_name") or item.get("linkedQuestionName") or "").strip(),
                linked_question_practice_url=str(item.get("linked_question_practice_url") or item.get("linkedQuestionPracticeUrl") or "").strip(),
                linked_question_level=str(item.get("linked_question_level") or item.get("linkedQuestionLevel") or "").strip(),
                linked_question_topic=str(item.get("linked_question_topic") or item.get("linkedQuestionTopic") or "").strip(),
                search_query=str(item.get("search_query") or ""),
                linked_questions=parse_draft_linked_questions(item),
            )
        )
    meta = raw if isinstance(raw, dict) else {}
    return meta, drafts


def validate_draft(draft: Draft) -> Optional[str]:
    if not draft.accepted:
        return "not accepted"
    if not draft.title or len(draft.title) > MAX_TITLE:
        return "bad title"
    if len(draft.description) > MAX_DESCRIPTION:
        return "description too long"
    if not draft.website_url.startswith("http"):
        return "bad url"
    if not draft.subject_id or not draft.subject_label:
        return "missing subject"
    return None


def post_drafts(
    db,
    drafts: list[Draft],
    *,
    uid: str,
    username: str,
    picture: Optional[str],
    existing: set[tuple[str, str]],
    dry_run: bool,
    stats: Stats,
) -> None:
    for draft in drafts:
        reason = validate_draft(draft)
        if reason:
            stats.reasons[reason] += 1
            continue
        ids = [str(row.get("id") or "").strip() for row in (draft.linked_questions or [])]
        ids = [qid for qid in ids if qid] or ([draft.linked_question_id] if draft.linked_question_id else [])
        if any((qid, draft.website_url) in existing for qid in ids):
            stats.skipped_existing += 1
            continue
        stats.would_post += 1
        preview = f"{draft.score:>3}  {draft.kind:<7}  {draft.title}  ->  {draft.website_url}"
        if dry_run:
            print(f"DRY  {preview}")
            continue
        payload = {
            "userId": uid,
            "username": username,
            "userPicture": picture,
            "title": draft.title,
            "description": draft.description,
            "websiteUrl": draft.website_url,
            "resourceSource": "website",
            "pdfPath": "",
            "pdfFileName": "",
            "thumbnailUrl": draft.thumbnail_url,
            "thumbnailPath": "",
            "uploadedThumbnailUrl": "",
            "uploadedThumbnailPath": "",
            "thumbnailStatus": "none",
            "moderationStatus": "pending",
            "faviconUrl": draft.favicon_url,
            "siteName": draft.site_name or hostname(draft.website_url),
            "subjectId": draft.subject_id,
            "subjectLabel": draft.subject_label,
            "levels": draft.levels,
            "resourceTypes": draft.resource_types,
            "resourceType": draft.resource_types[0],
            "topics": draft.topics,
            "likeCount": 0,
            "commentCount": 0,
            "ratingAverage": 0,
            "ratingCount": 0,
            "linkedQuestionId": draft.linked_question_id or None,
            "linkedQuestionName": draft.linked_question_name or None,
            "linkedQuestionPracticeUrl": draft.linked_question_practice_url or None,
            "linkedQuestionSubjectId": draft.subject_id,
            "linkedQuestionSubjectLabel": draft.subject_label,
            "linkedQuestionLevel": draft.linked_question_level or None,
            "linkedQuestionTopic": draft.linked_question_topic or None,
            "linkedQuestionSource": "practice",
            "linkedQuestions": draft.linked_questions or [],
            "timestamp": firestore.SERVER_TIMESTAMP,
            "sourcedBy": "discover_question_sources.py",
            "sourceScore": draft.score,
        }
        db.collection(DISCOVER_COLLECTION).add(payload)
        for qid in ids:
            existing.add((qid, draft.website_url))
        stats.posted += 1
        print(f"POST {preview}")


# ── Search run ───────────────────────────────────────────────────────────────

def youtube_fallback_query(cycle: str, search_label: str, question: GroupedQuestion) -> str:
    parts = [
        CYCLES[cycle]["label"],
        search_label,
        level_search_phrase(question.level),
        str(question.year) if question.year else "",
        f"Q{question.q_number}" if question.q_number else question.display_name,
        "worked solution",
    ]
    return " ".join(part for part in parts if part)


def gather_hits_for_question(
    question: GroupedQuestion,
    *,
    cycle: str,
    search_label: str,
    kinds: set[str],
    youtube_key: str,
    google_key: str,
    cse_id: str,
    stats: Stats,
) -> tuple[list[SearchHit], str]:
    queries = build_queries(cycle, search_label, question)
    hits: list[SearchHit] = []
    primary_query = queries.get("youtube") or queries.get("web") or ""
    print(f"    query: {primary_query}")
    search_kinds = set(kinds)
    search_kinds.add("youtube")
    for kind in ("youtube", "web", "pdf"):
        if kind not in search_kinds:
            continue
        query = queries[kind]
        try:
            if kind == "youtube":
                found = search_youtube(query, 8, youtube_key)
            else:
                found = search_web(query, kind, 5, google_key, cse_id)
            hits.extend(found)
            stats.hits += len(found)
        except Exception as exc:
            stats.search_errors += 1
            stats.reasons[f"{kind}_error"] += 1
            print(f"    warn: {kind} search failed: {exc}", file=sys.stderr)
    if not any(hit.kind == "youtube" for hit in hits):
        fallback = youtube_fallback_query(cycle, search_label, question)
        if fallback and fallback != primary_query:
            print(f"    youtube fallback: {fallback}")
            try:
                found = search_youtube(fallback, 8, youtube_key)
                hits.extend(found)
                stats.hits += len(found)
            except Exception as exc:
                stats.search_errors += 1
                stats.reasons["youtube_fallback_error"] += 1
                print(f"    warn: youtube fallback failed: {exc}", file=sys.stderr)
    return hits, primary_query


def run_search(
    db,
    *,
    cycle: str,
    subject: str,
    level: str,
    topic: Optional[str],
    year: Optional[int],
    limit: Optional[int],
    kinds: set[str],
    per_question: int,
    min_score: int,
    youtube_key: str,
    google_key: str,
    cse_id: str,
    sleep_s: float,
    existing: set[tuple[str, str]],
    stats: Stats,
) -> list[Draft]:
    questions = load_questions(db, cycle, subject, level)
    stats.questions += len(questions)
    if topic:
        want = topic.strip().lower()
        questions = [q for q in questions if q.topic.lower() == want]
    if year:
        questions = [q for q in questions if q.year == year]
    grouped = group_questions(questions)
    clusters = cluster_grouped_questions(grouped)
    stats.grouped += len(grouped)
    stats.clusters += len(clusters)
    if limit is not None:
        clusters = clusters[: max(0, limit)]

    practice_id = practice_subject_id(subject)
    subject_label = title_case_label(practice_id)
    search_label = search_label_for(practice_id)
    storage_subject = storage_subject_id(subject)
    drafts: list[Draft] = []
    seen_urls_global: set[str] = set()

    print(f"Searching {len(clusters)} exam questions in {subject}/{level} ({CYCLES[cycle]['label']})")
    for index, members in enumerate(clusters, start=1):
        question = cluster_search_question(members)
        stats.searched += 1
        part_names = ", ".join(item.display_name for item in members)
        print(f"[{index}/{len(clusters)}] {question.display_name}  ({question.topic}"
              f"{f', {question.year}' if question.year else ''}"
              f"{f' P{question.paper}' if question.paper else ''}"
              f"{f' Q{question.q_number}' if question.q_number else ''}"
              f"{f'; {len(members)} parts' if len(members) > 1 else ''})")
        if len(members) > 1:
            print(f"    parts: {part_names}")
        hits, query = gather_hits_for_question(
            question,
            cycle=cycle,
            search_label=search_label,
            kinds=kinds,
            youtube_key=youtube_key,
            google_key=google_key,
            cse_id=cse_id,
            stats=stats,
        )
        picked = pick_hits(
            hits,
            cycle=cycle,
            search_label=search_label,
            question=question,
            per_question=per_question,
            min_score=min_score,
            seen_urls=seen_urls_global,
        )
        if sleep_s > 0:
            time.sleep(sleep_s)
        if not picked:
            stats.skipped_low_score += 1
            print("    no dedicated source above score threshold")
            continue
        question_ids = [discover_question_id(storage_subject, item) for item in members]
        for hit, score, reason in picked:
            if any((qid, hit.url) in existing for qid in question_ids):
                stats.skipped_existing += 1
                print(f"    skip existing {hit.url}")
                continue
            draft = make_draft(
                hit,
                cycle=cycle,
                practice_id=practice_id,
                subject_label=subject_label,
                storage_subject=storage_subject,
                question=question,
                score=score,
                reason=reason,
                min_score=min_score,
                query=query,
                members=members,
            )
            drafts.append(draft)
            seen_urls_global.add(hit.url)
            stats.drafts += 1
            flag = "OK" if draft.accepted else "LOW"
            print(f"    {flag} {score:>3} {draft.kind:<7} {draft.title} | {draft.website_url}")
    return drafts


# ── CLI ──────────────────────────────────────────────────────────────────────

def parse_kinds(raw: str) -> set[str]:
    allowed = {"youtube", "web", "pdf"}
    parts = {p.strip().lower() for p in raw.split(",") if p.strip()}
    unknown = parts - allowed
    if unknown:
        raise SystemExit(f"Unknown --kinds values: {', '.join(sorted(unknown))}")
    return parts or allowed


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Search online sources for Practice Hub questions and draft Discover listings"
    )
    parser.add_argument("--cred", type=str, default=None, help="Service account JSON path")
    parser.add_argument("--cycle", type=str, default="leaving", help="leaving | junior")
    parser.add_argument("--subject", type=str, default=None, help="Subject slug, e.g. biology or maths")
    parser.add_argument(
        "--level",
        type=str,
        default=None,
        help="higher | ordinary | foundation | common | all",
    )
    parser.add_argument("--topic", type=str, default=None, help="Only this topic")
    parser.add_argument("--year", type=int, default=None, help="Only this exam year")
    parser.add_argument("--limit", type=int, default=None, help="Only first N exam questions (Q4 a/b/c counts as one)")
    parser.add_argument("--kinds", type=str, default="youtube,web", help="youtube,web,pdf")
    parser.add_argument("--per-question", type=int, default=2, help="Max drafts kept per question")
    parser.add_argument("--min-score", type=int, default=18, help="Drop weak matches below this score")
    parser.add_argument("--sleep", type=float, default=0.35, help="Seconds between questions")
    parser.add_argument("--out", type=str, default=None, help="JSON path for drafts")
    parser.add_argument("--from", dest="from_file", type=str, default=None, help="Load drafts JSON instead of searching")
    parser.add_argument("--apply", action="store_true", help="Post accepted drafts to discover-notes as pending")
    parser.add_argument("--uid", type=str, default=DEFAULT_ADMIN_UID, help="Author uid for posted listings")
    parser.add_argument("--username", type=str, default=None, help="Override author username")
    parser.add_argument("--list-subjects", action="store_true", help="Print subjects/levels and exit")
    parser.add_argument("--youtube-key", type=str, default=None, help="YouTube Data API key (or YOUTUBE_API_KEY)")
    parser.add_argument("--google-key", type=str, default=None, help="Google API key (or GOOGLE_API_KEY)")
    parser.add_argument("--cse-id", type=str, default=None, help="Google CSE id (or GOOGLE_CSE_ID)")
    args = parser.parse_args()

    cycle = parse_cycle(args.cycle)
    cred_path = resolve_cred_path(args.cred)
    db = init_firebase(cred_path)
    stats = Stats()

    if args.list_subjects:
        print(f"{CYCLES[cycle]['label']} subjects:")
        for subject in list_root_subjects(db, cycle):
            levels = list_subject_levels(db, cycle, subject)
            print(f"  {subject:40}  {', '.join(levels) or '(no levels)'}")
        return

    youtube_key = args.youtube_key or os.environ.get("YOUTUBE_API_KEY") or ""
    google_key = args.google_key or os.environ.get("GOOGLE_API_KEY") or ""
    cse_id = args.cse_id or os.environ.get("GOOGLE_CSE_ID") or ""
    dry_run = not args.apply

    existing = load_existing_pairs(db)
    drafts: list[Draft] = []
    meta: dict[str, Any] = {}
    out_path: Optional[Path] = Path(args.out).expanduser() if args.out else None

    if args.from_file:
        meta, drafts = load_drafts(Path(args.from_file).expanduser())
        stats.drafts = len(drafts)
        print(f"Loaded {len(drafts)} drafts from {args.from_file}")
    else:
        if not args.subject or not args.level:
            raise SystemExit("Pass --subject and --level, or --from FILE, or --list-subjects")
        subject = resolve_subject(db, cycle, args.subject)
        level_hint = args.level.strip().lower()
        levels = (
            list_subject_levels(db, cycle, subject)
            if level_hint in {"all", "*"}
            else [resolve_level(db, cycle, subject, args.level)]
        )
        if not levels:
            raise SystemExit(f"No levels found for {subject}")
        kinds = parse_kinds(args.kinds)
        for level in levels:
            if len(levels) > 1:
                print(f"\n=== {subject}/{level} ===")
            drafts.extend(
                run_search(
                    db,
                    cycle=cycle,
                    subject=subject,
                    level=level,
                    topic=args.topic,
                    year=args.year,
                    limit=args.limit,
                    kinds=kinds,
                    per_question=max(1, args.per_question),
                    min_score=args.min_score,
                    youtube_key=youtube_key,
                    google_key=google_key,
                    cse_id=cse_id,
                    sleep_s=max(0.0, args.sleep),
                    existing=existing,
                    stats=stats,
                )
            )
        level_label = "all" if len(levels) > 1 else levels[0]
        out_path = out_path or default_out_path(subject, level_label)
        payload = {
            "generatedAt": datetime.now(timezone.utc).isoformat(),
            "cycle": cycle,
            "subject": subject,
            "level": level_label,
            "levels": levels,
            "topic": args.topic,
            "year": args.year,
            "minScore": args.min_score,
            "kinds": sorted(kinds),
            "note": "Set accepted=false on any row you do not want posted. Re-run with --from this file --apply.",
            "drafts": [asdict(d) for d in drafts],
        }
        dump_drafts(out_path, payload)
        print(f"\nWrote {len(drafts)} drafts -> {out_path}")

    uid = (args.uid or DEFAULT_ADMIN_UID).strip()
    looked_up_username, picture = load_author(db, uid)
    username = (args.username or looked_up_username).strip()

    accepted = [d for d in drafts if d.accepted]
    print()
    print("-- Discover source summary --")
    if stats.questions:
        print(f"  catalogue questions:   {stats.questions}")
        print(f"  grouped questions:     {stats.grouped}")
        print(f"  exam question clusters:{stats.clusters:>6}")
        print(f"  searched:              {stats.searched}")
        print(f"  raw hits:              {stats.hits}")
        print(f"  search errors:         {stats.search_errors}")
    print(f"  drafts:                {len(drafts)}")
    print(f"  accepted:              {len(accepted)}")
    print(f"  skipped existing:      {stats.skipped_existing}")
    if stats.skipped_low_score:
        print(f"  questions with none:   {stats.skipped_low_score}")

    post_drafts(
        db,
        accepted,
        uid=uid,
        username=username,
        picture=picture,
        existing=existing,
        dry_run=dry_run,
        stats=stats,
    )
    print(f"  would post:            {stats.would_post}")
    if not dry_run:
        print(f"  posted pending:        {stats.posted}")
        print("Review them at /admin/discover-moderation")
    else:
        print("\nNo writes performed. Edit the JSON, then re-run with --from FILE --apply to post pending listings.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrupted.", file=sys.stderr)
        sys.exit(130)
