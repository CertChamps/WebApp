import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { deleteObject, getDownloadURL, ref as storageRef, uploadBytes } from "firebase/storage";
import {
  LuBookOpen,
  LuChevronDown,
  LuFileText,
  LuImage,
  LuLink,
  LuLoader,
  LuPlus,
  LuSearch,
} from "react-icons/lu";
import { db, storage } from "../../../firebase";
import { UserContext } from "../../context/UserContext";
import { SubjectDropdown } from "../practiceHub";
import {
  PRACTICE_HUB_SUBJECTS,
  FAVOURITES_CHANGED_EVENT,
  getFavouriteSubjectIds,
  useSyncedFavouriteSubjectIds,
} from "../../data/practiceHubSubjects";
import { extractYoutubeId, getDiscoverVideoPoster, isDiscoverVideoUrl } from "../../lib/discoverMedia";
import { renderPdfFirstPageJpeg } from "../../lib/discoverPreview";
import { captureWebsiteThumbnailBlob } from "../../lib/discoverCapture";
import type { QuestionDiscoveryContext } from "../../lib/questionDiscovery";
import { incomingShareDisplayName, incomingShareFile, type NativeIncomingShare } from "../../lib/nativeShareIntake";
import { linkedQuestionsPayload } from "../../lib/discoverLinks";
import { discoverTopicUrl, useDiscoverTopics } from "../../hooks/useDiscoverTopics";
import { documentContentType, isPdfDocument, resourceFormat, RESOURCE_TYPES, type ResourceType } from "../../lib/discoverClassification";
import Modal from "../modals/Modal";

type ResourceLevel = "Higher" | "Ordinary" | "Foundation";
type ResourceSource = "website" | "document";

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
  initialShare?: NativeIncomingShare | null;
};

