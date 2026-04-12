import { Capacitor, CapacitorHttp } from "@capacitor/core";

type RequestMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type NativeRequestOptions = {
  url: string;
  method?: RequestMethod;
  headers?: Record<string, string>;
  data?: unknown;
  responseType?: "json" | "text" | "blob" | "arraybuffer";
};

/**
 * Use native networking in Capacitor to avoid browser-level CORS restrictions.
 * Falls back to standard fetch automatically on web.
 */
export async function nativeHttpRequest(options: NativeRequestOptions): Promise<Response> {
  const method = options.method ?? "GET";

  if (!Capacitor.isNativePlatform()) {
    const response = await fetch(options.url, {
      method,
      headers: options.headers,
      body: options.data != null ? JSON.stringify(options.data) : undefined,
    });
    return response;
  }

  const nativeResponse = await CapacitorHttp.request({
    url: options.url,
    method,
    headers: options.headers,
    data: options.data,
    responseType: options.responseType ?? "text",
  });

  const body =
    options.responseType === "arraybuffer" && nativeResponse.data != null
      ? new Uint8Array(nativeResponse.data as ArrayBuffer)
      : typeof nativeResponse.data === "string"
      ? nativeResponse.data
      : JSON.stringify(nativeResponse.data ?? {});

  return new Response(body, {
    status: nativeResponse.status,
    headers: nativeResponse.headers as HeadersInit,
  });
}

export async function fetchPdfBytes(url: string, headers?: Record<string, string>): Promise<ArrayBuffer> {
  const response = await nativeHttpRequest({
    url,
    method: "GET",
    headers,
    responseType: "arraybuffer",
  });

  if (!response.ok) {
    throw new Error(`PDF request failed with status ${response.status}`);
  }

  return response.arrayBuffer();
}
