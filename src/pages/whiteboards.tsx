import { useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import {
  LuArrowRight,
  LuFileText,
  LuFolder,
  LuLoaderCircle,
  LuPencil,
  LuSearch,
  LuSparkles,
} from "react-icons/lu";
import SubjectDropdown from "../components/practiceHub/SubjectDropdown";
import PageDetailsModal from "../components/whiteboards/PageDetailsModal";
import FolderModal from "../components/whiteboards/FolderModal";
import { useWhiteboards } from "../hooks/useWhiteboards";
import { useWhiteboardAIMatch, type AIProposal } from "../hooks/useWhiteboardAIMatch";
import {
  getLastWhiteboardsSubject,
  setLastWhiteboardsSubject,
  type WhiteboardFolder,
} from "../data/whiteboards";
import { getFavouriteSubjectIds } from "../data/practiceHubSubjects";
import { UserContext } from "../context/UserContext";
import "../styles/practiceHub.css";

const RECENTS_PREVIEW_COUNT = 8;

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

export default function Whiteboards() {
  const navigate = useNavigate();
  const { user } = useContext(UserContext);
  const firstName = (user?.username || "").trim().split(/\s+/)[0] || "there";

  const [subject, setSubject] = useState<string | null>(
    () => getLastWhiteboardsSubject() ?? getFavouriteSubjectIds()[0] ?? null
  );
  const {
    recentItems,
    loading,
    createPage,
    updateFolder,
    deleteFolder,
  } = useWhiteboards(subject);

  const [showCreatePage, setShowCreatePage] = useState(false);
  const [editingFolder, setEditingFolder] = useState<WhiteboardFolder | null>(null);
  const [showAllRecents, setShowAllRecents] = useState(false);

  const [aiPrompt, setAiPrompt] = useState("");
  const { state: aiState, search: aiSearch, dismiss: aiDismiss } = useWhiteboardAIMatch(subject);
  const aiBusy = aiState.status === "searching";

  useEffect(() => {
    setLastWhiteboardsSubject(subject);
    setShowAllRecents(false);
  }, [subject]);

  const handleSubjectChange = useCallback(
    (subjectId: string | null) => {
      setSubject(subjectId);
      aiDismiss();
    },
    [aiDismiss]
  );

  const openPage = useCallback(
    (pageId: string) => navigate(`/whiteboards/page/${pageId}`),
    [navigate]
  );

  const createPageFromProposal = useCallback(
    async (proposal: AIProposal) => {
      if (!subject) return;
      const page = await createPage({
        name: proposal.pageName,
        subject,
        emoji: proposal.emoji,
        attachedQuestions: proposal.attachments,
      });
      openPage(page.id);
    },
    [subject, createPage, openPage]
  );

  const handleAISubmit = useCallback(async () => {
    if (!subject || aiBusy || !aiPrompt.trim()) return;
    const proposal = await aiSearch(aiPrompt);
    if (proposal) {
      setAiPrompt("");
      await createPageFromProposal(proposal);
    }
  }, [subject, aiBusy, aiPrompt, aiSearch, createPageFromProposal]);

  const handleFindQuestions = useCallback(() => {
    navigate(subject ? `/practice?subject=${encodeURIComponent(subject)}` : "/practice");
  }, [navigate, subject]);

  const visibleRecents = useMemo(
    () => (showAllRecents ? recentItems : recentItems.slice(0, RECENTS_PREVIEW_COUNT)),
    [recentItems, showAllRecents]
  );

  const actionsDisabled = !subject;

  return (
    <div className="flex h-full w-full flex-1 min-w-0 overflow-y-auto scrollbar-minimal color-bg">
      <div className="mx-auto flex w-full max-w-3xl flex-col items-center gap-8 px-6 py-12">
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
        <div className="grid w-full grid-cols-2 gap-4">
          <motion.button
            type="button"
            className="flex flex-col items-start gap-2 rounded-lg color-bg-grey-5 px-5 py-4 text-left transition-colors cursor-pointer hover:color-bg-grey-10 disabled:opacity-50 disabled:cursor-default"
            onClick={() => setShowCreatePage(true)}
            disabled={actionsDisabled}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            whileTap={{ scale: 0.98 }}
          >
            <LuPencil size={20} strokeWidth={2.25} className="color-txt-accent" aria-hidden />
            <span className="text-base font-black color-txt-main">Create Page</span>
            <span className="text-xs leading-snug color-txt-sub">
              Start a new whiteboard page for this subject
            </span>
          </motion.button>

          <motion.button
            type="button"
            className="flex flex-col items-start gap-2 rounded-lg color-bg-grey-5 px-5 py-4 text-left transition-colors cursor-pointer hover:color-bg-grey-10 disabled:opacity-50 disabled:cursor-default"
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
          <div className="flex w-full items-center gap-3 rounded-lg border-2 color-shadow color-bg px-4 py-2.5">
            <LuSparkles size={18} className="shrink-0 color-txt-accent" aria-hidden />
            <input
              type="text"
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAISubmit();
              }}
              placeholder={
                subject
                  ? "Describe the questions you want, e.g. “short differentiation questions”…"
                  : "Pick a subject first, then describe the questions you want…"
              }
              className="min-w-0 flex-1 bg-transparent py-1.5 text-sm color-txt-main placeholder:color-txt-sub outline-none"
              disabled={actionsDisabled || aiBusy}
              aria-label="Find questions with AI"
            />
            <button
              type="button"
              className="shrink-0 rounded-lg p-2 color-txt-accent hover:color-bg-grey-10 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-default"
              onClick={handleAISubmit}
              disabled={actionsDisabled || aiBusy || !aiPrompt.trim()}
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
            {aiBusy && (
              <motion.p
                key="ai-busy"
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="px-2 text-xs color-txt-sub"
              >
                Reading through the {subject ? "question bank" : "questions"} for you…
              </motion.p>
            )}

            {aiState.status === "message" && (
              <motion.div
                key="ai-message"
                initial={{ opacity: 0, y: 6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
                className="flex items-start justify-between gap-3 rounded-lg color-bg-grey-5 px-4 py-3"
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
                className="flex flex-col gap-2 rounded-lg color-bg-grey-5 px-4 py-3"
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
                    className="flex-1 rounded-lg py-2 text-sm font-semibold color-bg-grey-10 color-txt-main hover:opacity-80 transition-opacity cursor-pointer"
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
                      void createPageFromProposal(proposal);
                    }}
                  >
                    Create the page
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Recents — cute horizontal scroll */}
        <motion.div
          className="flex w-full flex-col gap-3"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-black color-txt-main">Recents</h2>
            {recentItems.length > RECENTS_PREVIEW_COUNT && (
              <button
                type="button"
                className="text-xs font-bold color-txt-accent hover:opacity-80 transition-opacity cursor-pointer"
                onClick={() => setShowAllRecents((v) => !v)}
              >
                {showAllRecents ? "Show less" : "See more"}
              </button>
            )}
          </div>

          {!subject ? (
            <p className="rounded-lg color-bg-grey-5 px-4 py-5 text-sm color-txt-sub">
              Choose a subject to see your recent pages and folders.
            </p>
          ) : loading ? (
            <div className="flex gap-3 overflow-hidden">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 w-28 shrink-0 rounded-lg color-bg-grey-5 animate-pulse" />
              ))}
            </div>
          ) : recentItems.length === 0 ? (
            <p className="rounded-lg color-bg-grey-5 px-4 py-5 text-sm color-txt-sub">
              Nothing here yet — create your first page to get going.
            </p>
          ) : showAllRecents ? (
            <div className="flex flex-col gap-1.5">
              {visibleRecents.map((item) =>
                item.type === "page" ? (
                  <button
                    key={`page-${item.page.id}`}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left color-txt-main hover:color-bg-grey-5 transition-colors cursor-pointer"
                    onClick={() => openPage(item.page.id)}
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center text-base leading-none color-txt-accent">
                      {item.page.emoji ?? <LuFileText size={16} />}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{item.page.name}</span>
                    <span className="shrink-0 text-xs color-txt-sub">{editedAgo(item.timestamp)}</span>
                  </button>
                ) : (
                  <button
                    key={`folder-${item.folder.id}`}
                    type="button"
                    className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left color-txt-main hover:color-bg-grey-5 transition-colors cursor-pointer"
                    onClick={() => setEditingFolder(item.folder)}
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
          ) : (
            <div className="-mx-1 flex gap-2.5 overflow-x-auto px-1 pb-1 scrollbar-minimal">
              {visibleRecents.map((item) =>
                item.type === "page" ? (
                  <button
                    key={`page-${item.page.id}`}
                    type="button"
                    className="flex h-28 w-28 shrink-0 flex-col items-start justify-between rounded-lg color-bg-grey-5 p-2.5 text-left transition-colors cursor-pointer hover:color-bg-grey-10"
                    onClick={() => openPage(item.page.id)}
                  >
                    <span className="text-base leading-none color-txt-accent">
                      {item.page.emoji ?? <LuFileText size={18} />}
                    </span>
                    <span className="flex w-full flex-col gap-0.5">
                      <span className="w-full truncate text-xs font-bold color-txt-main">
                        {item.page.name}
                      </span>
                      <span className="text-[10px] color-txt-sub">{editedAgo(item.timestamp)}</span>
                    </span>
                  </button>
                ) : (
                  <button
                    key={`folder-${item.folder.id}`}
                    type="button"
                    className="flex h-28 w-28 shrink-0 flex-col items-start justify-between rounded-lg color-bg-grey-5 p-2.5 text-left transition-colors cursor-pointer hover:color-bg-grey-10"
                    onClick={() => setEditingFolder(item.folder)}
                  >
                    <span className="text-base leading-none color-txt-accent">
                      <FolderRecentGlyph folder={item.folder} />
                    </span>
                    <span className="flex w-full flex-col gap-0.5">
                      <span className="w-full truncate text-xs font-bold color-txt-main">
                        {item.folder.name}
                      </span>
                      <span className="text-[10px] color-txt-sub">{editedAgo(item.timestamp)}</span>
                    </span>
                  </button>
                )
              )}
            </div>
          )}
        </motion.div>
      </div>

      {showCreatePage && subject && (
        <PageDetailsModal
          subject={subject}
          onSave={async (result) => {
            const page = await createPage({ ...result, subject });
            openPage(page.id);
          }}
          onBlankCanvas={async (result) => {
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
