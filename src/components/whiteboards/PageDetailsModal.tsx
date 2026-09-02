import { useState } from "react";
import { LuFileText, LuLayoutPanelTop, LuPlus, LuTrash2, LuX } from "react-icons/lu";
import WhiteboardModal from "./WhiteboardModal";
import EmojiPicker from "./EmojiPicker";
import AddQuestionModal from "./AddQuestionModal";
import type { AttachedQuestion, WhiteboardPage } from "../../data/whiteboards";
import "../../styles/practiceHub.css";

function untitledPageName(pageType: "whiteboard" | "document"): string {
  return pageType === "document" ? "Untitled document" : "Untitled whiteboard";
}

export type PageDetailsResult = {
  name: string;
  folderId: string | null;
  emoji: string | null;
  pageType: "whiteboard" | "document";
  attachedQuestions: AttachedQuestion[];
};

type Props = {
  /** UI subject slug for the page (scopes the question bank). */
  subject: string;
  /** Present when editing an existing page. */
  initial?: WhiteboardPage | null;
  /** Optional folder to place a new page in (e.g. created from a folder context). */
  defaultFolderId?: string | null;
  onSave: (result: PageDetailsResult) => Promise<void> | void;
  onDelete?: (page: WhiteboardPage) => Promise<void> | void;
  onClose: () => void;
};

export default function PageDetailsModal({
  subject,
  initial = null,
  defaultFolderId = null,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const isEdit = initial != null;
  const [name, setName] = useState(initial?.name ?? "");
  const [emoji, setEmoji] = useState<string | null>(initial?.emoji ?? null);
  const [attachedQuestions, setAttachedQuestions] = useState<AttachedQuestion[]>(
    initial?.attachedQuestions ?? []
  );
  const [pageType, setPageType] = useState<"whiteboard" | "document">(
    initial?.pageType ?? "whiteboard"
  );
  const [saving, setSaving] = useState(false);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  /** Preserve existing folder on edit; use default when creating from a folder context. */
  const folderId = initial?.folderId ?? defaultFolderId ?? null;

  const canSave = !saving && (isEdit ? name.trim().length > 0 : true);

  const buildResult = (): PageDetailsResult => ({
    name: name.trim() || untitledPageName(pageType),
    folderId,
    emoji,
    attachedQuestions,
    pageType,
  });

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave(buildResult());
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!initial || !onDelete) return;
    setSaving(true);
    try {
      await onDelete(initial);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <WhiteboardModal
        title={isEdit ? "Page details" : "Create page"}
        onClose={onClose}
        footer={
          confirmingDelete && initial ? (
            <div className="flex flex-col gap-2 rounded-lg color-bg-grey-5 p-3">
              <p className="text-sm color-txt-main font-semibold">Delete “{initial.name}”?</p>
              <p className="text-xs color-txt-sub">
                The page and all of its saved content will be permanently deleted.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  className="flex-1 py-2 rounded-lg text-sm font-semibold color-bg-grey-10 color-txt-main hover:opacity-80 transition-opacity cursor-pointer"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={saving}
                >
                  Keep page
                </button>
                <button
                  type="button"
                  className="flex-1 py-2 rounded-lg text-sm font-semibold red-btn cursor-pointer"
                  onClick={handleDelete}
                  disabled={saving}
                >
                  Delete page
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {isEdit && onDelete && (
                <button
                  type="button"
                  className="p-2.5 rounded-lg color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
                  onClick={() => setConfirmingDelete(true)}
                  aria-label="Delete page"
                  title="Delete page"
                >
                  <LuTrash2 size={18} />
                </button>
              )}
              <button
                type="button"
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold color-bg-grey-5 color-txt-main hover:color-bg-grey-10 transition-colors cursor-pointer"
                onClick={onClose}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold color-bg-accent color-txt-accent hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-default"
                onClick={handleSave}
                disabled={!canSave}
              >
                {isEdit ? "Save changes" : "Create page"}
              </button>
            </div>
          )
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-end gap-3">
            <EmojiPicker
              value={emoji}
              onChange={setEmoji}
              fallbackIcon={<LuFileText size={20} className="color-txt-sub" />}
              aria-label="Page icon"
            />
            <div className="flex-1 flex flex-col gap-1">
              <label className="text-xs font-semibold color-txt-sub" htmlFor="wb-page-name">
                Page name
              </label>
              <input
                id="wb-page-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={untitledPageName(pageType)}
                className="w-full px-3 py-2 rounded-lg text-sm color-bg-grey-5 color-txt-main placeholder:color-txt-sub outline-none"
                autoFocus={!isEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
              />
            </div>
          </div>

          {!isEdit && (
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold color-txt-sub">Page type</span>
              <div className="grid grid-cols-2 gap-2">
                {([
                  { id: "whiteboard" as const, label: "Whiteboard", Icon: LuLayoutPanelTop, detail: "Freeform canvas" },
                  { id: "document" as const, label: "Document", Icon: LuFileText, detail: "Word-style page" },
                ]).map(({ id, label, Icon, detail }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setPageType(id)}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-left transition-colors cursor-pointer ${
                      pageType === id ? "color-bg-accent color-txt-accent" : "color-bg-grey-5 color-txt-main hover:color-bg-grey-10"
                    }`}
                    aria-pressed={pageType === id}
                  >
                    <Icon size={17} />
                    <span className="flex flex-col">
                      <span className="text-sm font-semibold">{label}</span>
                      <span className="text-[11px] opacity-75">{detail}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold color-txt-sub">Attached questions</span>
              <button
                type="button"
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold color-txt-accent hover:color-bg-grey-5 transition-colors cursor-pointer"
                onClick={() => setShowAddQuestion(true)}
              >
                <LuPlus size={13} strokeWidth={2.5} />
                Add question
              </button>
            </div>

            {attachedQuestions.length === 0 ? (
              <p className="rounded-lg color-bg-grey-5 px-3 py-3 text-sm color-txt-sub">
                No questions attached.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {attachedQuestions.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-2 rounded-lg color-bg-grey-5 px-3 py-2 text-sm color-txt-main"
                  >
                    {attachment.source === "custom" && (
                      <span className="shrink-0 rounded-md color-bg-grey-10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide color-txt-sub">
                        Custom
                      </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{attachment.label}</span>
                    <button
                      type="button"
                      className="shrink-0 rounded-md p-1 color-txt-sub hover:color-bg-grey-10 transition-colors cursor-pointer"
                      onClick={() =>
                        setAttachedQuestions((prev) => prev.filter((a) => a.id !== attachment.id))
                      }
                      aria-label={`Remove ${attachment.label}`}
                    >
                      <LuX size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </WhiteboardModal>

      {showAddQuestion && (
        <AddQuestionModal
          subject={subject}
          onAdd={(attachments) => setAttachedQuestions((prev) => [...prev, ...attachments])}
          onClose={() => setShowAddQuestion(false)}
        />
      )}
    </>
  );
}
