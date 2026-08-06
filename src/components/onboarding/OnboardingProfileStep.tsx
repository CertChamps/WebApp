import { useEffect, useId, useState } from "react";
import Cropper from "react-easy-crop";
import { LuPen } from "react-icons/lu";
import Rank1 from "../../assets/Rank2-CCOkr3g2.png";
import { prepareProfileImagePreview, revokeProfileImagePreview } from "../../lib/profileImage";

type Area = { x: number; y: number; width: number; height: number };

type Props = {
  username: string;
  onUsernameChange: (value: string) => void;
  currentPictureUrl?: string;
  croppedPreviewUrl: string | null;
  onCroppedBlobChange: (blob: Blob | null, previewUrl: string | null) => void;
  error?: string;
};

async function getCroppedImg(imageSrc: string, crop: Area): Promise<Blob | null> {
  const image = new Image();
  image.src = imageSrc;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Failed to load image"));
  });

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  canvas.width = crop.width;
  canvas.height = crop.height;
  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    crop.width,
    crop.height,
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg");
  });
}

export default function OnboardingProfileStep({
  username,
  onUsernameChange,
  currentPictureUrl,
  croppedPreviewUrl,
  onCroppedBlobChange,
  error,
}: Props) {
  const inputId = useId();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [showCropper, setShowCropper] = useState(false);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropError, setCropError] = useState("");

  useEffect(() => {
    return () => {
      revokeProfileImagePreview(previewUrl);
    };
  }, [previewUrl]);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setCropError("");
    try {
      const preview = await prepareProfileImagePreview(file);
      revokeProfileImagePreview(previewUrl);
      setPreviewUrl(preview);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setShowCropper(true);
    } catch (err) {
      console.error("Profile image failed:", err);
      setCropError("Could not load that image. Try another photo.");
    }
  };

  const closeCropper = () => {
    revokeProfileImagePreview(previewUrl);
    setShowCropper(false);
    setPreviewUrl(null);
    setCroppedAreaPixels(null);
  };

  const handleCropComplete = async () => {
    if (!previewUrl || !croppedAreaPixels) return;

    try {
      const croppedBlob = await getCroppedImg(previewUrl, croppedAreaPixels);
      if (!croppedBlob) {
        setCropError("Could not crop that image. Try again.");
        return;
      }

      const croppedUrl = URL.createObjectURL(croppedBlob);
      revokeProfileImagePreview(croppedPreviewUrl);
      onCroppedBlobChange(croppedBlob, croppedUrl);
      closeCropper();
    } catch (err) {
      console.error("Crop failed:", err);
      setCropError("Could not crop that image. Try again.");
    }
  };

  const displaySrc = croppedPreviewUrl || currentPictureUrl || Rank1;

  return (
    <>
      {showCropper && previewUrl ? (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[150] px-4">
          <div className="color-bg p-4 rounded-out border-2 color-shadow w-full max-w-sm">
            <div className="relative w-full aspect-square">
              <Cropper
                image={previewUrl}
                crop={crop}
                zoom={zoom}
                aspect={1}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_, area) => setCroppedAreaPixels(area)}
              />
            </div>
            <div className="flex justify-between gap-3 mt-4">
              <button type="button" className="px-4 py-2 color-bg-grey-5 rounded-out" onClick={closeCropper}>
                Cancel
              </button>
              <button type="button" className="blue-btn px-4 py-2 text-center" onClick={() => void handleCropComplete()}>
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex flex-col items-center gap-4">
        <div className="relative">
          <img
            src={displaySrc}
            alt="Profile preview"
            className="h-28 w-28 rounded-full object-cover border-2 color-shadow"
          />
          <button
            type="button"
            className="absolute bottom-0 right-0 color-bg border-1 color-shadow rounded-full p-2 cursor-pointer"
            onClick={() => document.getElementById(inputId)?.click()}
            aria-label="Choose profile picture"
          >
            <LuPen className="text-xl color-txt-accent" fill="currentColor" />
          </button>
          <input
            id={inputId}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void handleAvatarChange(e)}
          />
        </div>

        <p className="txt-sub color-txt-sub text-center text-sm">
          {croppedPreviewUrl ? "Looking good — you can change it anytime." : "Tap the pen to add a profile picture."}
        </p>

        <input
          className="txtbox w-full"
          placeholder="Username"
          value={username}
          maxLength={20}
          onChange={(e) => onUsernameChange(e.target.value)}
          autoComplete="username"
        />

        {error || cropError ? (
          <p className="text-red text-center text-sm w-full">{error || cropError}</p>
        ) : null}
      </div>
    </>
  );
}
