export interface MaskConfig {
  size: number;
  margin: number;
  opacityMultiplier: number;
}

export interface ProcessedItem {
  id: string;
  filename: string;
  originalName: string;
  blob: Blob;
  blobUrl: string;
  originalBlob: Blob;
  originalBlobUrl: string;
  width: number;
  height: number;
  maskSize: number;
  margin: number;
  intensity: number;
  success: boolean;
  noWatermark: boolean;
  isVideo: boolean;
  duration?: number;
  error?: string;
  isConverting?: boolean;
  progress?: number;
}

export type Theme = 'light' | 'dark';
