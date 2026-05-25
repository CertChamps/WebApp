import type { ExamPaper } from "../hooks/useExamPapers";
import ContentProGate, { type ContentProGateProps } from "./ContentProGate";

type PaperProGateProps = Omit<ContentProGateProps, "freePaper"> & {
  /** @deprecated Use `freePaper` */
  firstFreePaper?: ExamPaper | null;
  freePaper?: ExamPaper | null;
};

/** @deprecated Use ContentProGate */
export default function PaperProGate({ firstFreePaper, freePaper, ...rest }: PaperProGateProps) {
  return <ContentProGate freePaper={freePaper ?? firstFreePaper ?? null} {...rest} />;
}

export type { ContentProGateProps };
