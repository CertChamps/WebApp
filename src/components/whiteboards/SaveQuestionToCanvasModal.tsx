import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  LuCheck,
  LuFileText,
  LuLoaderCircle,
  LuPlus,
  LuSearch,
} from "react-icons/lu";
import WhiteboardModal from "./WhiteboardModal";
import { useWhiteboards } from "../../hooks/useWhiteboards";
import type { AttachedQuestion, WhiteboardPage } from "../../data/whiteboards";

type Props = {
  subject: string;
  attachment: AttachedQuestion;
  onClose: () => void;
};

type DestinationMode = "existing" | "new";

function attachmentIdentity(attachment: AttachedQuestion): string {
  if (attachment.source === "bank" && attachment.bank) {
    const bank = attachment.bank;
    return bank.kind === "paper"
      ? ["paper", bank.subject, bank.level, bank.paperId, bank.questionId].join(":")
      : ["image", bank.subject, bank.level, bank.topic, bank.groupKey].join(":");
  }
  return `custom:${attachment.id}`;
}

function findExistingAttachment(
  page: WhiteboardPage,
  attachment: AttachedQuestion
): AttachedQuestion | undefined {
  const identity = attachmentIdentity(attachment);
  return page.attachedQuestions.find((item) => attachmentIdentity(item) === identity);
}

export default function SaveQuestionToCanvasModal({
  subject,
  attachment,
  onClose,
}: Props) {
  const navigate = useNavigate();
  const { pages, loading, createPage, updatePage } = useWhiteboards(subject);
  const [mode, setMode] = useState<DestinationMode>("existing");
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null);
  const [newPageName, setNewPageName] = useState(attachment.label);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visiblePages = useMemo(() => {
    const query = search.trim().toLowerCase();
    return [...pages]
      .sort(
        (a, b) =>
          Math.max(b.lastOpenedAt, b.updatedAt, b.createdAt) -
          Math.max(a.lastOpenedAt, a.updatedAt, a.createdAt)
      )
      .filter((page) => !query || page.name.toLowerCase().includes(query));
  }, [pages, search]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);

    try {
      if (mode === "existing") {
        const target = pages.find((page) => page.id === selectedPageId);
        if (!target) {
          setError("Choose a canvas first.");
          return;
        }

        const existing = findExistingAttachment(target, attachment);
        const attachmentId = existing?.id ?? attachment.id;
        if (!existing) {
          await updatePage(target.id, {
            attachedQuestions: [...target.attachedQuestions, attachment],
          });
        }
        onClose();
        navigate(`/whiteboards/page/${target.id}?q=${encodeURIComponent(attachmentId)}`);
        return;
      }

      const created = await createPage({
        name: newPageName.trim() || attachment.label,
        subject,
        attachedQuestions: [attachment],
      });
      onClose();
      navigate(`/whiteboards/page/${created.id}?q=${encodeURIComponent(attachment.id)}`);
    } catch (saveError) {
      console.error("[SaveQuestionToCanvasModal] save failed:", saveError);
      setError("Couldn’t add this question. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const canSave =
    !saving &&
    (mode === "existing" ? selectedPageId != null : newPageName.trim().length > 0);

  return (
    <WhiteboardModal
      title="Add question to canvas"
      onClose={onClose}
      maxWidthClass="max-w-lg"
      footer={
        <div className="flex flex-col gap-2">
          {error && <p className="text-center text-sm color-txt-sub">{error}</p>}
          <button
            type="button"
            className="flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold color-bg-accent color-txt-accent transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-50"
            disabled={!canSave}
            onClick={() => void save()}
          >
            {saving && <LuLoaderCircle size={16} className="animate-spin" />}
            {saving
              ? "Adding question…"
              : mode === "existing"
                ? "Add and open canvas"
                : "Create and open canvas"}
          </button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-xl color-bg-grey-5 px-3 py-2.5">
          <LuFileText size={18} className="shrink-0 color-txt-sub" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold color-txt-main">{attachment.label}</p>
            <p className="text-xs color-txt-sub">This question will stay linked to the question bank.</p>
          </div>
        </div>

        <div className="flex gap-1 rounded-xl color-bg-grey-5 p-1">
          <button
            type="button"
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              mode === "existing" ? "color-bg color-txt-main" : "color-txt-sub hover:color-txt-main"
            }`}
            onClick={() => {
              setMode("existing");
              setError(null);
            }}
          >
            <LuCheck size={15} />
            Existing canvas
          </button>
          <button
            type="button"
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
              mode === "new" ? "color-bg color-txt-main" : "color-txt-sub hover:color-txt-main"
            }`}
            onClick={() => {
              setMode("new");
              setError(null);
            }}
          >
            <LuPlus size={15} />
            New canvas
          </button>
        </div>

        {mode === "existing" ? (
          <>
            <div className="relative">
              <LuSearch className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 color-txt-sub" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search your canvases…"
                className="w-full rounded-xl color-bg-grey-5 py-2 pl-9 pr-3 text-sm color-txt-main outline-none placeholder:color-txt-sub"
                autoComplete="off"
              />
            </div>

            <div className="flex max-h-64 flex-col gap-1 overflow-y-auto scrollbar-minimal">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-8 text-sm color-txt-sub">
                  <LuLoaderCircle size={16} className="animate-spin" />
                  Loading canvases…
                </div>
              ) : visiblePages.length === 0 ? (
                <div className="py-8 text-center">
                  <p className="text-sm font-semibold color-txt-main">
                    {pages.length === 0 ? "No canvases for this subject yet" : "No canvases match"}
                  </p>
                  <button
                    type="button"
                    className="mt-2 text-sm font-semibold color-txt-accent"
                    onClick={() => setMode("new")}
                  >
                    Create a new canvas
                  </button>
                </div>
              ) : (
                visiblePages.map((page) => {
                  const selected = selectedPageId === page.id;
                  const alreadyAdded = Boolean(findExistingAttachment(page, attachment));
                  return (
                    <button
                      key={page.id}
                      type="button"
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                        selected
                          ? "color-bg-accent color-txt-accent"
                          : "color-bg-grey-5 color-txt-main hover:color-bg-grey-10"
                      }`}
                      onClick={() => {
                        setSelectedPageId(page.id);
                        setError(null);
                      }}
                    >
                      <span className="text-base" aria-hidden>{page.emoji ?? "📄"}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{page.name}</span>
                        <span className={`block text-xs ${selected ? "opacity-75" : "color-txt-sub"}`}>
                          {alreadyAdded
                            ? "Question already added"
                            : `${page.attachedQuestions.length} question${page.attachedQuestions.length === 1 ? "" : "s"}`}
                        </span>
                      </span>
                      {selected && <LuCheck size={17} className="shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </>
        ) : (
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-semibold color-txt-main">Canvas name</span>
            <input
              type="text"
              value={newPageName}
              onChange={(event) => setNewPageName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canSave) void save();
              }}
              placeholder="Untitled canvas"
              className="w-full rounded-xl color-bg-grey-5 px-3 py-2.5 text-sm color-txt-main outline-none placeholder:color-txt-sub"
              autoFocus
            />
            <span className="text-xs color-txt-sub">
              A new canvas will be created for this subject with the question attached.
            </span>
          </label>
        )}
      </div>
    </WhiteboardModal>
  );
}
