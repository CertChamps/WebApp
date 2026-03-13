import { useEffect, useState } from "react";
import { LuX, LuChartPie, LuGrid3X3, LuTable } from "react-icons/lu";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../firebase";
import {
  MODULE_TYPE_LABELS,
  MODULE_TYPE_DESCRIPTIONS,
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
  "paper-heatmap": LuGrid3X3,
  "question-heatmap": LuTable,
};

type Props = {
  onAdd: (type: ProgressModuleType, subject: string, level: string) => void;
  onClose: () => void;
};

export default function AddModuleModal({ onAdd, onClose }: Props) {
  const [step, setStep] = useState<"type" | "subject">("type");
  const [selectedType, setSelectedType] = useState<ProgressModuleType | null>(null);
  const [options, setOptions] = useState<SubjectLevel[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);

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

  const allTypes = Object.keys(MODULE_TYPE_LABELS) as ProgressModuleType[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-hidden />
      <div
        className="relative z-10 w-full max-w-sm color-bg rounded-2xl shadow-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <h2 className="text-base font-bold color-txt-main">
            {step === "type" ? "Add Module" : "Pick a Subject"}
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

        <div className="px-5 pb-5 flex flex-col gap-2 max-h-[60vh] overflow-y-auto scrollbar-minimal">
          {step === "type" &&
            allTypes.map((type) => {
              const Icon = MODULE_ICONS[type];
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => {
                    setSelectedType(type);
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

          {step === "subject" &&
            !loadingOptions &&
            options.map((opt) => (
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
        </div>
      </div>
    </div>
  );
}
