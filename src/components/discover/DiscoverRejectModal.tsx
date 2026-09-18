import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { LuLoaderCircle, LuX } from "react-icons/lu";
import { getThemedPortalTarget } from "../../utils/themedPortal";

type Props = {
  open: boolean;
  title?: string;
  busy?: boolean;
  error?: string | null;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
};

const MAX_REASON = 200;

export default function DiscoverRejectModal({
  open,
  title = "Reject resource",
  busy = false,
  error = null,
  onClose,
  onConfirm,
}: Props) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) return;
    setReason("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const trimmed = reason.trim();

  return createPortal(
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-4"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden />
      <div
        className="relative z-10 w-full max-w-md color-bg rounded-2xl p-5"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold color-txt-main">{title}</h2>
            <p className="text-sm color-txt-sub mt-1">
              This listing will be deleted. The reason is sent to the person who shared it.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-1.5 rounded-lg color-txt-sub hover:color-bg-grey-5 cursor-pointer disabled:opacity-50"
            aria-label="Close"
          >
            <LuX size={18} />
          </button>
        </div>

        <label className="block space-y-2">
          <span className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
            Reason
          </span>
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value.slice(0, MAX_REASON))}
            placeholder="Why is this being rejected?"
            rows={4}
            autoFocus
            className="w-full rounded-xl color-bg-grey-5 color-txt-main px-4 py-3 text-sm outline-none resize-none placeholder:color-txt-sub"
          />
          <span className="block text-[11px] color-txt-sub text-right">
            {reason.length}/{MAX_REASON}
          </span>
        </label>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 rounded-xl color-bg-grey-5 color-txt-main text-sm font-semibold cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void onConfirm(trimmed)}
            disabled={busy || !trimmed}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl color-bg-accent color-txt-accent text-sm font-semibold cursor-pointer disabled:opacity-50"
          >
            {busy ? <LuLoaderCircle size={15} className="animate-spin" /> : <LuX size={15} />}
            Reject
          </button>
        </div>
      </div>
    </div>,
    getThemedPortalTarget()
  );
}
