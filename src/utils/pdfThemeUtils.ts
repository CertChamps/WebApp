/** Parse hex "#rrggbb" to [r,g,b] 0-255 */
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Linear interpolation between two rgb tuples */
function lerpRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ];
}

/** Apply theme colors to canvas: white→bg, black→primary, grey→sub */
export function applyThemeToCanvas(
  canvas: HTMLCanvasElement,
  theme: { bg: string; primary: string; sub: string }
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  const imgData = ctx.getImageData(0, 0, w, h);
  const data = imgData.data;

  const bgRgb = hexToRgb(theme.bg);
  const primaryRgb = hexToRgb(theme.primary);
  const subRgb = hexToRgb(theme.sub);

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];

    if (a < 10) continue; // transparent, leave as-is

    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const t = lum / 255;

    let out: [number, number, number];
    if (t <= 0.25) {
      out = lerpRgb(primaryRgb, subRgb, t / 0.25);
    } else if (t >= 0.75) {
      out = lerpRgb(subRgb, bgRgb, (t - 0.75) / 0.25);
    } else {
      out = subRgb;
    }

    data[i] = out[0];
    data[i + 1] = out[1];
    data[i + 2] = out[2];
  }

  ctx.putImageData(imgData, 0, 0);
}
