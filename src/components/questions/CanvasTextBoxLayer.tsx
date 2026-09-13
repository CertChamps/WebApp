import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
} from "react";
import type {
	ClipboardEvent as ReactClipboardEvent,
	CompositionEvent as ReactCompositionEvent,
	PointerEvent as ReactPointerEvent,
} from "react";
import { GripHorizontal, Trash2 } from "lucide-react";
import {
	clampThemeColorIndex,
	isThemeTextColorClass,
	stripBakedColorStyles,
	themeTextColorClass,
} from "../../lib/themeTextColor";
import { ensureElementInView, ensureSelectionCaretInView, subscribeVisualViewport } from "../../utils/visualViewport";

export type CanvasTextBox = {
	id: string;
	/** May contain a small set of inline HTML tags (bold/italic/lists). */
	text: string;
	x: number;
	y: number;
	width: number;
	height: number;
	fontSize: number;
	/** Theme palette slot (main / sub / accent). */
	colorIndex: number;
	fontWeight: "normal" | "bold";
	fontStyle: "normal" | "italic";
	listStyle: "none" | "bullet";
};

export type CanvasTextDefaults = {
	fontSize: number;
	colorIndex: number;
	fontWeight: "normal" | "bold";
	fontStyle: "normal" | "italic";
	listStyle: "none" | "bullet";
};

export type CanvasTextFormatState = {
	bold: boolean;
	italic: boolean;
	bullet: boolean;
};

export type CanvasTextBoxLayerProps = {
	boxes: CanvasTextBox[];
	pan: { x: number; y: number };
	scale: number;
	/** Create new boxes and edit text content. */
	editing: boolean;
	/** Select, move, and resize existing boxes. */
	selectable: boolean;
	selectedIds: string[];
	onSelectedIdsChange: (ids: string[]) => void;
	/** Receives the complete collection after a box is created or changed. */
	onCreateChange: (boxes: CanvasTextBox[]) => void;
	defaults: CanvasTextDefaults;
	onFormatStateChange?: (state: CanvasTextFormatState) => void;
};

type BoxInteraction = {
	kind: "move" | "resize";
	pointerId: number;
	boxId: string;
	startClientX: number;
	startClientY: number;
	startBox: CanvasTextBox;
	startBoxes: CanvasTextBox[];
	captureTarget: HTMLElement;
};

const MIN_BOX_WIDTH = 120;
const MIN_BOX_HEIGHT = 48;
const NEW_BOX_WIDTH = 280;
const NEW_BOX_HEIGHT = 88;
const DEFAULT_FONT_SIZE = 18;
/** Matches DrawingCanvas essay ruled-line gap so text sits on the lines. */
const TEXT_LINE_GAP = 32;
const MAX_TEXT_BOXES = 200;
const MAX_TEXT_LENGTH = 100_000;
const MIN_VIEW_SCALE = 0.01;

const ALLOWED_TAGS = new Set(["B", "STRONG", "I", "EM", "BR", "DIV", "P", "SPAN", "UL", "OL", "LI"]);

function finiteOr(value: number, fallback: number): number {
	return Number.isFinite(value) ? value : fallback;
}

function makeBoxId(boxes: CanvasTextBox[]): string {
	const existingIds = new Set(boxes.map((box) => box.id));
	let id: string;
	do {
		id =
			typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
				? crypto.randomUUID()
				: `text-${Date.now()}-${Math.random().toString(36).slice(2)}`;
	} while (existingIds.has(id));
	return id;
}

export function createBlankCanvasTextBox(
	boxes: CanvasTextBox[],
	x: number,
	y: number,
	defaults: CanvasTextDefaults,
): CanvasTextBox | null {
	if (boxes.length >= MAX_TEXT_BOXES) return null;
	return {
		id: makeBoxId(boxes),
		text: "",
		x,
		y,
		width: NEW_BOX_WIDTH,
		height: NEW_BOX_HEIGHT,
		fontSize: defaults.fontSize,
		colorIndex: clampThemeColorIndex(defaults.colorIndex),
		fontWeight: "normal",
		fontStyle: "normal",
		listStyle: "none",
	};
}

