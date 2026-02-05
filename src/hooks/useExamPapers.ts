import { useCallback, useEffect, useState } from "react";
import { getBlob, listAll, ref, type StorageReference } from "firebase/storage";
import { storage } from "../../firebase";

const EXAM_PAPERS_STORAGE_PATH = "exam-papers/maths/LC/higher-level/full-papers";

export type ExamPaper = {
  id: string;
  label: string;
  storagePath: string;
};

function fileRefToPaper(itemRef: StorageReference): ExamPaper {
  const name = itemRef.name;
  const storagePath = itemRef.fullPath;
  const id = storagePath;
  const label = name.replace(/\.pdf$/i, "").replace(/-/g, " ").replace(/\b(\w)/g, (c) => c.toUpperCase());
  return { id, label, storagePath };
}

export function useExamPapers() {
  const [papers, setPapers] = useState<ExamPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const listRef = ref(storage, EXAM_PAPERS_STORAGE_PATH);
    listAll(listRef)
      .then((res) => {
        const list = res.items.map(fileRefToPaper).sort((a, b) => a.label.localeCompare(b.label));
        setPapers(list);
        setError(null);
      })
      .catch((err) => {
        console.error("Failed to list exam papers:", err);
        setError(err?.message ?? "Failed to load papers");
        setPapers([]);
      })
      .finally(() => setLoading(false));
  }, []);

  /** Download paper as Blob for the viewer (avoids CORS; react-pdf accepts Blob). */
  const getPaperBlob = useCallback(async (paper: ExamPaper): Promise<Blob> => {
    const pathRef = ref(storage, paper.storagePath);
    return getBlob(pathRef);
  }, []);

  return { papers, loading, error, getPaperBlob };
}
