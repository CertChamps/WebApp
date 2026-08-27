import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import fetch from "node-fetch";

function bearerToken(req: { headers?: { authorization?: string } }): string | null {
    const value = req.headers?.authorization;
    if (typeof value !== "string") return null;
    const match = value.match(/^Bearer\s+(.+)$/i);
    return match?.[1]?.trim() || null;
}

function extractYoutubeId(url: string): string | null {
    try {
        const parsed = new URL(url);
        const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
        if (host === "youtu.be") return parsed.pathname.split("/").filter(Boolean)[0] ?? null;
        if (host === "youtube.com" || host === "m.youtube.com" || host === "music.youtube.com") {
            const fromQuery = parsed.searchParams.get("v");
            if (fromQuery) return fromQuery;
            const parts = parsed.pathname.split("/").filter(Boolean);
            if (parts[0] === "shorts" || parts[0] === "embed" || parts[0] === "live") {
                return parts[1] ?? null;
            }
        }
    } catch {
        return null;
    }
    return null;
}

function isPublicHttpUrl(raw: string): URL | null {
    try {
        const parsed = new URL(raw);
        if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
        const host = parsed.hostname.toLowerCase();
        if (
            host === "localhost" ||
            host.endsWith(".local") ||
            host.endsWith(".internal") ||
            host === "metadata.google.internal"
        ) {
            return null;
        }
        if (
            /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.|169\.254\.|0\.|::1$|fc|fd)/i.test(host)
        ) {
            return null;
        }
        return parsed;
    } catch {
        return null;
    }
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
    try {
        const response = await fetch(url, {
            method: "GET",
            redirect: "follow",
            timeout: 8000,
            size: 4 * 1024 * 1024,
            headers: {
                "User-Agent": "CertChampsBot/1.0 (+https://app.certchamps.ie)",
                Accept: "image/*,*/*;q=0.8",
            },
        } as any);
        if (!response.ok) return null;
        const contentType = String(response.headers.get("content-type") || "");
        if (contentType && !contentType.startsWith("image/")) return null;
        const buffer = await response.buffer();
        return buffer.length > 32 ? buffer : null;
    } catch {
        return null;
    }
}

function extractOgImage(html: string, baseUrl: string): string | null {
    const keys = ["og:image", "og:image:secure_url", "twitter:image", "twitter:image:src"];
    for (const key of keys) {
        const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const patterns = [
            new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
            new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`, "i"),
        ];
        for (const pattern of patterns) {
            const match = html.match(pattern);
            if (match?.[1]) {
                try {
                    return new URL(match[1], baseUrl).toString();
                } catch {
                    return match[1];
                }
            }
        }
    }
    return null;
}

async function screenshotPage(url: string): Promise<Buffer | null> {
    const chromium = (await import("@sparticuz/chromium")).default;
    const puppeteer = await import("puppeteer-core");
    chromium.setGraphicsMode = false;

    const browser = await puppeteer.launch({
        args: chromium.args,
        defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 },
        executablePath: await chromium.executablePath(),
        headless: true,
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent(
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        );
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
        await new Promise((resolve) => setTimeout(resolve, 900));
        const shot = await page.screenshot({
            type: "jpeg",
            quality: 72,
            captureBeyondViewport: false,
        });
        return Buffer.isBuffer(shot) ? shot : Buffer.from(shot);
    } finally {
        await browser.close().catch(() => undefined);
    }
}

export const captureWebsiteThumbnail = functions.https.onRequest({
    cors: true,
    invoker: "public",
    timeoutSeconds: 60,
    memory: "2GiB",
    cpu: 1,
    region: "us-central1",
}, async (req, res) => {
    if (req.method !== "POST") {
        res.status(405).json({ error: "Method not allowed" });
        return;
    }

    try {
        const token = bearerToken(req);
        if (!token) {
            res.status(401).json({ error: "Sign in to capture a preview." });
            return;
        }
        await admin.auth().verifyIdToken(token);
    } catch {
        res.status(401).json({ error: "Sign in to capture a preview." });
        return;
    }

    const rawUrl = typeof req.body?.url === "string" ? req.body.url.trim() : "";
    const parsed = isPublicHttpUrl(rawUrl);
    if (!parsed) {
        res.status(400).json({ error: "Valid public https url is required" });
        return;
    }
    const url = parsed.toString();
    const youtubeId = extractYoutubeId(url);

    try {
        if (youtubeId) {
            const poster = await fetchImageBuffer(`https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`);
            if (poster) {
                res.set("Content-Type", "image/jpeg");
                res.status(200).send(poster);
                return;
            }
        } else {
            const shot = await screenshotPage(url);
            if (shot && shot.length > 32) {
                res.set("Content-Type", "image/jpeg");
                res.status(200).send(shot);
                return;
            }
        }

        const pageResponse = await fetch(url, {
            method: "GET",
            redirect: "follow",
            timeout: 8000,
            size: 1024 * 1024,
            headers: {
                "User-Agent": "CertChampsBot/1.0 (+https://app.certchamps.ie)",
                Accept: "text/html,application/xhtml+xml",
            },
        } as any);
        const html = await pageResponse.text();
        const ogImage = extractOgImage(html, pageResponse.url || url);
        const fallback = ogImage ? await fetchImageBuffer(ogImage) : null;
        if (fallback) {
            res.set("Content-Type", "image/jpeg");
            res.status(200).send(fallback);
            return;
        }

        res.status(422).json({ error: "Could not capture a preview image" });
    } catch (error) {
        console.error("captureWebsiteThumbnail failed:", error);
        res.status(500).json({ error: "Could not capture a preview image" });
    }
});
