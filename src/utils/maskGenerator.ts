/**
 * Programmatic visual generator for the Nano Banana and Gemini Sparkle Watermark Masks.
 * Generates white anti-aliased vectors on a black background
 * which are preprocessed into alpha maps for Reverse Alpha Blending.
 */

export function generateBananaMaskCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Fill background with black (Watermark absent)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);

  // Set style to draw the white banana shape
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const S = size;

  // Let's draw the banana body
  ctx.beginPath();
  
  // Start stem tip top-left
  const stemX1 = S * 0.28;
  const stemY1 = S * 0.14;
  
  // Tip of the banana bottom-right
  const tipX = S * 0.86;
  const tipY = S * 0.72;

  // Outer thick curve control point (curving deep towards bottom-left)
  const outerCtrlX = S * 0.12;
  const outerCtrlY = S * 0.88;

  // Inner narrow curve control point (curving gently towards top-right)
  const innerCtrlX = S * 0.72;
  const innerCtrlY = S * 0.32;

  ctx.moveTo(stemX1, stemY1);
  
  // Curve outer edge
  ctx.quadraticCurveTo(outerCtrlX, outerCtrlY, tipX, tipY);
  
  // Curve inner edge back
  ctx.quadraticCurveTo(innerCtrlX, innerCtrlY, stemX1, stemY1);
  
  ctx.fill();

  // Draw a stem structure at the top-left
  ctx.beginPath();
  ctx.lineWidth = S * 0.08;
  ctx.moveTo(stemX1, stemY1);
  ctx.lineTo(S * 0.36, S * 0.08); // curve stem slightly upwards
  ctx.stroke();

  // Draw the small dark tip at the bottom-right
  ctx.fillStyle = '#b0b0b0'; // slightly shaded tip
  ctx.beginPath();
  ctx.arc(tipX, tipY, S * 0.04, 0, Math.PI * 2);
  ctx.fill();

  return canvas;
}

export function generateSparkleMaskCanvas(size: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Fill background with black (Watermark absent)
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, size, size);

  // Set style to draw the white sparkle shape
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const Cx = size / 2;
  const Cy = size / 2;
  const R_active = size * 0.44; // leave standard space at edges for anti-aliasing safety

  ctx.beginPath();
  ctx.moveTo(Cx, Cy - R_active);
  // Quadrant 1: Top to Right curving back through center
  ctx.quadraticCurveTo(Cx, Cy, Cx + R_active, Cy);
  // Quadrant 2: Right to Bottom curving back through center
  ctx.quadraticCurveTo(Cx, Cy, Cx, Cy + R_active);
  // Quadrant 3: Bottom to Left curving back through center
  ctx.quadraticCurveTo(Cx, Cy, Cx - R_active, Cy);
  // Quadrant 4: Left to Top curving back through center
  ctx.quadraticCurveTo(Cx, Cy, Cx, Cy - R_active);
  ctx.closePath();
  ctx.fill();

  return canvas;
}

/**
 * Preprocesses mask image data:
 * Converts full RGB brightness into exact Alpha channel intensity,
 * and sets the pixel values to full white (R=255, G=255, B=255).
 */
export function preprocessMaskData(ctx: CanvasRenderingContext2D, width: number, height: number): ImageData {
  const rawData = ctx.getImageData(0, 0, width, height);
  const data = rawData.data;
  const length = data.length;

  const processed = new ImageData(width, height);
  const out = processed.data;

  for (let i = 0; i < length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];

    // standard luminance formula to extract watermark alpha intensity
    const luminance = Math.round(0.299 * r + 0.587 * g + 0.114 * b);

    out[i] = 255;     // Red (Watermark is always white)
    out[i + 1] = 255; // Green
    out[i + 2] = 255; // Blue
    out[i + 3] = luminance; // Alpha channel maps to brightness
  }

  return processed;
}

export interface PreprocessedMask {
  size: number;
  canvas: HTMLCanvasElement;
  imageData: ImageData;
  defaultMargin: number;
}

export function loadGeneratedMasks(style: 'banana' | 'sparkle' = 'sparkle'): Map<number, PreprocessedMask> {
  const maskMap = new Map<number, PreprocessedMask>();
  const sizes = [
    { size: 96, margin: 64 },
    { size: 48, margin: 32 }
  ];

  for (const { size, margin } of sizes) {
    const canvas = style === 'sparkle' ? generateSparkleMaskCanvas(size) : generateBananaMaskCanvas(size);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const imageData = preprocessMaskData(ctx, size, size);
      maskMap.set(size, {
        size,
        canvas,
        imageData,
        defaultMargin: margin
      });
    }
  }

  return maskMap;
}
