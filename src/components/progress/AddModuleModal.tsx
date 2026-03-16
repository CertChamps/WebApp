import { useEffect, useMemo, useState } from "react";
import { LuX, LuChartPie, LuChartBar, LuTable, LuType, LuPenTool, LuSearch } from "react-icons/lu";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import {
  MODULE_TYPE_LABELS,
  MODULE_TYPE_DESCRIPTIONS,
  MODULE_CATEGORIES,
  type ProgressModuleType,
} from "../../hooks/useProgressModules";

type SubjectLevel = { subject: string; level: string };

function formatSubject(s: string): string {
  return s.replace(/-/g, " ").replace(/\b(\w)/g, (c) => c.toUpperCase());
}

function formatLevel(l: string): string {
  return l.charAt(0).toUpperCase() + l.slice(1);
}

const MODULE_ICONS: Record<ProgressModuleType, typeof LuChartPie> = {
  "paper-ring": LuChartPie,
  "paper-bar": LuChartBar,
  "question-heatmap": LuTable,
  "text": LuType,
  "drawing": LuPenTool,
};

const NO_SUBJECT_TYPES: Set<ProgressModuleType> = new Set(["text", "drawing"]);

type Props = {
  onAdd: (type: ProgressModuleType, subject: string, level: string, customSize?: { w: number; h: number }) => void;
  onClose: () => void;
};

const NEEDS_SIZE_PICKER: Set<ProgressModuleType> = new Set(["text", "drawing"]);
const MAX_W = 12;
const MAX_H = 6;

