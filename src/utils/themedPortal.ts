/** Portal target inside the themed wrapper so Tailwind theme variants apply. */
export function getThemedPortalTarget(): HTMLElement {
  if (typeof document === "undefined") {
    throw new Error("getThemedPortalTarget() requires a browser environment");
  }
  return document.getElementById("themed-root") ?? document.body;
}
