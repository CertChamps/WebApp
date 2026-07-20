import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { LuX } from "react-icons/lu";
import { getThemedPortalTarget } from "../../utils/themedPortal";

type Props = {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Optional footer row (buttons). */
  footer?: React.ReactNode;
  maxWidthClass?: string;
};

const BACKDROP_TRANSITION = { duration: 0.22, ease: [0.22, 1, 0.36, 1] as const };
const PANEL_TRANSITION = { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };

/** Shared modal shell for the Whiteboards tab — soft fade + scale-in. */
export default function WhiteboardModal({
  title,
  onClose,
  children,
  footer,
  maxWidthClass = "max-w-lg",
}: Props) {
  return createPortal(
    <motion.div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={onClose}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={BACKDROP_TRANSITION}
    >
      <motion.div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        aria-hidden
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={BACKDROP_TRANSITION}
      />
      <motion.div
        className={`relative z-10 w-full ${maxWidthClass} color-bg rounded-2xl overflow-hidden flex flex-col max-h-[85vh]`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{ opacity: 0, y: 14, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={PANEL_TRANSITION}
      >
        <div className="px-5 pt-5 pb-3 flex items-center justify-between shrink-0">
          <h2 className="text-lg font-bold color-txt-main">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
            aria-label="Close"
          >
            <LuX size={18} />
          </button>
        </div>

        <div className="px-5 pb-4 flex-1 min-h-0 overflow-y-auto scrollbar-minimal">{children}</div>

        {footer && <div className="px-5 pb-5 pt-2 shrink-0">{footer}</div>}
      </motion.div>
    </motion.div>,
    getThemedPortalTarget()
  );
}
