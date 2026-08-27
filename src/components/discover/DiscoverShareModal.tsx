import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import {
  LuBookOpen,
  LuFileText,
  LuImage,
  LuLink,
  LuLoader,
  LuPlus,
  LuX,
} from "react-icons/lu";
import { db, storage } from "../../../firebase";
import { UserContext } from "../../context/UserContext";
import { SubjectDropdown } from "../practiceHub";
import {
  FAVOURITES_CHANGED_EVENT,
  getFavouriteSubjectIds,
  PRACTICE_HUB_SUBJECTS,
  useSyncedFavouriteSubjectIds,
} from "../../data/practiceHubSubjects";
import { extractYoutubeId, getDiscoverVideoPoster, isDiscoverVideoUrl } from "../../lib/discoverMedia";
import { renderPdfFirstPageJpeg } from "../../lib/discoverPreview";
import { captureWebsiteThumbnailBlob } from "../../lib/discoverCapture";
import type { QuestionDiscoveryContext } from "../../lib/questionDiscovery";

type ResourceType = "Notes" | "Videos" | "Sample Answers" | "Flashcards" | "Website" | "Other";
type ResourceLevel = "Higher" | "Ordinary" | "Foundation";
type ResourceSource = "website" | "pdf";

type LinkPreview = {
  url: string;
  title: string;
  description: string;
  imageUrl: string | null;
  faviconUrl: string | null;
  siteName: string;
};

const MAX_TITLE = 80;
const MAX_DESCRIPTION = 240;
const MAX_THUMBNAIL_BYTES = 2 * 1024 * 1024;
const MAX_PDF_BYTES = 25 * 1024 * 1024;
const LINK_PREVIEW_URL = "https://us-central1-certchamps-a7527.cloudfunctions.net/fetchLinkPreview";
const RESOURCE_TYPES: ResourceType[] = ["Notes", "Videos", "Sample Answers", "Flashcards", "Website", "Other"];
const RESOURCE_LEVELS: ResourceLevel[] = ["Higher", "Ordinary", "Foundation"];
const PLACEHOLDER_TITLES = [
  "My free LC Maths notes",
  "Biology summary sheets",
  "Irish essay starter pack",
  "Chemistry definitions cheatsheet",
  "Free history timeline PDFs",
];

function normaliseUrl(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function displayHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function fallbackPreview(url: string): LinkPreview {
  const parsed = new URL(url);
  const youtubeId = extractYoutubeId(url);
  const hostname = parsed.hostname.replace(/^www\./, "");
  return {
    url,
    title: hostname,
    description: "",
    imageUrl: youtubeId ? `https://img.youtube.com/vi/${youtubeId}/hqdefault.jpg` : null,
    faviconUrl: `${parsed.origin}/favicon.ico`,
    siteName: hostname,
  };
}

export type DiscoverShareModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmitted?: () => void;
  linkedQuestion?: QuestionDiscoveryContext | null;
};

