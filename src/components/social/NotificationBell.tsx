import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { doc, onSnapshot } from "firebase/firestore";
import { LuBell } from "react-icons/lu";
import { db } from "../../../firebase";
import { UserContext } from "../../context/UserContext";
import { getThemedPortalTarget } from "../../utils/themedPortal";
import Notifications from "./notifications";

export default function NotificationBell() {
  const { user, setUser } = useContext(UserContext);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const unreadCount = user?.notifications?.length ?? 0;

  useEffect(() => {
    if (!user?.uid) return;
    const unsubscribe = onSnapshot(doc(db, "user-data", user.uid), (snap) => {
      const data = snap.data();
      if (!data) return;
      setUser((prev: any) => ({
        ...prev,
        notifications: data.notifications ?? [],
      }));
    });
    return () => unsubscribe();
  }, [user?.uid, setUser]);

  const updatePos = () => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setPos({
      top: rect.bottom + 8,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    window.addEventListener("resize", updatePos);
    window.addEventListener("scroll", updatePos, true);
    return () => {
      window.removeEventListener("resize", updatePos);
      window.removeEventListener("scroll", updatePos, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleOutside(e: MouseEvent | FocusEvent) {
      const target = e.target as Node | null;
      if (
        containerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("focusin", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("focusin", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label="Notifications"
        aria-expanded={open}
        aria-controls="notifications-dropdown"
        className="relative flex items-center justify-center rounded-xl p-2 color-txt-sub hover:color-txt-main hover:color-bg-grey-5 transition-colors cursor-pointer focus:outline-none"
      >
        {unreadCount > 0 && (
          <div className="bg-red w-2 h-2 rounded-full absolute top-1.5 right-1.5" />
        )}
        <LuBell strokeWidth={3} size={22} />
      </button>

      {open &&
        pos &&
        createPortal(
          <div
            ref={dropdownRef}
            id="notifications-dropdown"
            className="fixed z-[200] min-w-[28rem] w-[min(90vw,32rem)] max-h-[75vh] overflow-hidden rounded-2xl border-2 color-shadow color-bg shadow-none"
            style={{ top: pos.top, right: pos.right }}
          >
            <Notifications />
          </div>,
          getThemedPortalTarget()
        )}
    </div>
  );
}
