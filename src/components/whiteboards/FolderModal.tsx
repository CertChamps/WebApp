import { useMemo, useState } from "react";
import { LuFolder, LuTrash2 } from "react-icons/lu";
import WhiteboardModal from "./WhiteboardModal";
import EmojiPicker from "./EmojiPicker";
import CustomSelect from "../practiceHub/CustomSelect";
import {
  FOLDER_COLOURS,
  isDescendantFolder,
  type WhiteboardFolder,
} from "../../data/whiteboards";
import "../../styles/practiceHub.css";

export type FolderModalResult = {
  name: string;
  colour: string | null;
  emoji: string | null;
  parentId: string | null;
};

type Props = {
  folders: WhiteboardFolder[];
  /** Present in edit mode. */
  initial?: WhiteboardFolder | null;
  defaultParentId?: string | null;
  onSave: (result: FolderModalResult) => Promise<void> | void;
  onDelete?: (folder: WhiteboardFolder) => Promise<void> | void;
  onClose: () => void;
};

export default function FolderModal({
  folders,
  initial = null,
  defaultParentId = null,
  onSave,
  onDelete,
  onClose,
}: Props) {
  const [name, setName] = useState(initial?.name ?? "");
  const [colour, setColour] = useState<string | null>(initial?.colour ?? null);
  const [emoji, setEmoji] = useState<string | null>(initial?.emoji ?? null);
  const [parentId, setParentId] = useState<string | null>(initial?.parentId ?? defaultParentId);
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const parentOptions = useMemo(() => {
    const eligible = folders.filter((f) => {
      if (!initial) return true;
      if (f.id === initial.id) return false;
      return !isDescendantFolder(folders, initial.id, f.id);
    });
    return [
      { value: "", label: "Subject root (no folder)" },
      ...eligible.map((f) => ({ value: f.id, label: `${f.emoji ? `${f.emoji} ` : ""}${f.name}` })),
    ];
  }, [folders, initial]);

  const canSave = name.trim().length > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), colour, emoji, parentId });
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
    <WhiteboardModal
      title={initial ? "Edit folder" : "New folder"}
      onClose={onClose}
      footer={
        confirmingDelete && initial ? (
          <div className="flex flex-col gap-2 rounded-xl color-bg-grey-5 p-3">
            <p className="text-sm color-txt-main font-semibold">Delete “{initial.name}”?</p>
            <p className="text-xs color-txt-sub">
              Pages and folders inside it won't be deleted — they'll move up one level.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                className="flex-1 py-2 rounded-xl text-sm font-semibold color-bg-grey-10 color-txt-main hover:opacity-80 transition-opacity cursor-pointer"
                onClick={() => setConfirmingDelete(false)}
                disabled={saving}
              >
                Keep folder
              </button>
              <button
                type="button"
                className="flex-1 py-2 rounded-xl text-sm font-semibold red-btn cursor-pointer"
                onClick={handleDelete}
                disabled={saving}
              >
                Delete folder
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {initial && onDelete && (
              <button
                type="button"
                className="p-2.5 rounded-xl color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
                onClick={() => setConfirmingDelete(true)}
                aria-label="Delete folder"
                title="Delete folder"
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
              {initial ? "Save changes" : "Create folder"}
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
            fallbackIcon={
              colour ? (
                <span className="block size-4 rounded-full" style={{ backgroundColor: colour }} />
              ) : (
                <LuFolder size={20} className="color-txt-sub" />
              )
            }
            aria-label="Folder icon"
          />
          <div className="flex-1 flex flex-col gap-1">
            <label className="text-xs font-semibold color-txt-sub" htmlFor="wb-folder-name">
              Name
            </label>
            <input
              id="wb-folder-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Calculus"
              className="w-full px-3 py-2 rounded-xl text-sm color-bg-grey-5 color-txt-main placeholder:color-txt-sub outline-none"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold color-txt-sub">Colour</span>
          <div className="flex items-center gap-2">
            {FOLDER_COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                className={`size-7 rounded-full transition-transform cursor-pointer hover:scale-110 ${
                  colour === c ? "ring-2 ring-offset-2 ring-[var(--theme-txt-accent)]" : ""
                }`}
                style={{ backgroundColor: c }}
                onClick={() => setColour(colour === c ? null : c)}
                aria-label={`Colour ${c}`}
                aria-pressed={colour === c}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold color-txt-sub">Parent folder</span>
          <CustomSelect
            options={parentOptions}
            value={parentId ?? ""}
            onChange={(v) => setParentId(v || null)}
            placeholder="Subject root (no folder)"
            aria-label="Parent folder"
          />
        </div>
      </div>
    </WhiteboardModal>
  );
}