export default function DiscoverShareModal({
  open,
  onClose,
  onSubmitted,
  linkedQuestion = null,
}: DiscoverShareModalProps) {
  const { user } = useContext(UserContext);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [resourceSource, setResourceSource] = useState<ResourceSource>("website");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [shareSubjectId, setShareSubjectId] = useState<string | null>(null);
  const [shareTypes, setShareTypes] = useState<ResourceType[]>(["Notes"]);
  const [shareLevels, setShareLevels] = useState<ResourceLevel[]>([]);
  const [topicDraft, setTopicDraft] = useState("");
  const [shareTopics, setShareTopics] = useState<string[]>([]);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [thumbnailPreview, setThumbnailPreview] = useState<string | null>(null);
  const [linkPreview, setLinkPreview] = useState<LinkPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [websiteShotPreview, setWebsiteShotPreview] = useState<string | null>(null);
  const [websiteShotLoading, setWebsiteShotLoading] = useState(false);
  const websiteShotRef = useRef<{ url: string; blob: Blob } | null>(null);
  const [pdfPreview, setPdfPreview] = useState<string | null>(null);
  const [pdfPreviewLoading, setPdfPreviewLoading] = useState(false);
  const pdfShotRef = useRef<Blob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [, setFavouriteSubjectIds] = useState<string[]>(() => getFavouriteSubjectIds());
  const syncedFavouriteSubjectIds = useSyncedFavouriteSubjectIds();
  const thumbnailInputRef = useRef<HTMLInputElement | null>(null);
  const pdfInputRef = useRef<HTMLInputElement | null>(null);
  const [placeholderTitle] = useState(
    () => PLACEHOLDER_TITLES[Math.floor(Math.random() * PLACEHOLDER_TITLES.length)]
  );

  useEffect(() => {
    const updateFavourites = () => setFavouriteSubjectIds(getFavouriteSubjectIds());
    window.addEventListener(FAVOURITES_CHANGED_EVENT, updateFavourites);
    window.addEventListener("storage", updateFavourites);
    return () => {
      window.removeEventListener(FAVOURITES_CHANGED_EVENT, updateFavourites);
      window.removeEventListener("storage", updateFavourites);
    };
  }, []);

  useEffect(() => {
    setFavouriteSubjectIds(syncedFavouriteSubjectIds);
  }, [syncedFavouriteSubjectIds]);

  const resetForm = () => {
    setTitle("");
    setDescription("");
    setResourceSource("website");
    setWebsiteUrl("");
    setPdfFile(null);
    setShareSubjectId(linkedQuestion?.subjectId ?? null);
    setShareTypes(["Notes"]);
    setShareLevels(
      linkedQuestion?.level && RESOURCE_LEVELS.includes(linkedQuestion.level as ResourceLevel)
        ? [linkedQuestion.level as ResourceLevel]
        : []
    );
    setTopicDraft("");
    setShareTopics(linkedQuestion?.topic ? [linkedQuestion.topic.replace(/^#/, "")] : []);
    setThumbnailFile(null);
    setThumbnailPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    if (thumbnailInputRef.current) thumbnailInputRef.current.value = "";
    if (pdfInputRef.current) pdfInputRef.current.value = "";
    setLinkPreview(null);
    setPreviewLoading(false);
    websiteShotRef.current = null;
    setWebsiteShotPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setWebsiteShotLoading(false);
    pdfShotRef.current = null;
    setPdfPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    setPdfPreviewLoading(false);
    setFormError(null);
  };

  useEffect(() => {
    if (!open) return;
    resetForm();
    // Seed defaults when the modal opens for this question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, linkedQuestion?.id]);

  const fetchLinkPreview = async (validUrl: string): Promise<LinkPreview> => {
    setPreviewLoading(true);
    setFormError(null);
    try {
      const response = await fetch(LINK_PREVIEW_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: validUrl }),
      });
      if (!response.ok) throw new Error("Preview request failed");
      const data = (await response.json()) as LinkPreview;
      const preview = {
        ...fallbackPreview(validUrl),
        ...data,
        url: data.url || validUrl,
      };
      setLinkPreview(preview);
      setTitle((current) => (current.trim() ? current : preview.title.slice(0, MAX_TITLE)));
      setDescription((current) => (current.trim() ? current : preview.description.slice(0, MAX_DESCRIPTION)));
      return preview;
    } catch {
      const preview = fallbackPreview(validUrl);
      setLinkPreview(preview);
      setTitle((current) => (current.trim() ? current : preview.title.slice(0, MAX_TITLE)));
      return preview;
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (!open || resourceSource !== "website") {
      setLinkPreview(null);
      setPreviewLoading(false);
      return;
    }
    const validUrl = normaliseUrl(websiteUrl);
    if (!validUrl) {
      setLinkPreview(null);
      setPreviewLoading(false);
      return;
    }

    setPreviewLoading(true);
    const timeout = window.setTimeout(() => {
      void fetchLinkPreview(validUrl);
    }, 700);

    return () => window.clearTimeout(timeout);
  }, [open, resourceSource, websiteUrl]);

  useEffect(() => {
    if (!open || resourceSource !== "website" || !linkPreview?.url || isDiscoverVideoUrl(linkPreview.url)) {
      websiteShotRef.current = null;
      setWebsiteShotLoading(false);
      setWebsiteShotPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      return;
    }

    const previewUrl = linkPreview.url;
    const abort = new AbortController();
    let objectUrl: string | null = null;
    websiteShotRef.current = null;
    setWebsiteShotLoading(true);
    const loadShot = async () => {
      let blob: Blob | null = null;
      try {
        blob = await captureWebsiteThumbnailBlob(previewUrl, abort.signal);
      } catch {
        blob = null;
      }
      if (abort.signal.aborted) return;

      if (!blob) {
        try {
          const parsed = new URL(previewUrl);
          if (/\.pdf$/i.test(parsed.pathname)) {
            const response = await fetch(previewUrl, { signal: abort.signal });
            if (response.ok) {
              blob = await renderPdfFirstPageJpeg(await response.blob());
            }
          }
        } catch {
          blob = null;
        }
      }
      if (abort.signal.aborted || !blob) {
        if (!abort.signal.aborted) setWebsiteShotLoading(false);
        return;
      }
      websiteShotRef.current = { url: previewUrl, blob };
      objectUrl = URL.createObjectURL(blob);
      setWebsiteShotPreview(objectUrl);
      setWebsiteShotLoading(false);
    };

    loadShot().catch(() => {
      if (!abort.signal.aborted) setWebsiteShotLoading(false);
    });

    return () => {
      abort.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, resourceSource, linkPreview?.url]);

  useEffect(() => {
    if (!open || resourceSource !== "pdf" || !pdfFile) {
      pdfShotRef.current = null;
      setPdfPreviewLoading(false);
      setPdfPreview((current) => {
        if (current) URL.revokeObjectURL(current);
        return null;
      });
      return;
    }

    let objectUrl: string | null = null;
    let cancelled = false;
    setPdfPreviewLoading(true);
    renderPdfFirstPageJpeg(pdfFile)
      .then((jpeg) => {
        if (cancelled) return;
        if (!jpeg) {
          setPdfPreviewLoading(false);
          return;
        }
        pdfShotRef.current = jpeg;
        objectUrl = URL.createObjectURL(jpeg);
        setPdfPreview(objectUrl);
        setPdfPreviewLoading(false);
      })
      .catch(() => {
        if (!cancelled) setPdfPreviewLoading(false);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, resourceSource, pdfFile]);

  const closeForm = () => {
    if (submitting) return;
    resetForm();
    onClose();
  };

  const handleSubmit = async () => {
    if (!user?.uid) {
      setFormError("You must be logged in to share notes.");
      return;
    }
    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();
    const validUrl = resourceSource === "website" ? normaliseUrl(websiteUrl) ?? "" : "";
    const topics = shareTopics.slice(0, 8);
    const shareSubject = shareSubjectId
      ? PRACTICE_HUB_SUBJECTS.find((subject) => subject.id === shareSubjectId)
      : null;

    if (!trimmedTitle) {
      setFormError("Add a title so people know what your notes are about.");
      return;
    }
    if (trimmedTitle.length > MAX_TITLE) {
      setFormError(`Title is too long (max ${MAX_TITLE} characters).`);
      return;
    }
    if (trimmedDescription.length > MAX_DESCRIPTION) {
      setFormError(`Description is too long (max ${MAX_DESCRIPTION} characters).`);
      return;
    }
    if (resourceSource === "website" && !validUrl) {
      setFormError("Add a valid link (https://...) for people to visit.");
      return;
    }
    if (resourceSource === "pdf" && !pdfFile) {
      setFormError("Choose a PDF to upload.");
      return;
    }
    if (!shareSubject) {
      setFormError("Choose the subject this resource is for.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    let uploadedThumbnailPath: string | null = null;
    let uploadedPdfPath: string | null = null;
    let listingThumbnailPath: string | null = null;
    try {
      const preview = resourceSource === "website"
        ? (linkPreview?.url === validUrl ? linkPreview : await fetchLinkPreview(validUrl))
        : null;
      let resourceUrl = preview?.url || validUrl;
      if (resourceSource === "pdf" && pdfFile) {
        const safePdfName = pdfFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        uploadedPdfPath = `discover-pdf-uploads/${user.uid}/${Date.now()}-${safePdfName}`;
        const pdfRef = storageRef(storage, uploadedPdfPath);
        await uploadBytes(pdfRef, pdfFile, { contentType: "application/pdf" });
        resourceUrl = await getDownloadURL(pdfRef);
      }
      let uploadedThumbnailUrl = "";
      if (thumbnailFile) {
        const safeName = thumbnailFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        uploadedThumbnailPath = `discover-thumbnail-uploads/${user.uid}/${Date.now()}-${safeName}`;
        const fileRef = storageRef(storage, uploadedThumbnailPath);
        await uploadBytes(fileRef, thumbnailFile);
        uploadedThumbnailUrl = await getDownloadURL(fileRef);
      }

      let listingThumbnailUrl = preview?.imageUrl ?? "";
      if (resourceSource === "website" && validUrl && !isDiscoverVideoUrl(validUrl)) {
        try {
          const cached = websiteShotRef.current;
          const shot =
            cached?.url === (preview?.url || validUrl)
              ? cached.blob
              : await captureWebsiteThumbnailBlob(preview?.url || validUrl);
          if (shot) {
            listingThumbnailPath = `discover-thumbnail-uploads/${user.uid}/${Date.now()}-preview.jpg`;
            await uploadBytes(storageRef(storage, listingThumbnailPath), shot, {
              contentType: shot.type || "image/jpeg",
            });
            listingThumbnailUrl = await getDownloadURL(storageRef(storage, listingThumbnailPath));
          }
        } catch (err) {
          console.warn("Failed to capture website preview thumbnail:", err);
        }
      }
      if (resourceSource === "pdf" && pdfFile) {
        try {
          const pageJpeg = pdfShotRef.current ?? await renderPdfFirstPageJpeg(pdfFile);
          if (pageJpeg) {
            listingThumbnailPath = `discover-thumbnail-uploads/${user.uid}/${Date.now()}-preview.jpg`;
            await uploadBytes(storageRef(storage, listingThumbnailPath), pageJpeg, {
              contentType: "image/jpeg",
            });
            listingThumbnailUrl = await getDownloadURL(storageRef(storage, listingThumbnailPath));
          }
        } catch (err) {
          console.warn("Failed to generate PDF preview thumbnail:", err);
        }
      }

      await addDoc(collection(db, "discover-notes"), {
        userId: user.uid,
        username: user.username ?? "",
        userPicture: user.picture ?? null,
        title: trimmedTitle,
        description: trimmedDescription,
        websiteUrl: resourceUrl,
        resourceSource,
        pdfPath: uploadedPdfPath,
        pdfFileName: resourceSource === "pdf" ? pdfFile?.name ?? "" : "",
        thumbnailUrl: listingThumbnailUrl,
        thumbnailPath: listingThumbnailPath,
        uploadedThumbnailUrl,
        uploadedThumbnailPath,
        thumbnailStatus: thumbnailFile ? "pending" : "none",
        moderationStatus: "pending",
        faviconUrl: preview?.faviconUrl ?? "",
        siteName: resourceSource === "pdf"
          ? pdfFile?.name ?? "PDF"
          : preview?.siteName ?? displayHostname(validUrl),
        subjectId: shareSubject.id,
        subjectLabel: shareSubject.label,
        levels: shareLevels,
        resourceTypes: shareTypes,
        resourceType: shareTypes[0] ?? "Notes",
        topics,
        likeCount: 0,
        commentCount: 0,
        ratingAverage: 0,
        ratingCount: 0,
        linkedQuestionId: linkedQuestion?.id ?? null,
        linkedQuestionName: linkedQuestion?.name ?? null,
        linkedQuestionPracticeUrl: linkedQuestion?.practiceUrl ?? null,
        linkedQuestionSubjectId: linkedQuestion?.subjectId ?? null,
        linkedQuestionSubjectLabel: linkedQuestion?.subjectLabel ?? null,
        linkedQuestionLevel: linkedQuestion?.level ?? null,
        linkedQuestionTopic: linkedQuestion?.topic ?? null,
        linkedQuestionSource: linkedQuestion?.source ?? null,
        timestamp: serverTimestamp(),
      });

      resetForm();
      onClose();
      onSubmitted?.();
    } catch (e: unknown) {
      console.error("Failed to publish discover note:", e);
      const message = e instanceof Error ? e.message : "Couldn't publish. Try again in a moment.";
      setFormError(message);
      if (uploadedThumbnailPath) {
        try {
          await deleteObject(storageRef(storage, uploadedThumbnailPath));
        } catch {
          // ignore cleanup failure
        }
      }
      if (listingThumbnailPath) {
        try {
          await deleteObject(storageRef(storage, listingThumbnailPath));
        } catch {
          // ignore cleanup failure
        }
      }
      if (uploadedPdfPath) {
        try {
          await deleteObject(storageRef(storage, uploadedPdfPath));
        } catch {
          // ignore cleanup failure
        }
      }
    } finally {
      setSubmitting(false);
    }
  };

  const toggleShareType = (type: ResourceType) => {
    setShareTypes((current) => {
      if (current.includes(type)) {
        const next = current.filter((item) => item !== type);
        return next.length > 0 ? next : current;
      }
      return [...current, type];
    });
  };

  const toggleShareLevel = (level: ResourceLevel) => {
    setShareLevels((current) =>
      current.includes(level)
        ? current.filter((item) => item !== level)
        : [...current, level]
    );
  };

  const addTopicsFromDraft = () => {
    const nextTopics = topicDraft
      .split(/[,\s]+/)
      .map((topic) => topic.trim().replace(/^#/, ""))
      .filter(Boolean)
      .map((topic) => topic.replace(/\s+/g, "-"))
      .slice(0, 8);
    if (nextTopics.length === 0) return;
    setShareTopics((current) => [...new Set([...current, ...nextTopics])].slice(0, 8));
    setTopicDraft("");
  };

  const removeShareTopic = (topic: string) => {
    setShareTopics((current) => current.filter((item) => item !== topic));
  };

  const chooseResourceSource = (source: ResourceSource) => {
    setResourceSource(source);
    setFormError(null);
    if (source === "website") {
      setPdfFile(null);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    } else {
      setWebsiteUrl("");
      setLinkPreview(null);
    }
  };

  const handlePickPdf = (file: File | undefined | null) => {
    if (!file) return;
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    if (!isPdf) {
      setPdfFile(null);
      setFormError("Choose a PDF file.");
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setPdfFile(null);
      setFormError("PDF must be under 25 MB.");
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      return;
    }
    setPdfFile(file);
    setFormError(null);
    setTitle((current) => current.trim()
      ? current
      : file.name.replace(/\.pdf$/i, "").replace(/[_-]+/g, " ").slice(0, MAX_TITLE));
  };

  const handlePickThumbnail = (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFormError("Thumbnail must be an image.");
      return;
    }
    if (file.size > MAX_THUMBNAIL_BYTES) {
      setFormError("Thumbnail must be under 2 MB.");
      return;
    }
    setFormError(null);
    setThumbnailFile(file);
    setThumbnailPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return URL.createObjectURL(file);
    });
  };

  const clearThumbnailUpload = () => {
    setThumbnailFile(null);
    setThumbnailPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
    if (thumbnailInputRef.current) thumbnailInputRef.current.value = "";
  };

  const shareWebsiteUrl = resourceSource === "website" ? normaliseUrl(websiteUrl) : null;
  const matchingLinkPreview = shareWebsiteUrl && linkPreview?.url === shareWebsiteUrl ? linkPreview : null;
  const formPreviewReady = resourceSource === "website" ? Boolean(shareWebsiteUrl) : Boolean(pdfFile);
  const generatedFormPreview =
    (resourceSource === "pdf" ? pdfPreview : null)
    || (shareWebsiteUrl && websiteShotRef.current?.url === shareWebsiteUrl ? websiteShotPreview : null)
    || (shareWebsiteUrl ? getDiscoverVideoPoster(shareWebsiteUrl) : null)
    || matchingLinkPreview?.imageUrl
    || null;
  const formPreviewSrc = thumbnailPreview || generatedFormPreview;
  const formPreviewLoading =
    formPreviewReady
    && !thumbnailPreview
    && (resourceSource === "website" ? previewLoading || websiteShotLoading : pdfPreviewLoading);

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-3 sm:p-6 bg-black/50 backdrop-blur-sm"
      onClick={closeForm}
    >
      <div
        className="flex h-[min(920px,92vh)] w-full max-w-6xl flex-col overflow-hidden rounded-2xl color-bg shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-4 px-6 pt-6 pb-4">
          <h2 className="text-xl font-bold color-txt-main">
            Share a free resource
          </h2>
          <button
            type="button"
            onClick={closeForm}
            className="color-txt-sub hover:color-txt-main cursor-pointer"
            aria-label="Close"
          >
            <LuX size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto scrollbar-minimal px-6">
          {linkedQuestion && (
            <div className="mb-5 rounded-2xl color-bg-accent px-4 py-3">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide color-txt-accent">
                <LuLink size={14} /> Linking to this question
              </p>
              <p className="mt-1 text-sm font-bold color-txt-main">{linkedQuestion.name}</p>
            </div>
          )}

          <div className="space-y-5 pb-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
                placeholder={placeholderTitle}
                className="w-full rounded-xl color-bg-grey-5 color-txt-main px-4 py-3 text-sm outline-none placeholder:color-txt-sub"
              />
              <p className="text-[11px] color-txt-sub text-right">
                {title.length}/{MAX_TITLE}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION))}
                placeholder="What's in the resource? Which subjects and topics does it cover?"
                rows={4}
                className="w-full rounded-xl color-bg-grey-5 color-txt-main px-4 py-3 text-sm outline-none resize-none placeholder:color-txt-sub"
              />
              <p className="text-[11px] color-txt-sub text-right">
                {description.length}/{MAX_DESCRIPTION}
              </p>
            </div>

            <div className="relative z-20 space-y-2">
              <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                Subject
              </label>
              <SubjectDropdown
                id="discover-share-subject"
                value={shareSubjectId}
                onChange={setShareSubjectId}
                onFavouritesChange={setFavouriteSubjectIds}
                aria-label="Choose resource subject"
                variant="list"
                dropdownAlign="start"
              />
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-8">
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                    Source
                  </label>
                  <div className="grid grid-cols-2 gap-1 rounded-xl color-bg-grey-5 p-1">
                    <button
                      type="button"
                      onClick={() => chooseResourceSource("website")}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                        resourceSource === "website"
                          ? "color-bg color-txt-main shadow-sm"
                          : "color-txt-sub hover:color-txt-main"
                      }`}
                    >
                      <LuLink size={16} />
                      Link
                    </button>
                    <button
                      type="button"
                      onClick={() => chooseResourceSource("pdf")}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                        resourceSource === "pdf"
                          ? "color-bg color-txt-main shadow-sm"
                          : "color-txt-sub hover:color-txt-main"
                      }`}
                    >
                      <LuFileText size={16} />
                      PDF
                    </button>
                  </div>
                </div>

                {resourceSource === "website" ? (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                      Paste the link
                    </label>
                    <div className="flex items-center gap-2 rounded-xl color-bg-grey-5 px-4 py-3">
                      <LuLink size={16} className="color-txt-sub shrink-0" />
                      <input
                        type="url"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        placeholder="https://free-notes-site.com"
                        className="flex-1 bg-transparent color-txt-main text-sm outline-none placeholder:color-txt-sub"
                      />
                      {previewLoading && <LuLoader size={16} className="animate-spin color-txt-sub" />}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                      Upload a PDF
                    </label>
                    <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-color-border color-bg-grey-5 px-4 py-5 text-center hover:opacity-90">
                      <LuFileText size={26} className="color-txt-sub" />
                      <span className="max-w-full truncate text-sm font-semibold color-txt-main">
                        {pdfFile?.name ?? "Choose a PDF"}
                      </span>
                      <span className="text-xs color-txt-sub">PDF only, up to 25 MB</span>
                      <input
                        ref={pdfInputRef}
                        type="file"
                        accept="application/pdf,.pdf"
                        className="hidden"
                        onChange={(e) => handlePickPdf(e.target.files?.[0])}
                      />
                    </label>
                  </div>
                )}
              </div>

              <div className="space-y-2 lg:min-h-[420px]">
                <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                  Thumbnail
                </label>
                <div className="group relative flex h-full min-h-[240px] overflow-hidden rounded-2xl color-bg-grey-5 lg:min-h-[420px]">
                  {formPreviewSrc ? (
                    <img
                      src={formPreviewSrc}
                      alt=""
                      className="h-full w-full object-cover object-top"
                    />
                  ) : (
                    <div className="flex h-full min-h-[240px] w-full flex-col items-center justify-center gap-2 px-6 text-center color-txt-sub lg:min-h-[420px]">
                      {formPreviewLoading ? (
                        <LuLoader size={28} className="animate-spin" />
                      ) : resourceSource === "pdf" ? (
                        <LuFileText size={36} />
                      ) : (
                        <LuBookOpen size={36} />
                      )}
                      <span className="text-sm font-semibold">
                        {formPreviewLoading
                          ? "Generating preview…"
                          : formPreviewReady
                            ? "Preview unavailable"
                            : "Paste a link or upload a PDF to generate a preview"}
                      </span>
                    </div>
                  )}
                  {formPreviewLoading && formPreviewSrc && (
                    <div className="absolute inset-0 flex items-center justify-center color-bg/40 pointer-events-none">
                      <LuLoader size={22} className="animate-spin color-txt-sub" />
                    </div>
                  )}
                  {formPreviewReady && (
                    <>
                      <button
                        type="button"
                        onClick={() => thumbnailInputRef.current?.click()}
                        className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/55 opacity-0 transition-opacity group-hover:opacity-100 cursor-pointer"
                      >
                        <LuImage size={28} className="text-white" />
                        <span className="text-sm font-semibold text-white">
                          Upload custom thumbnail
                        </span>
                      </button>
                      {thumbnailPreview && (
                        <button
                          type="button"
                          onClick={clearThumbnailUpload}
                          className="absolute right-3 top-3 z-10 rounded-full color-bg px-3 py-1 text-xs font-semibold color-txt-main cursor-pointer"
                        >
                          Use generated preview
                        </button>
                      )}
                      <input
                        ref={thumbnailInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handlePickThumbnail(e.target.files?.[0])}
                      />
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-5 pb-6 md:grid-cols-3">
              <div className="space-y-2">
                <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                  Type
                </label>
                <div className="flex flex-wrap gap-2">
                  {RESOURCE_TYPES.map((type) => (
                    <button
                      type="button"
                      key={type}
                      onClick={() => toggleShareType(type)}
                      className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                        shareTypes.includes(type)
                          ? "color-bg-accent color-txt-accent"
                          : "color-bg-grey-5 color-txt-main hover:opacity-90"
                      }`}
                    >
                      {type}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                  Level
                </label>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setShareLevels([])}
                    className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                      shareLevels.length === 0
                        ? "color-bg-accent color-txt-accent"
                        : "color-bg-grey-5 color-txt-main hover:opacity-90"
                    }`}
                  >
                    All levels
                  </button>
                  {RESOURCE_LEVELS.map((level) => (
                    <button
                      type="button"
                      key={level}
                      onClick={() => toggleShareLevel(level)}
                      className={`px-3 py-2 rounded-xl text-sm font-semibold transition-colors cursor-pointer ${
                        shareLevels.includes(level)
                          ? "color-bg-accent color-txt-accent"
                          : "color-bg-grey-5 color-txt-main hover:opacity-90"
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold color-txt-sub uppercase tracking-wide">
                  Topics
                </label>
                <div className="flex items-center gap-2 rounded-xl color-bg-grey-5 px-3 py-2">
                  <span className="text-sm color-txt-sub">#</span>
                  <input
                    type="text"
                    value={topicDraft}
                    onChange={(e) => setTopicDraft(e.target.value)}
                    onBlur={addTopicsFromDraft}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === "," || e.key === " ") {
                        e.preventDefault();
                        addTopicsFromDraft();
                      }
                    }}
                    placeholder="macbeth"
                    className="flex-1 bg-transparent color-txt-main text-sm outline-none placeholder:color-txt-sub"
                  />
                </div>
                {shareTopics.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {shareTopics.map((topic) => (
                      <button
                        type="button"
                        key={topic}
                        onClick={() => removeShareTopic(topic)}
                        className="px-2.5 py-1 rounded-full color-bg-grey-5 color-txt-sub text-xs font-semibold hover:color-txt-main cursor-pointer"
                      >
                        #{topic}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-color-border px-6 py-4">
          {formError && (
            <p className="mr-auto text-sm text-red-500">{formError}</p>
          )}
          <button
            type="button"
            onClick={closeForm}
            disabled={submitting}
            className="px-4 py-2 rounded-xl text-sm color-txt-sub hover:color-txt-main transition-colors cursor-pointer disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl color-bg-accent color-txt-accent font-semibold text-sm hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <LuLoader size={16} className="animate-spin" />
                Publishing...
              </>
            ) : (
              <>
                <LuPlus size={16} />
                Publish
              </>
            )}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
