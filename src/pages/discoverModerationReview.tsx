import { useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  deleteDoc,
  doc,
  onSnapshot,
  updateDoc,
} from "firebase/firestore";
import { deleteObject, ref as storageRef } from "firebase/storage";
import {
  LuArrowLeft,
  LuCheck,
  LuExternalLink,
  LuLoaderCircle,
  LuPlus,
  LuSave,
  LuX,
} from "react-icons/lu";
import { db, storage } from "../../firebase";
import { UserContext } from "../context/UserContext";
import { isAdminUid } from "../constants/adminUids";
import { notifyPostOwner } from "../lib/notifications";
import {
  loadLinkedQuestionPreview,
  MAX_DESCRIPTION,
  MAX_TITLE,
  parseDiscoverModerationNote,
  RESOURCE_LEVELS,
  RESOURCE_TYPES,
  timeAgo,
  type DiscoverModerationNote,
  type LinkedQuestionPreview,
  type ResourceLevel,
  type ResourceSource,
  type ResourceType,
} from "../lib/discoverModeration";
import { getPracticeSubjectId, getSubjectLabel } from "../data/practiceHubSubjects";
import { SubjectDropdown } from "../components/practiceHub";
import DiscoverMediaPreview from "../components/discover/DiscoverMediaPreview";
import DiscoverRejectModal from "../components/discover/DiscoverRejectModal";
import ZoomableQuestionImage from "../components/questions/ZoomableQuestionImage";
import { linkedQuestionsPayload, withDiscoverSidebar, type LinkedDiscoverQuestion } from "../lib/discoverLinks";
import { lookupDiscoverAuthor } from "../lib/discoverAuthor";

type FormState = {
  title: string;
  description: string;
  websiteUrl: string;
  resourceSource: ResourceSource;
  siteName: string;
  subjectId: string;
  subjectLabel: string;
  levels: ResourceLevel[];
  resourceTypes: ResourceType[];
  topics: string[];
  thumbnailUrl: string;
  userId: string;
  username: string;
  userPicture: string | null;
  linkedQuestionId: string;
  linkedQuestionName: string;
  linkedQuestionPracticeUrl: string;
  linkedQuestionSubjectId: string;
  linkedQuestionSubjectLabel: string;
  linkedQuestionLevel: string;
  linkedQuestionTopic: string;
  linkedQuestionSource: string;
  linkedQuestions: LinkedDiscoverQuestion[];
};

function emptyLinkedQuestion(): LinkedDiscoverQuestion {
  return {
    id: "",
    name: "",
    practiceUrl: "",
    subjectId: "",
    subjectLabel: "",
    level: "",
    topic: "",
    source: "practice",
  };
}

function primaryFromLinks(links: LinkedDiscoverQuestion[]) {
  const first = links[0];
  return {
    linkedQuestions: links,
    linkedQuestionId: first?.id ?? "",
    linkedQuestionName: first?.name ?? "",
    linkedQuestionPracticeUrl: first?.practiceUrl ?? "",
    linkedQuestionSubjectId: first?.subjectId ?? "",
    linkedQuestionSubjectLabel: first?.subjectLabel ?? "",
    linkedQuestionLevel: first?.level ?? "",
    linkedQuestionTopic: first?.topic ?? "",
    linkedQuestionSource: first?.source ?? "",
  };
}

