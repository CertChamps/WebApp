import type { ImageQuestion } from "../../hooks/useImageQuestions";

type ImageMarkingSchemeProps = {
  images: ImageQuestion[];
  questionName?: string;
  className?: string;
};

/** Renders topic-based marking scheme images from Firebase Storage. */
export default function ImageMarkingScheme({
  images,
  questionName,
  className = "",
}: ImageMarkingSchemeProps) {
  if (images.length === 0) {
    return (
      <div
        className={`flex flex-col items-center justify-center py-12 color-txt-sub text-sm ${className}`}
      >
        No marking scheme available for this question.
      </div>
    );
  }

  return (
    <div className={`flex flex-col overflow-y-auto scrollbar-minimal ${className}`}>
      {questionName && (
        <div className="shrink-0 px-3 py-2 text-center text-sm font-bold color-txt-sub truncate">
          {questionName}
        </div>
      )}
      <div className="flex flex-col items-center gap-4 p-2 w-full">
        {images.map((img, idx) => (
          <img
            key={img.storagePath}
            src={img.downloadUrl}
            alt={idx === 0 ? questionName ?? "Marking scheme" : `${questionName ?? "Marking scheme"} part ${idx + 1}`}
            className="w-full h-auto rounded-lg color-shadow"
            style={{ objectFit: "contain", display: "block" }}
            draggable={false}
          />
        ))}
      </div>
    </div>
  );
}
