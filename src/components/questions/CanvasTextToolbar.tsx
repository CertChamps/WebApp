import { Bold, Italic, List, PenLine, Redo2, Undo2 } from "lucide-react";
import type { CanvasTextBox } from "./CanvasTextBoxLayer";

type Props = {
  selected: CanvasTextBox | null;
  onSwitchToPen: () => void;
  onPatchSelected: (patch: Partial<CanvasTextBox>) => void;
};

const buttonClass = "p-1.5 rounded-[var(--radius-in)] transition-colors color-txt-main hover:color-bg-grey-10 disabled:opacity-35 disabled:cursor-not-allowed";

export default function CanvasTextToolbar({ selected, onSwitchToPen, onPatchSelected }: Props) {
  const runHistory = (command: "undo" | "redo") => {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.isContentEditable) document.execCommand(command);
  };
  return (
    <div className="absolute bottom-4 left-1/2 z-[2000] flex max-w-[calc(100%-1rem)] -translate-x-1/2 items-center gap-1 rounded-[var(--radius-out)] color-bg color-shadow border px-2 py-1.5">
      <button type="button" className={buttonClass} onClick={onSwitchToPen} title="Switch to pen" aria-label="Switch to pen"><PenLine size={18} /></button>
      <button type="button" className={buttonClass} onPointerDown={(event) => event.preventDefault()} onClick={() => runHistory("undo")} title="Undo" aria-label="Undo"><Undo2 size={18} /></button>
      <button type="button" className={buttonClass} onPointerDown={(event) => event.preventDefault()} onClick={() => runHistory("redo")} title="Redo" aria-label="Redo"><Redo2 size={18} /></button>
      <button type="button" disabled={!selected} aria-pressed={selected?.fontWeight === "bold"} className={`${buttonClass} ${selected?.fontWeight === "bold" ? "color-bg-accent color-txt-accent" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={() => selected && onPatchSelected({ fontWeight: selected.fontWeight === "bold" ? "normal" : "bold" })} title="Bold" aria-label="Bold"><Bold size={18} /></button>
      <button type="button" disabled={!selected} aria-pressed={selected?.fontStyle === "italic"} className={`${buttonClass} ${selected?.fontStyle === "italic" ? "color-bg-accent color-txt-accent" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={() => selected && onPatchSelected({ fontStyle: selected.fontStyle === "italic" ? "normal" : "italic" })} title="Italic" aria-label="Italic"><Italic size={18} /></button>
      <button type="button" disabled={!selected} aria-pressed={selected?.listStyle === "bullet"} className={`${buttonClass} ${selected?.listStyle === "bullet" ? "color-bg-accent color-txt-accent" : ""}`} onPointerDown={(event) => event.preventDefault()} onClick={() => selected && onPatchSelected({ listStyle: selected.listStyle === "bullet" ? "none" : "bullet" })} title="Bullet list" aria-label="Bullet list"><List size={18} /></button>
      <select aria-label="Text size" title="Text size" disabled={!selected} value={selected?.fontSize ?? 18} onChange={(event) => onPatchSelected({ fontSize: Number(event.target.value) })} className="h-8 rounded-[var(--radius-in)] color-bg-grey-5 px-2 text-xs font-semibold color-txt-main outline-none disabled:opacity-35">
        <option value={14}>14</option><option value={16}>16</option><option value={18}>18</option><option value={22}>22</option><option value={28}>28</option><option value={36}>36</option><option value={48}>48</option>
      </select>
      <label className={`flex size-8 items-center justify-center rounded-[var(--radius-in)] color-txt-main hover:color-bg-grey-10 ${selected ? "cursor-pointer" : "pointer-events-none opacity-35"}`} title="Text colour">
        <input type="color" aria-label="Text colour" value={selected?.color || "#222222"} onChange={(event) => onPatchSelected({ color: event.target.value })} className="size-4 cursor-pointer border-0 bg-transparent p-0" />
      </label>
      {!selected && <span className="whitespace-nowrap px-1 text-[11px] color-txt-sub">Tap the board to add text</span>}
    </div>
  );
}
