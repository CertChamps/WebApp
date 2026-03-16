import { useMemo } from "react";
import { LuX } from "react-icons/lu";
import DrawingCanvas from "../questions/DrawingCanvas";
import type { ProgressModuleConfig } from "../../hooks/useProgressModules";

type Point = { x: number; y: number; pressure: number };
type Stroke = { points: Point[]; tool: "pen" | "eraser" };

function parseStrokes(raw: string | undefined): Stroke[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Stroke[];
    return null;
  } catch {
    return null;
  }
}

type Props = {
  config: ProgressModuleConfig;
  onRemove: () => void;
  onDrawingChange: (drawing: string) => void;
  editing?: boolean;
};

export default function DrawingModule({ config, onRemove, onDrawingChange, editing }: Props) {
  const initialStrokes = useMemo(() => parseStrokes(config.drawing) ?? [], [config.drawing]);

  const handleStrokesChange = (strokes: Stroke[]) => {
    onDrawingChange(JSON.stringify(strokes));
  };

  return (
    <div className="progress-module progress-module--drawing">
      {editing && (
        <button
          type="button"
          onClick={onRemove}
          className="progress-module__remove progress-module__remove--visible progress-drawing__remove"
          aria-label="Remove module"
        >
          <LuX size={12} />
        </button>
      )}

      <div className="progress-drawing__canvas-wrap">
        <DrawingCanvas
          initialStrokes={initialStrokes}
          onStrokesChange={editing ? handleStrokesChange : undefined}
          wrapperClassName="color-bg-grey-5"
          readOnly={!editing}
          defaultGridMode="off"
        />
      </div>
    </div>
  );
}
