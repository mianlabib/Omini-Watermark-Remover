/**
 * Lossless Reverse Alpha Blending algorithms for Watermark Out model
 */

/**
 * Checks if a watermark is present in the specified region.
 * We compare the average luminance of pixels falling inside the watermark's mask shape
 * against the average luminance of reference pixels in surrounding border areas.
 * Since the watermark is a semi-transparent white layer overlay, the matched region
 * will display higher relative brightness if the watermark is present.
 */
export function detectWatermark(
  imgPixels: Uint8ClampedArray,
  maskPixels: Uint8ClampedArray,
  maskWidth: number,
  maskHeight: number,
  margin: number,
  imgWidth: number,
  imgHeight: number
): { hasWatermark: boolean; diff: number } {
  // calculate mask position from bottom-right corner
  const offsetX = imgWidth - maskWidth - margin;
  const offsetY = imgHeight - maskHeight - margin;

  if (offsetX < 0 || offsetY < 0) {
    return { hasWatermark: false, diff: 0 };
  }

  let watermarkBrightness = 0;
  let watermarkPixelCount = 0;
  let surroundingBrightness = 0;
  let surroundingPixelCount = 0;

  // 1. Gather average luminance on watermark-covered pixels (mask alpha > 0.1)
  for (let my = 0; my < maskHeight; my++) {
    for (let mx = 0; mx < maskWidth; mx++) {
      const imgX = offsetX + mx;
      const imgY = offsetY + my;

      if (imgX < 0 || imgY < 0 || imgX >= imgWidth || imgY >= imgHeight) continue;

      const imgIdx = (imgY * imgWidth + imgX) * 4;
      const maskIdx = (my * maskWidth + mx) * 4;

      const alpha = maskPixels[maskIdx + 3] / 255;

      if (alpha > 0.1) {
        const r = imgPixels[imgIdx];
        const g = imgPixels[imgIdx + 1];
        const b = imgPixels[imgIdx + 2];
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

        watermarkBrightness += brightness * alpha;
        watermarkPixelCount += alpha;
      }
    }
  }

  // 2. Gather surrounding canvas baseline luminance for background contrast comparison
  const sampleSize = Math.min(maskWidth, maskHeight);

  // Left-border reference band
  for (let y = offsetY; y < offsetY + maskHeight && y < imgHeight; y++) {
    for (let x = Math.max(0, offsetX - sampleSize); x < offsetX; x++) {
      const imgIdx = (y * imgWidth + x) * 4;
      const r = imgPixels[imgIdx];
      const g = imgPixels[imgIdx + 1];
      const b = imgPixels[imgIdx + 2];
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

      surroundingBrightness += brightness;
      surroundingPixelCount++;
    }
  }

  // Top-border reference band
  for (let y = Math.max(0, offsetY - sampleSize); y < offsetY; y++) {
    for (let x = offsetX; x < offsetX + maskWidth && x < imgWidth; x++) {
      const imgIdx = (y * imgWidth + x) * 4;
      const r = imgPixels[imgIdx];
      const g = imgPixels[imgIdx + 1];
      const b = imgPixels[imgIdx + 2];
      const brightness = 0.299 * r + 0.587 * g + 0.114 * b;

      surroundingBrightness += brightness;
      surroundingPixelCount++;
    }
  }

  const avgWatermarkBrightness = watermarkPixelCount > 0 
    ? watermarkBrightness / watermarkPixelCount 
    : 0;
  const avgSurroundingBrightness = surroundingPixelCount > 0 
    ? surroundingBrightness / surroundingPixelCount 
    : 128;

  // A white translucent overlay elevates region brightness
  const brightnessDiff = avgWatermarkBrightness - avgSurroundingBrightness;
  const threshold = 8.5; // Optimized delta threshold for accurate detection

  return {
    hasWatermark: brightnessDiff > threshold,
    diff: brightnessDiff
  };
}

/**
 * Applies Reverse Alpha Blending to correct watermark pixels and restore original colors.
 * 
 * Formula:
 *   Composite = Original * (1 - alpha) + Watermark * alpha
 *   Original = (Composite - Watermark * alpha) / (1 - alpha)
 * 
 * Since the watermark is pure white: Watermark = 255.
 */
