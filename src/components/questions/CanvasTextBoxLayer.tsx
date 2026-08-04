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

export type CanvasTextBox = {
	id: string;
	text: string;
	x: number;
	y: number;
	width: number;
	height: number;
	fontSize: number;
	color: string;
	fontWeight: "normal" | "bold";
	fontStyle: "normal" | "italic";
	listStyle: "none" | "bullet";
};

export type CanvasTextBoxLayerProps = {
	boxes: CanvasTextBox[];
	pan: { x: number; y: number };
	scale: number;
	/** Whether the whiteboard is currently in Text mode. */
	active: boolean;
	selectedId: string | null;
	onSelectedIdChange: (id: string | null) => void;
	/** Receives the complete collection after a box is created or changed. */
	onCreateChange: (boxes: CanvasTextBox[]) => void;
	defaultColor: string;
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
const MAX_TEXT_BOXES = 200;
const MAX_TEXT_LENGTH = 100_000;
const MIN_VIEW_SCALE = 0.01;

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

function readEditableText(element: HTMLElement): string {
	return element.innerText.replace(/\r\n?/g, "\n").replace(/\u00a0/g, " ").slice(0, MAX_TEXT_LENGTH);
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

export default function CanvasTextBoxLayer({
	boxes,
	pan,
	scale,
	active,
	selectedId,
	onSelectedIdChange,
	onCreateChange,
	defaultColor,
}: CanvasTextBoxLayerProps) {
	const layerRef = useRef<HTMLDivElement>(null);
	const editorRefs = useRef(new Map<string, HTMLDivElement>());
	const composingIdsRef = useRef(new Set<string>());
	const boxesRef = useRef(boxes);
	const onCreateChangeRef = useRef(onCreateChange);
	const onSelectedIdChangeRef = useRef(onSelectedIdChange);
	const interactionRef = useRef<BoxInteraction | null>(null);
	const interactionPreviewRef = useRef<CanvasTextBox[] | null>(null);
	const pendingFocusIdRef = useRef<string | null>(null);
	const [interactionPreview, setInteractionPreview] = useState<CanvasTextBox[] | null>(null);

	boxesRef.current = boxes;
	onCreateChangeRef.current = onCreateChange;
	onSelectedIdChangeRef.current = onSelectedIdChange;

	const viewScale = Math.max(MIN_VIEW_SCALE, Math.abs(finiteOr(scale, 1)));
	const panX = finiteOr(pan.x, 0);
	const panY = finiteOr(pan.y, 0);
	const visibleBoxes =
		active && interactionRef.current && interactionPreview
			? interactionPreview
			: boxes;

	const publish = useCallback((nextBoxes: CanvasTextBox[]) => {
		boxesRef.current = nextBoxes;
		onCreateChangeRef.current(nextBoxes);
	}, []);

	const commitEditorText = useCallback((id: string, element: HTMLElement) => {
		const text = readEditableText(element);
		const currentBoxes = boxesRef.current;
		const box = currentBoxes.find((candidate) => candidate.id === id);
		if (!box || box.text === text) return;
		publish(
			currentBoxes.map((candidate) =>
				candidate.id === id ? { ...candidate, text } : candidate,
			),
		);
	}, [publish]);

	useLayoutEffect(() => {
		for (const box of visibleBoxes) {
			const editor = editorRefs.current.get(box.id);
			if (!editor || composingIdsRef.current.has(box.id)) continue;
			if (readEditableText(editor) !== box.text) {
				editor.textContent = box.text;
				if (document.activeElement === editor) placeCaretAtEnd(editor);
			}
		}

		const pendingId = pendingFocusIdRef.current;
		if (!pendingId) return;
		const editor = editorRefs.current.get(pendingId);
		if (!editor) return;
		pendingFocusIdRef.current = null;
		editor.focus({ preventScroll: true });
		placeCaretAtEnd(editor);
	}, [visibleBoxes]);

	useEffect(() => {
		if (active) return;
		const interaction = interactionRef.current;
		if (!interaction) return;
		interactionRef.current = null;
		interactionPreviewRef.current = null;
		releasePointerCapture(interaction);
	}, [active]);

	useEffect(() => {
		return () => {
			const interaction = interactionRef.current;
			interactionRef.current = null;
			interactionPreviewRef.current = null;
			if (interaction) releasePointerCapture(interaction);
		};
	}, []);

	const handleBlankPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
		if (!active || event.target !== event.currentTarget) return;
		if (event.pointerType === "mouse" && event.button !== 0) return;

		const rect = event.currentTarget.getBoundingClientRect();
		const worldX = (event.clientX - rect.left - panX) / viewScale;
		const worldY = (event.clientY - rect.top - panY) / viewScale;
		const currentBoxes = boxesRef.current;
		if (currentBoxes.length >= MAX_TEXT_BOXES) return;
		const created: CanvasTextBox = {
			id: makeBoxId(currentBoxes),
			text: "",
			x: worldX,
			y: worldY,
			width: NEW_BOX_WIDTH,
			height: NEW_BOX_HEIGHT,
			fontSize: DEFAULT_FONT_SIZE,
			color: defaultColor,
			fontWeight: "normal",
			fontStyle: "normal",
			listStyle: "none",
		};

		event.preventDefault();
		pendingFocusIdRef.current = created.id;
		onSelectedIdChangeRef.current(created.id);
		publish([...currentBoxes, created]);
	};

	const beginInteraction = (
		event: ReactPointerEvent<HTMLElement>,
		box: CanvasTextBox,
		kind: BoxInteraction["kind"],
	) => {
		if (!active) return;
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
		onSelectedIdChangeRef.current(box.id);
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
		const nextBoxes = interactionPreviewRef.current ?? interaction.startBoxes;
		interactionRef.current = null;
		interactionPreviewRef.current = null;
		setInteractionPreview(null);
		publish(nextBoxes);
	};

	const deleteBox = (id: string) => {
		const currentBoxes = boxesRef.current;
		const nextBoxes = currentBoxes.filter((box) => box.id !== id);
		if (nextBoxes.length === currentBoxes.length) return;
		composingIdsRef.current.delete(id);
		editorRefs.current.delete(id);
		if (selectedId === id) onSelectedIdChangeRef.current(null);
		publish(nextBoxes);
	};

	const handlePaste = (event: ReactClipboardEvent<HTMLDivElement>, id: string) => {
		if (!active) return;
		event.preventDefault();
		insertPlainText(event.currentTarget, event.clipboardData.getData("text/plain"));
		commitEditorText(id, event.currentTarget);
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
		commitEditorText(id, event.currentTarget);
	};

	return (
		<div
			ref={layerRef}
			className={`absolute inset-0 ${active ? "pointer-events-auto" : "pointer-events-none"}`}
			style={{ touchAction: active ? "none" : "auto" }}
			onPointerDown={handleBlankPointerDown}
			aria-hidden={!active && boxes.length === 0 ? true : undefined}
		>
			{visibleBoxes.map((box) => {
				const selected = active && selectedId === box.id;
				const boxWidth = Math.max(MIN_BOX_WIDTH, finiteOr(box.width, MIN_BOX_WIDTH));
				const boxHeight = Math.max(MIN_BOX_HEIGHT, finiteOr(box.height, MIN_BOX_HEIGHT));
				return (
					<div
						key={box.id}
						data-canvas-text-box-id={box.id}
						className={`group absolute rounded-[var(--radius-in)] border transition-[border-color] duration-150 ${
							active ? "pointer-events-auto" : "pointer-events-none"
						} ${
							selected
								? "border-current color-txt-accent"
								: active
									? "border-transparent color-txt-sub hover:border-current"
									: "border-transparent"
						}`}
						style={{
							left: finiteOr(box.x, 0) * viewScale + panX,
							top: finiteOr(box.y, 0) * viewScale + panY,
							width: boxWidth * viewScale,
							height: boxHeight * viewScale,
							touchAction: active ? "none" : "auto",
							zIndex: selected ? 2 : 1,
						}}
						onPointerDown={(event) => {
							if (!active) return;
							event.stopPropagation();
							onSelectedIdChangeRef.current(box.id);
						}}
					>
						<div
							ref={(element) => {
								if (element) editorRefs.current.set(box.id, element);
								else editorRefs.current.delete(box.id);
							}}
							role="textbox"
							aria-label="Whiteboard text"
							aria-multiline="true"
							contentEditable={active ? "plaintext-only" : false}
							suppressContentEditableWarning
							spellCheck
							tabIndex={active ? 0 : -1}
							className={`h-full w-full overflow-auto rounded-[var(--radius-in)] outline-none whitespace-pre-wrap break-words ${
								active ? "cursor-text select-text" : "select-none"
							}`}
							style={{
								padding: `${6 * viewScale}px ${8 * viewScale}px`,
								fontSize: Math.max(1, finiteOr(box.fontSize, DEFAULT_FONT_SIZE) * viewScale),
								lineHeight: 1.4,
								color: box.color || defaultColor,
								fontWeight: box.fontWeight,
								fontStyle: box.fontStyle,
								listStyleType: box.listStyle === "bullet" ? "disc" : "none",
								listStylePosition: "inside",
								display: box.listStyle === "bullet" ? "list-item" : "block",
								WebkitUserSelect: active ? "text" : "none",
								userSelect: active ? "text" : "none",
								touchAction: active ? "manipulation" : "auto",
							}}
							onFocus={() => onSelectedIdChangeRef.current(box.id)}
							onPointerDown={(event) => event.stopPropagation()}
							onInput={(event) => {
								if (
									(event.nativeEvent as InputEvent).isComposing ||
									composingIdsRef.current.has(box.id)
								) return;
								commitEditorText(box.id, event.currentTarget);
							}}
							onBlur={(event) => {
								composingIdsRef.current.delete(box.id);
								commitEditorText(box.id, event.currentTarget);
							}}
							onPaste={(event) => handlePaste(event, box.id)}
							onCompositionStart={(event) => handleCompositionStart(event, box.id)}
							onCompositionEnd={(event) => handleCompositionEnd(event, box.id)}
						/>

						{selected && (
							<>
								<button
									type="button"
									className="absolute left-1/2 -top-7 flex h-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border color-bg color-shadow color-txt-sub px-2 transition-colors hover:color-bg-grey-10 active:cursor-grabbing"
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
								<button
									type="button"
									className="absolute -right-2 -top-7 flex h-6 w-6 items-center justify-center rounded-full border color-bg color-shadow color-txt-main transition-colors hover:color-bg-grey-10"
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
									className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-current color-bg color-txt-accent"
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
