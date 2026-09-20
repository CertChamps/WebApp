import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { deleteObject, ref as storageRef } from "firebase/storage";
import { AnimatePresence, motion } from "framer-motion";
import {
  LuArrowRight,
  LuChevronDown,
  LuFileText,
  LuFolder,
  LuLoaderCircle,
  LuLock,
  LuPencil,
  LuPlus,
  LuSearch,
  LuSparkles,
} from "react-icons/lu";
import SubjectDropdown from "../components/practiceHub/SubjectDropdown";
import PageDetailsModal from "../components/whiteboards/PageDetailsModal";
import FolderModal from "../components/whiteboards/FolderModal";
import WhiteboardModal from "../components/whiteboards/WhiteboardModal";
import SaveQuestionToCanvasModal from "../components/whiteboards/SaveQuestionToCanvasModal";
import { uploadWhiteboardAsset, useWhiteboards } from "../hooks/useWhiteboards";
import { useWhiteboardAIMatch, type AIProposal } from "../hooks/useWhiteboardAIMatch";
import {
  getLastWhiteboardsSubject,
  newAttachmentId,
  setLastWhiteboardsSubject,
  type AttachedQuestion,
  type WhiteboardFolder,
  type WhiteboardPage,
} from "../data/whiteboards";
import { getFavouriteSubjectIds, getSubjectLabel, useSyncedFavouriteSubjectIds } from "../data/practiceHubSubjects";
import { UserContext } from "../context/UserContext";
import { hasAceAccess } from "../lib/contentAccess";
import { storage } from "../../firebase";
import {
  completeIncomingShare,
  getIncomingShare,
  incomingShareDisplayName,
  incomingShareFile,
  subscribeIncomingShare,
  type NativeIncomingShare,
} from "../lib/nativeShareIntake";
import "../styles/practiceHub.css";

const RECENTS_PREVIEW_COUNT = 4;

const AI_SEARCH_STATUS_MESSAGES = [
  "Reading through the question bank…",
  "Matching your request…",
  "Picking the best questions…",
  "Putting a page together…",
];

type AiSearchOverlayPhase = "in" | "out" | "enter";
type AIPageType = "whiteboard" | "document";

const AI_PAGE_TYPES: Array<{
  id: AIPageType;
  label: string;
  Icon: typeof LuPencil;
}> = [
  { id: "whiteboard", label: "Whiteboard", Icon: LuPencil },
  { id: "document", label: "Document", Icon: LuFileText },
];

/** Landing page uses hairlines instead of framed cards to separate items. */
const hairline = "border-grey/15";
const dividedList = "flex w-full flex-col divide-y divide-grey/15";

const actionCardClassName =
  "flex flex-col items-start gap-2 rounded-2xl color-bg-grey-5 px-5 py-4 text-left transition-colors cursor-pointer hover:color-bg-grey-10 disabled:opacity-50 disabled:cursor-default";

const recentRowClassName =
  "flex w-full items-center gap-2.5 px-1 py-2 text-left cursor-pointer transition-colors hover:color-bg-grey-5";

const surfacePanelClassName = `border-b ${hairline} px-1 py-3`;

const secondaryButtonClassName =
  "flex-1 rounded-lg py-2 text-sm font-semibold color-txt-sub hover:color-txt-main transition-colors cursor-pointer";

const fadeUp = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] as const },
};

