import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from "react";
import { LuSparkles, LuSave, LuRefreshCw } from "react-icons/lu";
import { generatePredictedPaper, resolvePredictionContentType } from "../../lib/predictions/api";
import { savePredictedPaperToFirestore } from "../../lib/predictions/savePredictedPaper";
import { getSubjectLabel } from "../../data/practiceHubSubjects";
import type { PredictedPaperBlueprint } from "../../lib/predictions/types";

/** Shared themed select — must be on JSX (not only in CSS @apply) for theme variants. */
export const PREDICTION_SELECT_CLASS =
  "px-4 py-2 rounded-xl color-bg-grey-5 color-txt-main text-sm outline-none min-w-[8rem] focus:ring-2 focus:ring-[var(--accent)]/50";

export type GeneratePredictionFlowHandle = {
  generate: () => void;
  loading: boolean;
};

type Props = {
  subject: string;
  level: string;
  onSaved?: (paperId: string) => void;
  /** Parent renders subject/level/generate row (Practice Hub modal). */
  embeddedControls?: boolean;
  onLoadingChange?: (loading: boolean) => void;
  /** When set with onPaperNumberChange, paper select is rendered by the parent. */
  paperNumber?: 1 | 2;
  onPaperNumberChange?: (paper: 1 | 2) => void;
  /** Called after a prediction blueprint is generated successfully. */
  onBlueprintReady?: () => void;
};

