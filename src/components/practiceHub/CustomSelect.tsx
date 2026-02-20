import { useEffect, useRef, useState } from "react";
import { LuChevronDown } from "react-icons/lu";

export type CustomSelectOption = { value: string; label: string };

type Props = {
  options: CustomSelectOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  id?: string;
  "aria-label"?: string;
  /** Optional: disable specific option values (e.g. already selected topics) */
  disabledValues?: Set<string>;
  /** Root class name so you can override styles */
  className?: string;
  /** Class for the trigger button */
  triggerClassName?: string;
  /** Class for the dropdown panel */
  dropdownClassName?: string;
  /** Class for each option */
  optionClassName?: string;
};

export default function CustomSelect({
  options,
  value,
  onChange,
  placeholder = "Select…",
  id,
  "aria-label": ariaLabel,
  disabledValues,
  className = "",
  triggerClassName = "",
  dropdownClassName = "",
  optionClassName = "",
}: Props) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((o) => o.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  const handleSelect = (optionValue: string) => {
    if (disabledValues?.has(optionValue)) return;
    onChange(optionValue);
    setOpen(false);
  };

  return (
    <div
      ref={containerRef}
      className={`ph-custom-select ${className}`}
      data-state={open ? "open" : "closed"}
    >
      <button
        type="button"
        id={id}
        aria-label={ariaLabel ?? placeholder}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`ph-custom-select__trigger ${triggerClassName}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="ph-custom-select__trigger-label">{displayLabel}</span>
        <span className="ph-custom-select__arrow" aria-hidden>
          <LuChevronDown size={18} strokeWidth={2} />
        </span>
      </button>

      {open && (
        <div
          className={`ph-custom-select__dropdown ${dropdownClassName}`}
          role="listbox"
          aria-activedescendant={value ? `ph-custom-select-option-${value}` : undefined}
        >
          {options.map((opt) => {
            const disabled = disabledValues?.has(opt.value);
            return (
              <button
                key={opt.value}
                type="button"
                role="option"
                id={opt.value ? `ph-custom-select-option-${opt.value}` : undefined}
                aria-selected={value === opt.value}
                aria-disabled={disabled}
                disabled={disabled}
                className={`ph-custom-select__option ${optionClassName} ${disabled ? "ph-custom-select__option--disabled" : ""}`}
                onClick={() => handleSelect(opt.value)}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