function editedAgo(ms: number): string {
  const diff = Math.floor((Date.now() - ms) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ms).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function FolderRecentGlyph({ folder }: { folder: WhiteboardFolder }) {
  if (folder.colour && !folder.emoji) {
    return (
      <span
        className="block size-4 rounded-full"
        style={{ backgroundColor: folder.colour }}
        aria-hidden
      />
    );
  }
  if (folder.emoji) return <span aria-hidden>{folder.emoji}</span>;
  return <LuFolder size={16} className="color-txt-accent" />;
}

function PageRecentGlyph({ page, size = 16 }: { page: WhiteboardPage; size?: number }) {
  if (page.emoji) return <span aria-hidden>{page.emoji}</span>;
  if (page.pageType === "document") {
    return <LuFileText size={size} className="color-txt-accent" />;
  }
  return <LuPencil size={size} className="color-txt-accent" />;
}

export default function Whiteboards() {
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const hasAce = hasAceAccess(user);
  const firstName = (user?.username || "").trim().split(/\s+/)[0] || "there";
  const [subject, setSubject] = useState<string | null>(
    () => getLastWhiteboardsSubject() ?? getFavouriteSubjectIds()[0] ?? null
  );
  const favouriteSubjectIds = useSyncedFavouriteSubjectIds();
  const {
    recentItems,
    folders,
    pages,
    loading,
    createPage,
    updateFolder,
    deleteFolder,
  } = useWhiteboards(subject);

  const [showCreatePage, setShowCreatePage] = useState(false);
  const [editingFolder, setEditingFolder] = useState<WhiteboardFolder | null>(null);
  const [showRecentsModal, setShowRecentsModal] = useState(false);
  const [incomingAttachment, setIncomingAttachment] = useState<{
    attachment: AttachedQuestion;
    share: NativeIncomingShare;
  } | null>(null);
  const [incomingShareVersion, setIncomingShareVersion] = useState(0);
  const importingShareIdRef = useRef<string | null>(null);
  const incomingShareSavedRef = useRef(false);

  useEffect(
    () => subscribeIncomingShare(() => setIncomingShareVersion((version) => version + 1)),
    []
  );

  useEffect(() => {
    const share = getIncomingShare("question");
    if (!share || !subject || !user?.uid || incomingAttachment) return;
    if (importingShareIdRef.current === share.id) return;
    importingShareIdRef.current = share.id;
    let cancelled = false;

    void (async () => {
      try {
        if (share.kind === "url") {
          throw new Error("Links can be uploaded to Discover, but questions must be an image or PDF.");
        }
        const file = await incomingShareFile(share);
        const attachmentId = newAttachmentId();
        const uploaded = await uploadWhiteboardAsset(user.uid, attachmentId, "question", file);
        if (cancelled) {
          await deleteObject(storageRef(storage, uploaded.storagePath)).catch(() => undefined);
          if (importingShareIdRef.current === share.id) importingShareIdRef.current = null;
          return;
        }
        const attachment: AttachedQuestion = {
          id: attachmentId,
          source: "custom",
          label: incomingShareDisplayName(share, file),
          custom: {
            questionPath: uploaded.storagePath,
            questionType: uploaded.fileType,
            markingSchemePath: null,
            markingSchemeType: null,
          },
        };
        setIncomingAttachment({ attachment, share });
      } catch (error) {
        console.error("[native share] Question import failed:", error);
        window.alert(error instanceof Error ? error.message : "The shared question could not be imported.");
        await completeIncomingShare(share);
        importingShareIdRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [incomingAttachment, incomingShareVersion, subject, user?.uid]);

  const [aiPrompt, setAiPrompt] = useState("");
  const [aiPageType, setAiPageType] = useState<AIPageType>("whiteboard");
  const [aiTypeMenuOpen, setAiTypeMenuOpen] = useState(false);
  const [aiOverlay, setAiOverlay] = useState<{ text: string; phase: AiSearchOverlayPhase }>({
    text: "",
    phase: "in",
  });
  const aiTypeMenuRef = useRef<HTMLDivElement>(null);
  const { state: aiState, search: aiSearch, dismiss: aiDismiss } = useWhiteboardAIMatch(subject);
  const aiBusy = aiState.status === "searching";
  const selectedAiPageType = AI_PAGE_TYPES.find((option) => option.id === aiPageType) ?? AI_PAGE_TYPES[0];
  const SelectedPageTypeIcon = selectedAiPageType.Icon;

  useEffect(() => {
    setLastWhiteboardsSubject(subject);
    setShowRecentsModal(false);
  }, [subject]);

  useEffect(() => {
    if (subject || favouriteSubjectIds.length === 0) return;
    setSubject(favouriteSubjectIds[0]);
  }, [favouriteSubjectIds, subject]);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      if (aiTypeMenuRef.current && !aiTypeMenuRef.current.contains(e.target as Node)) {
        setAiTypeMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  useEffect(() => {
    if (!aiBusy) return;
    const queryText = aiPrompt.trim();
    let cancelled = false;
    let showQuery = true;
    let messageIndex = 0;
    const timeouts: number[] = [];
    setAiOverlay({ text: queryText, phase: "in" });

    const later = (fn: () => void, ms: number) => {
      const id = window.setTimeout(fn, ms);
      timeouts.push(id);
    };

    const cycle = () => {
      later(() => {
        if (cancelled) return;
        setAiOverlay((current) => ({ ...current, phase: "out" }));
        later(() => {
          if (cancelled) return;
          showQuery = !showQuery;
          const statusMessages =
            aiPageType === "document"
              ? [...AI_SEARCH_STATUS_MESSAGES.slice(0, 3), "Putting a document together…"]
              : AI_SEARCH_STATUS_MESSAGES;
          const nextText = showQuery
            ? queryText
            : statusMessages[messageIndex++ % statusMessages.length];
          setAiOverlay({ text: nextText, phase: "enter" });
          requestAnimationFrame(() => {
            if (cancelled) return;
            requestAnimationFrame(() => {
              if (cancelled) return;
              setAiOverlay({ text: nextText, phase: "in" });
              cycle();
            });
          });
        }, 320);
      }, 1500);
    };

    cycle();
    return () => {
      cancelled = true;
      timeouts.forEach(clearTimeout);
    };
  }, [aiBusy, aiPrompt, aiPageType]);

  const handleSubjectChange = useCallback(
    (subjectId: string | null) => {
      setSubject(subjectId);
      setAiTypeMenuOpen(false);
      aiDismiss();
    },
    [aiDismiss]
  );

  const openPage = useCallback(
    (pageId: string) => navigate(`/whiteboards/page/${pageId}`),
    [navigate]
  );

  const openFolder = useCallback(
    (folder: WhiteboardFolder) => {
      const folderIds = new Set<string>([folder.id]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const item of folders) {
          if (item.parentId && folderIds.has(item.parentId) && !folderIds.has(item.id)) {
            folderIds.add(item.id);
            grew = true;
          }
        }
      }
      const recency = (page: WhiteboardPage) => Math.max(page.lastOpenedAt, page.updatedAt, page.createdAt);
      const inFolder = pages
        .filter((page) => page.folderId != null && folderIds.has(page.folderId))
        .sort((a, b) => recency(b) - recency(a));
      const fallback = [...pages].sort((a, b) => recency(b) - recency(a))[0];
      const target = inFolder[0] ?? fallback;
      if (target) {
        navigate(`/whiteboards/page/${target.id}?folder=${encodeURIComponent(folder.id)}`);
        return;
      }
      setEditingFolder(folder);
    },
    [folders, pages, navigate]
  );

  const createPageFromProposal = useCallback(
    async (proposal: AIProposal, pageType: AIPageType = aiPageType) => {
      if (!subject) return;
      const page = await createPage({
        name: proposal.pageName,
        subject,
        emoji: proposal.emoji,
        attachedQuestions: proposal.attachments,
        pageType,
      });
      openPage(page.id);
    },
    [subject, createPage, openPage, aiPageType]
  );

  const handleAISubmit = useCallback(async () => {
    if (!hasAce) {
      navigate("/user/manage-account?tab=payments");
      return;
    }
    if (!subject || aiBusy || !aiPrompt.trim()) return;
    setAiTypeMenuOpen(false);
    const proposal = await aiSearch(aiPrompt, aiPageType);
    if (proposal) {
      setAiPrompt("");
      await createPageFromProposal(proposal, aiPageType);
    }
  }, [hasAce, navigate, subject, aiBusy, aiPrompt, aiSearch, aiPageType, createPageFromProposal]);

  const handleFindQuestions = useCallback(() => {
    navigate(subject ? `/practice?subject=${encodeURIComponent(subject)}` : "/practice");
  }, [navigate, subject]);

  const previewRecents = useMemo(
    () => recentItems.slice(0, RECENTS_PREVIEW_COUNT),
    [recentItems]
  );

  const actionsDisabled = !subject;

  return (
    <div className="flex h-full w-full flex-1 min-w-0 overflow-y-auto scrollbar-minimal color-bg">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-6 px-6 py-8">
        {/* Welcome + subject */}
        <motion.div className="flex w-full flex-col items-center gap-5" {...fadeUp}>
          <div className="text-center">
            <h1 className="text-2xl font-black tracking-tight color-txt-main sm:text-3xl">
              Welcome back, {firstName}
            </h1>
          </div>
          <div className="relative z-20 w-full max-w-sm">
            <SubjectDropdown
              value={subject}
              onChange={handleSubjectChange}
              id="wb-home-subject"
              aria-label="Whiteboards subject"
            />
          </div>
        </motion.div>

        {/* Action cards — matching, whole card is the tap target */}
        <div className="grid w-full grid-cols-2 gap-3">
          <motion.button
            type="button"
            className={actionCardClassName}
            onClick={() => setShowCreatePage(true)}
            disabled={actionsDisabled}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            whileTap={{ scale: 0.98 }}
          >
            <LuPlus size={20} strokeWidth={2.25} className="color-txt-accent" aria-hidden />
            <span className="text-base font-black color-txt-main">Create Page</span>
            <span className="text-xs leading-snug color-txt-sub">
              Start a new whiteboard page for this subject
            </span>
          </motion.button>

          <motion.button
            type="button"
            className={actionCardClassName}
            onClick={handleFindQuestions}
            disabled={actionsDisabled}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
            whileTap={{ scale: 0.98 }}
          >
            <LuSearch size={20} strokeWidth={2.25} className="color-txt-accent" aria-hidden />
            <span className="text-base font-black color-txt-main">Find Questions</span>
            <span className="text-xs leading-snug color-txt-sub">
              Browse the full question bank in Practice Hub
            </span>
          </motion.button>
        </div>

        {/* AI bar */}
        <motion.div
          className="flex w-full flex-col gap-2"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.14, ease: [0.22, 1, 0.36, 1] }}
        >
          {!hasAce && (
            <button
              type="button"
              onClick={() => navigate("/user/manage-account?tab=payments")}
              className="flex w-full items-center justify-between gap-3 rounded-2xl color-bg-accent px-4 py-3 text-left cursor-pointer"
            >
              <span className="flex items-center gap-3">
                <LuLock size={17} className="color-txt-accent" />
                <span>
                  <span className="block text-sm font-bold color-txt-main">AI question matching is included with ACE</span>
                  <span className="block text-xs color-txt-sub">Blank whiteboards remain free.</span>
                </span>
              </span>
              <LuArrowRight size={17} className="color-txt-accent" />
            </button>
          )}
          <div className="flex w-full items-center gap-2 rounded-full border-2 color-shadow color-bg px-4 py-2">
            <LuSparkles size={18} className="shrink-0 color-txt-accent" aria-hidden />
            <div className="relative min-w-0 flex-1 overflow-hidden">
              <input
                type="search"
                value={aiPrompt}
                onChange={(e) => setAiPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleAISubmit();
                }}
                placeholder={
                  subject
                    ? "Let AI choose a set of questions for you"
                    : "Pick a subject first, then describe the questions you want…"
                }
                className={`min-w-0 w-full bg-transparent py-1.5 text-sm outline-none [&::-webkit-search-cancel-button]:hidden ${
                  aiBusy
                    ? "text-transparent caret-transparent placeholder:text-transparent"
                    : "color-txt-main placeholder:color-txt-sub"
                }`}
                disabled={!hasAce || actionsDisabled || aiBusy}
                aria-label="Find questions with AI"
              />
              {aiBusy && (
                <div
                  className="absolute inset-0 overflow-hidden pointer-events-none flex items-center"
                  aria-live="polite"
                >
                  <span
                    className="block w-full truncate text-sm color-txt-main"
                    style={{
                      transform:
                        aiOverlay.phase === "out"
                          ? "translateY(-110%)"
                          : aiOverlay.phase === "enter"
                            ? "translateY(110%)"
                            : "translateY(0)",
                      opacity: aiOverlay.phase === "in" ? 1 : 0,
                      transition:
                        aiOverlay.phase === "enter"
                          ? "none"
                          : "transform 320ms ease, opacity 320ms ease",
                    }}
                  >
                    {aiOverlay.text}
                  </span>
                </div>
              )}
            </div>
            <div className="relative shrink-0" ref={aiTypeMenuRef}>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs font-bold color-txt-main hover:color-bg-grey-10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
                onClick={() => setAiTypeMenuOpen((open) => !open)}
                disabled={!hasAce || actionsDisabled || aiBusy}
                aria-expanded={aiTypeMenuOpen}
                aria-haspopup="listbox"
                aria-label={`Create as ${selectedAiPageType.label}`}
              >
                <SelectedPageTypeIcon size={14} className="shrink-0 color-txt-accent" />
                <span className="hidden sm:inline">{selectedAiPageType.label}</span>
                <LuChevronDown
                  size={13}
                  className={`color-txt-sub transition-transform duration-200 ${aiTypeMenuOpen ? "rotate-180" : ""}`}
                />
              </button>
              {aiTypeMenuOpen && (
                <div
                  role="listbox"
                  className="absolute right-0 top-full mt-2 z-30 min-w-[10.5rem] rounded-xl color-bg shadow-md border border-color-border p-1.5 flex flex-col gap-1"
                >
                  {AI_PAGE_TYPES.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      role="option"
                      aria-selected={aiPageType === id}
                      className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold cursor-pointer ${
                        aiPageType === id
                          ? "color-bg-accent color-txt-accent"
                          : "color-txt-sub hover:color-txt-main hover:color-bg-grey-5"
                      }`}
                      onClick={() => {
                        setAiPageType(id);
                        setAiTypeMenuOpen(false);
                      }}
                    >
                      <Icon size={15} />
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="shrink-0 rounded-lg p-2 color-txt-accent hover:color-bg-grey-10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
              onClick={handleAISubmit}
              disabled={!hasAce || actionsDisabled || aiBusy || !aiPrompt.trim()}
              aria-label="Search questions"
            >
              {aiBusy ? (
                <LuLoaderCircle size={18} className="animate-spin" />
              ) : (
                <LuArrowRight size={18} />
              )}
            </button>
          </div>

          <AnimatePresence mode="wait">
            {aiState.status === "message" && (
              <motion.div
                key="ai-message"
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className={`flex items-start justify-between gap-3 ${surfacePanelClassName}`}
              >
                <p className="text-sm color-txt-main">{aiState.message}</p>
                <button
                  type="button"
                  className="shrink-0 text-xs font-semibold color-txt-sub hover:color-txt-main transition-colors cursor-pointer"
                  onClick={aiDismiss}
                >
                  Dismiss
                </button>
              </motion.div>
            )}

            {aiState.status === "low_confidence" && (
              <motion.div
                key="ai-low"
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className={`flex flex-col gap-2 ${surfacePanelClassName}`}
              >
                <p className="text-sm color-txt-main">{aiState.message}</p>
                <div className="flex flex-col gap-1">
                  {aiState.proposal.attachments.slice(0, 6).map((attachment) => (
                    <span key={attachment.id} className="truncate text-xs color-txt-sub">
                      • {attachment.label}
                    </span>
                  ))}
                  {aiState.proposal.attachments.length > 6 && (
                    <span className="text-xs color-txt-sub">
                      …and {aiState.proposal.attachments.length - 6} more
                    </span>
                  )}
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    className={secondaryButtonClassName}
                    onClick={aiDismiss}
                  >
                    Not quite
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-lg py-2 text-sm font-semibold color-bg-accent color-txt-accent hover:opacity-90 transition-opacity cursor-pointer"
                    onClick={() => {
                      const proposal = aiState.proposal;
                      aiDismiss();
                      setAiPrompt("");
                      void createPageFromProposal(proposal, aiPageType);
                    }}
                  >
                    Create {aiPageType === "document" ? "document" : "whiteboard"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Recents — one full-width row per item */}
        <motion.div
          className="flex min-h-0 w-full flex-1 flex-col gap-1.5"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className={`flex items-center justify-between border-b ${hairline} pb-1`}>
            <h2 className="text-lg font-black color-txt-main">
              {subject ? `Recent ${getSubjectLabel(subject)} Pages` : "Recent Pages"}
            </h2>
            {subject && !loading && recentItems.length > RECENTS_PREVIEW_COUNT && (
              <button
                type="button"
                className="inline-flex items-center gap-1 py-1 text-xs font-bold color-txt-accent hover:opacity-80 transition-opacity cursor-pointer"
                onClick={() => setShowRecentsModal(true)}
              >
                View all
                <LuArrowRight size={13} />
              </button>
            )}
          </div>

          {!subject ? (
            <p className={`text-sm color-txt-sub ${surfacePanelClassName}`}>
              Choose a subject to see your recent pages and folders.
            </p>
          ) : loading ? (
            <div className={dividedList}>
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 w-full">
                  <div className="mt-3 h-4 w-2/3 animate-pulse rounded color-bg-grey-5" />
                </div>
              ))}
            </div>
          ) : recentItems.length === 0 ? (
            <p className="px-1 py-3 text-sm color-txt-sub">
              No Results
            </p>
          ) : (
            <div className={dividedList}>
              {previewRecents.map((item) =>
                item.type === "page" ? (
                  <button
                    key={`page-${item.page.id}`}
                    type="button"
                    className={recentRowClassName}
                    onClick={() => openPage(item.page.id)}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center text-base leading-none color-txt-accent">
                      <PageRecentGlyph page={item.page} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold color-txt-main">
                      {item.page.name}
                    </span>
                    <span className="shrink-0 text-xs color-txt-sub">{editedAgo(item.timestamp)}</span>
                  </button>
                ) : (
                  <button
                    key={`folder-${item.folder.id}`}
                    type="button"
                    className={recentRowClassName}
                    onClick={() => openFolder(item.folder)}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center text-base leading-none color-txt-accent">
                      <FolderRecentGlyph folder={item.folder} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold color-txt-main">
                      {item.folder.name}
                    </span>
                    <span className="shrink-0 text-xs color-txt-sub">{editedAgo(item.timestamp)}</span>
                  </button>
                )
              )}
            </div>
          )}
        </motion.div>
      </div>

      {showRecentsModal && (
        <WhiteboardModal title="Recents" onClose={() => setShowRecentsModal(false)}>
          <div className={`${dividedList} max-h-[min(28rem,70dvh)] overflow-y-auto scrollbar-minimal`}>
            {recentItems.map((item) =>
              item.type === "page" ? (
                <button
                  key={`modal-page-${item.page.id}`}
                  type="button"
                  className={recentRowClassName}
                  onClick={() => {
                    setShowRecentsModal(false);
                    openPage(item.page.id);
                  }}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center text-base leading-none color-txt-accent">
                    <PageRecentGlyph page={item.page} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.page.name}</span>
                  <span className="shrink-0 text-xs color-txt-sub">{editedAgo(item.timestamp)}</span>
                </button>
              ) : (
                <button
                  key={`modal-folder-${item.folder.id}`}
                  type="button"
                  className={recentRowClassName}
                  onClick={() => {
                    setShowRecentsModal(false);
                    openFolder(item.folder);
                  }}
                >
                  <span className="flex size-8 shrink-0 items-center justify-center text-base leading-none color-txt-accent">
                    <FolderRecentGlyph folder={item.folder} />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.folder.name}</span>
                  <span className="shrink-0 text-xs color-txt-sub">{editedAgo(item.timestamp)}</span>
                </button>
              )
            )}
          </div>
        </WhiteboardModal>
      )}

      {incomingAttachment && subject && (
        <SaveQuestionToCanvasModal
          subject={subject}
          attachment={incomingAttachment.attachment}
          onSaved={() => {
            incomingShareSavedRef.current = true;
            void completeIncomingShare(incomingAttachment.share);
            importingShareIdRef.current = null;
            setIncomingAttachment(null);
          }}
          onClose={() => {
            if (incomingShareSavedRef.current) {
              incomingShareSavedRef.current = false;
              return;
            }
            const current = incomingAttachment;
            setIncomingAttachment(null);
            importingShareIdRef.current = null;
            const path = current.attachment.custom?.questionPath;
            if (path) void deleteObject(storageRef(storage, path)).catch(() => undefined);
            void completeIncomingShare(current.share);
          }}
        />
      )}

      {showCreatePage && subject && (
        <PageDetailsModal
          subject={subject}
          onSave={async (result) => {
            const page = await createPage({ ...result, subject });
            openPage(page.id);
          }}
          onClose={() => setShowCreatePage(false)}
        />
      )}

      {editingFolder && (
        <FolderModal
          initial={editingFolder}
          onSave={(result) => updateFolder(editingFolder.id, result)}
          onDelete={(folder) => deleteFolder(folder)}
          onClose={() => setEditingFolder(null)}
        />
      )}
    </div>
  );
}
