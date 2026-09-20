import { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { deleteObject, ref as storageRef } from "firebase/storage";
import {
  LuArrowLeft,
  LuArrowRight,
  LuCheck,
  LuExternalLink,
  LuLoaderCircle,
  LuSearch,
  LuShieldCheck,
  LuX,
} from "react-icons/lu";
import { db, storage } from "../../firebase";
import { UserContext } from "../context/UserContext";
import { isAdminUid } from "../constants/adminUids";
import { notifyPostOwner } from "../lib/notifications";
import {
  parseDiscoverModerationNote,
  parsePracticeLink,
  timeAgo,
  RESOURCE_LEVELS,
  RESOURCE_TYPES,
  type DiscoverModerationNote,
  type ResourceType,
} from "../lib/discoverModeration";
import {
  ALL_SUBJECTS_OPTION,
  getPracticeSubjectId,
  getSubjectLabel,
  PRACTICE_HUB_SUBJECTS,
} from "../data/practiceHubSubjects";
import DiscoverMediaPreview from "../components/discover/DiscoverMediaPreview";
import DiscoverRejectModal from "../components/discover/DiscoverRejectModal";
import ModerationFiltersModal, {
  type ModerationFiltersValue,
  type ModerationLinkedFilter,
  type ModerationSourceFilter,
} from "../components/discover/ModerationFiltersModal";

const FILTER_LEVELS = [...RESOURCE_LEVELS, "Common", "Unspecified"] as const;
const UNLEVELLED = "Unspecified";

function noteSubjectId(item: DiscoverModerationNote): string {
  const practice = parsePracticeLink(item.linkedQuestionPracticeUrl);
  const linked = item.linkedQuestions[0];
  const raw =
    item.subjectId ||
    item.linkedQuestionSubjectId ||
    linked?.subjectId ||
    practice?.subject ||
    item.subjectLabel ||
    linked?.subjectLabel ||
    "";
  return raw ? getPracticeSubjectId(raw) : "unspecified";
}

function noteMatchesSubject(item: DiscoverModerationNote, selectedIds: string[]): boolean {
  if (selectedIds.length === 0) return true;
  const id = noteSubjectId(item);
  const label = (item.subjectLabel || "").trim().toLowerCase();
  return selectedIds.some((selected) => {
    if (selected === id) return true;
    const selectedLabel = getSubjectLabel(selected).trim().toLowerCase();
    return Boolean(label) && (label === selectedLabel || label === selected.replace(/-/g, " "));
  });
}

function titleCaseLevel(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const lower = trimmed.toLowerCase();
  if (lower === "hl" || lower === "higher") return "Higher";
  if (lower === "ol" || lower === "ordinary") return "Ordinary";
  if (lower === "fl" || lower === "foundation") return "Foundation";
  if (lower === "common") return "Common";
  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
}

function noteLevelLabels(item: DiscoverModerationNote): string[] {
  const practice = parsePracticeLink(item.linkedQuestionPracticeUrl);
  const raw = [
    ...item.levels,
    item.linkedQuestionLevel,
    practice?.level ?? "",
    ...item.linkedQuestions.flatMap((question) => [
      question.level ?? "",
      parsePracticeLink(question.practiceUrl)?.level ?? "",
    ]),
  ];
  const labels = raw.map(titleCaseLevel).filter(Boolean);
  return [...new Set(labels)];
}

function parseCsvParam(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function noteHasLinkedQuestion(item: DiscoverModerationNote): boolean {
  return Boolean(
    item.linkedQuestionId ||
      item.linkedQuestionName ||
      item.linkedQuestionPracticeUrl ||
      item.linkedQuestions.some((question) => question.id || question.name || question.practiceUrl)
  );
}

function parseLinkedParam(value: string | null): ModerationLinkedFilter {
  return value === "linked" || value === "unlinked" ? value : "all";
}

function parseTypesParam(value: string | null): ResourceType[] {
  return parseCsvParam(value).filter((item): item is ResourceType =>
    RESOURCE_TYPES.includes(item as ResourceType)
  );
}

function parseSourcesParam(value: string | null): ModerationSourceFilter[] {
  return parseCsvParam(value).filter(
    (item): item is ModerationSourceFilter => item === "website" || item === "pdf" || item === "image"
  );
}

export default function DiscoverModeration() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { user } = useContext(UserContext);
  const isAdmin = isAdminUid(user?.uid, user?.email);
  const [items, setItems] = useState<DiscoverModerationNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [rejecting, setRejecting] = useState<DiscoverModerationNote | null>(null);
  const filtersButtonRef = useRef<HTMLButtonElement | null>(null);
  const selectedSubjects = parseCsvParam(searchParams.get("subject"));
  const selectedLevels = parseCsvParam(searchParams.get("level"));
  const selectedTypes = parseTypesParam(searchParams.get("type"));
  const selectedSources = parseSourcesParam(searchParams.get("source"));
  const selectedLinked = parseLinkedParam(searchParams.get("linked"));
  const searchQuery = searchParams.get("q") ?? "";
  const filterQuery = searchParams.toString();
  const listSearch = filterQuery ? `?${filterQuery}` : "";
  const filterValue: ModerationFiltersValue = {
    subjects: selectedSubjects,
    levels: selectedLevels,
    types: selectedTypes,
    sources: selectedSources,
    linked: selectedLinked,
  };

  const setSearchQuery = (query: string) => {
    const next = new URLSearchParams(searchParams);
    if (query) next.set("q", query);
    else next.delete("q");
    setSearchParams(next, { replace: true });
  };

  const setFilterValue = (value: ModerationFiltersValue) => {
    const next = new URLSearchParams(searchParams);
    const write = (key: string, values: string[]) => {
      if (values.length > 0) next.set(key, values.join(","));
      else next.delete(key);
    };
    write("subject", value.subjects);
    write("level", value.levels);
    write("type", value.types);
    write("source", value.sources);
    if (value.linked === "all") next.delete("linked");
    else next.set("linked", value.linked);
    setSearchParams(next, { replace: true });
  };

  useEffect(() => {
    if (!isAdmin) return;
    const pendingQuery = query(
      collection(db, "discover-notes"),
      where("moderationStatus", "==", "pending"),
      limit(100)
    );

    const unsub = onSnapshot(
      pendingQuery,
      (snap) => {
        const pendingItems = snap.docs
          .map((entry) => parseDiscoverModerationNote(entry.id, entry.data() as Record<string, unknown>))
          .sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
        setItems(pendingItems);
        setLoading(false);
      },
      (err) => {
        console.error("Discover moderation listener failed:", err);
        setError(err.message ?? "Failed to load pending resources.");
        setLoading(false);
      }
    );

    return () => unsub();
  }, [isAdmin]);

  const subjectOptions = useMemo(() => {
    const byId = new Map<string, string>(
      [...PRACTICE_HUB_SUBJECTS, ALL_SUBJECTS_OPTION].map((subject) => [subject.id, subject.label])
    );
    items.forEach((item) => {
      const id = noteSubjectId(item);
      if (!byId.has(id)) byId.set(id, getSubjectLabel(id) || item.subjectLabel || id);
    });
    selectedSubjects.forEach((id) => {
      if (!byId.has(id)) byId.set(id, getSubjectLabel(id) || id);
    });
    return [...byId.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [items, selectedSubjects]);

  const filteredItems = useMemo(() => {
    const queryText = searchQuery.trim().toLowerCase();
    return items.filter((item) => {
      if (!noteMatchesSubject(item, selectedSubjects)) {
        return false;
      }

      const levels = noteLevelLabels(item);
      const levelLabels = levels.length > 0 ? levels : [UNLEVELLED];
      if (selectedLevels.length > 0 && !levelLabels.some((level) => selectedLevels.includes(level))) {
        return false;
      }

      const types = item.resourceTypes.length > 0 ? item.resourceTypes : [item.resourceType];
      if (selectedTypes.length > 0 && !types.some((type) => selectedTypes.includes(type))) {
        return false;
      }

      if (selectedSources.length > 0 && !selectedSources.includes(item.resourceSource)) {
        return false;
      }

      const linked = noteHasLinkedQuestion(item);
      if (selectedLinked === "linked" && !linked) return false;
      if (selectedLinked === "unlinked" && linked) return false;

      if (queryText) {
        const haystack = [
          item.title,
          item.description,
          item.username,
          item.subjectLabel,
          item.siteName,
          item.pdfFileName,
          item.imageFileName,
          ...types,
          ...levelLabels,
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(queryText)) return false;
      }

      return true;
    });
  }, [
    items,
    searchQuery,
    selectedSubjects,
    selectedLevels,
    selectedTypes,
    selectedSources,
    selectedLinked,
  ]);

  const activeFilterCount =
    selectedSubjects.length +
    selectedLevels.length +
    selectedTypes.length +
    selectedSources.length +
    (selectedLinked === "all" ? 0 : 1);

  const openReview = (item: DiscoverModerationNote) => {
    navigate(`/admin/discover-moderation/${item.id}${listSearch}`);
  };

  const approve = async (item: DiscoverModerationNote) => {
    setBusyId(item.id);
    setError(null);
    try {
      await updateDoc(doc(db, "discover-notes", item.id), {
        moderationStatus: "approved",
        thumbnailModeratedBy: user?.uid ?? "",
        thumbnailModeratedAt: new Date(),
        ...(item.uploadedThumbnailUrl
          ? {
              thumbnailUrl: item.uploadedThumbnailUrl,
              thumbnailStatus: "approved",
            }
          : {}),
      });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not approve resource.");
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (item: DiscoverModerationNote, reason: string) => {
    const why = reason.trim();
    if (!why) {
      setError("Add a reason before rejecting.");
      return;
    }
    setBusyId(item.id);
    setError(null);
    try {
      await deleteDoc(doc(db, "discover-notes", item.id));
      notifyPostOwner({
        ownerId: item.userId,
        actorId: user?.uid,
        type: "post-rejected",
        postId: item.id,
        postTitle: item.title,
        reason: why,
      });
      if (item.uploadedThumbnailPath) {
        try {
          await deleteObject(storageRef(storage, item.uploadedThumbnailPath));
        } catch (deleteErr) {
          console.warn("Failed to delete rejected resource thumbnail:", deleteErr);
        }
      }
      if (item.pdfPath) {
        try {
          await deleteObject(storageRef(storage, item.pdfPath));
        } catch (deleteErr) {
          console.warn("Failed to delete rejected PDF:", deleteErr);
        }
      }
      if (item.imagePath) {
        try {
          await deleteObject(storageRef(storage, item.imagePath));
        } catch (deleteErr) {
          console.warn("Failed to delete rejected image:", deleteErr);
        }
      }
      setRejecting(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not reject resource.");
    } finally {
      setBusyId(null);
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

  return (
    <div className="flex flex-col flex-1 min-w-0 min-h-0 w-full h-full overflow-y-auto color-bg scrollbar-minimal">
      <div className="w-full max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="color-bg-grey-5 p-2.5 rounded-xl hover:color-bg-grey-10 transition-all"
              aria-label="Go back"
            >
              <LuArrowLeft size={22} className="color-txt-accent" />
            </button>
            <div>
              <h1 className="color-txt-main text-2xl font-bold">Discover Moderation</h1>
              <p className="color-txt-sub text-sm">
                Open a pending listing to compare it with the linked question, edit fields, then approve or reject.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative min-w-[12rem] flex-1 max-w-xs">
              <LuSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 color-txt-sub" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search title, author..."
                className="w-full pl-9 pr-3 py-2 rounded-xl color-bg-grey-5 color-txt-main text-sm outline-none placeholder:color-txt-sub"
              />
            </label>
            <button
              ref={filtersButtonRef}
              type="button"
              onClick={() => setShowFilters((open) => !open)}
              className="shrink-0 inline-flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold color-bg-grey-5 color-txt-main cursor-pointer hover:opacity-90"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden
              >
                <line x1="3" y1="8" x2="21" y2="8" />
                <circle cx="8" cy="8" r="2.25" fill="currentColor" />
                <line x1="3" y1="16" x2="21" y2="16" />
                <circle cx="16" cy="16" r="2.25" fill="currentColor" />
              </svg>
              Filters
              {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl color-bg-grey-5 color-txt-sub text-sm font-semibold">
              <LuShieldCheck size={16} />
              {filteredItems.length}
              {filteredItems.length !== items.length ? ` of ${items.length}` : ""} pending
            </div>
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            {selectedSubjects.map((id) => (
              <button
                key={`subject-${id}`}
                type="button"
                onClick={() =>
                  setFilterValue({
                    ...filterValue,
                    subjects: selectedSubjects.filter((item) => item !== id),
                  })
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg color-bg-accent color-txt-accent text-xs font-semibold cursor-pointer"
              >
                {subjectOptions.find((subject) => subject.id === id)?.label ?? getSubjectLabel(id)}
                <LuX size={12} />
              </button>
            ))}
            {selectedLevels.map((level) => (
              <button
                key={`level-${level}`}
                type="button"
                onClick={() =>
                  setFilterValue({
                    ...filterValue,
                    levels: selectedLevels.filter((item) => item !== level),
                  })
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg color-bg-accent color-txt-accent text-xs font-semibold cursor-pointer"
              >
                {level}
                <LuX size={12} />
              </button>
            ))}
            {selectedTypes.map((type) => (
              <button
                key={`type-${type}`}
                type="button"
                onClick={() =>
                  setFilterValue({
                    ...filterValue,
                    types: selectedTypes.filter((item) => item !== type),
                  })
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg color-bg-accent color-txt-accent text-xs font-semibold cursor-pointer"
              >
                {type}
                <LuX size={12} />
              </button>
            ))}
            {selectedSources.map((source) => (
              <button
                key={`source-${source}`}
                type="button"
                onClick={() =>
                  setFilterValue({
                    ...filterValue,
                    sources: selectedSources.filter((item) => item !== source),
                  })
                }
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg color-bg-accent color-txt-accent text-xs font-semibold cursor-pointer"
              >
                {source === "pdf" ? "PDF" : source === "image" ? "Image" : "Website"}
                <LuX size={12} />
              </button>
            ))}
            {selectedLinked !== "all" && (
              <button
                type="button"
                onClick={() => setFilterValue({ ...filterValue, linked: "all" })}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg color-bg-accent color-txt-accent text-xs font-semibold cursor-pointer"
              >
                {selectedLinked === "linked" ? "Has linked question" : "No linked question"}
                <LuX size={12} />
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                setFilterValue({
                  subjects: [],
                  levels: [],
                  types: [],
                  sources: [],
                  linked: "all",
                })
              }
              className="text-xs font-semibold color-txt-sub hover:color-txt-main cursor-pointer"
            >
              Clear filters
            </button>
          </div>
        )}

        {error && !rejecting && (
          <div className="rounded-xl color-bg-grey-5 px-4 py-3 text-sm text-red-500">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center gap-2 color-txt-sub">
            <LuLoaderCircle className="animate-spin" size={18} />
            Loading pending resources...
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-2xl color-bg-grey-5 p-10 text-center color-txt-sub">
            No pending Discover resources.
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="rounded-2xl color-bg-grey-5 p-10 text-center color-txt-sub">
            No pending resources match these filters.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {filteredItems.map((item) => (
              <article
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => openReview(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openReview(item);
                  }
                }}
                className="rounded-2xl color-bg-grey-5 overflow-hidden text-left cursor-pointer hover:color-bg-grey-10 transition-colors"
              >
                <div className="aspect-video color-bg-grey-10 overflow-hidden">
                  <DiscoverMediaPreview
                    resource={{
                      title: item.title,
                      websiteUrl: item.websiteUrl,
                      resourceSource: item.resourceSource,
                      pdfPath: item.pdfPath,
                      imagePath: item.imagePath,
                      thumbnailUrl: item.uploadedThumbnailUrl || item.thumbnailUrl,
                      faviconUrl: item.faviconUrl,
                    }}
                    variant="thumb"
                    className="w-full h-full"
                  />
                </div>

                <div className="p-4 space-y-4">
                  <div>
                    <h2 className="font-bold color-txt-main">{item.title}</h2>
                    <p className="text-sm color-txt-sub line-clamp-2 mt-1">{item.description}</p>
                    <p className="text-xs color-txt-sub mt-2">
                      {item.subjectLabel}
                      {noteLevelLabels(item).length > 0
                        ? ` · ${noteLevelLabels(item).join(", ")}`
                        : " · Unspecified level"}
                      {` · ${(item.resourceTypes.length > 0 ? item.resourceTypes : [item.resourceType]).join(", ")}`}
                      {item.linkedQuestionName
                        ? item.linkedQuestions.length > 1
                          ? ` · ${item.linkedQuestions.length} linked questions`
                          : ` · ${item.linkedQuestionName}`
                        : ""}
                      {` · ${item.resourceSource === "pdf" ? item.pdfFileName || "PDF" : item.resourceSource === "image" ? item.imageFileName || "Image" : item.siteName || "Website"}`}
                      {` · ${item.username}`}
                      {item.timestamp ? ` · ${timeAgo(item.timestamp)}` : ""}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        openReview(item);
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg-accent color-txt-accent text-sm font-semibold hover:opacity-90 cursor-pointer"
                    >
                      Review
                      <LuArrowRight size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void approve(item);
                      }}
                      disabled={busyId === item.id}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg color-txt-main text-sm font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
                    >
                      <LuCheck size={15} />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setRejecting(item);
                        setError(null);
                      }}
                      disabled={busyId === item.id}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg color-txt-main text-sm font-semibold hover:opacity-90 cursor-pointer disabled:opacity-50"
                    >
                      <LuX size={15} />
                      Reject
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        window.open(item.websiteUrl, "_blank", "noopener,noreferrer");
                      }}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg color-txt-main text-sm font-semibold hover:opacity-90 cursor-pointer"
                    >
                      <LuExternalLink size={15} />
                      {item.resourceSource === "pdf"
                        ? "Open PDF"
                        : item.resourceSource === "image"
                          ? "Open image"
                          : "Open link"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <ModerationFiltersModal
        open={showFilters}
        onClose={() => setShowFilters(false)}
        anchorRef={filtersButtonRef}
        subjects={subjectOptions}
        resourceTypes={RESOURCE_TYPES}
        levels={FILTER_LEVELS}
        value={filterValue}
        onChange={setFilterValue}
      />
      <DiscoverRejectModal
        open={rejecting != null}
        title={rejecting ? `Reject “${rejecting.title}”` : "Reject resource"}
        busy={rejecting != null && busyId === rejecting.id}
        error={error}
        onClose={() => {
          if (!busyId) setRejecting(null);
        }}
        onConfirm={(reason) => {
          if (rejecting) void reject(rejecting, reason);
        }}
      />
    </div>
  );
}
