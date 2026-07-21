import { LuLoaderCircle, LuLogOut, LuCrown, LuTriangleAlert } from "react-icons/lu";
import { useSpotify } from "../../context/SpotifyContext";
import { SpotifyLogo } from "./SpotifyLogo";
import { SpotifyNowPlaying } from "./SpotifyNowPlaying";
import { SpotifyBrowse } from "./SpotifyBrowse";

function PanelShell({ children }: { children: React.ReactNode }) {
  return <div className="flex h-full min-h-0 flex-col gap-3 p-3 color-bg">{children}</div>;
}

function ConnectedHeader() {
  const { profile, disconnect } = useSpotify();
  const avatar = profile?.images?.[0]?.url ?? null;
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full color-bg-grey-10">
        {avatar ? (
          <img src={avatar} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <SpotifyLogo className="h-4 w-4 color-txt-main" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold color-txt-main">{profile?.display_name ?? "Spotify"}</p>
        <p className="truncate text-[11px] color-txt-sub">Connected</p>
      </div>
      <button
        type="button"
        onClick={disconnect}
        aria-label="Disconnect Spotify"
        title="Disconnect"
        className="flex h-8 w-8 items-center justify-center rounded-lg color-txt-sub transition-colors hover:color-bg-grey-5 hover:color-txt-main"
      >
        <LuLogOut size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

export default function SpotifyPanel() {
  const { configured, status, isPremium, error, beginLogin } = useSpotify();

  if (!configured) {
    return (
      <PanelShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <SpotifyLogo className="h-9 w-9 color-txt-sub opacity-70" />
          <p className="text-sm font-semibold color-txt-main">Spotify isn't set up</p>
          <p className="max-w-[220px] text-xs color-txt-sub">
            Add a <code className="rounded color-bg-grey-5 px-1">VITE_SPOTIFY_CLIENT_ID</code> to enable the
            in-app player.
          </p>
        </div>
      </PanelShell>
    );
  }

  if (status === "connecting") {
    return (
      <PanelShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3">
          <LuLoaderCircle size={22} className="animate-spin color-txt-accent" />
          <p className="text-sm color-txt-sub">Connecting to Spotify…</p>
        </div>
      </PanelShell>
    );
  }

  if (status === "disconnected") {
    return (
      <PanelShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <SpotifyLogo className="h-12 w-12 color-txt-main" />
          <div>
            <p className="text-base font-bold color-txt-main">Listen while you study</p>
            <p className="mt-1 max-w-[220px] text-xs color-txt-sub">
              Connect Spotify to play music without leaving your whiteboard.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void beginLogin()}
            className="flex items-center gap-2 rounded-out color-bg-accent color-txt-accent px-4 py-2 text-sm font-bold transition-opacity hover:opacity-80"
          >
            <SpotifyLogo className="h-4 w-4" />
            Connect Spotify
          </button>
          {error ? (
            <div className="flex items-center gap-1.5 text-xs text-red">
              <LuTriangleAlert size={14} />
              <span>{error}</span>
            </div>
          ) : null}
        </div>
      </PanelShell>
    );
  }

  // Connected
  if (!isPremium) {
    return (
      <PanelShell>
        <ConnectedHeader />
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full color-bg-accent">
            <LuCrown size={22} strokeWidth={2} className="color-txt-accent" />
          </div>
          <p className="text-sm font-bold color-txt-main">Spotify Premium required</p>
          <p className="max-w-[230px] text-xs color-txt-sub">
            In-app playback uses Spotify's Web Playback SDK, which only works with a Premium account. You can
            still stay connected, but tracks can't stream inside the app.
          </p>
        </div>
      </PanelShell>
    );
  }

  return (
    <PanelShell>
      <ConnectedHeader />
      <SpotifyNowPlaying />
      <SpotifyBrowse />
    </PanelShell>
  );
}
