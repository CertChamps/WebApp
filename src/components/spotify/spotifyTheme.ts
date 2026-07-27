// Shared Spotify-branded styling tokens.
//
// The user explicitly asked for the player to *look like Spotify* rather than
// adopt the app's theme tokens, so this feature intentionally uses Spotify's
// signature dark palette + green accent instead of the app's color-* utilities.

export const SPOTIFY_GREEN = "#1db954";
export const SPOTIFY_GREEN_HOVER = "#1ed760";

export const spotify = {
  // Surfaces
  shell: "bg-[#121212] text-white",
  base: "bg-[#121212]",
  card: "bg-[#181818]",
  cardHover: "hover:bg-[#282828]",
  rowHover: "hover:bg-white/10",
  input: "bg-[#242424]",
  // Text
  textPrimary: "text-white",
  textSub: "text-[#b3b3b3]",
  // Accent (green)
  green: "bg-[#1db954] hover:bg-[#1ed760]",
  greenText: "text-[#1db954]",
  // Pills / tabs
  pill: "bg-white/10 hover:bg-white/20 text-white",
  pillActive: "bg-white text-black",
} as const;
