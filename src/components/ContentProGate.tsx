import { useNavigate } from "react-router-dom";
import type { ExamPaper } from "../hooks/useExamPapers";
import type { FreeImageSample } from "../lib/contentAccess";
import crownImg from "../assets/images/Ranks/Rank6.png";

export type ContentProGateProps = {
  freePaper?: ExamPaper | null;
  freeImageSample?: FreeImageSample | null;
  asModal?: boolean;
  onClose?: () => void;
  sideContent?: React.ReactNode;
};

/** @deprecated Use ContentProGate */
export type PaperProGateProps = ContentProGateProps;

export default function ContentProGate({
  freePaper,
  freeImageSample,
  asModal,
  onClose,
  sideContent,
}: ContentProGateProps) {
  const navigate = useNavigate();

  const goToFreeSample = () => {
    if (freePaper) {
      const level = freePaper.level ?? "higher";
      navigate(
        `/practice/session?mode=pastpaper&paperId=${encodeURIComponent(freePaper.id)}&level=${encodeURIComponent(level)}&subject=${encodeURIComponent(freePaper.subject ?? "")}`,
        { replace: true }
      );
      return;
    }
    if (freeImageSample) {
      navigate(
        `/practice/session?mode=imagequestions&subject=${encodeURIComponent(freeImageSample.subject)}&level=${encodeURIComponent(freeImageSample.level)}&topic=${encodeURIComponent(freeImageSample.topic)}`,
        { replace: true }
      );
    }
  };

  const goToPayments = () => {
    navigate("/user/manage-account?tab=payments");
  };

  const sampleLabel = freePaper?.label ?? freeImageSample?.label ?? null;

  const card = (
    <div
      className="flex flex-col items-center gap-5 p-8 max-w-xs text-center color-bg rounded-2xl shadow-lg shrink-0"
      onClick={(e) => e.stopPropagation()}
    >
      <img src={crownImg} alt="" className="w-24 h-24 object-contain" />
      <h2 className="text-xl font-bold color-txt-main">CertChamps ACE</h2>
      <p className="color-txt-sub text-sm leading-relaxed">
        Unlock the full library — every subject, paper, and topic. Each subject includes a free sample so you can
        practice before upgrading. ACE also unlocks threads and more.
      </p>
      <div className="flex flex-col gap-3 w-full">
        {sampleLabel && (freePaper || freeImageSample) && (
          <button
            type="button"
            onClick={goToFreeSample}
            className="w-full px-6 py-2.5 rounded-xl font-semibold color-bg-accent color-txt-accent hover:opacity-90 transition-opacity cursor-pointer text-sm"
          >
            Try {sampleLabel}
          </button>
        )}
        <button
          type="button"
          onClick={goToPayments}
          className="w-full px-6 py-2.5 rounded-xl border border-color-border color-txt-main hover:color-bg-grey-10 transition-all cursor-pointer text-sm font-medium"
        >
          Upgrade to ACE
        </button>
      </div>
    </div>
  );

  const outerClass = `${asModal ? "fixed inset-0" : "absolute inset-0"} z-50 flex backdrop-blur-sm ${asModal ? "bg-black/30" : "bg-black/5 rounded-xl"} ${sideContent ? "items-center justify-center p-6" : "flex-col items-center justify-center"}`;

  return (
    <div
      className={outerClass}
      onClick={asModal && onClose ? onClose : undefined}
      role={asModal ? "dialog" : undefined}
      aria-modal={asModal}
    >
      {sideContent ? (
        <div
          className="flex flex-row items-stretch gap-6 h-[calc(100vh-2rem)] min-h-[650px] shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center shrink-0">{card}</div>
          <div
            className="w-[560px] min-h-0 overflow-y-auto overflow-x-hidden pointer-events-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {sideContent}
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center w-full">{card}</div>
      )}
    </div>
  );
}