export function applyReverseAlphaBlend(
  imgPixels: Uint8ClampedArray,
  maskPixels: Uint8ClampedArray,
  maskWidth: number,
  maskHeight: number,
  margin: number,
  imgWidth: number,
  imgHeight: number,
  opacityMultiplier: number
): void {
  const offsetX = imgWidth - maskWidth - margin;
  const offsetY = imgHeight - maskHeight - margin;

  if (offsetX < 0 || offsetY < 0) return;

  const wmFactor = 255 * opacityMultiplier;

  for (let my = 0; my < maskHeight; my++) {
    const imgY = offsetY + my;
    if (imgY < 0 || imgY >= imgHeight) continue;

    for (let mx = 0; mx < maskWidth; mx++) {
      const imgX = offsetX + mx;
      if (imgX < 0 || imgX >= imgWidth) continue;

      const maskIdx = (my * maskWidth + mx) * 4;
      const maskAlpha = maskPixels[maskIdx + 3];
      if (maskAlpha === 0) continue;

      const alpha = (maskAlpha / 255) * opacityMultiplier;
      if (alpha < 0.005) continue;

      const invAlpha = 1 - alpha;
      if (invAlpha < 0.005) continue;

      const imgIdx = (imgY * imgWidth + imgX) * 4;
      const compR = imgPixels[imgIdx];
      const compG = imgPixels[imgIdx + 1];
      const compB = imgPixels[imgIdx + 2];

      const sub = wmFactor * (maskAlpha / 255);
      const origR = (compR - sub) / invAlpha;
      const origG = (compG - sub) / invAlpha;
      const origB = (compB - sub) / invAlpha;

      imgPixels[imgIdx] = origR < 0 ? 0 : (origR > 255 ? 255 : (origR + 0.5) | 0);
      imgPixels[imgIdx + 1] = origG < 0 ? 0 : (origG > 255 ? 255 : (origG + 0.5) | 0);
      imgPixels[imgIdx + 2] = origB < 0 ? 0 : (origB > 255 ? 255 : (origB + 0.5) | 0);
    }
  }
}

/**
 * Surgically performs reverse alpha blending on a specific region inside a Canvas 2D context.
 * Useful for ultra-fast progressive frame rendering on videos without reading the entire frame.
 */
export function applyReverseAlphaBlendRegion(
  ctx: CanvasRenderingContext2D,
  maskPixels: Uint8ClampedArray,
  maskWidth: number,
  maskHeight: number,
  margin: number,
  imgWidth: number,
  imgHeight: number,
  opacityMultiplier: number
): void {
  const offsetX = imgWidth - maskWidth - margin;
  const offsetY = imgHeight - maskHeight - margin;

  if (offsetX < 0 || offsetY < 0) return;

  // Retrieve pixel buffer solely for the watermark bounding box region
  const regionData = ctx.getImageData(offsetX, offsetY, maskWidth, maskHeight);
  const pixels = regionData.data;
  const total = maskWidth * maskHeight * 4;

  const wmFactor = 255 * opacityMultiplier;

  for (let idx = 0; idx < total; idx += 4) {
    const maskAlpha = maskPixels[idx + 3];
    if (maskAlpha === 0) continue;

    const alpha = (maskAlpha / 255) * opacityMultiplier;
    if (alpha < 0.005) continue;

    const invAlpha = 1 - alpha;
    if (invAlpha < 0.005) continue;

    const compR = pixels[idx];
    const compG = pixels[idx + 1];
    const compB = pixels[idx + 2];

    const sub = wmFactor * (maskAlpha / 255);
    const origR = (compR - sub) / invAlpha;
    const origG = (compG - sub) / invAlpha;
    const origB = (compB - sub) / invAlpha;

    pixels[idx] = origR < 0 ? 0 : (origR > 255 ? 255 : (origR + 0.5) | 0);
    pixels[idx + 1] = origG < 0 ? 0 : (origG > 255 ? 255 : (origG + 0.5) | 0);
    pixels[idx + 2] = origB < 0 ? 0 : (origB > 255 ? 255 : (origB + 0.5) | 0);
  }

  // Draw altered region back onto the same area
  ctx.putImageData(regionData, offsetX, offsetY);
}