const GeneratePredictionFlow = forwardRef<GeneratePredictionFlowHandle, Props>(
  function GeneratePredictionFlow(
    {
      subject,
      level,
      onSaved,
      embeddedControls = false,
      onLoadingChange,
      paperNumber: paperNumberProp,
      onPaperNumberChange,
      onBlueprintReady,
    },
    ref
  ) {
    const subjectLabel = getSubjectLabel(subject);
    const contentType = useMemo(() => resolvePredictionContentType(subject), [subject]);
    const isImageSubject = contentType === "image";
    const [internalPaperNumber, setInternalPaperNumber] = useState<1 | 2>(1);
    const paperControlled = onPaperNumberChange !== undefined;
    const paperNumber = paperControlled ? (paperNumberProp ?? 1) : internalPaperNumber;
    const setPaperNumber = paperControlled ? onPaperNumberChange : setInternalPaperNumber;
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [blueprint, setBlueprint] = useState<PredictedPaperBlueprint | null>(null);
    const [savedPaperId, setSavedPaperId] = useState<string | null>(null);

    const levelLabel =
      level === "higher" ? "Higher" : level === "ordinary" ? "Ordinary" : level;

    const handleGenerate = async () => {
      setLoading(true);
      setError(null);
      setSavedPaperId(null);
      try {
        const result = await generatePredictedPaper({
          subject,
          level,
          paperNumber: isImageSubject ? undefined : paperNumber,
          contentType,
        });
        setBlueprint(result);
        onBlueprintReady?.();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Generation failed");
        setBlueprint(null);
      } finally {
        setLoading(false);
      }
    };

    useEffect(() => {
      onLoadingChange?.(loading);
    }, [loading, onLoadingChange]);

    useImperativeHandle(ref, () => ({ generate: handleGenerate, loading }), [loading]);

    const handleSave = async () => {
      if (!blueprint) return;
      setSaving(true);
      setError(null);
      try {
        const paperId = await savePredictedPaperToFirestore(subject, level, blueprint);
        setSavedPaperId(paperId);
        onSaved?.(paperId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="prediction-flow color-txt-main">
        {!embeddedControls && (
          <>
            <p className="prediction-flow__meta txt-bold color-txt-main text-sm">
              {subjectLabel} · {levelLabel}
              {contentType === "pastpaper" ? " · Past paper" : " · Image questions"}
            </p>
            <p className="prediction-flow__desc txt-sub color-txt-sub">
              {isImageSubject ? (
                <>
                  Scans image question banks in Storage for {subject} {level}, picks questions from
                  topics that appear most often (recent years weighted higher when detectable). Runs
                  in-app — zero cost.
                </>
              ) : (
                <>
                  Analyses tagged questions from past {subject} {level} papers and assembles a
                  prediction paper by picking real questions whose topics appear most often in recent
                  exams. Runs entirely in-app — no AI API call, zero cost.
                </>
              )}
            </p>

            <div className="prediction-flow__controls-row">
              {!isImageSubject && (
                <div className="prediction-flow__field">
                  <label className="prediction-flow__label color-txt-sub">Paper</label>
                  <select
                    value={paperNumber}
                    onChange={(e) => setPaperNumber(Number(e.target.value) as 1 | 2)}
                    className={PREDICTION_SELECT_CLASS}
                  >
                    <option value={1}>Paper 1</option>
                    <option value={2}>Paper 2</option>
                  </select>
                </div>
              )}
              <button
                type="button"
                onClick={handleGenerate}
                disabled={loading}
                className="blue-btn prediction-flow__generate-btn"
              >
                {loading ? (
                  <LuRefreshCw size={18} className="animate-spin" aria-hidden />
                ) : (
                  <LuSparkles size={18} aria-hidden />
                )}
                {loading ? "Generating…" : "Generate prediction"}
              </button>
            </div>
          </>
        )}

        {embeddedControls && !isImageSubject && !paperControlled && (
          <div className="prediction-flow__controls-row mb-4">
            <div className="prediction-flow__field">
              <label className="prediction-flow__label txt-sub">Paper</label>
              <select
                value={paperNumber}
                onChange={(e) => setPaperNumber(Number(e.target.value) as 1 | 2)}
                className={PREDICTION_SELECT_CLASS}
              >
                <option value={1}>Paper 1</option>
                <option value={2}>Paper 2</option>
              </select>
            </div>
          </div>
        )}

        {embeddedControls && (
          <p className="prediction-flow__desc txt-sub color-txt-sub mb-4">
            {isImageSubject ? (
              <>
                Picks image questions from topics that show up most often in the bank. Runs in-app —
                zero cost.
              </>
            ) : (
              <>
                Analyses past {subjectLabel} {levelLabel} papers and builds a prediction from the
                most common topics. Runs in-app — zero cost.
              </>
            )}
          </p>
        )}

        {error && (
          <div
            className="mb-4 p-3 rounded-xl text-sm bg-red/15 text-red"
            role="alert"
          >
            {error}
          </div>
        )}

        {savedPaperId && (
          <div className="mb-4 p-3 rounded-xl color-bg-accent color-txt-accent text-sm">
            Prediction saved — it will appear in Practice Hub → Predictions.
          </div>
        )}

        {blueprint && (
          <div className="rounded-xl p-5 flex flex-col gap-5 color-bg-grey-5 color-shadow-small">
            <div>
              <h3 className="txt-heading-colour text-lg font-bold">{blueprint.label}</h3>
              <p className="txt-sub color-txt-sub mt-2 text-sm">{blueprint.summary}</p>
            </div>

            {blueprint.topicForecast.length > 0 && (
              <div className="prediction-flow__forecast">
                <h4 className="prediction-flow__section-title txt-bold">Topic forecast</h4>
                <ul className="prediction-flow__forecast-list">
                  {blueprint.topicForecast.map((t) => (
                    <li key={t.topic} className="prediction-flow__forecast-item">
                      <div className="prediction-flow__forecast-header">
                        <span className="prediction-flow__forecast-topic txt-bold">{t.topic}</span>
                        <span className="prediction-flow__forecast-pct color-txt-accent">
                          {t.percent}%
                        </span>
                      </div>
                      <div
                        className="prediction-flow__forecast-track color-bg-grey-10"
                        role="presentation"
                        aria-hidden
                      >
                        <div
                          className="prediction-flow__forecast-fill color-bg-accent"
                          style={{ width: `${Math.min(100, Math.max(0, t.percent))}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div>
              <h4 className="prediction-flow__section-title txt-bold">
                Selected questions ({blueprint.selections.length})
              </h4>
              <ol className="prediction-flow__selection-list">
                {blueprint.selections.map((s) => (
                  <li
                    key={`${s.slot}-${s.imageKey ?? s.sourceQuestionId}`}
                    className="prediction-flow__selection-item color-bg color-shadow-small"
                  >
                    <span className="prediction-flow__selection-name txt-bold">
                      {s.displayName || `Question ${s.slot}`}
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !!savedPaperId}
              className="blue-btn prediction-flow__save-btn"
            >
              <LuSave size={18} aria-hidden />
              {saving ? "Saving…" : savedPaperId ? "Saved" : "Save Prediction"}
            </button>
          </div>
        )}
      </div>
    );
  }
);

export default GeneratePredictionFlow;
