# Firestore structure for exam papers and questions

Use this as a reference or prompt when working on the app’s data model, seeding, or new features.

---

## Overview

- All **question-related data** lives under the **`questions`** collection (same as existing CertChamps content).
- **Leaving Cert** content is under **`questions/leavingcert`**, organised as: **exam group → subject → level**, then either **full papers** (PDF metadata) or **questions by topic** (“separated”).
- **PDF files** stay in **Firebase Storage**; Firestore only stores metadata and paths (`storagePath`).
- **Phase 1:** We use **full papers** only (documents in `.../papers`). **Later:** add topic subcollections (e.g. `algebra`, `calculus`) under each level for individual questions by topic.

---

## Hierarchy

```
questions (collection)
│
├── certchamps (document)                    ← existing: CertChamps question sets
│   └── sections: ["sequences-and-series", "algebra", ...]
│   └── sequences-and-series/ (subcollection)  ← question docs (e.g. CCQ00000001)
│   └── algebra/
│   └── ...
│
└── leavingcert (document)                   ← Leaving Cert content
    └── sections: ["maths", "irish", ...]     ← list of subject IDs
    │
    └── maths (document)
        └── sections: ["higher", "ordinary"]   ← level IDs
        │
        └── higher (document)
            └── sections: ["papers", "algebra", "calculus", ...]   ← "papers" + topic names
            │
            └── papers (subcollection)        ← Phase 1: full exam paper metadata
            │   └── 2024-p1 (document)       ← year, storagePath, label
            │   └── 2024-p2
            │   └── ...
            │
            └── algebra (subcollection)       ← Later: question docs by topic
            └── calculus (subcollection)
            └── ...
        │
        └── ordinary (document)
            └── sections: ["papers", "algebra", ...]
            └── papers/
            └── algebra/
            └── ...
    │
    └── irish (document)
        └── sections: ["higher", "ordinary"]
        └── higher/
        └── ordinary/
        └── ...
```

- **Parent documents** use a **`sections`** field (array of strings) to list the **IDs of their subcollections or child docs** (e.g. subject IDs under `leavingcert`, level IDs under a subject, then `"papers"` and topic names under a level).
- The app **resolves** this by reading `sections` and then querying the corresponding subcollections or documents.

---

## Full-paper documents (Phase 1)

**Path:** `questions/leavingcert/{subject}/{level}/papers/{paperId}`

**Example:** `questions/leavingcert/maths/higher/papers/2024-p1`

| Field         | Type   | Required | Example / notes |
|---------------|--------|----------|------------------|
| `year`        | number | yes      | `2024` |
| `storagePath` | string | yes      | Full path in Firebase Storage to the PDF, e.g. `exam-papers/leaving-cert/maths/higher-level/full-papers/2024-p1.pdf` |
| `label`       | string | no       | Display name, e.g. `"2024 Paper 1"`. If missing, the app can derive from filename or year. |

- **Document ID:** Use a slug (e.g. `2024-p1`) or auto-ID. The app uses this `id` plus `storagePath` to load the PDF from Storage.
- **Storage path convention:**  
  `exam-papers/leaving-cert/{subject}/{level}-level/full-papers/{filename}.pdf`  
  e.g. `exam-papers/leaving-cert/maths/higher-level/full-papers/2024-p1.pdf`

---

## Questions by topic (later)

- Under each **level** document, `sections` can include both `"papers"` and topic names (e.g. `"algebra"`, `"calculus"`).
- Each **topic** is a **subcollection** of question documents (same idea as CertChamps: doc per question, optional `content` subcollection, etc.).
- Question docs can store **`paperId`** (and optionally `page` or `section`) to link back to a full paper in `.../papers/{paperId}` for “Open in full paper” or similar.

---

## Summary for prompts / AI

**Firestore:**

- **Collection:** `questions`.
- **Leaving Cert branch:** `questions/leavingcert` (document with `sections: [subjectIds]`).
- **Per subject:** `questions/leavingcert/{subject}` (document with `sections: [levelIds]`), e.g. `maths`, `irish`.
- **Per level:** `questions/leavingcert/{subject}/{level}` (document with `sections: ["papers", ...topicIds]`), e.g. `higher`, `ordinary`.
- **Full papers:** subcollection `questions/leavingcert/{subject}/{level}/papers`; each doc has `year`, `storagePath`, `label`; PDFs live in Storage at `storagePath`.
- **Later – by topic:** subcollections like `questions/leavingcert/{subject}/{level}/algebra` with question docs; they can reference a paper via `paperId`.

**Storage:**

- PDFs: `exam-papers/leaving-cert/{subject}/{level}-level/full-papers/{filename}.pdf`.

This is the Firestore (and Storage) structure we are going for.
