/**
 * Theme-to-PDF color mapping. PDFs are typically black text on white with grey accents.
 * We map: white → theme BG, black → theme Primary, grey → theme Sub.
 * These hex values match the @theme block in index.css.
 *
 * Set to true to re-enable PDF theming (canvas color remapping).
 */
export const PDF_THEMING_ENABLED = false;

export type PdfThemeColors = {
  bg: string;      // PDF white becomes this
  primary: string; // PDF black becomes this
  sub: string;     // PDF grey becomes this
};

export const PDF_THEME_COLORS: Record<string, PdfThemeColors> = {
  light: { bg: "#ffffff", primary: "#353535", sub: "#9ca3af" },
  dark: { bg: "#353535", primary: "#ffffff", sub: "#bdbdbd" },
  icebergLight: { bg: "#e8e9ec", primary: "#33374c", sub: "#adb1c4" },
  icebergDark: { bg: "#161821", primary: "#84a0c6", sub: "#595e76" },
  nordLight: { bg: "#ECEFF4", primary: "#8FBCBB", sub: "#6A7791" },
  nordDark: { bg: "#242933", primary: "#88c0d0", sub: "#d8dee9" },
  modernInk: { bg: "#ffffff", primary: "#ff360d", sub: "#b7b7b7" },
  magicGirl: { bg: "#291f33", primary: "#a982c4", sub: "#86679c" },
  lavendar: { bg: "#EBE1EF", primary: "#8A5BD6", sub: "#A28DB8" },
  airplane: { bg: "#E0F7FA", primary: "#004D40", sub: "#26A69A" },
  sewingTinLight: { bg: "#FFFFFF", primary: "#2D2076", sub: "#385ECA" },
  camping: { bg: "#FAF1E4", primary: "#618C56", sub: "#C2B8AA" },
  paper: { bg: "#EEEEEE", primary: "#444444", sub: "#B2B2B2" },
  tangerine: { bg: "#ffede0", primary: "#3d1705", sub: "#ff9562" },
  menthol: { bg: "#00c18c", primary: "#ffffff", sub: "#186544" },
  markoblank: { bg: "#2a273f", primary: "#9ccfd8", sub: "#d5d4e9" },
  aurora: { bg: "#282C34", primary: "#E06C75", sub: "#ABB2BF" },
  gruvbox: { bg: "#282828", primary: "#d79921", sub: "#665c54" },
  husqy: { bg: "#000000", primary: "#ebd7ff", sub: "#972fff" },
  shadow: { bg: "#000000", primary: "#eeeeee", sub: "#444444" },
  blueberryLight: { bg: "#dae0f5", primary: "#92a4be", sub: "#506477" },
  blueberryDark: { bg: "#506477", primary: "#add7ff", sub: "#5c7da5" },
  darkFuchsia: { bg: "#1f1319", primary: "#bf115a", sub: "#d19bb1" },
  pastelPink: { bg: "#f2cbdc", primary: "#c4668d", sub: "#c46695" },
};