function noteToForm(note: DiscoverModerationNote): FormState {
  const links = note.linkedQuestions.length > 0
    ? note.linkedQuestions
    : note.linkedQuestionId || note.linkedQuestionName || note.linkedQuestionPracticeUrl
      ? [
          {
            id: note.linkedQuestionId,
            name: note.linkedQuestionName,
            practiceUrl: note.linkedQuestionPracticeUrl || undefined,
            subjectId: note.linkedQuestionSubjectId || undefined,
            subjectLabel: note.linkedQuestionSubjectLabel || undefined,
            level: note.linkedQuestionLevel || undefined,
            topic: note.linkedQuestionTopic || undefined,
            source: note.linkedQuestionSource || undefined,
          },
        ]
      : [];
  return {
    title: note.title,
    description: note.description,
    websiteUrl: note.websiteUrl,
    resourceSource: note.resourceSource,
    siteName: note.siteName,
    subjectId: note.subjectId,
    subjectLabel: note.subjectLabel,
    levels: note.levels,
    resourceTypes: note.resourceTypes.length > 0 ? note.resourceTypes : [note.resourceType],
    topics: note.topics,
    thumbnailUrl: note.thumbnailUrl,
    userId: note.userId,
    username: note.username,
    userPicture: note.userPicture,
    ...primaryFromLinks(links),
  };
}

function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-xs font-semibold color-txt-sub uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

const inputClass =
  "w-full rounded-xl color-bg-grey-5 color-txt-main px-4 py-3 text-sm outline-none placeholder:color-txt-sub";

