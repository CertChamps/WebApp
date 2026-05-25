/** Portal target inside the themed wrapper so Tailwind theme variants apply. */
export function getThemedPortalTarget(): HTMLElement {
  if (typeof document === "undefined") {
    return document.body;
  }
  return document.getElementById("themed-root") ?? document.body;
}