export default function DiscoverShareModal({
  open,
  onClose,
  onSubmitted,
  linkedQuestion = null,
  initialShare = null,
}: DiscoverShareModalProps) {
  const { user } = useContext(UserContext);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [resourceSource, setResourceSource] = useState<ResourceSource>("website");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [shareSubjectId, setShareSubjectId] = useState<string | null>(null);
  const [shareType, setShareType] = useState<ResourceType>("Revision Notes");
  const [shareLevels, setShareLevels] = useState<ResourceLevel[]>([]);
  const [levelChosen, setLevelChosen] = useState(false);
  const [openSelection, setOpenSelection] = useState<"level" | "topics" | null>(null);
  const selectionRef = useRef<HTMLDivElement | null>(null);
  const selectionPopupRef = useRef<HTMLDivElement | null>(null);
  const levelTriggerRef = useRef<HTMLButtonElement | null>(null);
  const topicTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [selectionPosition, setSelectionPosition] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const [topicSearch, setTopicSearch] = useState("");
  const [shareTopicIds, setShareTopicIds] = useState<string[]>([]);
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
  const { topics: availableTopics, loading: topicsLoading, error: topicsError } = useDiscoverTopics(
    shareSubjectId,
    shareLevels
  );
  const selectedTopics = availableTopics.filter((topic) => shareTopicIds.includes(topic.id));
  const visibleTopics = availableTopics.filter((topic) => topic.label.toLowerCase().includes(topicSearch.trim().toLowerCase()));

  useEffect(() => {
    if (!openSelection) return;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!selectionRef.current?.contains(event.target as Node)
        && !selectionPopupRef.current?.contains(event.target as Node)) setOpenSelection(null);
    };
    document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [openSelection]);

  useEffect(() => {
    if (!openSelection) {
      setSelectionPosition(null);
      setTopicSearch("");
      return;
    }
    const updatePosition = () => {
      const trigger = (openSelection === "level" ? levelTriggerRef : topicTriggerRef).current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const panel = trigger.closest(".app-modal-panel");
      const panelRect = panel?.getBoundingClientRect();
      const topEdge = Math.max(8, (panelRect?.top ?? 0) + 12);
      const bottomEdge = Math.min(window.innerHeight - 8, (panelRect?.bottom ?? window.innerHeight) - 12);
      const desiredHeight = openSelection === "topics" ? 280 : 220;
      const below = Math.max(0, bottomEdge - rect.bottom - 4);
      const above = Math.max(0, rect.top - topEdge - 4);
      const placeAbove = below < Math.min(desiredHeight, 180) && above > below;
      const maxHeight = Math.min(desiredHeight, placeAbove ? above : below);
      setSelectionPosition({
        top: placeAbove ? rect.top - maxHeight - 4 : rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        maxHeight,
      });
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [openSelection]);

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
    setShareType("Revision Notes");
    setShareLevels(
      linkedQuestion?.level && RESOURCE_LEVELS.includes(linkedQuestion.level as ResourceLevel)
        ? [linkedQuestion.level as ResourceLevel]
        : []
    );
    setLevelChosen(Boolean(linkedQuestion?.level));
    setOpenSelection(null);
    setShareTopicIds(linkedQuestion?.topic ? [linkedQuestion.topic.replace(/^#/, "")] : []);
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
    if (initialShare?.kind === "url" && initialShare.url) {
      setResourceSource("website");
      setWebsiteUrl(initialShare.url);
      setTitle(initialShare.title?.slice(0, MAX_TITLE) ?? "");
      setDescription(initialShare.description?.slice(0, MAX_DESCRIPTION) ?? "");
      return;
    }
    if (initialShare?.kind === "image") {
      setFormError("Discover doesn’t accept image uploads yet — share a PDF or a link instead.");
      return;
    }
    if (initialShare?.kind === "pdf") {
      let cancelled = false;
      void incomingShareFile(initialShare)
        .then((file) => {
          if (cancelled) return;
          setTitle(incomingShareDisplayName(initialShare, file).slice(0, MAX_TITLE));
          setDescription(initialShare.description?.slice(0, MAX_DESCRIPTION) ?? "");
          setResourceSource("document");
          setPdfFile(file);
        })
        .catch((error) => {
          if (!cancelled) {
            setFormError(error instanceof Error ? error.message : "The shared file could not be opened.");
          }
        });
      return () => {
        cancelled = true;
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, linkedQuestion?.id, initialShare?.id]);

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
    if (!open || resourceSource !== "document" || !pdfFile || !isPdfDocument(pdfFile.name)) {
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
    const topics = selectedTopics;
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
    if (resourceSource === "document" && !pdfFile) {
      setFormError("Choose a document to upload.");
      return;
    }
    if (pdfFile && !documentContentType(pdfFile)) {
      setFormError("Choose a PDF, DOCX or PowerPoint file.");
      return;
    }
    if (!shareSubject) {
      setFormError("Choose the subject this resource is for.");
      return;
    }
    if (!levelChosen) {
      setFormError("Choose a level, or select All levels.");
      return;
    }
    const authorUid = user.uid;
    const authorUsername = user.username ?? "";
    const authorPicture: string | null = user.picture ?? null;

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
      if (resourceSource === "document" && pdfFile) {
        const safePdfName = pdfFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        uploadedPdfPath = `discover-pdf-uploads/${authorUid}/${Date.now()}-${safePdfName}`;
        const pdfRef = storageRef(storage, uploadedPdfPath);
        await uploadBytes(pdfRef, pdfFile, { contentType: documentContentType(pdfFile) ?? "application/octet-stream" });
        resourceUrl = await getDownloadURL(pdfRef);
      }
      let uploadedThumbnailUrl = "";
      if (thumbnailFile) {
        const safeName = thumbnailFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
        uploadedThumbnailPath = `discover-thumbnail-uploads/${authorUid}/${Date.now()}-${safeName}`;
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
            listingThumbnailPath = `discover-thumbnail-uploads/${authorUid}/${Date.now()}-preview.jpg`;
            await uploadBytes(storageRef(storage, listingThumbnailPath), shot, {
              contentType: shot.type || "image/jpeg",
            });
            listingThumbnailUrl = await getDownloadURL(storageRef(storage, listingThumbnailPath));
          }
        } catch (err) {
          console.warn("Failed to capture website preview thumbnail:", err);
        }
      }
      if (resourceSource === "document" && pdfFile && isPdfDocument(pdfFile.name)) {
        try {
          const pageJpeg = pdfShotRef.current ?? await renderPdfFirstPageJpeg(pdfFile);
          if (pageJpeg) {
            listingThumbnailPath = `discover-thumbnail-uploads/${authorUid}/${Date.now()}-preview.jpg`;
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
        userId: authorUid,
        username: authorUsername,
        userPicture: authorPicture,
        title: trimmedTitle,
        description: trimmedDescription,
        websiteUrl: resourceUrl,
        resourceSource,
        pdfPath: uploadedPdfPath,
        pdfFileName: resourceSource === "document" ? pdfFile?.name ?? "" : "",
        formatType: resourceFormat(resourceSource, validUrl),
        imagePath: null,
        imageFileName: "",
        thumbnailUrl: listingThumbnailUrl,
        thumbnailPath: listingThumbnailPath,
        uploadedThumbnailUrl,
        uploadedThumbnailPath,
        thumbnailStatus: thumbnailFile ? "pending" : "none",
        moderationStatus: "pending",
        faviconUrl: preview?.faviconUrl ?? "",
        siteName: resourceSource === "document"
          ? pdfFile?.name ?? "Document"
          : preview?.siteName ?? displayHostname(validUrl),
        subjectId: shareSubject.id,
        subjectLabel: shareSubject.label,
        levels: shareLevels,
        resourceTypes: [shareType],
        resourceType: shareType,
        topicId: topics[0]?.id ?? "",
        topicLabel: topics[0]?.label ?? "",
        topicLevel: topics[0]?.levels[0] ?? "",
        topicUrl: topics[0] ? discoverTopicUrl(shareSubject.id, topics[0].id, topics[0].levels[0] ?? "higher") : "",
        topics: topics.map((topic) => topic.id),
        likeCount: 0,
        commentCount: 0,
        ratingAverage: 0,
        ratingCount: 0,
        ...(linkedQuestion
          ? linkedQuestionsPayload([
              {
                id: linkedQuestion.id,
                name: linkedQuestion.name,
                practiceUrl: linkedQuestion.practiceUrl,
                subjectId: linkedQuestion.subjectId,
                subjectLabel: linkedQuestion.subjectLabel,
                level: linkedQuestion.level,
                topic: linkedQuestion.topic,
                source: linkedQuestion.source,
              },
            ])
          : {
              linkedQuestions: [],
              linkedQuestionId: null,
              linkedQuestionName: null,
              linkedQuestionPracticeUrl: null,
              linkedQuestionSubjectId: null,
              linkedQuestionSubjectLabel: null,
              linkedQuestionLevel: null,
              linkedQuestionTopic: null,
              linkedQuestionSource: null,
            }),
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
    if (!documentContentType(file)) {
      setPdfFile(null);
      setFormError("Choose a PDF, DOCX or PowerPoint file.");
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      setPdfFile(null);
      setFormError("Document must be under 25 MB.");
      if (pdfInputRef.current) pdfInputRef.current.value = "";
      return;
    }
    setPdfFile(file);
    setFormError(null);
    setTitle((current) => current.trim() ? current : file.name.replace(/\.(pdf|docx|pptx|ppt)$/i, "").slice(0, MAX_TITLE));
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
    (resourceSource === "document" ? pdfPreview : null)
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
  const selectionPortalTarget = selectionRef.current?.closest(".app-modal-panel");

  return (
    <Modal
      title="Share a free resource"
      onClose={closeForm}
      maxWidthClass="max-w-6xl"
      className="discover-share-modal__panel"
      footer={
        <div className="space-y-2">
          <p aria-live="polite" className="h-10 overflow-hidden text-sm leading-5 text-red-500 line-clamp-2">
            {formError || "\u00a0"}
          </p>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={closeForm}
              disabled={submitting}
              className="discover-modal-action--secondary px-4 py-2 rounded-xl text-sm transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSubmit()}
              disabled={submitting}
              className="discover-modal-action--primary inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <><LuLoader size={16} className="animate-spin" /> Publishing...</>
              ) : (
                <><LuPlus size={16} /> Publish</>
              )}
            </button>
          </div>
        </div>
      }
    >
          {linkedQuestion && (
            <div className="mb-5 rounded-2xl color-bg-accent px-4 py-3">
              <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide color-txt-accent">
                <LuLink size={14} /> Linking to this question
              </p>
              <p className="mt-1 text-sm font-bold color-txt-main">{linkedQuestion.name}</p>
            </div>
          )}

          <div className="space-y-5 pb-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-8">
              <div className="space-y-5">
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-1 rounded-lg color-bg-grey-5 p-1">
                    <button
                      type="button"
                      onClick={() => chooseResourceSource("website")}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg border-0 px-3 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                        resourceSource === "website"
                          ? "discover-modal-action--primary"
                          : "color-txt-sub hover:color-txt-main"
                      }`}
                    >
                      <LuLink size={16} />
                      Link
                    </button>
                    <button
                      type="button"
                      onClick={() => chooseResourceSource("document")}
                      className={`inline-flex items-center justify-center gap-2 rounded-lg border-0 px-3 py-2.5 text-sm font-semibold transition-colors cursor-pointer ${
                        resourceSource === "document"
                          ? "discover-modal-action--primary"
                          : "color-txt-sub hover:color-txt-main"
                      }`}
                    >
                      <LuFileText size={16} />
                      Document
                    </button>
                  </div>
                </div>

                {resourceSource === "website" ? (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold color-txt-sub">
                      Paste the link
                    </label>
                    <div className="discover-share-link-field practice-hub__subject-trigger--compact flex items-center gap-2">
                      <LuLink size={16} className="color-txt-sub shrink-0" />
                      <input
                        type="url"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                        placeholder="https://free-notes-site.com"
                        className="discover-share-link-input flex-1 bg-transparent color-txt-main font-medium outline-none placeholder:color-txt-sub"
                      />
                      {previewLoading && <LuLoader size={16} className="animate-spin color-txt-sub" />}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <label className="text-xs font-semibold color-txt-sub">
                      Upload a document
                    </label>
                    <label className="practice-hub__subject-trigger--compact flex cursor-pointer items-center gap-2 hover:opacity-90" title="PDF, DOCX or PowerPoint, up to 25 MB">
                      <LuFileText size={16} className="color-txt-sub shrink-0" />
                      <span className="min-w-0 truncate text-sm font-medium color-txt-main">
                        {pdfFile?.name ?? "Choose PDF, DOCX or PowerPoint"}
                      </span>
                      <input
                        ref={pdfInputRef}
                        type="file"
                        accept=".pdf,.docx,.pptx,.ppt"
                        className="hidden"
                        onChange={(e) => handlePickPdf(e.target.files?.[0])}
                      />
                    </label>
                  </div>
                )}
                <div className="space-y-2">
                  <label htmlFor="discover-share-title" className="text-xs font-semibold color-txt-main">Title</label>
                  <input
                    id="discover-share-title"
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value.slice(0, MAX_TITLE))}
                    placeholder={placeholderTitle}
                    className="practice-hub__subject-trigger--compact discover-share-copy-field w-full color-txt-main outline-none placeholder:color-txt-sub"
                  />
                </div>
                <div className="space-y-2">
                  <label htmlFor="discover-share-description" className="text-xs font-semibold color-txt-main">Description</label>
                  <input
                    id="discover-share-description"
                    type="text"
                    value={description}
                    onChange={(e) => setDescription(e.target.value.slice(0, MAX_DESCRIPTION))}
                    placeholder="What does this resource cover?"
                    className="practice-hub__subject-trigger--compact discover-share-copy-field w-full color-txt-main outline-none placeholder:color-txt-sub"
                  />
                </div>
              </div>

              <div className="h-56 lg:h-[320px]">
                <div className="group relative flex h-full overflow-hidden rounded-2xl color-bg-grey-5">
                  {formPreviewSrc ? (
                    <img
                      src={formPreviewSrc}
                      alt=""
                      className="absolute inset-0 h-full w-full object-cover object-top"
                    />
                  ) : (
                    <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center color-txt-sub">
                      {formPreviewLoading ? (
                        <LuLoader size={28} className="animate-spin" />
                      ) : resourceSource === "document" ? (
                        <LuFileText size={36} />
                      ) : (
                        <LuBookOpen size={36} />
                      )}
                      <span className="text-sm font-semibold">
                        {formPreviewLoading
                          ? "Generating preview…"
                          : formPreviewReady
                            ? "Preview unavailable"
                            : "Paste a link or upload a file to generate a preview"}
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

            <div ref={selectionRef} className="relative z-20 grid gap-4 sm:grid-cols-[minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,1.3fr)]">
              <div className="min-w-0 space-y-2">
                <SubjectDropdown
                  id="discover-share-subject"
                  value={shareSubjectId}
                  onChange={(subjectId) => {
                    setShareSubjectId(subjectId);
                    setShareLevels([]);
                    setLevelChosen(false);
                    setShareTopicIds([]);
                    setOpenSelection(null);
                  }}
                  onFavouritesChange={setFavouriteSubjectIds}
                  aria-label="Choose resource subject"
                  variant="list"
                  dropdownAlign="start"
                  fitWithinModal
                />
              </div>
              <div className="relative min-w-0 space-y-2">
                <button
                  ref={levelTriggerRef}
                  type="button"
                  disabled={!shareSubjectId}
                  aria-label="Choose resource level"
                  aria-expanded={openSelection === "level"}
                  onClick={() => { setSelectionPosition(null); setOpenSelection((current) => current === "level" ? null : "level"); }}
                  className="practice-hub__subject-trigger practice-hub__subject-trigger--compact w-full disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="practice-hub__subject-trigger-label truncate">{!levelChosen ? "Choose level" : shareLevels.length ? shareLevels.join(", ") : "All levels"}</span>
                  <span className="practice-hub__subject-arrow"><LuChevronDown size={16} className={`practice-hub__subject-chevron ${openSelection === "level" ? "rotate-180" : ""}`} /></span>
                </button>
                {openSelection === "level" && shareSubjectId && selectionPosition && selectionPortalTarget && createPortal(
                  <div style={{ position: "fixed", inset: 0, zIndex: 100, pointerEvents: "none", contain: "layout" }}>
                  <div ref={selectionPopupRef} className="practice-hub__subject-dropdown practice-hub__subject-dropdown--list" role="listbox" aria-label="Levels" style={{ position: "absolute", top: selectionPosition.top, left: selectionPosition.left, right: "auto", width: selectionPosition.width, maxHeight: selectionPosition.maxHeight, marginTop: 0, pointerEvents: "auto" }}>
                    <div className="practice-hub__subject-scroll">
                      <button type="button" role="option" aria-selected={levelChosen && shareLevels.length === 0} onClick={() => { setShareLevels([]); setLevelChosen(true); setShareTopicIds([]); setOpenSelection(null); }} className="practice-hub__subject-option">All levels</button>
                      {RESOURCE_LEVELS.map((level) => (
                        <button key={level} type="button" role="option" aria-selected={shareLevels.includes(level)} onClick={() => { setShareLevels([level]); setLevelChosen(true); setShareTopicIds([]); setOpenSelection(null); }} className="practice-hub__subject-option">{level}</button>
                      ))}
                    </div>
                  </div>
                  </div>, selectionPortalTarget
                )}
              </div>
              <div className="relative min-w-0 space-y-2">
                <button
                  ref={topicTriggerRef}
                  type="button"
                  disabled={!shareSubjectId || !levelChosen}
                  aria-label="Choose resource topics"
                  aria-expanded={openSelection === "topics"}
                  onClick={() => { setSelectionPosition(null); setOpenSelection((current) => current === "topics" ? null : "topics"); }}
                  className="practice-hub__subject-trigger practice-hub__subject-trigger--compact w-full disabled:cursor-not-allowed disabled:opacity-45"
                >
                  <span className="practice-hub__subject-trigger-label truncate">{selectedTopics.length ? `${selectedTopics.length} ${selectedTopics.length === 1 ? "topic" : "topics"} selected` : "All topics / general"}</span>
                  <span className="practice-hub__subject-arrow"><LuChevronDown size={16} className={`practice-hub__subject-chevron ${openSelection === "topics" ? "rotate-180" : ""}`} /></span>
                </button>
                {openSelection === "topics" && levelChosen && selectionPosition && selectionPortalTarget && createPortal(
                  <div style={{ position: "fixed", inset: 0, zIndex: 100, pointerEvents: "none", contain: "layout" }}>
                  <div ref={selectionPopupRef} className="practice-hub__subject-dropdown practice-hub__subject-dropdown--list" aria-label="Topics" style={{ position: "absolute", top: selectionPosition.top, left: selectionPosition.left, right: "auto", width: selectionPosition.width, maxHeight: selectionPosition.maxHeight, marginTop: 0, pointerEvents: "auto" }}>
                    <div className="practice-hub__subject-search-wrap">
                      <LuSearch size={15} className="practice-hub__subject-search-icon" aria-hidden />
                      <input type="search" className="practice-hub__subject-search" value={topicSearch} onChange={(event) => setTopicSearch(event.target.value)} placeholder="Search topics…" aria-label="Search topics" />
                    </div>
                    <div className="practice-hub__subject-scroll">
                      <p className="px-3 py-2 text-xs color-txt-sub">Leave unchecked for a general resource.</p>
                      {visibleTopics.map((topic) => (
                        <label key={topic.id} className="practice-hub__subject-option">
                          <input type="checkbox" className="discover-share-topic-checkbox" checked={shareTopicIds.includes(topic.id)} onChange={() => setShareTopicIds((current) => current.includes(topic.id) ? current.filter((id) => id !== topic.id) : [...current, topic.id])} />
                          <span className="truncate">{topic.label}</span>
                        </label>
                      ))}
                      {topicsLoading && <p className="px-3 py-2 text-sm color-txt-sub">Loading topics…</p>}
                      {!topicsLoading && visibleTopics.length === 0 && <p className="px-3 py-2 text-sm color-txt-sub">{topicSearch ? "No topics match" : "No topics available"}</p>}
                      {topicsError && <p className="px-3 py-2 text-sm color-txt-danger">Couldn’t load topics. Try again.</p>}
                    </div>
                  </div>
                  </div>, selectionPortalTarget
                )}
              </div>
            </div>

            <div className="space-y-2 pb-6">
              <label className="text-xs font-semibold color-txt-sub">Type</label>
              <div className="flex flex-wrap gap-2">
                {RESOURCE_TYPES.map((type) => (
                  <button type="button" key={type} onClick={() => setShareType(type)} className={`rounded-lg border color-shadow px-3 py-2 text-sm font-semibold cursor-pointer ${shareType === type ? "discover-modal-action--primary" : "color-bg color-txt-main hover:opacity-90"}`}>{type}</button>
                ))}
              </div>
            </div>
          </div>
    </Modal>
  );
}
