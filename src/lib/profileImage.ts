/** Max edge length for profile previews — keeps WKWebView memory safe on iPad. */
const MAX_DIMENSION = 1536;

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to load image"));
        img.src = src;
    });
}

/**
 * Returns an object URL suitable for react-easy-crop. Downscales very large
 * camera photos so iPad WebViews do not run out of memory.
 */
export async function prepareProfileImagePreview(file: File): Promise<string> {
    const objectUrl = URL.createObjectURL(file);
    try {
        const img = await loadImage(objectUrl);
        const maxSide = Math.max(img.naturalWidth, img.naturalHeight);
        if (maxSide <= MAX_DIMENSION) {
            return objectUrl;
        }

        URL.revokeObjectURL(objectUrl);
        const scale = MAX_DIMENSION / maxSide;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            throw new Error("Could not prepare image for cropping.");
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, "image/jpeg", 0.92);
        });
        if (!blob) {
            throw new Error("Could not compress image.");
        }
        return URL.createObjectURL(blob);
    } catch (err) {
        URL.revokeObjectURL(objectUrl);
        throw err;
    }
}

export function revokeProfileImagePreview(url: string | null | undefined): void {
    if (url?.startsWith("blob:")) {
        URL.revokeObjectURL(url);
    }
}
