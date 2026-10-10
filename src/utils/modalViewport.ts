let openModals = 0;
let restoreApp: (() => void) | undefined;

export function isModalOpen(): boolean {
  return openModals > 0;
}

/** Freeze app chrome, not the body. React Aria owns the document scroll lock. */
export function acquireAppViewportLock(): () => void {
  if (openModals++ === 0) {
    const root = document.documentElement;
    const app = document.querySelector<HTMLElement>(".app-viewport");
    const bounds = app?.getBoundingClientRect();
    const properties = {
      "--modal-app-top": `${bounds?.top ?? 0}px`,
      "--modal-app-left": `${bounds?.left ?? 0}px`,
      "--modal-app-width": `${bounds?.width ?? window.innerWidth}px`,
      "--modal-app-height": `${bounds?.height ?? window.innerHeight}px`,
    };
    const previous = Object.keys(properties).map((name) => [name, root.style.getPropertyValue(name)]);
    for (const [name, value] of Object.entries(properties)) root.style.setProperty(name, value);
    root.classList.add("app-modal-open");
    restoreApp = () => {
      root.classList.remove("app-modal-open");
      for (const [name, value] of previous) {
        if (value) root.style.setProperty(name, value);
        else root.style.removeProperty(name);
      }
      // Let App resume with the current viewport after the final overlay closes.
      window.dispatchEvent(new Event("resize"));
    };
  }
  let released = false;
  return () => {
    if (released) return;
    released = true;
    if (--openModals === 0) {
      restoreApp?.();
      restoreApp = undefined;
    }
  };
}
