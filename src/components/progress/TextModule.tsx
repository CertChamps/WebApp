import { useCallback, useEffect, useRef, useState } from "react";
import { LuX } from "react-icons/lu";
import type { ProgressModuleConfig } from "../../hooks/useProgressModules";

type Props = {
  config: ProgressModuleConfig;
  onRemove: () => void;
  onTextChange: (text: string) => void;
  editing?: boolean;
};

export default function TextModule({ config, onRemove, onTextChange, editing }: Props) {
  const [value, setValue] = useState(config.text ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setValue(config.text ?? "");
  }, [config.text]);

  const handleChange = useCallback(
    (next: string) => {
      setValue(next);
      if (debounceRef.current !== null) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onTextChange(next), 500);
    },
    [onTextChange]
  );

  useEffect(() => () => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
  }, []);

  return (
    <div className="progress-module progress-module--text">
      {editing && (
        <button
          type="button"
          onClick={onRemove}
          className="progress-module__remove progress-module__remove--visible progress-text__remove"
          aria-label="Remove module"
        >
          <LuX size={12} />
        </button>
      )}

      <textarea
        className={`progress-text__input ${!editing ? "progress-text__input--readonly" : ""}`}
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={() => {
          if (debounceRef.current !== null) clearTimeout(debounceRef.current);
          onTextChange(value);
        }}
        placeholder="Type a note…"
        spellCheck={false}
        readOnly={!editing}
      />
    </div>
  );
}
