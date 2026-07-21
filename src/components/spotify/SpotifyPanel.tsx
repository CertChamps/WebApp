import { LuLoaderCircle, LuLogOut, LuCrown, LuTriangleAlert, LuSparkles } from "react-icons/lu";
import { useSpotify } from "../../context/SpotifyContext";
import { SpotifyLogo } from "./SpotifyLogo";
import { SpotifyNowPlaying } from "./SpotifyNowPlaying";
import { SpotifyBrowse } from "./SpotifyBrowse";
import { spotify } from "./spotifyTheme";

function PanelShell({ children }: { children: React.ReactNode }) {
  return <div className={`flex h-full min-h-0 flex-col gap-3 p-3 ${spotify.shell}`}>{children}</div>;
}

function ConnectedHeader() {
  const { profile, disconnect } = useSpotify();
  const avatar = profile?.images?.[0]?.url ?? null;
  return (
    <div className="flex shrink-0 items-center gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#282828]">
        {avatar ? (
          <img src={avatar} alt="" className="h-full w-full object-cover" draggable={false} />
        ) : (
          <SpotifyLogo className={`h-4 w-4 ${spotify.greenText}`} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold text-white">{profile?.display_name ?? "Spotify"}</p>
        <p className={`truncate text-[11px] ${spotify.textSub}`}>Connected</p>
      </div>
      <button
        type="button"
        onClick={disconnect}
        aria-label="Disconnect Spotify"
        title="Disconnect"
        className={`flex h-8 w-8 items-center justify-center rounded-full ${spotify.textSub} transition-colors hover:bg-white/10 hover:text-white`}
      >
        <LuLogOut size={16} strokeWidth={2} />
      </button>
    </div>
  );
}

function ReauthBanner() {
  const { beginLogin } = useSpotify();
  return (
    <div className="flex shrink-0 items-center gap-2 rounded-lg bg-[#1db954]/12 px-2.5 py-2">
      <LuSparkles size={15} className={`shrink-0 ${spotify.greenText}`} />
      <p className="min-w-0 flex-1 text-[11px] text-white">Reconnect to enable Recently Played.</p>
      <button
        type="button"
        onClick={() => void beginLogin()}
        className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold text-black ${spotify.green}`}
      >
        Reconnect
      </button>
    </div>
  );
}

export default function SpotifyPanel() {
  const { configured, status, isPremium, error, needsReauth, beginLogin } = useSpotify();

  if (!configured) {
    return (
      <PanelShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <SpotifyLogo className={`h-9 w-9 ${spotify.greenText}`} />
          <p className="text-sm font-semibold text-white">Spotify isn't set up</p>
          <p className={`max-w-[220px] text-xs ${spotify.textSub}`}>
            Add a <code className="rounded bg-white/10 px-1">VITE_SPOTIFY_CLIENT_ID</code> to enable the
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
          <LuLoaderCircle size={22} className={`animate-spin ${spotify.greenText}`} />
          <p className={`text-sm ${spotify.textSub}`}>Connecting to Spotify…</p>
        </div>
      </PanelShell>
    );
  }

  if (status === "disconnected") {
    return (
      <PanelShell>
        <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
          <SpotifyLogo className={`h-12 w-12 ${spotify.greenText}`} />
          <div>
            <p className="text-base font-bold text-white">Listen while you study</p>
            <p className={`mt-1 max-w-[220px] text-xs ${spotify.textSub}`}>
              Connect Spotify to play music without leaving your whiteboard.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void beginLogin()}
            className={`flex items-center gap-2 rounded-full px-6 py-2.5 text-sm font-bold text-black transition-transform hover:scale-105 ${spotify.green}`}
          >
            <SpotifyLogo className="h-4 w-4" />
            Connect Spotify
          </button>
          {error ? (
            <div className="flex items-center gap-1.5 text-xs text-[#f15e6c]">
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
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#1db954]/15">
            <LuCrown size={22} strokeWidth={2} className={spotify.greenText} />
          </div>
          <p className="text-sm font-bold text-white">Spotify Premium required</p>
          <p className={`max-w-[230px] text-xs ${spotify.textSub}`}>
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
      {needsReauth ? <ReauthBanner /> : null}
      <SpotifyNowPlaying />
      <SpotifyBrowse />
    </PanelShell>
  );
}
