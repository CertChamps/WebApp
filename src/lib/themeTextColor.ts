/** Theme-aware text ink slots — same order as the pen/text colour palette. */
export const THEME_TEXT_COLOR_CLASSES = [
	"color-txt-main",
	"color-txt-sub",
	"color-txt-accent",
] as const;

export type ThemeTextColorClass = (typeof THEME_TEXT_COLOR_CLASSES)[number];

export function clampThemeColorIndex(index: number | null | undefined): number {
	if (typeof index !== "number" || !Number.isFinite(index)) return 0;
	return Math.max(0, Math.min(THEME_TEXT_COLOR_CLASSES.length - 1, Math.round(index)));
}

export function themeTextColorClass(index: number | null | undefined): ThemeTextColorClass {
	return THEME_TEXT_COLOR_CLASSES[clampThemeColorIndex(index)];
}

export function isThemeTextColorClass(name: string): name is ThemeTextColorClass {
	return (THEME_TEXT_COLOR_CLASSES as readonly string[]).includes(name);
}

/** Strip baked hex/rgb colour so theme utility classes control ink. */
export function stripBakedColorStyles(style: string): string {
	return style
		.split(";")
		.map((part) => part.trim())
		.filter(Boolean)
		.filter((part) => !/^color\s*:/i.test(part))
		.join("; ");
}

/**
 * Apply a theme colour index to the current selection (or next typed run).
 * Persists as a utility class + data-theme-ink, not a baked hex.
 */
export function applyThemeTextColor(index: number): void {
	const colorIndex = clampThemeColorIndex(index);
	const className = themeTextColorClass(colorIndex);
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) return;

	const range = selection.getRangeAt(0);
	const span = document.createElement("span");
	span.className = className;
	span.setAttribute("data-theme-ink", String(colorIndex));

	if (range.collapsed) {
		span.appendChild(document.createTextNode("\u200b"));
		range.insertNode(span);
		const textNode = span.firstChild;
		if (textNode) {
			range.setStart(textNode, 1);
			range.collapse(true);
		}
		selection.removeAllRanges();
		selection.addRange(range);
		return;
	}

	try {
		range.surroundContents(span);
	} catch {
		span.appendChild(range.extractContents());
		range.insertNode(span);
	}

	selection.removeAllRanges();
	const next = document.createRange();
	next.selectNodeContents(span);
	selection.addRange(next);
}
