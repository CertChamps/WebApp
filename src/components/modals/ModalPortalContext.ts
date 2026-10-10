import { createContext, type RefObject } from "react";

// Popovers opened within a dialog must stay inside its focus/inert boundary.
export const ModalPortalContext = createContext<RefObject<HTMLElement | null> | null>(null);
