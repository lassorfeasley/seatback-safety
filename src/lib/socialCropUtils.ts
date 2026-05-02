/**
 * Convert react-easy-crop pixel area to the social_posts crop convention:
 * - x_pct, y_pct: top-left of the square in fractions of image width/height
 * - size_pct: square side length as a fraction of min(width, height)
 */
export function pixelsToSocialCropPct(
  area: { x: number; y: number; width: number; height: number },
  naturalWidth: number,
  naturalHeight: number
): { x_pct: number; y_pct: number; size_pct: number } {
  const minDim = Math.min(naturalWidth, naturalHeight);
  return {
    x_pct: area.x / naturalWidth,
    y_pct: area.y / naturalHeight,
    size_pct: area.width / minDim,
  };
}