export default function DiscoverModerationReview() {
  const { noteId } = useParams<{ noteId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const listHref = `/admin/discover-moderation${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
  const { user } = useContext(UserContext);
  const isAdmin = isAdminUid(user?.uid, user?.email);

  const [note, setNote] = useState<DiscoverModerationNote | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [topicDraft, setTopicDraft] = useState("");
  const [authorHandle, setAuthorHandle] = useState("");
  const [lookingUpAuthor, setLookingUpAuthor] = useState(false);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState<"save" | "approve" | "reject" | null>(null);
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [questionPreview, setQuestionPreview] = useState<LinkedQuestionPreview | null>(null);
  const [questionLoading, setQuestionLoading] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);

  useEffect(() => {
    if (!form?.username && !form?.userId) return;
    setAuthorHandle((current) => current || form.username || form.userId);
  }, [form?.username, form?.userId]);

  useEffect(() => {
    setForm(null);
    setNote(null);
    setLoading(true);
    setMissing(false);
    setError(null);
    setQuestionPreview(null);
    setPreviewIndex(0);
    setAuthorHandle("");
    setLookingUpAuthor(false);
  }, [noteId]);

  useEffect(() => {
    if (!isAdmin || !noteId) return;
    const unsub = onSnapshot(
      doc(db, "discover-notes", noteId),
      (snap) => {
        if (!snap.exists()) {
          setMissing(true);
          setNote(null);
          setForm(null);
          setLoading(false);
          return;
        }
        const parsed = parseDiscoverModerationNote(snap.id, snap.data() as Record<string, unknown>);
        setNote(parsed);
        setForm((current) => current ?? noteToForm(parsed));
        setLoading(false);
      },
      (err) => {
        setError(err.message ?? "Failed to load this resource.");
        setLoading(false);
      }
    );
    return () => unsub();
  }, [isAdmin, noteId]);

  useEffect(() => {
    if (!form) {
      setQuestionPreview(null);
      return;
    }
    const target =
      form.linkedQuestions[previewIndex] ??
      form.linkedQuestions[0] ??
      (form.linkedQuestionId || form.linkedQuestionPracticeUrl || form.linkedQuestionName
        ? {
            id: form.linkedQuestionId,
            name: form.linkedQuestionName,
            practiceUrl: form.linkedQuestionPracticeUrl,
            subjectId: form.linkedQuestionSubjectId,
            level: form.linkedQuestionLevel,
            topic: form.linkedQuestionTopic,
          }
        : null);
    if (!target?.id && !target?.practiceUrl && !target?.name) {
      setQuestionPreview(null);
      return;
    }
    let cancelled = false;
    setQuestionLoading(true);
    const timer = window.setTimeout(() => {
      loadLinkedQuestionPreview({
        linkedQuestionId: target.id,
        linkedQuestionName: target.name,
        linkedQuestionPracticeUrl: target.practiceUrl,
        linkedQuestionSubjectId: target.subjectId,
        linkedQuestionLevel: target.level,
        linkedQuestionTopic: target.topic,
      })
        .then((preview) => {
          if (!cancelled) setQuestionPreview(preview);
        })
        .finally(() => {
          if (!cancelled) setQuestionLoading(false);
        });
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [
    previewIndex,
    form?.linkedQuestionId,
    form?.linkedQuestionName,
    form?.linkedQuestionPracticeUrl,
    form?.linkedQuestionSubjectId,
    form?.linkedQuestionLevel,
    form?.linkedQuestionTopic,
    form?.linkedQuestions,
  ]);

  const dirty = useMemo(() => {
    if (!note || !form) return false;
    return JSON.stringify(form) !== JSON.stringify(noteToForm(note));
  }, [form, note]);

  const previewResource = useMemo(() => {
    if (!form) return null;
    return {
      title: form.title,
      websiteUrl: form.websiteUrl,
      resourceSource: form.resourceSource,
      pdfPath: note?.pdfPath ?? "",
      imagePath: note?.imagePath ?? "",
      thumbnailUrl: form.thumbnailUrl,
      faviconUrl: note?.faviconUrl ?? "",
    };
  }, [form, note?.faviconUrl, note?.pdfPath, note?.imagePath]);

  const patchForm = (partial: Partial<FormState>) => {
    setForm((current) => (current ? { ...current, ...partial } : current));
  };

  const toggleLevel = (level: ResourceLevel) => {
    if (!form) return;
    patchForm({
      levels: form.levels.includes(level)
        ? form.levels.filter((item) => item !== level)
        : [...form.levels, level],
    });
  };

  const toggleType = (type: ResourceType) => {
    if (!form) return;
    const next = form.resourceTypes.includes(type)
      ? form.resourceTypes.filter((item) => item !== type)
      : [...form.resourceTypes, type];
    patchForm({
      resourceTypes: next.length > 0 ? next : form.resourceTypes,
    });
  };

  const addTopics = () => {
    if (!form) return;
    const next = topicDraft
      .split(/[,\s]+/)
      .map((topic) => topic.trim().replace(/^#/, "").replace(/\s+/g, "-"))
      .filter(Boolean);
    if (next.length === 0) return;
    patchForm({ topics: [...new Set([...form.topics, ...next])].slice(0, 8) });
    setTopicDraft("");
  };

  const buildPayload = () => {
    if (!form) return null;
    const title = form.title.trim().slice(0, MAX_TITLE);
    const description = form.description.trim().slice(0, MAX_DESCRIPTION);
    if (!title) {
      setError("Title is required.");
      return null;
    }
    if (description.length > MAX_DESCRIPTION) {
      setError("Description is too long.");
      return null;
    }
    const types = form.resourceTypes.length > 0 ? form.resourceTypes : (["Notes"] as ResourceType[]);
    const links = form.linkedQuestions.filter(
      (item) => item.id.trim() || item.name.trim() || Boolean(item.practiceUrl?.trim())
    );
    const linksPayload = linkedQuestionsPayload(links);
    return {
      title,
      description,
      websiteUrl: form.websiteUrl.trim(),
      resourceSource: form.resourceSource,
      siteName: form.siteName.trim(),
      subjectId: form.subjectId,
      subjectLabel: form.subjectLabel,
      levels: form.levels,
      resourceTypes: types,
      resourceType: types[0],
      topics: form.topics,
      thumbnailUrl: form.thumbnailUrl.trim(),
      userId: form.userId,
      username: form.username,
      userPicture: form.userPicture,
      linkedQuestions: linksPayload.linkedQuestions,
      linkedQuestionId: linksPayload.linkedQuestionId,
      linkedQuestionName: linksPayload.linkedQuestionName,
      linkedQuestionPracticeUrl: linksPayload.linkedQuestionPracticeUrl,
      linkedQuestionSubjectId: linksPayload.linkedQuestionSubjectId,
      linkedQuestionSubjectLabel: linksPayload.linkedQuestionSubjectLabel,
      linkedQuestionLevel: linksPayload.linkedQuestionLevel,
      linkedQuestionTopic: linksPayload.linkedQuestionTopic,
      linkedQuestionSource: linksPayload.linkedQuestionSource,
    };
  };

  const applyAuthor = async () => {
    const handle = authorHandle.trim();
    if (!handle || !form) return null;
    if (handle === form.username || handle === form.userId) return null;
    setLookingUpAuthor(true);
    setError(null);
    try {
      const match = await lookupDiscoverAuthor(handle);
      if (!match) {
        setError("Could not find that account. Use their username or uid.");
        return false as const;
      }
      patchForm({
        userId: match.uid,
        username: match.username,
        userPicture: match.picture,
      });
      setAuthorHandle(match.username);
      return match;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not look up that account.");
      return false as const;
    } finally {
      setLookingUpAuthor(false);
    }
  };

  const save = async () => {
    if (!noteId || !form) return false;
    const author = await applyAuthor();
    if (author === false) return false;
    const payload = buildPayload();
    if (!payload) return false;
    if (author) {
      payload.userId = author.uid;
      payload.username = author.username;
      payload.userPicture = author.picture;
    }
    setBusy("save");
    setError(null);
    try {
      await updateDoc(doc(db, "discover-notes", noteId), payload);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 1600);
      return true;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save changes.");
      return false;
    } finally {
      setBusy(null);
    }
  };

  const approve = async () => {
    if (!noteId || !note || !form) return;
    const handle = authorHandle.trim();
    const authorPending = Boolean(handle && handle !== form.username && handle !== form.userId);
    if (dirty || authorPending) {
      const saved = await save();
      if (!saved) return;
    }
    setBusy("approve");
    setError(null);
    try {
      await updateDoc(doc(db, "discover-notes", noteId), {
        moderationStatus: "approved",
        thumbnailModeratedBy: user?.uid ?? "",
        thumbnailModeratedAt: new Date(),
        ...(note.uploadedThumbnailUrl
          ? {
              thumbnailUrl: form?.thumbnailUrl?.trim() || note.uploadedThumbnailUrl,
              thumbnailStatus: "approved",
            }
          : {}),
      });
      navigate(listHref);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not approve resource.");
    } finally {
      setBusy(null);
    }
  };

  const reject = async (reason: string) => {
    if (!noteId || !note) return;
    const why = reason.trim();
    if (!why) {
      setError("Add a reason before rejecting.");
      return;
    }
    setBusy("reject");
    setError(null);
    try {
      await deleteDoc(doc(db, "discover-notes", noteId));
      notifyPostOwner({
        ownerId: note.userId,
        actorId: user?.uid,
        type: "post-rejected",
        postId: note.id,
        postTitle: form?.title || note.title,
        reason: why,
      });
      if (note.uploadedThumbnailPath) {
        try {
          await deleteObject(storageRef(storage, note.uploadedThumbnailPath));
        } catch (deleteErr) {
          console.warn("Failed to delete rejected resource thumbnail:", deleteErr);
        }
      }
      if (note.pdfPath) {
        try {
          await deleteObject(storageRef(storage, note.pdfPath));
        } catch (deleteErr) {
          console.warn("Failed to delete rejected PDF:", deleteErr);
        }
      }
      if (note.imagePath) {
        try {
          await deleteObject(storageRef(storage, note.imagePath));
        } catch (deleteErr) {
          console.warn("Failed to delete rejected image:", deleteErr);
        }
      }
      navigate(listHref);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not reject resource.");
    } finally {
      setBusy(null);
    }
  };

  if (!isAdmin) {
    return (
      <div className="flex-1 w-full h-full color-bg flex items-center justify-center p-6">
        <div className="color-bg-grey-5 p-8 rounded-xl text-center">
          <LuX size={48} className="color-txt-accent mx-auto mb-4" />
          <h2 className="txt-heading-colour text-2xl mb-2">Access Denied</h2>
          <p className="color-txt-sub">You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 color-bg color-txt-sub">
        <LuLoaderCircle className="animate-spin" size={18} />
        Loading resource...
      </div>
    );
  }

  if (missing || !note || !form) {
    return (
      <div className="flex flex-col flex-1 min-h-0 color-bg p-6">
        <button
          type="button"
          onClick={() => navigate(listHref)}
          className="self-start inline-flex items-center gap-2 color-bg-grey-5 px-3 py-2 rounded-xl color-txt-main"
        >
          <LuArrowLeft size={18} />
          Back
        </button>
        <p className="mt-6 color-txt-sub">This Discover resource is no longer available.</p>
      </div>
    );
  }

  const hasLinkedQuestion = Boolean(
    form.linkedQuestions.some((item) => item.id || item.name || item.practiceUrl) ||
      form.linkedQuestionId ||
      form.linkedQuestionPracticeUrl ||
      form.linkedQuestionName
  );
  const previewJumpUrl = questionPreview?.practiceUrl
    ? withDiscoverSidebar(questionPreview.practiceUrl, note.id)
    : "";

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 w-full h-full overflow-hidden color-bg">
      <div className="shrink-0 w-full max-w-[1600px] mx-auto px-6 pt-6 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4 min-w-0">
            <button
              type="button"
              onClick={() => navigate(listHref)}
              className="color-bg-grey-5 p-2.5 rounded-xl hover:color-bg-grey-10 transition-all shrink-0"
              aria-label="Back to pending list"
            >
              <LuArrowLeft size={22} className="color-txt-accent" />
            </button>
            <div className="min-w-0">
              <h1 className="color-txt-main text-2xl font-bold truncate">{form.title || "Untitled resource"}</h1>
              <p className="color-txt-sub text-sm mt-1">
                Shared by {form.username || note.username}
                {form.userId !== note.userId ? ` (was ${note.username})` : ""}
                {note.timestamp ? ` · ${timeAgo(note.timestamp)}` : ""}
                {note.sourceScore != null ? ` · score ${note.sourceScore}` : ""}
                {note.moderationStatus ? ` · ${note.moderationStatus}` : ""}
                {dirty ? " · unsaved edits" : ""}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void save()}
              disabled={busy != null || !dirty}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg-grey-5 color-txt-main text-sm font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
            >
              {busy === "save" ? <LuLoaderCircle size={15} className="animate-spin" /> : <LuSave size={15} />}
              {savedFlash ? "Saved" : "Save edits"}
            </button>
            <button
              type="button"
              onClick={() => void approve()}
              disabled={busy != null}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg-accent color-txt-accent text-sm font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
            >
              {busy === "approve" ? <LuLoaderCircle size={15} className="animate-spin" /> : <LuCheck size={15} />}
              Approve
            </button>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setShowReject(true);
              }}
              disabled={busy != null}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg-grey-5 color-txt-main text-sm font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
            >
              {busy === "reject" ? <LuLoaderCircle size={15} className="animate-spin" /> : <LuX size={15} />}
              Reject
            </button>
          </div>
        </div>
        {error && !showReject && (
          <div className="mt-4 rounded-xl color-bg-grey-5 px-4 py-3 text-sm text-red-500">{error}</div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal">
        <div className="w-full max-w-[1600px] mx-auto px-6 pb-8 space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <section className="rounded-2xl color-bg-grey-5 overflow-hidden flex flex-col min-h-[420px] h-[min(62vh,640px)]">
              <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-xs font-bold color-txt-sub uppercase tracking-wide">Linked question</p>
                  <p className="text-sm font-semibold color-txt-main truncate">
                    {questionPreview?.displayName ||
                      form.linkedQuestions[previewIndex]?.name ||
                      form.linkedQuestionName ||
                      "No question linked"}
                  </p>
                  {form.linkedQuestions.length > 1 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {form.linkedQuestions.map((item, index) => (
                        <button
                          key={`${item.id}-${index}`}
                          type="button"
                          onClick={() => setPreviewIndex(index)}
                          className={`max-w-[12rem] truncate rounded-lg px-2 py-1 text-[11px] font-semibold cursor-pointer ${
                            index === previewIndex
                              ? "color-bg-accent color-txt-accent"
                              : "color-bg-grey-10 color-txt-main"
                          }`}
                        >
                          {item.name || item.id || `Part ${index + 1}`}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {previewJumpUrl && (
                  <button
                    type="button"
                    onClick={() => navigate(previewJumpUrl)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold color-txt-accent cursor-pointer shrink-0"
                  >
                    Open in app
                    <LuExternalLink size={13} />
                  </button>
                )}
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto scrollbar-minimal color-bg-grey-10 p-3">
                {questionLoading ? (
                  <div className="h-full flex items-center justify-center gap-2 color-txt-sub">
                    <LuLoaderCircle className="animate-spin" size={18} />
                    Loading question...
                  </div>
                ) : questionPreview?.images.length ? (
                  <ZoomableQuestionImage
                    images={questionPreview.images}
                    roundStack
                    className="w-full"
                  />
                ) : hasLinkedQuestion ? (
                  <div className="h-full flex items-center justify-center px-6 text-center color-txt-sub text-sm">
                    Could not load the question image. Check the linked question fields below.
                  </div>
                ) : (
                  <div className="h-full flex items-center justify-center px-6 text-center color-txt-sub text-sm">
                    This listing is not linked to a Practice Hub question.
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl color-bg-grey-5 overflow-hidden flex flex-col min-h-[420px] h-[min(62vh,640px)]">
              <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-xs font-bold color-txt-sub uppercase tracking-wide">Resource preview</p>
                  <p className="text-sm font-semibold color-txt-main truncate">
                    {form.siteName || form.websiteUrl || "No source yet"}
                  </p>
                </div>
                {form.websiteUrl && (
                  <a
                    href={form.websiteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-semibold color-txt-accent cursor-pointer shrink-0"
                  >
                    Open original
                    <LuExternalLink size={13} />
                  </a>
                )}
              </div>
              <div className="flex-1 min-h-0 color-bg-grey-10">
                {previewResource ? (
                  <DiscoverMediaPreview
                    key={`${form.resourceSource}:${form.websiteUrl}:${form.thumbnailUrl}`}
                    resource={previewResource}
                    variant="hero"
                    className="w-full h-full"
                  />
                ) : (
                  <div className="h-full flex items-center justify-center color-txt-sub text-sm">
                    No preview available
                  </div>
                )}
              </div>
            </section>
          </div>

          <section className="rounded-2xl color-bg-grey-5 p-5 space-y-6">
            <h2 className="text-lg font-bold color-txt-main">Edit listing</h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
              <Field label={`Title (${form.title.length}/${MAX_TITLE})`}>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => patchForm({ title: e.target.value.slice(0, MAX_TITLE) })}
                  className={inputClass}
                />
              </Field>
              <Field label="Site name">
                <input
                  type="text"
                  value={form.siteName}
                  onChange={(e) => patchForm({ siteName: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <div className="lg:col-span-2">
                <Field label={`Description (${form.description.length}/${MAX_DESCRIPTION})`}>
                  <textarea
                    value={form.description}
                    onChange={(e) => patchForm({ description: e.target.value.slice(0, MAX_DESCRIPTION) })}
                    rows={4}
                    className={`${inputClass} resize-none`}
                  />
                </Field>
              </div>
              <Field label="Source URL">
                <input
                  type="url"
                  value={form.websiteUrl}
                  onChange={(e) => patchForm({ websiteUrl: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <Field label="Thumbnail URL">
                <input
                  type="url"
                  value={form.thumbnailUrl}
                  onChange={(e) => patchForm({ thumbnailUrl: e.target.value })}
                  className={inputClass}
                />
              </Field>
              <div className="lg:col-span-2 space-y-2">
                <p className="text-xs font-semibold color-txt-sub uppercase tracking-wide">Publish as</p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={authorHandle}
                    onChange={(e) => setAuthorHandle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        void applyAuthor();
                      }
                    }}
                    placeholder="Username or uid"
                    className={`${inputClass} flex-1 min-w-[16rem]`}
                  />
                  <button
                    type="button"
                    onClick={() => void applyAuthor()}
                    disabled={lookingUpAuthor || !authorHandle.trim()}
                    className="px-4 py-3 rounded-xl color-bg-grey-10 color-txt-main text-sm font-semibold cursor-pointer disabled:opacity-50"
                  >
                    {lookingUpAuthor ? "Looking up…" : "Use this account"}
                  </button>
                </div>
                <p className="text-xs color-txt-sub">
                  This listing will appear as {form.username || "Unknown"}
                  {form.userId ? ` (${form.userId})` : ""}. Save or approve to keep the change.
                </p>
              </div>
              <Field label="Source type">
                <div className="grid grid-cols-3 gap-1 rounded-xl color-bg-grey-10 p-1">
                  {(["website", "pdf", "image"] as ResourceSource[]).map((source) => (
                    <button
                      key={source}
                      type="button"
                      onClick={() => patchForm({ resourceSource: source })}
                      className={`rounded-lg px-3 py-2.5 text-sm font-semibold cursor-pointer ${
                        form.resourceSource === source
                          ? "color-bg color-txt-main"
                          : "color-txt-sub hover:color-txt-main"
                      }`}
                    >
                      {source === "website" ? "Website / video" : source === "image" ? "Image" : "PDF"}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label="Subject">
                <SubjectDropdown
                  id="discover-moderation-subject"
                  value={form.subjectId || null}
                  onChange={(subjectId) => {
                    if (!subjectId) {
                      patchForm({ subjectId: "", subjectLabel: "" });
                      return;
                    }
                    const id = getPracticeSubjectId(subjectId);
                    patchForm({
                      subjectId: id,
                      subjectLabel: getSubjectLabel(id),
                    });
                  }}
                  aria-label="Choose resource subject"
                  variant="list"
                  dropdownAlign="start"
                />
              </Field>
              <div className="space-y-2">
                <p className="text-xs font-semibold color-txt-sub uppercase tracking-wide">Types</p>
                <div className="flex flex-wrap gap-2">
                  {RESOURCE_TYPES.map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => toggleType(type)}
                      className={`px-3 py-1.5 rounded-full text-sm font-semibold cursor-pointer ${
                        form.resourceTypes.includes(type)
                          ? "color-bg-accent color-txt-accent"
                          : "color-bg-grey-10 color-txt-sub"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold color-txt-sub uppercase tracking-wide">Levels</p>
                <div className="flex flex-wrap gap-2">
                  {RESOURCE_LEVELS.map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => toggleLevel(level)}
                      className={`px-3 py-1.5 rounded-full text-sm font-semibold cursor-pointer ${
                        form.levels.includes(level)
                          ? "color-bg-accent color-txt-accent"
                          : "color-bg-grey-10 color-txt-sub"
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              <div className="lg:col-span-2 space-y-2">
                <p className="text-xs font-semibold color-txt-sub uppercase tracking-wide">Topics</p>
                <div className="flex flex-wrap gap-2">
                  {form.topics.map((topic) => (
                    <button
                      key={topic}
                      type="button"
                      onClick={() => patchForm({ topics: form.topics.filter((item) => item !== topic) })}
                      className="px-3 py-1.5 rounded-full text-sm font-semibold color-bg-grey-10 color-txt-main cursor-pointer"
                    >
                      #{topic} ×
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={topicDraft}
                  onChange={(e) => setTopicDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addTopics();
                    }
                  }}
                  onBlur={addTopics}
                  placeholder="Add topic and press Enter"
                  className={inputClass}
                />
              </div>
            </div>
          </section>

          <section className="rounded-2xl color-bg-grey-5 p-5 space-y-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold color-txt-main">Linked questions</h2>
              <button
                type="button"
                onClick={() => {
                  const next = [...form.linkedQuestions, emptyLinkedQuestion()];
                  patchForm(primaryFromLinks(next));
                  setPreviewIndex(next.length - 1);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl color-bg-grey-10 color-txt-main px-3 py-1.5 text-xs font-semibold cursor-pointer"
              >
                <LuPlus size={14} />
                Add question
              </button>
            </div>
            {form.linkedQuestions.length === 0 ? (
              <p className="text-sm color-txt-sub">No Practice Hub questions linked yet.</p>
            ) : (
              <div className="space-y-4">
                {form.linkedQuestions.map((item, index) => (
                  <div key={`${item.id}-${index}`} className="rounded-2xl color-bg-grey-10 p-4 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs font-bold color-txt-sub uppercase tracking-wide">
                        Question {index + 1}
                      </p>
                      <button
                        type="button"
                        onClick={() => {
                          const next = form.linkedQuestions.filter((_, row) => row !== index);
                          patchForm(primaryFromLinks(next));
                          setPreviewIndex((current) => Math.max(0, Math.min(current, next.length - 1)));
                        }}
                        className="text-xs font-semibold color-txt-sub hover:color-txt-main cursor-pointer"
                      >
                        Remove
                      </button>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <Field label="Question name">
                        <input
                          type="text"
                          value={item.name}
                          onChange={(e) => {
                            const next = form.linkedQuestions.map((row, rowIndex) =>
                              rowIndex === index ? { ...row, name: e.target.value } : row
                            );
                            patchForm(primaryFromLinks(next));
                          }}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Question id">
                        <input
                          type="text"
                          value={item.id}
                          onChange={(e) => {
                            const next = form.linkedQuestions.map((row, rowIndex) =>
                              rowIndex === index ? { ...row, id: e.target.value } : row
                            );
                            patchForm(primaryFromLinks(next));
                          }}
                          className={inputClass}
                        />
                      </Field>
                      <div className="lg:col-span-2">
                        <Field label="Practice URL">
                          <input
                            type="text"
                            value={item.practiceUrl ?? ""}
                            onChange={(e) => {
                              const next = form.linkedQuestions.map((row, rowIndex) =>
                                rowIndex === index ? { ...row, practiceUrl: e.target.value } : row
                              );
                              patchForm(primaryFromLinks(next));
                            }}
                            className={inputClass}
                          />
                        </Field>
                      </div>
                      <Field label="Topic">
                        <input
                          type="text"
                          value={item.topic ?? ""}
                          onChange={(e) => {
                            const next = form.linkedQuestions.map((row, rowIndex) =>
                              rowIndex === index ? { ...row, topic: e.target.value } : row
                            );
                            patchForm(primaryFromLinks(next));
                          }}
                          className={inputClass}
                        />
                      </Field>
                      <Field label="Level">
                        <input
                          type="text"
                          value={item.level ?? ""}
                          onChange={(e) => {
                            const next = form.linkedQuestions.map((row, rowIndex) =>
                              rowIndex === index ? { ...row, level: e.target.value } : row
                            );
                            patchForm(primaryFromLinks(next));
                          }}
                          className={inputClass}
                        />
                      </Field>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
      <DiscoverRejectModal
        open={showReject}
        title={form.title ? `Reject “${form.title}”` : "Reject resource"}
        busy={busy === "reject"}
        error={error}
        onClose={() => {
          if (busy !== "reject") setShowReject(false);
        }}
        onConfirm={(reason) => void reject(reason)}
      />
    </div>
  );
}