export function htmlToPlainText(html: string): string {
	if (!html) return "";
	if (typeof document === "undefined") {
		return html.replace(/<[^>]+>/g, "").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
	}
	const host = document.createElement("div");
	host.innerHTML = html;
	return host.innerText.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").slice(0, MAX_TEXT_LENGTH);
}

function readEditableHtml(element: HTMLElement): string {
	return element.innerHTML.slice(0, MAX_TEXT_LENGTH);
}

function looksLikeHtml(value: string): boolean {
	return /<\/?[a-z][\s\S]*>/i.test(value);
}

function sanitizeStyle(value: string): string {
	return stripBakedColorStyles(value)
		.split(";")
		.map((part) => part.trim())
		.filter((part) => /^(font-size|font-weight|font-style)\s*:/i.test(part))
		.filter((part) => !/(?:url|expression|var|calc)\s*\(/i.test(part))
		.join("; ");
}

function sanitizeHtml(html: string): string {
	if (typeof document === "undefined") return htmlToPlainText(html);
	const template = document.createElement("template");
	template.innerHTML = html;
	const walk = (node: Node) => {
		const children = Array.from(node.childNodes);
		for (const child of children) {
			if (child.nodeType === Node.TEXT_NODE) continue;
			if (child.nodeType !== Node.ELEMENT_NODE) {
				child.parentNode?.removeChild(child);
				continue;
			}
			const element = child as HTMLElement;
			if (!ALLOWED_TAGS.has(element.tagName)) {
				while (element.firstChild) element.parentNode?.insertBefore(element.firstChild, element);
				element.remove();
				continue;
			}
			for (const attr of Array.from(element.attributes)) {
				if (attr.name === "style") {
					const next = sanitizeStyle(attr.value);
					if (next) element.setAttribute("style", next);
					else element.removeAttribute(attr.name);
				} else if (attr.name === "class") {
					const safe = attr.value.split(/\s+/).filter((name) => isThemeTextColorClass(name));
					if (safe.length) element.setAttribute("class", safe.join(" "));
					else element.removeAttribute(attr.name);
				} else if (attr.name === "data-theme-ink" && element.tagName === "SPAN") {
					element.setAttribute("data-theme-ink", String(clampThemeColorIndex(Number(attr.value))));
				} else {
					element.removeAttribute(attr.name);
				}
			}
			walk(element);
		}
	};
	walk(template.content);
	return template.innerHTML.slice(0, MAX_TEXT_LENGTH);
}

function placeCaretAtEnd(element: HTMLElement): void {
	const selection = window.getSelection();
	if (!selection) return;
	const range = document.createRange();
	range.selectNodeContents(element);
	range.collapse(false);
	selection.removeAllRanges();
	selection.addRange(range);
}

function insertPlainText(element: HTMLElement, text: string): void {
	const selection = window.getSelection();
	if (!selection || selection.rangeCount === 0) {
		element.append(document.createTextNode(text));
		placeCaretAtEnd(element);
		return;
	}

	const range = selection.getRangeAt(0);
	if (!element.contains(range.commonAncestorContainer)) {
		element.append(document.createTextNode(text));
		placeCaretAtEnd(element);
		return;
	}

	range.deleteContents();
	const textNode = document.createTextNode(text.replace(/\r\n?/g, "\n"));
	range.insertNode(textNode);
	range.setStartAfter(textNode);
	range.collapse(true);
	selection.removeAllRanges();
	selection.addRange(range);
}

function releasePointerCapture(interaction: BoxInteraction): void {
	try {
		if (interaction.captureTarget.hasPointerCapture(interaction.pointerId)) {
			interaction.captureTarget.releasePointerCapture(interaction.pointerId);
		}
	} catch {
		// The browser may already have released capture after a cancel or DOM removal.
	}
}

const TEXT_PAD_X = 8;
const TEXT_PAD_Y = 6;
let textMeasureCtx: CanvasRenderingContext2D | null | undefined;

function getTextMeasureContext(): CanvasRenderingContext2D | null {
	if (textMeasureCtx !== undefined) return textMeasureCtx;
	if (typeof document === "undefined") {
		textMeasureCtx = null;
		return null;
	}
	textMeasureCtx = document.createElement("canvas").getContext("2d");
	return textMeasureCtx;
}

export function isEmptyTextBox(box: { text: string }): boolean {
	return !htmlToPlainText(box.text).trim();
}

export function getTextContentBounds(box: {
	text: string;
	x: number;
	y: number;
	width: number;
	height: number;
	fontSize: number;
}): { x: number; y: number; width: number; height: number } | null {
	if (isEmptyTextBox(box)) return null;
	const fontSize = finiteOr(box.fontSize, DEFAULT_FONT_SIZE);
	const lines = htmlToPlainText(box.text).replace(/\s+$/g, "").split(/\n/);
	const ctx = getTextMeasureContext();
	if (ctx) ctx.font = `${fontSize}px ui-sans-serif, system-ui, sans-serif`;
	const innerWidth = Math.max(8, finiteOr(box.width, MIN_BOX_WIDTH) - TEXT_PAD_X * 2);
	const innerHeight = Math.max(fontSize, finiteOr(box.height, MIN_BOX_HEIGHT) - TEXT_PAD_Y * 2);
	let wrappedLineCount = 0;
	let longest = 0;
	for (const line of lines) {
		const lineWidth = ctx ? ctx.measureText(line).width : Math.max(1, line.length) * fontSize * 0.55;
		longest = Math.max(longest, lineWidth);
		wrappedLineCount += Math.max(1, Math.ceil(lineWidth / innerWidth));
	}
	const contentWidth = Math.min(innerWidth, Math.max(8, longest));
	const contentHeight = Math.min(innerHeight, Math.max(fontSize, wrappedLineCount * TEXT_LINE_GAP));
	return {
		x: finiteOr(box.x, 0) + TEXT_PAD_X,
		y: finiteOr(box.y, 0) + TEXT_PAD_Y,
		width: contentWidth,
		height: contentHeight,
	};
}

function measureEditorWorldHeight(element: HTMLElement, viewScale: number): number {
	const previousHeight = element.style.height;
	const previousMinHeight = element.style.minHeight;
	element.style.height = "auto";
	element.style.minHeight = "0px";
	const contentHeight = Math.max(MIN_BOX_HEIGHT, element.scrollHeight / viewScale);
	element.style.height = previousHeight;
	element.style.minHeight = previousMinHeight;
	return contentHeight;
}

function readFormatState(): CanvasTextFormatState {
	try {
		return {
			bold: document.queryCommandState("bold"),
			italic: document.queryCommandState("italic"),
			bullet: document.queryCommandState("insertUnorderedList"),
		};
	} catch {
		return { bold: false, italic: false, bullet: false };
	}
}

export default function CanvasTextBoxLayer({
	boxes,
	pan,
	scale,
	editing,
	selectable,
	selectedIds,
	onSelectedIdsChange,
	onCreateChange,
	defaults,
	onFormatStateChange,
}: CanvasTextBoxLayerProps) {
	const layerRef = useRef<HTMLDivElement>(null);
	const editorRefs = useRef(new Map<string, HTMLDivElement>());
	const composingIdsRef = useRef(new Set<string>());
	const boxesRef = useRef(boxes);
	const onCreateChangeRef = useRef(onCreateChange);
	const onSelectedIdsChangeRef = useRef(onSelectedIdsChange);
	const onFormatStateChangeRef = useRef(onFormatStateChange);
	const selectedIdsRef = useRef(selectedIds);
	const interactionRef = useRef<BoxInteraction | null>(null);
	const interactionPreviewRef = useRef<CanvasTextBox[] | null>(null);
	const pendingFocusIdRef = useRef<string | null>(null);
	const knownBoxIdsRef = useRef<Set<string>>(new Set(boxes.map((box) => box.id)));
	const [interactionPreview, setInteractionPreview] = useState<CanvasTextBox[] | null>(null);

	boxesRef.current = boxes;
	onCreateChangeRef.current = onCreateChange;
	onSelectedIdsChangeRef.current = onSelectedIdsChange;
	onFormatStateChangeRef.current = onFormatStateChange;
	selectedIdsRef.current = selectedIds;

	const viewScale = Math.max(MIN_VIEW_SCALE, Math.abs(finiteOr(scale, 1)));
	const panX = finiteOr(pan.x, 0);
	const panY = finiteOr(pan.y, 0);
	const interactive = editing || selectable;
	const visibleBoxes =
		interactive && interactionRef.current && interactionPreview
			? interactionPreview
			: boxes;

	const publish = useCallback((nextBoxes: CanvasTextBox[]) => {
		boxesRef.current = nextBoxes;
		onCreateChangeRef.current(nextBoxes);
	}, []);

	useEffect(() => {
		if (editing) return;
		const current = boxesRef.current;
		const next = current.filter((box) => !isEmptyTextBox(box));
		if (next.length === current.length) return;
		const keep = new Set(next.map((box) => box.id));
		const nextIds = selectedIdsRef.current.filter((id) => keep.has(id));
		if (nextIds.length !== selectedIdsRef.current.length) {
			onSelectedIdsChangeRef.current(nextIds);
		}
		publish(next);
	}, [editing, publish]);

	const emitFormatState = useCallback(() => {
		onFormatStateChangeRef.current?.(readFormatState());
	}, []);

	const commitEditorHtml = useCallback((id: string, element: HTMLElement) => {
		const html = readEditableHtml(element);
		const contentHeight = measureEditorWorldHeight(element, viewScale);
		const currentBoxes = boxesRef.current;
		const box = currentBoxes.find((candidate) => candidate.id === id);
		if (!box) return;
		const heightChanged = Math.abs(box.height - contentHeight) > 0.5;
		if (box.text === html && !heightChanged) return;
		publish(
			currentBoxes.map((candidate) =>
				candidate.id === id
					? { ...candidate, text: html, height: contentHeight }
					: candidate,
			),
		);
	}, [publish, viewScale]);

	useLayoutEffect(() => {
		if (editing) {
			const known = knownBoxIdsRef.current;
			const created = visibleBoxes.find((box) => !known.has(box.id) && selectedIds.includes(box.id));
			if (created) pendingFocusIdRef.current = created.id;
		}
		knownBoxIdsRef.current = new Set(visibleBoxes.map((box) => box.id));

		for (const box of visibleBoxes) {
			const editor = editorRefs.current.get(box.id);
			if (!editor || composingIdsRef.current.has(box.id)) continue;
			const current = readEditableHtml(editor);
			if (current !== box.text) {
				if (looksLikeHtml(box.text)) editor.innerHTML = box.text;
				else editor.textContent = box.text;
				if (document.activeElement === editor) placeCaretAtEnd(editor);
			}
			const contentHeight = measureEditorWorldHeight(editor, viewScale);
			if (Math.abs(box.height - contentHeight) > 0.5) {
				publish(
					boxesRef.current.map((candidate) =>
						candidate.id === box.id ? { ...candidate, height: contentHeight } : candidate,
					),
				);
			}
		}

		const pendingId = pendingFocusIdRef.current;
		if (!pendingId) return;
		const editor = editorRefs.current.get(pendingId);
		if (!editor) return;
		pendingFocusIdRef.current = null;
		editor.focus({ preventScroll: true });
		placeCaretAtEnd(editor);
		emitFormatState();
		requestAnimationFrame(() => {
			if (!ensureSelectionCaretInView(editor)) ensureElementInView(editor);
		});
	}, [visibleBoxes, selectedIds, editing, emitFormatState, publish, viewScale]);

	const revealFocusedText = useCallback(() => {
		const layer = layerRef.current;
		const active = document.activeElement;
		if (!layer || !(active instanceof HTMLElement) || !layer.contains(active)) return;
		if (!active.isContentEditable) return;
		if (!ensureSelectionCaretInView(active)) ensureElementInView(active);
	}, []);

	useEffect(() => {
		if (!editing) return;
		const stopViewport = subscribeVisualViewport(revealFocusedText);
		document.addEventListener("selectionchange", revealFocusedText);
		return () => {
			stopViewport();
			document.removeEventListener("selectionchange", revealFocusedText);
		};
	}, [editing, revealFocusedText]);

	useEffect(() => {
		if (interactive) return;
		const interaction = interactionRef.current;
		if (!interaction) return;
		interactionRef.current = null;
		interactionPreviewRef.current = null;
		releasePointerCapture(interaction);
	}, [interactive]);

	useEffect(() => {
		return () => {
			const interaction = interactionRef.current;
			interactionRef.current = null;
			interactionPreviewRef.current = null;
			if (interaction) releasePointerCapture(interaction);
		};
	}, []);

	const beginInteraction = (
		event: ReactPointerEvent<HTMLElement>,
		box: CanvasTextBox,
		kind: BoxInteraction["kind"],
	) => {
		if (!selectable && !editing) return;
		if (event.pointerType === "mouse" && event.button !== 0) return;

		event.preventDefault();
		event.stopPropagation();
		const currentBoxes = boxesRef.current;
		const currentBox = currentBoxes.find((candidate) => candidate.id === box.id) ?? box;
		const captureTarget = event.currentTarget;
		const interaction: BoxInteraction = {
			kind,
			pointerId: event.pointerId,
			boxId: box.id,
			startClientX: event.clientX,
			startClientY: event.clientY,
			startBox: currentBox,
			startBoxes: currentBoxes,
			captureTarget,
		};

		interactionRef.current = interaction;
		interactionPreviewRef.current = currentBoxes;
		setInteractionPreview(currentBoxes);
		const currentIds = selectedIdsRef.current;
		onSelectedIdsChangeRef.current(currentIds.includes(box.id) ? currentIds : [...currentIds, box.id]);
		captureTarget.setPointerCapture(event.pointerId);
	};

	const handleInteractionMove = (event: ReactPointerEvent<HTMLElement>) => {
		const interaction = interactionRef.current;
		if (!interaction || interaction.pointerId !== event.pointerId) return;

		event.preventDefault();
		const deltaX = (event.clientX - interaction.startClientX) / viewScale;
		const deltaY = (event.clientY - interaction.startClientY) / viewScale;
		const nextBox: CanvasTextBox =
			interaction.kind === "move"
				? {
						...interaction.startBox,
						x: interaction.startBox.x + deltaX,
						y: interaction.startBox.y + deltaY,
					}
				: {
						...interaction.startBox,
						width: Math.max(MIN_BOX_WIDTH, interaction.startBox.width + deltaX),
						height: Math.max(MIN_BOX_HEIGHT, interaction.startBox.height + deltaY),
					};
		const nextBoxes = interaction.startBoxes.map((candidate) =>
			candidate.id === interaction.boxId ? nextBox : candidate,
		);
		interactionPreviewRef.current = nextBoxes;
		setInteractionPreview(nextBoxes);
	};

	const finishInteraction = (
		event: ReactPointerEvent<HTMLElement>,
		cancelled: boolean,
	) => {
		const interaction = interactionRef.current;
		if (!interaction || interaction.pointerId !== event.pointerId) return;

		event.preventDefault();
		event.stopPropagation();
		const nextBoxes = interactionPreviewRef.current ?? interaction.startBoxes;
		interactionRef.current = null;
		interactionPreviewRef.current = null;
		releasePointerCapture(interaction);
		setInteractionPreview(null);

		if (cancelled) return;
		publish(nextBoxes);
	};

	const handleLostPointerCapture = (event: ReactPointerEvent<HTMLElement>) => {
		const interaction = interactionRef.current;
		if (!interaction || interaction.pointerId !== event.pointerId) return;
		interactionRef.current = null;
		interactionPreviewRef.current = null;
		setInteractionPreview(null);
	};

	const deleteBox = (id: string) => {
		const next = boxesRef.current.filter((box) => box.id !== id);
		onSelectedIdsChangeRef.current(selectedIdsRef.current.filter((selectedId) => selectedId !== id));
		publish(next);
	};

	const handlePaste = (event: ReactClipboardEvent<HTMLDivElement>, id: string) => {
		event.preventDefault();
		const editor = event.currentTarget;
		const html = event.clipboardData.getData("text/html");
		const text = event.clipboardData.getData("text/plain");
		if (html) document.execCommand("insertHTML", false, sanitizeHtml(html));
		else insertPlainText(editor, text);
		commitEditorHtml(id, editor);
		emitFormatState();
	};

	const handleCompositionStart = (
		event: ReactCompositionEvent<HTMLDivElement>,
		id: string,
	) => {
		composingIdsRef.current.add(id);
		event.stopPropagation();
	};

	const handleCompositionEnd = (
		event: ReactCompositionEvent<HTMLDivElement>,
		id: string,
	) => {
		composingIdsRef.current.delete(id);
		commitEditorHtml(id, event.currentTarget);
		emitFormatState();
	};

	return (
		<div
			ref={layerRef}
			className="absolute inset-0 pointer-events-none"
			style={{ touchAction: "auto" }}
			aria-hidden={!interactive && boxes.length === 0 ? true : undefined}
		>
			{visibleBoxes.map((box) => {
				const selected = interactive && selectedIds.includes(box.id);
				const showChrome = selected && editing;
				const boxWidth = Math.max(MIN_BOX_WIDTH, finiteOr(box.width, MIN_BOX_WIDTH));
				const boxHeight = Math.max(MIN_BOX_HEIGHT, finiteOr(box.height, MIN_BOX_HEIGHT));
				return (
					<div
						key={box.id}
						data-canvas-text-box-id={box.id}
						className={`group absolute rounded-in border transition-[border-color] duration-150 ${
							editing ? "pointer-events-auto" : "pointer-events-none"
						} ${
							selected && editing
								? "border-current color-txt-accent"
								: editing
									? "border-transparent color-txt-sub hover:border-current"
									: "border-transparent"
						}`}
						style={{
							left: finiteOr(box.x, 0) * viewScale + panX,
							top: finiteOr(box.y, 0) * viewScale + panY,
							width: boxWidth * viewScale,
							height: boxHeight * viewScale,
							touchAction: editing ? "none" : "auto",
							zIndex: selected ? 2 : 1,
						}}
						onPointerDown={(event) => {
							if (!editing) return;
							event.stopPropagation();
							onSelectedIdsChangeRef.current([box.id]);
						}}
						onPointerMove={handleInteractionMove}
						onPointerUp={(event) => finishInteraction(event, false)}
						onPointerCancel={(event) => finishInteraction(event, true)}
						onLostPointerCapture={handleLostPointerCapture}
					>
						<div
							ref={(element) => {
								if (element) editorRefs.current.set(box.id, element);
								else editorRefs.current.delete(box.id);
							}}
							role="textbox"
							aria-label="Whiteboard text"
							aria-multiline="true"
							contentEditable={editing}
							suppressContentEditableWarning
							spellCheck={false}
							autoCorrect="off"
							autoCapitalize="off"
							data-gramm="false"
							data-enable-grammarly="false"
							tabIndex={editing ? 0 : -1}
							className={`w-full overflow-hidden rounded-in outline-none break-words [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 ${themeTextColorClass(box.colorIndex ?? defaults.colorIndex)} ${
								editing ? "cursor-text select-text" : "select-none"
							}`}
							style={{
								minHeight: "100%",
								padding: `${6 * viewScale}px ${8 * viewScale}px`,
								fontSize: Math.max(1, finiteOr(box.fontSize, DEFAULT_FONT_SIZE) * viewScale),
								lineHeight: `${TEXT_LINE_GAP * viewScale}px`,
								WebkitUserSelect: editing ? "text" : "none",
								userSelect: editing ? "text" : "none",
								touchAction: editing ? "manipulation" : "auto",
							}}
							onFocus={() => {
								onSelectedIdsChangeRef.current([box.id]);
								emitFormatState();
								requestAnimationFrame(revealFocusedText);
							}}
							onPointerDown={(event) => {
								if (!editing) {
									event.preventDefault();
									return;
								}
								event.stopPropagation();
							}}
							onMouseUp={emitFormatState}
							onKeyUp={() => {
								emitFormatState();
								revealFocusedText();
							}}
							onInput={(event) => {
								if (
									(event.nativeEvent as InputEvent).isComposing ||
									composingIdsRef.current.has(box.id)
								) return;
								commitEditorHtml(box.id, event.currentTarget);
								emitFormatState();
								revealFocusedText();
							}}
							onBlur={(event) => {
								composingIdsRef.current.delete(box.id);
								commitEditorHtml(box.id, event.currentTarget);
								const latest = boxesRef.current.find((candidate) => candidate.id === box.id);
								if (latest && isEmptyTextBox(latest)) deleteBox(box.id);
							}}
							onPaste={(event) => handlePaste(event, box.id)}
							onCompositionStart={(event) => handleCompositionStart(event, box.id)}
							onCompositionEnd={(event) => handleCompositionEnd(event, box.id)}
						/>

						{showChrome && (
							<>
								{editing && (
									<button
										type="button"
										className="pointer-events-auto absolute left-1/2 -top-7 flex h-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border color-bg color-shadow color-txt-sub px-2 transition-colors hover:color-bg-grey-10 active:cursor-grabbing"
										title="Move text box"
										aria-label="Move text box"
										onPointerDown={(event) => beginInteraction(event, box, "move")}
										onPointerMove={handleInteractionMove}
										onPointerUp={(event) => finishInteraction(event, false)}
										onPointerCancel={(event) => finishInteraction(event, true)}
										onLostPointerCapture={handleLostPointerCapture}
									>
										<GripHorizontal size={14} strokeWidth={2} aria-hidden />
									</button>
								)}
								<button
									type="button"
									className="pointer-events-auto absolute -right-2 -top-7 flex h-6 w-6 items-center justify-center rounded-full border color-bg color-shadow color-txt-main transition-colors hover:color-bg-grey-10"
									title="Delete text box"
									aria-label="Delete text box"
									onPointerDown={(event) => {
										event.preventDefault();
										event.stopPropagation();
									}}
									onClick={(event) => {
										event.stopPropagation();
										deleteBox(box.id);
									}}
								>
									<Trash2 size={12} strokeWidth={2} aria-hidden />
								</button>
								<button
									type="button"
									className="pointer-events-auto absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-current color-bg color-txt-accent"
									title="Resize text box"
									aria-label="Resize text box"
									onPointerDown={(event) => beginInteraction(event, box, "resize")}
									onPointerMove={handleInteractionMove}
									onPointerUp={(event) => finishInteraction(event, false)}
									onPointerCancel={(event) => finishInteraction(event, true)}
									onLostPointerCapture={handleLostPointerCapture}
								/>
							</>
						)}
					</div>
				);
			})}
		</div>
	);
}
