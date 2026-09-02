import * as admin from "firebase-admin";
import fetch from "node-fetch";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export type ExpoPushMessage = {
    to: string;
    title: string;
    body: string;
    sound: "default";
    channelId: string;
    data: Record<string, string>;
};

export function asString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

export function collectExpoPushTokens(data: admin.firestore.DocumentData | undefined): string[] {
    if (!data) return [];
    const raw = data.expoPushTokens;
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((token): token is string => typeof token === "string" && token.trim().length > 0)
        .map((token) => token.trim());
}

export async function loadUserPushTokens(uid: string): Promise<string[]> {
    if (!uid) return [];
    const snap = await admin.firestore().doc(`user-data/${uid}`).get();
    return collectExpoPushTokens(snap.data());
}

export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
    if (messages.length === 0) return;

    for (let i = 0; i < messages.length; i += 100) {
        const chunk = messages.slice(i, i + 100);
        const response = await fetch(EXPO_PUSH_URL, {
            method: "POST",
            headers: {
                Accept: "application/json",
                "Accept-Encoding": "gzip, deflate",
                "Content-Type": "application/json",
            },
            body: JSON.stringify(chunk),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error("Expo push failed", response.status, text);
            continue;
        }

        const payload = (await response.json()) as {
            data?: Array<{ status?: string; message?: string; details?: unknown }>;
        };
        const failures = (payload.data ?? []).filter((item) => item.status !== "ok");
        if (failures.length > 0) {
            console.error("Expo push ticket failures", failures);
        }
    }
}
