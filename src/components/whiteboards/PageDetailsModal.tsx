import { useMemo, useState } from "react";
import { LuFileText, LuPlus, LuTrash2, LuX, LuZap } from "react-icons/lu";
import WhiteboardModal from "./WhiteboardModal";
import EmojiPicker from "./EmojiPicker";
import FolderModal, { type FolderModalResult } from "./FolderModal";
import AddQuestionModal from "./AddQuestionModal";
import CustomSelect from "../practiceHub/CustomSelect";
import type { AttachedQuestion, WhiteboardFolder, WhiteboardPage } from "../../data/whiteboards";
import "../../styles/practiceHub.css";

export type PageDetailsResult = {
  name: string;
  folderId: string | null;
  emoji: string | null;
  attachedQuestions: AttachedQuestion[];
};

type Props = {
  /** UI subject slug for the page (scopes the folder picker + question bank). */
  subject: string;
  folders: WhiteboardFolder[];
  /** Present when editing an existing page. */
  initial?: WhiteboardPage | null;
  defaultFolderId?: string | null;
  onSave: (result: PageDetailsResult) => Promise<void> | void;
  /** Create-mode only: skip straight to the canvas with defaults. */
  onBlankCanvas?: (result: PageDetailsResult) => Promise<void> | void;
  onDelete?: (page: WhiteboardPage) => Promise<void> | void;
  /** Creates a folder (from the inline "New folder" option) and returns it so it can be selected. */
  onCreateFolder: (input: FolderModalResult) => Promise<WhiteboardFolder>;
  onClose: () => void;
};

const NEW_FOLDER_VALUE = "__new_folder__";

export default function PageDetailsModal({
  subject,
  folders,
  initial = null,
  defaultFolderId = null,
  onSave,
  onBlankCanvas,
  onDelete,
  onCreateFolder,
  onClose,
}: Props) {
  const isEdit = initial != null;
  const [name, setName] = useState(initial?.name ?? "");
  const [folderId, setFolderId] = useState<string | null>(initial?.folderId ?? defaultFolderId);
  const [emoji, setEmoji] = useState<string | null>(initial?.emoji ?? null);
  const [attachedQuestions, setAttachedQuestions] = useState<AttachedQuestion[]>(
    initial?.attachedQuestions ?? []
  );
  const [saving, setSaving] = useState(false);
  const [showFolderModal, setShowFolderModal] = useState(false);
  const [showAddQuestion, setShowAddQuestion] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const folderOptions = useMemo(
    () => [
      { value: "", label: "Subject root (no folder)" },
      ...folders.map((f) => ({ value: f.id, label: `${f.emoji ? `${f.emoji} ` : ""}${f.name}` })),
      { value: NEW_FOLDER_VALUE, label: "+ New folder…" },
    ],
    [folders]
  );

  const canSave = name.trim().length > 0 && !saving;

  const buildResult = (): PageDetailsResult => ({
    name: name.trim(),
    folderId,
    emoji,
    attachedQuestions,
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

  const handleBlankCanvas = async () => {
    if (!onBlankCanvas || saving) return;
    setSaving(true);
    try {
      await onBlankCanvas({ ...buildResult(), name: name.trim() || "Untitled page" });
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
            <div className="flex flex-col gap-2 rounded-xl color-bg-grey-5 p-3">
              <p className="text-sm color-txt-main font-semibold">Delete “{initial.name}”?</p>
              <p className="text-xs color-txt-sub">
                The page and its whiteboard drawing will be permanently deleted.
              </p>
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  className="flex-1 py-2 rounded-xl text-sm font-semibold color-bg-grey-10 color-txt-main hover:opacity-80 transition-opacity cursor-pointer"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={saving}
                >
                  Keep page
                </button>
                <button
                  type="button"
                  className="flex-1 py-2 rounded-xl text-sm font-semibold red-btn cursor-pointer"
                  onClick={handleDelete}
                  disabled={saving}
                >
                  Delete page
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                {isEdit && onDelete && (
                  <button
                    type="button"
                    className="p-2.5 rounded-xl color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
                    onClick={() => setConfirmingDelete(true)}
                    aria-label="Delete page"
                    title="Delete page"
                  >
                    <LuTrash2 size={18} />
                  </button>
                )}
                <button
                  type="button"
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold color-bg-grey-5 color-txt-main hover:color-bg-grey-10 transition-colors cursor-pointer"
                  onClick={onClose}
                  disabled={saving}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="flex-1 py-2.5 rounded-xl text-sm font-semibold color-bg-accent color-txt-accent hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-default"
                  onClick={handleSave}
                  disabled={!canSave}
                >
                  {isEdit ? "Save changes" : "Create page"}
                </button>
              </div>
              {!isEdit && onBlankCanvas && (
                <button
                  type="button"
                  className="flex items-center justify-center gap-1.5 py-2 rounded-xl text-sm font-semibold color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
                  onClick={handleBlankCanvas}
                  disabled={saving}
                >
                  <LuZap size={15} />
                  Just give me a blank canvas
                </button>
              )}
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
                placeholder="e.g. Differentiation practice"
                className="w-full px-3 py-2 rounded-xl text-sm color-bg-grey-5 color-txt-main placeholder:color-txt-sub outline-none"
                autoFocus={!isEdit}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                }}
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <span className="text-xs font-semibold color-txt-sub">Folder</span>
            <CustomSelect
              options={folderOptions}
              value={folderId ?? ""}
              onChange={(v) => {
                if (v === NEW_FOLDER_VALUE) {
                  setShowFolderModal(true);
                  return;
                }
                setFolderId(v || null);
              }}
              placeholder="Subject root (no folder)"
              aria-label="Folder"
            />
          </div>

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
              <p className="rounded-xl color-bg-grey-5 px-3 py-3 text-sm color-txt-sub">
                No questions attached yet — you can add some now or later from the page itself.
              </p>
            ) : (
              <div className="flex flex-col gap-1">
                {attachedQuestions.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="flex items-center gap-2 rounded-xl color-bg-grey-5 px-3 py-2 text-sm color-txt-main"
                  >
                    <span className="shrink-0 rounded-md color-bg-grey-10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide color-txt-sub">
                      {attachment.source === "bank" ? "Bank" : "Yours"}
                    </span>
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

      {showFolderModal && (
        <FolderModal
          folders={folders}
          defaultParentId={null}
          onSave={async (result) => {
            const folder = await onCreateFolder(result);
            setFolderId(folder.id);
          }}
          onClose={() => setShowFolderModal(false)}
        />
      )}

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