export default function AddModuleModal({ onAdd, onClose }: Props) {
  const [step, setStep] = useState<"type" | "subject" | "size">("type");
  const [selectedType, setSelectedType] = useState<ProgressModuleType | null>(null);
  const [options, setOptions] = useState<SubjectLevel[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [sizeW, setSizeW] = useState(3);
  const [sizeH, setSizeH] = useState(1);
  const [search, setSearch] = useState("");

  const searchLower = search.trim().toLowerCase();

  useEffect(() => {
    let cancelled = false;
    setLoadingOptions(true);

    (async () => {
      try {
        const lcRef = doc(db, "questions", "leavingcert");
        const lcSnap = await getDoc(lcRef);
        const subjects: string[] = Array.isArray(lcSnap.data()?.sections)
          ? lcSnap.data()!.sections
          : [];

        const pairs: SubjectLevel[] = [];
        for (const subId of subjects) {
          if (cancelled) return;
          const subjRef = doc(db, "questions", "leavingcert", "subjects", subId);
          const subjSnap = await getDoc(subjRef);
          let levelIds = (subjSnap.data()?.sections as string[] | undefined) ?? [];
          if (levelIds.length === 0 && (subId === "maths" || subId === "applied-maths")) {
            levelIds = ["higher", "ordinary"];
          }
          for (const level of levelIds) {
            pairs.push({ subject: subId, level });
          }
        }
        if (!cancelled) setOptions(pairs);
      } catch {
        if (!cancelled) setOptions([]);
      } finally {
        if (!cancelled) setLoadingOptions(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const filteredOptions = useMemo(() => {
    if (!searchLower) return options;
    return options.filter(
      (o) =>
        formatSubject(o.subject).toLowerCase().includes(searchLower) ||
        formatLevel(o.level).toLowerCase().includes(searchLower)
    );
  }, [options, searchLower]);

  const filteredTypesByCategory = useMemo(() => {
    const out: Record<string, ProgressModuleType[]> = {};
    for (const [cat, types] of Object.entries(MODULE_CATEGORIES)) {
      const filtered = types.filter((type) => {
        if (!searchLower) return true;
        const label = MODULE_TYPE_LABELS[type].toLowerCase();
        const desc = MODULE_TYPE_DESCRIPTIONS[type].toLowerCase();
        const catLower = cat.toLowerCase();
        return label.includes(searchLower) || desc.includes(searchLower) || catLower.includes(searchLower);
      });
      if (filtered.length > 0) out[cat] = filtered;
    }
    return out;
  }, [searchLower]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden />
      <div
        className="relative z-10 w-full max-w-xl color-bg rounded-2xl shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-5 pb-3 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold color-txt-main">
              {step === "type" ? "Add Module" : step === "size" ? "Pick a Size" : "Pick a Subject"}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg color-txt-sub hover:color-bg-grey-5 transition-colors cursor-pointer"
              aria-label="Close"
            >
              <LuX size={18} />
            </button>
          </div>

          {(step === "type" || step === "subject") && (
            <div className="relative">
              <LuSearch className="absolute left-3 top-1/2 -translate-y-1/2 size-4 color-txt-sub pointer-events-none" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={step === "type" ? "Search modules…" : "Search subjects…"}
                className="w-full pl-9 pr-3 py-2 rounded-xl text-sm color-bg-grey-5 color-txt-main placeholder:color-txt-sub outline-none focus:ring-2 focus:ring-inset focus:ring-offset-0"
                autoComplete="off"
              />
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex flex-col gap-2 max-h-[60vh] overflow-y-auto scrollbar-minimal">
          {step === "type" && Object.keys(filteredTypesByCategory).length === 0 && (
            <p className="text-sm color-txt-sub py-4 text-center">
              No modules match your search.
            </p>
          )}

          {step === "type" &&
            Object.keys(filteredTypesByCategory).length > 0 &&
            Object.entries(filteredTypesByCategory).map(([category, types]) => (
              <div key={category}>
                <h3 className="text-xs font-semibold color-txt-sub uppercase tracking-wide mb-1.5 px-1">
                  {category}
                </h3>
                <div className="flex flex-col gap-1">
                  {types.map((type) => {
                    const Icon = MODULE_ICONS[type];
                    return (
                      <button
                        key={type}
                        type="button"
                        onClick={() => {
                          setSelectedType(type);
                          if (NEEDS_SIZE_PICKER.has(type)) {
                            const defaults = { w: 3, h: 1 };
                            setSizeW(defaults.w);
                            setSizeH(defaults.h);
                            setStep("size");
                            return;
                          }
                          if (NO_SUBJECT_TYPES.has(type)) {
                            onAdd(type, "", "");
                            onClose();
                            return;
                          }
                          setSearch("");
                          setStep("subject");
                        }}
                        className="add-module-option group"
                      >
                        <div className="add-module-option__icon">
                          <Icon size={20} />
                        </div>
                        <div className="flex flex-col gap-0.5 text-left min-w-0">
                          <span className="text-sm font-semibold color-txt-main">
                            {MODULE_TYPE_LABELS[type]}
                          </span>
                          <span className="text-xs color-txt-sub">
                            {MODULE_TYPE_DESCRIPTIONS[type]}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

          {step === "subject" && loadingOptions && (
            <div className="flex flex-col gap-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-12 rounded-xl color-bg-grey-10 animate-pulse" />
              ))}
            </div>
          )}

          {step === "subject" && !loadingOptions && options.length === 0 && (
            <p className="text-sm color-txt-sub py-4 text-center">
              No subjects found.
            </p>
          )}

          {step === "subject" && !loadingOptions && options.length > 0 && filteredOptions.length === 0 && (
            <p className="text-sm color-txt-sub py-4 text-center">
              No subjects match your search.
            </p>
          )}

          {step === "subject" &&
            !loadingOptions &&
            filteredOptions.map((opt) => (
              <button
                key={`${opt.subject}_${opt.level}`}
                type="button"
                onClick={() => {
                  if (selectedType) {
                    onAdd(selectedType, opt.subject, opt.level);
                    onClose();
                  }
                }}
                className="add-module-option"
              >
                <span className="text-sm font-semibold color-txt-main">
                  {formatSubject(opt.subject)}
                </span>
                <span className="text-xs color-txt-sub ml-auto">
                  {formatLevel(opt.level)}
                </span>
              </button>
            ))}

          {step === "size" && (
            <div className="flex flex-col gap-3 py-2">
              <p className="text-sm font-semibold color-txt-main text-center">
                {sizeW} × {sizeH}
              </p>
              <div
                className="grid gap-1 mx-auto"
                style={{ gridTemplateColumns: `repeat(${MAX_W}, 1.125rem)` }}
              >
                {Array.from({ length: MAX_H }, (_, r) =>
                  Array.from({ length: MAX_W }, (_, c) => {
                    const col = c + 1;
                    const row = r + 1;
                    const active = col <= sizeW && row <= sizeH;
                    return (
                      <button
                        key={`${c}-${r}`}
                        type="button"
                        className={`h-[1.125rem] rounded-[3px] transition-colors cursor-pointer ${
                          active ? "color-bg-accent" : "color-bg-grey-10 hover:color-bg-grey-20"
                        }`}
                        onClick={() => { setSizeW(col); setSizeH(row); }}
                      />
                    );
                  })
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  if (selectedType) {
                    onAdd(selectedType, "", "", { w: sizeW, h: sizeH });
                    onClose();
                  }
                }}
                className="w-full py-2.5 rounded-xl text-sm font-semibold color-bg-accent color-txt-accent hover:opacity-90 transition-opacity cursor-pointer"
              >
                Add {selectedType === "drawing" ? `${sizeW} × ${sizeH} Drawing` : `${sizeW} × ${sizeH} Note`}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
