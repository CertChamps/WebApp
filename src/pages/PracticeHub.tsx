import { useContext, useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { UserContext } from "../context/UserContext";
import useFetch from "../hooks/useFetch";
import { useExamPapers, type ExamPaper } from "../hooks/useExamPapers";
import useFilters from "../hooks/useFilters";
import DeckCard from "../components/decks/deckCard";
import {
  LuPencil,
  LuFileQuestion,
  LuBookOpen,
  LuArrowRight,
  LuSparkles,
  LuChevronDown,
} from "react-icons/lu";
import "../styles/decks.css";
import "../styles/practiceHub.css";

/** Format section id for display (e.g. "sequences-and-series" → "Sequences & Series") */
function formatSectionLabel(id: string): string {
  return id
    .replace(/-/g, " ")
    .replace(/\b(\w)/g, (c) => c.toUpperCase());
}

/** Format subject for display */
function formatSubject(id: string): string {
  return id.charAt(0).toUpperCase() + id.slice(1);
}

export default function PracticeHub() {
  const { user } = useContext(UserContext);
  const navigate = useNavigate();

  const [userDecks, setUserDecks] = useState<any[]>([]);
  const [loadingDecks, setLoadingDecks] = useState(true);

  const { fetchUserDecks } = useFetch();
  const { papers, loading: papersLoading } = useExamPapers();
  const { availableSets, loading: filtersLoading } = useFilters();

  const certChampsSet = useMemo(
    () => availableSets.find((s) => s.id === "certchamps"),
    [availableSets]
  );

  const papersBySubject = useMemo(() => {
    const grouped: Record<string, ExamPaper[]> = {};
    papers.forEach((p) => {
      const key = p.subject ?? "other";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(p);
    });
    Object.keys(grouped).forEach((k) => {
      grouped[k].sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    });
    return grouped;
  }, [papers]);

  useEffect(() => {
    const load = async () => {
      setLoadingDecks(true);
      const decks = await fetchUserDecks(user?.uid ?? "");
      setUserDecks(decks ?? []);
      setLoadingDecks(false);
    };
    load();
  }, [user?.uid, fetchUserDecks]);

  const handleCertChampsAll = () => {
    navigate("/practice/session?mode=certchamps");
  };

  const handleCertChampsTopic = (section: string) => {
    navigate(`/practice/session?mode=certchamps&subject=${section}`);
  };

  const handlePastPaper = (paper: ExamPaper) => {
    navigate(`/practice/session?mode=pastpaper&paperId=${paper.id}`);
  };

  return (
    <div className="practice-hub w-full h-full overflow-y-auto overflow-x-hidden scrollbar-minimal pt-[env(safe-area-inset-top,0px)]">
      {/* Hero: full-height intro with centered text + bouncing arrow */}
      <section className="practice-hub__hero min-h-[100dvh] flex flex-col items-center justify-center relative shrink-0">
        <div className="flex flex-col items-center justify-center text-center px-6">
          <h1 className="color-txt-main text-3xl sm:text-4xl font-bold mb-2">
            Practice Hub
          </h1>
          <p className="color-txt-sub text-base sm:text-lg max-w-md">
            Choose what you want to practice — decks, exam papers, or topics.
          </p>
        </div>
        <button
          type="button"
          onClick={() => document.getElementById("practice-hub-content")?.scrollIntoView({ behavior: "smooth" })}
          className="practice-hub__bounce-arrow absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center justify-center w-12 h-12 rounded-full color-bg-grey-10 color-txt-sub hover:color-bg-accent hover:color-txt-accent transition-colors"
          aria-label="Scroll to content"
        >
          <LuChevronDown size={24} strokeWidth={2} />
        </button>
      </section>

      {/* Scrollable content */}
      <div id="practice-hub-content" className="flex flex-col p-4 pb-8">
      {/* Quick actions: CertChamps all + past paper */}
      <div className="practice-hub__quick grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
        <button
          type="button"
          onClick={handleCertChampsAll}
          className="practice-hub__tile practice-hub__tile--primary"
        >
          <div className="practice-hub__tile-icon">
            <LuSparkles size={28} strokeWidth={2} />
          </div>
          <div className="practice-hub__tile-content flex-1 min-w-0">
            <h3 className="color-txt-main font-semibold text-lg">
              CertChamps Questions
            </h3>
            <p className="color-txt-sub text-sm mt-0.5">
              Random questions across all topics
            </p>
          </div>
          <LuArrowRight className="practice-hub__tile-arrow shrink-0" size={20} />
        </button>

        <button
          type="button"
          onClick={() => navigate("/practice/session?mode=pastpaper")}
          className="practice-hub__tile practice-hub__tile--secondary"
        >
          <div className="practice-hub__tile-icon">
            <LuFileQuestion size={28} strokeWidth={2} />
          </div>
          <div className="practice-hub__tile-content flex-1 min-w-0">
            <h3 className="color-txt-main font-semibold text-lg">
              Past Exam Papers
            </h3>
            <p className="color-txt-sub text-sm mt-0.5">
              Full papers with PDF viewer
            </p>
          </div>
          <LuArrowRight className="practice-hub__tile-arrow shrink-0" size={20} />
        </button>
      </div>

      {/* My Decks */}
      <section className="practice-hub__section mb-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="color-txt-main text-xl font-semibold flex items-center gap-2">
            <LuBookOpen size={22} strokeWidth={2} />
            My Decks
          </h2>
          <button
            type="button"
            onClick={() => navigate("/decks")}
            className="text-sm color-txt-accent hover:underline"
          >
            View all
          </button>
        </div>

        {loadingDecks ? (
          <div className="practice-hub__deck-grid">
            {[...Array(3)].map((_, i) => (
              <div
                key={i}
                className="deck practice-hub__skeleton"
                style={{ minWidth: 280 }}
              >
                <div className="h-full color-bg rounded-2xl animate-pulse" />
              </div>
            ))}
          </div>
        ) : userDecks.length === 0 ? (
          <p className="color-txt-sub text-sm">
            No decks yet. Create one from the{" "}
            <button
              type="button"
              onClick={() => navigate("/decks")}
              className="color-txt-accent hover:underline"
            >
              Decks
            </button>{" "}
            page.
          </p>
        ) : (
          <div className="practice-hub__deck-grid">
            {userDecks.slice(0, 6).map((deck: any) => (
              <DeckCard key={deck.id} deck={deck} />
            ))}
          </div>
        )}
      </section>

      {/* CertChamps by topic */}
      {certChampsSet && certChampsSet.sections.length > 0 && (
        <section className="practice-hub__section mb-8">
          <h2 className="color-txt-main text-xl font-semibold mb-4 flex items-center gap-2">
            <LuPencil size={22} strokeWidth={2} />
            Practice by topic
          </h2>

          {filtersLoading ? (
            <div className="flex flex-wrap gap-2">
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="h-10 w-24 color-bg-grey-5 rounded-lg animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {certChampsSet.sections.map((section) => (
                <button
                  key={section}
                  type="button"
                  onClick={() => handleCertChampsTopic(section)}
                  className="practice-hub__topic-btn"
                >
                  {formatSectionLabel(section)}
                </button>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Exam papers by subject */}
      {papers.length > 0 && (
        <section className="practice-hub__section">
          <h2 className="color-txt-main text-xl font-semibold mb-4">
            Exam papers by subject
          </h2>

          {papersLoading ? (
            <div className="space-y-4">
              {[...Array(2)].map((_, i) => (
                <div
                  key={i}
                  className="h-24 color-bg-grey-5 rounded-xl animate-pulse"
                />
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {Object.entries(papersBySubject).map(([subject, subjectPapers]) => (
                <div key={subject} className="practice-hub__papers-group">
                  <h3 className="color-txt-sub text-sm font-medium mb-2 capitalize">
                    {formatSubject(subject)}
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {subjectPapers.slice(0, 8).map((paper) => (
                      <button
                        key={paper.id}
                        type="button"
                        onClick={() => handlePastPaper(paper)}
                        className="practice-hub__paper-btn"
                      >
                        {paper.label}
                      </button>
                    ))}
                    {subjectPapers.length > 8 && (
                      <span className="color-txt-sub text-sm self-center">
                        +{subjectPapers.length - 8} more
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}
      </div>
    </div>
  );
}
