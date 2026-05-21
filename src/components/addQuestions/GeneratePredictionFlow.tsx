import { useEffect, useMemo, useRef, useState } from "react";
import { LuSparkles, LuSave, LuRefreshCw } from "react-icons/lu";
import { generatePredictedPaper, resolvePredictionContentType } from "../../lib/predictions/api";
import { savePredictedPaperToFirestore } from "../../lib/predictions/savePredictedPaper";
import { getSubjectLabel } from "../../data/practiceHubSubjects";
import type { PredictedPaperBlueprint } from "../../lib/predictions/types";

type Props = {
  subject: string;
  level: string;
  onSaved?: (paperId: string) => void;
  /** During onboarding tour: save automatically after a successful generate */
  tutorialAutoSave?: boolean;
};

export default function GeneratePredictionFlow({
  subject,
  level,
  onSaved,
  tutorialAutoSave = false,
}: Props) {
  const subjectLabel = getSubjectLabel(subject);
  const contentType = useMemo(() => resolvePredictionContentType(subject), [subject]);
  const isImageSubject = contentType === "image";
  const [paperNumber, setPaperNumber] = useState<1 | 2>(1);
  const [targetYear, setTargetYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blueprint, setBlueprint] = useState<PredictedPaperBlueprint | null>(null);
  const [savedPaperId, setSavedPaperId] = useState<string | null>(null);
  const tutorialSaveStarted = useRef(false);

  const handleSave = async (blueprintToSave: PredictedPaperBlueprint) => {
    setSaving(true);
    setError(null);
    try {
      const paperId = await savePredictedPaperToFirestore(subject, level, blueprintToSave);
      setSavedPaperId(paperId);
      onSaved?.(paperId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!tutorialAutoSave || !blueprint || tutorialSaveStarted.current) return;
    tutorialSaveStarted.current = true;
    void handleSave(blueprint);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once per generated blueprint in tour mode
  }, [tutorialAutoSave, blueprint]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    setSavedPaperId(null);
    try {
      const result = await generatePredictedPaper({
        subject,
        level,
        paperNumber: isImageSubject ? undefined : paperNumber,
        targetYear,
        contentType,
      });
      setBlueprint(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
      setBlueprint(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveClick = async () => {
    if (!blueprint) return;
    await handleSave(blueprint);
  };

  return (
    <div className="max-w-3xl">
      <p className="txt-bold color-txt-main text-sm mb-2">
        Subject: {subjectLabel} · {level === "higher" ? "Higher" : level === "ordinary" ? "Ordinary" : level}
        {contentType === "pastpaper" ? " · Past paper" : " · Image questions"}
      </p>
      <p className="txt-sub color-txt-sub mb-6">
        {isImageSubject ? (
          <>
            Scans image question banks in Storage for {subject} {level}, picks questions from topics
            that appear most often (recent years weighted higher when detectable). Runs in-app — zero
            cost.
          </>
        ) : (
          <>
            Analyses tagged questions from past {subject} {level} papers and assembles a prediction
            paper by picking real questions whose topics appear most often in recent exams. Runs
            entirely in-app — no AI API call, zero cost.
          </>
        )}
      </p>

      <div className="flex flex-wrap gap-4 mb-6">
        {!isImageSubject && (
          <div>
            <label className="block color-txt-sub text-sm mb-1">Paper</label>
            <select
              value={paperNumber}
              onChange={(e) => setPaperNumber(Number(e.target.value) as 1 | 2)}
              className="px-4 py-2 rounded-xl color-bg-grey-5 color-txt-main text-sm"
            >
              <option value={1}>Paper 1</option>
              <option value={2}>Paper 2</option>
            </select>
          </div>
        )}
        <div>
          <label className="block color-txt-sub text-sm mb-1">Target year</label>
          <input
            type="number"
            value={targetYear}
            onChange={(e) => setTargetYear(Number(e.target.value) || new Date().getFullYear())}
            className="px-4 py-2 rounded-xl color-bg-grey-5 color-txt-main text-sm w-28"
          />
        </div>
        <div className="flex items-end">
          <button
            type="button"
            onClick={handleGenerate}
            disabled={loading}
            className="blue-btn !w-auto inline-flex items-center gap-2 px-5 py-2.5 whitespace-nowrap disabled:opacity-50"
          >
            {loading ? (
              <LuRefreshCw size={18} className="animate-spin" aria-hidden />
            ) : (
              <LuSparkles size={18} aria-hidden />
            )}
            {loading ? "Generating…" : "Generate prediction"}
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-red-500/20 text-red-400 text-sm">{error}</div>
      )}

      {savedPaperId && (
        <div className="mb-4 p-3 rounded-xl color-bg-accent/10 color-txt-accent text-sm">
          Saved to{" "}
          <span className="font-mono font-bold">questions/leavingcert/predictions/{savedPaperId}</span>{" "}
          — it will appear in Practice Hub → Predictions.
        </div>
      )}

      {blueprint && (
        <div className="rounded-xl color-bg-grey-5 p-5 space-y-5">
          <div>
            <h3 className="txt-heading-colour text-lg font-bold">{blueprint.label}</h3>
            <p className="txt-sub color-txt-sub mt-2 text-sm">{blueprint.summary}</p>
          </div>

          {blueprint.topicForecast.length > 0 && (
            <div>
              <h4 className="txt-bold color-txt-main text-sm mb-2">Topic forecast</h4>
              <ul className="space-y-2">
                {blueprint.topicForecast.map((t) => (
                  <li key={t.topic} className="text-sm color-txt-sub">
                    <span className="color-txt-main font-medium">{t.topic}</span>
                    <span className="mx-1.5 uppercase text-xs opacity-70">({t.likelihood})</span>
                    — {t.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h4 className="txt-bold color-txt-main text-sm mb-2">
              Selected questions ({blueprint.selections.length})
            </h4>
            <ol className="space-y-2 list-decimal list-inside">
              {blueprint.selections.map((s) => (
                <li key={`${s.slot}-${s.imageKey ?? s.sourceQuestionId}`} className="text-sm color-txt-sub">
                  <span className="color-txt-main font-mono text-xs">
                    {s.sourceTopic && s.imageKey
                      ? `${s.sourceTopic}/${s.imageKey}`
                      : `${s.sourcePaperId}/${s.sourceQuestionId}`}
                  </span>
                  <span className="block pl-5 mt-0.5">{s.reason}</span>
                </li>
              ))}
            </ol>
          </div>

          <button
            type="button"
            onClick={handleSaveClick}
            disabled={saving || !!savedPaperId}
            className="blue-btn !w-auto inline-flex items-center gap-2 px-5 py-2.5 disabled:opacity-50"
          >
            <LuSave size={18} aria-hidden />
            {saving ? "Saving…" : savedPaperId ? "Saved" : "Save to Firestore"}
          </button>
        </div>
      )}
    </div>
  );
}
