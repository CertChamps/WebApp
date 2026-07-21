// Loads Spotify's official Web Playback SDK script exactly once and resolves
// when the global `Spotify` namespace is ready. The SDK requires a global
// `window.onSpotifyWebPlaybackSDKReady` callback to be defined before it loads.

const SDK_SRC = "https://sdk.scdn.co/spotify-player.js";

let sdkPromise: Promise<typeof Spotify> | null = null;

export function loadSpotifyPlaybackSdk(): Promise<typeof Spotify> {
  if (sdkPromise) return sdkPromise;

  sdkPromise = new Promise<typeof Spotify>((resolve, reject) => {
    if (typeof window === "undefined") {
      reject(new Error("Spotify SDK can only load in the browser"));
      return;
    }

    if (window.Spotify) {
      resolve(window.Spotify);
      return;
    }

    window.onSpotifyWebPlaybackSDKReady = () => {
      resolve(window.Spotify);
    };

    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SDK_SRC}"]`);
    if (existing) return;

    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    script.onerror = () => {
      sdkPromise = null;
      reject(new Error("Failed to load the Spotify Web Playback SDK"));
    };
    document.body.appendChild(script);
  });

  return sdkPromise;
}
