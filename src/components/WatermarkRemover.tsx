import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Sliders, 
  Download, 
  Trash2, 
  Settings, 
  HelpCircle, 
  RefreshCw, 
  Eye, 
  Info, 
  Globe, 
  FileVideo, 
  Sparkles,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  X,
  Check,
  AlertTriangle,
  Flame,
  Sun,
  Moon,
  Star,
  Shield
} from 'lucide-react';
import { ProcessedItem, MaskConfig } from '../types';
import { loadGeneratedMasks, generateBananaMaskCanvas, preprocessMaskData, PreprocessedMask } from '../utils/maskGenerator';
import { detectWatermark, applyReverseAlphaBlend, applyReverseAlphaBlendRegion } from '../utils/watermarkRemover';
import { LOCALES, Translation, LANGUAGE_NAMES } from '../utils/locales';
import { Muxer, ArrayBufferTarget } from 'mp4-muxer';
import { motion, AnimatePresence } from 'motion/react';

export default function WatermarkRemover() {
  // Localization state safely handled with try/catch fallback for mobile frames
  const [lang, setLang] = useState<string>(() => {
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('language') : null;
      if (saved && LOCALES[saved]) return saved;
    } catch (e) {}
    
    const rawLang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'en';
    const n = rawLang.split('-')[0];
    return LOCALES[n] ? n : 'en';
  });
  const [showLangDropdown, setShowLangDropdown] = useState(false);
  const t: Translation = LOCALES[lang] || LOCALES.en;

  // Watermark Style state: 'custom' | 'banana' | 'sparkle'
  const [maskStyle, setMaskStyle] = useState<'custom' | 'banana' | 'sparkle'>('custom');

  // Mask presets state
  const [masksMap, setMasksMap] = useState<Map<number, PreprocessedMask>>(() => loadGeneratedMasks('sparkle'));

  // Sync / load actual uploaded mask files dynamically
  useEffect(() => {
    let active = true;

    async function loadAllMasks() {
      // 1. Generate fallback masks instantly so there is no delay
      const fallback = loadGeneratedMasks(maskStyle === 'custom' ? 'sparkle' : maskStyle);
      if (!active) return;
      setMasksMap(fallback);

      // 2. Try to asynchronously load uploaded real masks if style is 'custom'
      if (maskStyle === 'custom') {
        try {
          const sizesObj = [
            { size: 96, margin: 64 },
            { size: 48, margin: 32 }
          ];

          const loadedMap = new Map<number, PreprocessedMask>();

          await Promise.all(
            sizesObj.map(async ({ size, margin }) => {
              const img = new Image();
              img.crossOrigin = 'anonymous';
              
              // Return Promise for image loading
              const loadedMask = await new Promise<PreprocessedMask>((resolve, reject) => {
                img.onload = () => {
                  const canvas = document.createElement('canvas');
                  canvas.width = size;
                  canvas.height = size;
                  const ctx = canvas.getContext('2d');
                  if (ctx) {
                    ctx.drawImage(img, 0, 0, size, size);
                    const imageData = preprocessMaskData(ctx, size, size);
                    resolve({
                      size,
                      canvas,
                      imageData,
                      defaultMargin: margin
                    });
                  } else {
                    reject(new Error('Failed to create canvas context'));
                  }
                };
                img.onerror = () => {
                  reject(new Error(`Failed to load uploaded file mask_${size}.png`));
                };
                img.src = `/assets/.aistudio/mask_${size}.png?t=${Date.now()}`; // Bypass potential caching issues
              });

              loadedMap.set(size, loadedMask);
            })
          );

          if (active) {
            console.log('✓ Successfully loaded and preprocessed uploaded real PNG masks from .aistudio!', loadedMap);
            setMasksMap(loadedMap);
          }
        } catch (err) {
          console.log('Fallback: Uploaded files not ready or empty. Using programmatic high-fidelity generator.', err);
        }
      }
    }

    loadAllMasks();

    return () => {
      active = false;
    };
  }, [maskStyle]);
  
  // App variables
  const [processedItems, setProcessedItems] = useState<ProcessedItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Video Preview Modal Configuration
  interface VideoPreviewTask {
    file: File;
    draftId: string;
    w: number;
    h: number;
    duration: number;
    originalFrameData: ImageData;
    margin: number;
    intensity: number;
    force: boolean;
    resolve: (config: { margin: number; intensity: number; force: boolean } | null) => void;
  }
  const [activeVideoTask, setActiveVideoTask] = useState<VideoPreviewTask | null>(null);
  const modalCanvasRef = useRef<HTMLCanvasElement>(null);
  
  // Advanced control states
  const [forceRemove, setForceRemove] = useState(false);
  const [customMargin, setCustomMargin] = useState(0); // 0 = Auto
  const [customOpacity, setCustomOpacity] = useState(0); // 0 = Auto
  const [customMaskSize, setCustomMaskSize] = useState<number>(0); // 0 = Auto (adapts based on media size)

  // Layout states
  const [mobileActiveTab, setMobileActiveTab] = useState<'control' | 'results'>('control');
  const [activePolicyModal, setActivePolicyModal] = useState<'privacy' | 'terms' | 'about' | 'contact' | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [lightboxShowingOriginal, setLightboxShowingOriginal] = useState(false);
  const [activeFAQ, setActiveFAQ] = useState<number | null>(null);

  // Dark Mode state safely
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    try {
      const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('theme') : null;
      if (saved) return saved === 'dark';
    } catch (e) {}
    try {
      if (typeof window !== 'undefined' && window.matchMedia) {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
      }
    } catch (e) {}
    return false;
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('theme', 'dark');
        }
      } catch (e) {}
    } else {
      document.documentElement.classList.remove('dark');
      try {
        if (typeof localStorage !== 'undefined') {
          localStorage.setItem('theme', 'light');
        }
      } catch (e) {}
    }
  }, [darkMode]);

  // Hidden references for processing
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeVideoRef = useRef<HTMLVideoElement | null>(null);

  // Live Canvas Bounding Box Editor Preview
  const maskPreviewCanvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = maskPreviewCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 160;
    canvas.width = size;
    canvas.height = size;

    // Draw dark blue tech backing representing image corner
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, size, size);

    // Draw coordinate dots
    ctx.strokeStyle = '#334155';
    ctx.lineWidth = 1;
    for (let i = 16; i < size; i += 16) {
      ctx.beginPath();
      ctx.moveTo(i, 0); ctx.lineTo(i, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, i); ctx.lineTo(size, i);
      ctx.stroke();
    }

    // Determine watermark size based on state
    const currentSize = customMaskSize > 0 ? customMaskSize : 48;
    const currentMargin = customMargin > 0 ? customMargin : 32;
    const opacityMult = customOpacity > 0 ? customOpacity / 100 : 1.0;

    // Calculate simulated offset on 160x160 viewport
    // Shift scale down so it fits visually
    const fitScale = 0.8;
    const mSize = Math.max(20, Math.min(80, currentSize * fitScale));
    const mMargin = Math.max(10, Math.min(45, currentMargin * fitScale));

    const offsetLeft = size - mSize - mMargin;
    const offsetTop = size - mSize - mMargin;

    // Draw simulated safe outline boundary box
    ctx.strokeStyle = '#2563eb';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(offsetLeft, offsetTop, mSize, mSize);
    ctx.setLineDash([]);

    // Draw dynamic mini watermark matching actual curves
    ctx.fillStyle = `rgba(251, 191, 36, ${0.4 * opacityMult})`;
    ctx.strokeStyle = `rgba(251, 191, 36, ${0.4 * opacityMult})`;

    ctx.save();
    // Translate to center of simulated envelope box
    ctx.translate(offsetLeft + mSize/2, offsetTop + mSize/2);
    ctx.scale(mSize / 48, mSize / 48);

    if (maskStyle === 'banana') {
      // Draw micro banana path
      ctx.beginPath();
      ctx.moveTo(-11, -17);
      ctx.quadraticCurveTo(-18, 17, 17, 11);
      ctx.quadraticCurveTo(11, -8, -11, -17);
      ctx.fill();

      ctx.beginPath();
      ctx.lineWidth = 3;
      ctx.moveTo(-11, -17);
      ctx.lineTo(-7, -20);
      ctx.stroke();
    } else if (maskStyle === 'sparkle') {
      // Draw micro 4-point sparkle path (Cx=0, Cy=0, R=21 is active size inside 48 scale bounds)
      const r = 21;
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.quadraticCurveTo(0, 0, 0, r);
      ctx.quadraticCurveTo(0, 0, -r, 0);
      ctx.quadraticCurveTo(0, 0, 0, -r);
      ctx.closePath();
      ctx.fill();
    } else {
      // Draw custom uploaded mask image scaled
      const activeMask = masksMap.get(currentSize) || masksMap.get(48)!;
      if (activeMask && activeMask.canvas) {
        ctx.drawImage(activeMask.canvas, -24, -24, 48, 48);
      }
    }
    ctx.restore();

    // Text specs
    ctx.fillStyle = '#94a3b8';
    ctx.font = '9px monospace';
    ctx.fillText(`Offset: ${currentMargin}px`, 8, 18);
    ctx.fillText(`Scale: ${currentSize}px`, 8, 30);
    ctx.fillText(`Intensity: ${Math.round(opacityMult * 100)}%`, 8, 42);
    if (forceRemove) {
      ctx.fillStyle = '#f43f5e';
      ctx.fillText('[FORCE_MODE]', 8, 54);
    }
  }, [customMargin, customOpacity, customMaskSize, forceRemove, maskStyle, masksMap]);

  // Dynamic Canvas rendering loop inside the Video Preview Modal
  useEffect(() => {
    if (!activeVideoTask || !modalCanvasRef.current) return;
    const canvas = modalCanvasRef.current;
    canvas.width = activeVideoTask.w;
    canvas.height = activeVideoTask.h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // 1. Draw the clear extracted raw pixel frame
    ctx.putImageData(activeVideoTask.originalFrameData, 0, 0);

    // 2. Resolve target size
    let maskSize = 48;
    if (customMaskSize > 0) {
      maskSize = customMaskSize;
    } else if (activeVideoTask.w > 1024 && activeVideoTask.h > 1024) {
      maskSize = 96;
    }
    const maskObj = masksMap.get(maskSize) || masksMap.get(48)!;

    // 3. Capture testing region and check/apply Reverse Blend region
    const opacityMult = activeVideoTask.intensity / 100;
    const hasWatermark = detectWatermark(
      activeVideoTask.originalFrameData.data,
      maskObj.imageData.data,
      maskSize,
      maskSize,
      activeVideoTask.margin,
      activeVideoTask.w,
      activeVideoTask.h
    ).hasWatermark;

    if (hasWatermark || activeVideoTask.force) {
      applyReverseAlphaBlendRegion(
        ctx,
        maskObj.imageData.data,
        maskSize,
        maskSize,
        activeVideoTask.margin,
        activeVideoTask.w,
        activeVideoTask.h,
        opacityMult
      );
    }
  }, [activeVideoTask, masksMap, customMaskSize]);

  // Handle Drag & Drop
  const [dragActive, setDragActive] = useState(false);
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processUploadedFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleManualUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processUploadedFiles(Array.from(e.target.files));
    }
  };

  // Main file router (Images / Video)
  const processUploadedFiles = async (files: File[]) => {
    setIsProcessing(true);
    const results: ProcessedItem[] = [];

    for (const file of files) {
      const isVideo = file.type.startsWith('video/');
      const randomId = Math.random().toString(36).substring(2, 11);
      
      const draftItem: ProcessedItem = {
        id: randomId,
        filename: `${file.name.replace(/\.[^.]+$/, '')}_cleared${isVideo ? '.mp4' : '.png'}`,
        originalName: file.name,
        blob: file,
        blobUrl: URL.createObjectURL(file),
        originalBlob: file,
        originalBlobUrl: URL.createObjectURL(file),
        width: 0,
        height: 0,
        maskSize: 0,
        margin: 0,
        intensity: 0,
        success: false,
        noWatermark: false,
        isVideo,
        isConverting: true,
        progress: 0
      };

      // Append immediately to state for loading dashboard sequence
      setProcessedItems(prev => [...prev, draftItem]);
      setMobileActiveTab('results');

      try {
        if (isVideo) {
          const result = await processVideoItem(file, draftItem);
          setProcessedItems(prev => prev.map(item => item.id === randomId ? { ...item, ...result, isConverting: false } : item));
        } else {
          const result = await processImageItem(file, draftItem);
          setProcessedItems(prev => prev.map(item => item.id === randomId ? { ...item, ...result, isConverting: false } : item));
        }
      } catch (err: any) {
        console.error('Task error:', err);
        setProcessedItems(prev => prev.map(item => item.id === randomId ? { 
          ...item, 
          isConverting: false, 
          success: false, 
          error: err?.message || 'Processing error' 
        } : item));
      }
    }
    setIsProcessing(false);
  };

  // Image Processing Implementation
  const processImageItem = async (file: File, draft: ProcessedItem): Promise<Partial<ProcessedItem>> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const w = img.naturalWidth;
        const h = img.naturalHeight;

        // Auto select mask size based on resolution
        let maskSize = 48;
        if (customMaskSize > 0) {
          maskSize = customMaskSize;
        } else if (w > 1024 && h > 1024) {
          maskSize = 96;
        }

        // Gather matching mask
        const maskObj = masksMap.get(maskSize) || masksMap.get(48)!;
        const activeMargin = customMargin > 0 ? customMargin : maskObj.defaultMargin;
        const opacityMult = customOpacity > 0 ? customOpacity / 100 : 1.0;

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to capture canvas context'));
          return;
        }

        // Draw original
        ctx.drawImage(img, 0, 0);
        const imgData = ctx.getImageData(0, 0, w, h);

        // Run Watermark Detection
        const detection = detectWatermark(
          imgData.data,
          maskObj.imageData.data,
          maskSize,
          maskSize,
          activeMargin,
          w,
          h
        );

        let didWork = false;
        if (detection.hasWatermark || forceRemove) {
          // Applying standard inverse math
          applyReverseAlphaBlend(
            imgData.data,
            maskObj.imageData.data,
            maskSize,
            maskSize,
            activeMargin,
            w,
            h,
            opacityMult
          );
          ctx.putImageData(imgData, 0, 0);
          didWork = true;
        }

        canvas.toBlob((processedBlob) => {
          if (!processedBlob) {
            reject(new Error('Canvas serialization failed'));
            return;
          }
          resolve({
            width: w,
            height: h,
            maskSize,
            margin: activeMargin,
            intensity: Math.round(opacityMult * 100),
            success: true,
            noWatermark: !didWork,
            blob: processedBlob,
            blobUrl: URL.createObjectURL(processedBlob)
          });
        }, 'image/png');
      };

      img.onerror = () => reject(new Error('Failed to parse image file'));
      img.src = draft.blobUrl;
    });
  };

  // Video Processing Implementation (preserving audio sync)
  const processVideoItem = async (file: File, draft: ProcessedItem): Promise<Partial<ProcessedItem>> => {
    return new Promise(async (resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true;
      video.playsInline = true;
      video.src = draft.blobUrl;
      activeVideoRef.current = video;

      // Append video off-screen to activate hard-accelerated background decoding
      // Set to 0.01 opacity with tiny width/height inline, so iOS/Safari doesn't suspend frame processing
      video.style.position = 'fixed';
      video.style.top = '10px';
      video.style.left = '10px';
      video.style.width = '240px';
      video.style.height = '180px';
      video.style.opacity = '0.01';
      video.style.pointerEvents = 'none';
      video.style.zIndex = '-50';
      video.style.transform = 'translate3d(0, 0, 0)';
      document.body.appendChild(video);

      video.onloadedmetadata = async () => {
        const w = video.videoWidth;
        const h = video.videoHeight;
        const duration = video.duration || 10;

        // Auto select mask
        let maskSize = 48;
        if (customMaskSize > 0) {
          maskSize = customMaskSize;
        } else if (w > 1024 && h > 1024) {
          maskSize = 96;
        }

        const maskObj = masksMap.get(maskSize) || masksMap.get(48)!;
        const activeMargin = customMargin > 0 ? customMargin : 72; // default video offset 
        const opacityMult = customOpacity > 0 ? customOpacity / 100 : 0.60; // default intensity

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.style.willChange = 'transform';
        const ctx = canvas.getContext('2d', {
          alpha: false,
          desynchronized: true,
          colorSpace: 'srgb'
        });
        if (!ctx) {
          reject(new Error('Canvas initializing failed'));
          return;
        }

        // Seek to midpoint for a frame capture to inspect watermark existence and show dynamic preview
        video.currentTime = Math.min(1.0, duration / 2);
        
        await new Promise(r => {
          video.onseeked = r;
        });

        // Test one frame
        ctx.drawImage(video, 0, 0, w, h);
        const testImgData = ctx.getImageData(0, 0, w, h);

        // Present interactive Video Conversion Preview Dialog before continuing!
        const modalConfig = await new Promise<{ margin: number; intensity: number; force: boolean } | null>((resModal) => {
          setActiveVideoTask({
            file,
            draftId: draft.id,
            w,
            h,
            duration,
            originalFrameData: testImgData,
            margin: activeMargin,
            intensity: Math.round(opacityMult * 100),
            force: forceRemove,
            resolve: resModal
          });
        });

        // Hide overlay/modal
        setActiveVideoTask(null);

        if (!modalConfig) {
          reject(new Error('Conversion cancelled by user'));
          return;
        }

        const finalMargin = modalConfig.margin;
        const finalOpacity = modalConfig.intensity / 100;
        const finalForce = modalConfig.force;

        // Prepare frame-by-frame rendering recorder sequence
        video.currentTime = 0;
        await new Promise(r => {
          video.onseeked = r;
        });

        // Stream merge pipeline - capture stream at fixed 30fps to guarantee perfect smooth output
        const canvasStream = (canvas as any).captureStream 
          ? (canvas as any).captureStream(30) 
          : ((canvas as any).mozCaptureStream 
            ? (canvas as any).mozCaptureStream(30) 
            : null);
        const combinedStream = new MediaStream();

        // Add video track
        if (canvasStream && canvasStream.getVideoTracks().length > 0) {
          combinedStream.addTrack(canvasStream.getVideoTracks()[0]);
        } else {
          console.error("No video tracks found from canvas stream capture.");
        }

        // Attempt Audio capture from video element
        let mediaRecorder: MediaRecorder;
        let audioContext: AudioContext | null = null;
        let audioDestination: MediaStreamAudioDestinationNode | null = null;

        try {
          const originalStream = (video as any).captureStream ? (video as any).captureStream() : ((canvas as any).mozCaptureStream ? (canvas as any).mozCaptureStream() : null);
          if (originalStream && originalStream.getAudioTracks().length > 0) {
            combinedStream.addTrack(originalStream.getAudioTracks()[0]);
          } else {
            // Web Audio API context fallback
            const AudioContextClass = (window as any).AudioContext || (window as any).webkitAudioContext;
            if (AudioContextClass) {
              try {
                audioContext = new AudioContextClass();
                const sourceNode = audioContext.createMediaElementSource(video);
                audioDestination = audioContext.createMediaStreamDestination();
                sourceNode.connect(audioDestination);
                // connect to default audio output so they can play if needed
                sourceNode.connect(audioContext.destination);

                if (audioDestination.stream.getAudioTracks().length > 0) {
                  combinedStream.addTrack(audioDestination.stream.getAudioTracks()[0]);
                }
              } catch (audioCtxErr) {
                console.warn('AudioContext creation or play routing failed:', audioCtxErr);
              }
            }
          }
        } catch (audioErr) {
          console.warn('Audio capture skipped or direct pipe configured: ', audioErr);
        }

        // Setup recorder options prioritizing H.264 (avc1/h264) codec with standard Fallbacks
        const mimeTypesToTry = [
          'video/mp4;codecs=avc1,mp4a.40.2',
          'video/mp4;codecs=avc1',
          'video/mp4;codecs=h264,aac',
          'video/mp4;codecs=h264',
          'video/mp4',
          'video/quicktime;codecs=h264',
          'video/quicktime',
          'video/webm;codecs=h264,opus',
          'video/webm;codecs=h264',
          'video/webm;codecs=avc1',
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm'
        ];

        let mimeType = '';
        for (const type of mimeTypesToTry) {
          if (MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(type)) {
            mimeType = type;
            break;
          }
        }
        if (!mimeType) {
          mimeType = 'video/webm';
        }

        // Calculate high-fidelity bitrate (4K: 80 Mbps, 1080p: 45 Mbps, etc.) to keep lossless original quality
        const videoBitrate =
          w >= 3840 ? 80000000 :
          w >= 1920 ? 45000000 :
          w >= 1280 ? 25000000 :
          12000000;

        try {
          mediaRecorder = new MediaRecorder(combinedStream, { 
            mimeType,
            videoBitsPerSecond: videoBitrate
          });
        } catch (recErr) {
          console.warn('Custom mimeType with bitrate unsupported, switching to fallback configuration:', recErr);
          try {
            mediaRecorder = new MediaRecorder(combinedStream, { 
              videoBitsPerSecond: videoBitrate
            });
          } catch (e) {
            mediaRecorder = new MediaRecorder(combinedStream);
          }
        }

        const recordedChunks: Blob[] = [];
        mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            recordedChunks.push(event.data);
          }
        };

        mediaRecorder.onstop = () => {
          if (audioContext) {
            audioContext.close().catch(() => {});
          }
          if (document.body.contains(video)) {
            document.body.removeChild(video);
          }
          const finishedBlob = new Blob(recordedChunks, { type: mediaRecorder.mimeType });
          resolve({
            width: w,
            height: h,
            maskSize,
            margin: finalMargin,
            intensity: Math.round(finalOpacity * 100),
            success: true,
            noWatermark: false,
            blob: finishedBlob,
            blobUrl: URL.createObjectURL(finishedBlob)
          });
        };

        // Execution frame loop with robust fallback for devices (like iOS Safari / old browsers) without requestVideoFrameCallback
        let rAFId = 0;
        let lastPercent = -1;
        const useFrameCallback = typeof (video as any).requestVideoFrameCallback === 'function';

        const processFrame = () => {
          if (video.paused || video.ended) return;

          // Paint frame
          ctx.drawImage(video, 0, 0, w, h);

          // Apply Reverse Alpha Blending filter on calculated coordinates
          applyReverseAlphaBlendRegion(
            ctx,
            maskObj.imageData.data,
            maskSize,
            maskSize,
            finalMargin,
            w,
            h,
            finalOpacity
          );

          // Throttled Progress tracker to avoid React freeze
          const progressVal = Math.min(0.99, video.currentTime / duration);
          const currentPercent = Math.floor(progressVal * 100);
          if (currentPercent % 5 === 0 && currentPercent !== lastPercent) {
            lastPercent = currentPercent;
            setProcessedItems(prev => prev.map(item => item.id === draft.id ? { ...item, progress: progressVal } : item));
          }

          if (useFrameCallback) {
            rAFId = (video as any).requestVideoFrameCallback(processFrame);
          } else {
            rAFId = requestAnimationFrame(processFrame);
          }
        };

        // Begin play-based rendering pipeline
        mediaRecorder.start();
        video.currentTime = 0;
        video.muted = true;
        video.playbackRate = 1.0;

        video.play().then(() => {
          if (useFrameCallback) {
            rAFId = (video as any).requestVideoFrameCallback(processFrame);
          } else {
            rAFId = requestAnimationFrame(processFrame);
          }
        }).catch(err => {
          mediaRecorder.stop();
          if (document.body.contains(video)) {
            document.body.removeChild(video);
          }
          reject(new Error('Playback initialization failed: ' + err.message));
        });

        // Listen for video end to wrap compile
        video.onended = () => {
          if (useFrameCallback && (video as any).cancelVideoFrameCallback) {
            (video as any).cancelVideoFrameCallback(rAFId);
          } else {
            cancelAnimationFrame(rAFId);
          }
          if (mediaRecorder.state !== 'inactive') {
            mediaRecorder.stop();
          }
        };
      };

      video.onerror = () => {
        if (document.body.contains(video)) {
          document.body.removeChild(video);
        }
        reject(new Error('Failed to load video properties'));
      };
    });
  };

  // Global Actions
  const clearDatabase = () => {
    processedItems.forEach(item => {
      URL.revokeObjectURL(item.blobUrl);
      URL.revokeObjectURL(item.originalBlobUrl);
    });
    setProcessedItems([]);
  };

  const downloadAllItems = async () => {
    const valid = processedItems.filter(item => item.success && !item.isConverting);
    if (valid.length === 0) return;

    for (let i = 0; i < valid.length; i++) {
      const item = valid[i];
      const link = document.createElement('a');
      link.href = item.blobUrl;
      link.download = item.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Delay to avoid browser bulk block trigger
      if (i < valid.length - 1) {
        await new Promise(r => setTimeout(r, 400));
      }
    }
  };

  const triggerManualInput = () => {
    fileInputRef.current?.click();
  };

  // Keyboard navigation on comparison lightbox
  useEffect(() => {
    const handleKeys = (e: KeyboardEvent) => {
      if (lightboxIndex === null) return;
      if (e.key === 'Escape') {
        setLightboxIndex(null);
      } else if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        setLightboxShowingOriginal(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeys);
    return () => window.removeEventListener('keydown', handleKeys);
  }, [lightboxIndex]);  return (
    <div className="relative min-h-screen w-full flex flex-col items-center justify-start select-none font-sans overflow-x-hidden text-slate-800 dark:text-slate-100 transition-colors duration-500" id="watermark-app-root">
      {/* Dynamic Cyber-Mint Grid & Aura Background System */}
      <div className="absolute inset-0 bg-[#f7faf8] dark:bg-[#050806] transition-colors duration-500 -z-50" />
      <div className="absolute inset-x-0 top-0 h-[720px] bg-[linear-gradient(to_right,rgba(0,182,122,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,182,122,0.04)_1px,transparent_1px)] dark:bg-[linear-gradient(to_right,rgba(0,182,122,0.015)_1px,transparent_1px),linear-gradient(to_bottom,rgba(0,182,122,0.015)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] pointer-events-none -z-40" />
      
      {/* Cosmic Fluid Light Glimmers */}
      <div className="absolute top-[-10%] left-[-5%] w-[60%] h-[40%] bg-gradient-to-tr from-emerald-500/8 to-teal-500/4 dark:from-emerald-700/12 dark:to-emerald-900/4 rounded-full blur-[130px] pointer-events-none -z-30 animate-pulse" style={{ animationDuration: '12s' }} />
      <div className="absolute top-[20%] right-[-10%] w-[50%] h-[45%] bg-gradient-to-bl from-teal-500/4 to-emerald-500/6 dark:from-emerald-950/15 dark:to-slate-900/8 rounded-full blur-[130px] pointer-events-none -z-30" style={{ animationDuration: '18s' }} />

      <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-8 py-6 md:py-10 z-20">
        
        {/* PREMIUM GLOBAL HEADER */}
        <header className="relative flex flex-col md:flex-row md:items-center justify-between pb-5 mb-6 border-b border-slate-200/80 dark:border-emerald-900/15 gap-4" id="header-nav">
          <div className="flex items-center gap-3.5">
            {/* BRAND LOGO CONSOLE */}
            <div className="flex items-center justify-center w-10.5 h-10.5 rounded-xl bg-gradient-to-br from-[#00b67a] via-[#00c584] to-emerald-600 text-white shadow-md shadow-emerald-500/10 dark:shadow-emerald-950/20 flex-shrink-0">
              <Sparkles className="w-5.5 h-5.5 text-white" />
            </div>

            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white tracking-tight leading-none">
                  {t.title.split(' ')[0]} <span className="bg-gradient-to-r from-[#00b67a] via-[#00c584] to-emerald-600 bg-clip-text text-transparent">{t.title.split(' ').slice(1).join(' ') || 'Remover'}</span>
                </h1>
                
                {/* Minimalist security badging pill */}
                <div className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/15 dark:bg-emerald-500/15 border border-emerald-500/20 rounded-full text-[9px] font-black text-[#00b67a] uppercase tracking-wider">
                  <Shield className="w-2.5 h-2.5 fill-emerald-500/10" />
                  <span>Secure Local</span>
                </div>
              </div>
              <p className="text-slate-500 dark:text-slate-450 text-[11px] font-semibold leading-tight truncate max-w-[280px] sm:max-w-md md:max-w-xl" dangerouslySetInnerHTML={{ __html: t.subtitle }} />
            </div>
          </div>
 
          {/* UTILITY BAR GROUP */}
          <div className="flex flex-wrap items-center justify-start sm:justify-end gap-2.5 mt-2 md:mt-0" id="utils-rail">
            
            {/* Gorgeous Floating Language Custom Box */}
            <div className="relative">
              <button 
                onClick={() => setShowLangDropdown(prev => !prev)}
                className="inline-flex items-center gap-2 h-10 px-3.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-white/90 dark:bg-[#0c0f0d]/90 border border-slate-200 dark:border-emerald-950 rounded-xl hover:bg-slate-50 dark:hover:bg-emerald-950/20 backdrop-blur-md transition-all shadow-xs cursor-pointer focus:outline-none"
                id="langToggle"
              >
                <Globe className="w-4 h-4 text-[#00b67a]" />
                <span>{LANGUAGE_NAMES[lang] || lang}</span>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 transition-transform duration-200" />
              </button>
              
              <AnimatePresence>
                {showLangDropdown && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95, y: 6 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 6 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 mt-2 w-48 max-h-72 overflow-y-auto bg-white dark:bg-[#070a08] border border-slate-200 dark:border-emerald-900/30 rounded-xl shadow-xl py-2 z-50 divide-y divide-slate-100 dark:divide-emerald-950/20 scrollbar-thin scrollbar-thumb-emerald-500/20" 
                    id="langDropdown"
                  >
                    {Object.keys(LOCALES).map((lCode) => (
                      <button
                        key={lCode}
                        onClick={() => {
                          setLang(lCode);
                          localStorage.setItem('language', lCode);
                          setShowLangDropdown(false);
                        }}
                        className={`w-full px-4 py-2.5 text-left text-xs font-bold hover:bg-emerald-500/5 flex items-center justify-between transition-colors cursor-pointer ${lang === lCode ? 'text-[#00b67a] bg-emerald-500/5 font-extrabold' : 'text-slate-600 dark:text-slate-350'}`}
                      >
                        <span>{LANGUAGE_NAMES[lCode] || lCode}</span>
                        {lang === lCode && <Check className="w-4 h-4 text-[#00b67a]" />}
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
 
            <div className="hidden sm:block w-[1px] h-5 bg-slate-200 dark:bg-emerald-900/30" />
 
            {/* Elegant Mode Toggle */}
            <button
              onClick={() => setDarkMode(prev => !prev)}
              type="button"
              className="flex items-center justify-center w-10 h-10 rounded-xl text-slate-700 dark:text-slate-200 bg-white/90 dark:bg-[#0c0f0d]/90 border border-slate-200 dark:border-emerald-950 hover:bg-slate-50 dark:hover:bg-emerald-950/20 backdrop-blur-md transition-all shadow-xs cursor-pointer focus:outline-none"
              title={darkMode ? "Switch to Light Mode" : "Switch to Dark Mode"}
            >
              {darkMode ? (
                <Sun className="w-4.5 h-4.5 text-amber-500" />
              ) : (
                <Moon className="w-4.5 h-4.5 text-emerald-600" />
              )}
            </button>
          </div>
        </header>
 
        {/* MOBILE RESPONSIVE SWITCH TABS */}
        <div className="flex lg:hidden mb-6 p-1 bg-white/75 dark:bg-[#0c100d]/90 border border-slate-200 dark:border-emerald-950/40 rounded-2xl shadow-xs overflow-hidden gap-1" id="mobile-tabs-rail">
          <button
            onClick={() => setMobileActiveTab('control')}
            type="button"
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold rounded-xl transition-all cursor-pointer ${
              mobileActiveTab === 'control'
                ? 'bg-[#00b67a] text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Upload & Settings</span>
          </button>
          
          <button
            onClick={() => setMobileActiveTab('results')}
            type="button"
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 text-xs font-bold rounded-xl transition-all cursor-pointer relative ${
              mobileActiveTab === 'results'
                ? 'bg-[#00b67a] text-white shadow-xs'
                : 'text-slate-500 dark:text-slate-450 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Processed Results</span>
            {processedItems.length > 0 && (
              <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-extrabold ${
                mobileActiveTab === 'results' ? 'bg-white text-[#00b67a]' : 'bg-[#00b67a] text-white'
              }`}>
                {processedItems.length}
              </span>
            )}
            {processedItems.some(i => i.isConverting) && (
              <span className="absolute top-2 right-2 flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#ff4a4a] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#ff4a4a]"></span>
              </span>
            )}
          </button>
        </div>

        {/* CORE WORKSPACE GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start" id="workspace-grid">
          
          {/* LEFT COLUMN: CONTROL PANEL DECK */}
          <aside className={`lg:col-span-4 lg:sticky lg:top-6 flex flex-col gap-6 ${mobileActiveTab === 'control' ? 'flex' : 'hidden lg:flex'}`} id="control-sidebar">
            
            {/* APERTURE MEDIA UPLOAD CHASSIS */}
            <motion.div 
              whileHover={{ y: -4 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              onDragEnter={handleDrag}
              onDragOver={handleDrag}
              onDragLeave={handleDrag}
              onDrop={handleDrop}
              onClick={triggerManualInput}
              className={`group relative flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-6 md:p-8 text-center cursor-pointer transition-all duration-300 bg-white dark:bg-[#0c100d]/90 backdrop-blur-md ${
                dragActive 
                  ? 'border-[#00b67a] bg-emerald-500/5 shadow-[0_0_24px_rgba(0,182,122,0.16)] text-[#00b67a]' 
                  : 'border-slate-200 dark:border-emerald-900/25 hover:border-[#00b67a] dark:hover:border-emerald-600 hover:shadow-xl dark:hover:shadow-[0_8px_30px_rgba(0,182,122,0.06)]'
              }`}
              id="dropZone"
            >
              {/* Scan overlay */}
              <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_center,rgba(0,182,122,0.03),transparent)] opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
              
              {/* Calibration reticle corners */}
              <div className="absolute top-4 left-4 w-3.5 h-3.5 border-t-2 border-l-2 border-slate-300 dark:border-emerald-900/40 group-hover:border-[#00b67a]/80 transition-colors" />
              <div className="absolute top-4 right-4 w-3.5 h-3.5 border-t-2 border-r-2 border-slate-300 dark:border-emerald-900/40 group-hover:border-[#00b67a]/80 transition-colors" />
              <div className="absolute bottom-4 left-4 w-3.5 h-3.5 border-b-2 border-l-2 border-slate-300 dark:border-emerald-900/40 group-hover:border-[#00b67a]/80 transition-colors" />
              <div className="absolute bottom-4 right-4 w-3.5 h-3.5 border-b-2 border-r-2 border-slate-300 dark:border-emerald-900/40 group-hover:border-[#00b67a]/80 transition-colors" />
 
              <div className="flex p-4 bg-emerald-500/5 text-[#00b67a] border border-emerald-500/10 rounded-xl mb-4 transition-all duration-300 group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-[0_4px_18px_rgba(0,182,122,0.15)]">
                <Upload className="w-6 h-6 animate-pulse" />
              </div>
 
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1.5 tracking-tight">{t.dropText}</h3>
              <p className="text-[11px] text-slate-450 dark:text-slate-400 mb-5 px-3 leading-relaxed font-semibold">{t.dropHint}</p>
              
              <button 
                type="button" 
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-xs font-extrabold text-white bg-gradient-to-r from-[#00b67a] to-emerald-600 hover:from-[#00c584] hover:to-emerald-500 rounded-lg shadow-md hover:shadow-lg hover:shadow-emerald-550/10 dark:shadow-emerald-950/20 cursor-pointer transition-all duration-200 active:scale-95"
              >
                <span>{t.chooseFiles}</span>
              </button>
              
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleManualUpload}
                multiple
                accept="image/png,image/jpeg,video/mp4,video/webm"
                hidden 
              />
            </motion.div>
 
            {/* SETTINGS SLIDERS */}
            <section className="bg-white dark:bg-[#0c100d]/90 border border-slate-200 dark:border-emerald-900/25 rounded-2xl p-5 shadow-xs flex flex-col gap-6" id="settings-sliders">
              <div className="flex justify-between items-center pb-3 border-b border-slate-100 dark:border-emerald-950/60">
                <h3 className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-emerald-500 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#00b67a]" />
                  <span>Advanced Parameters</span>
                </h3>
                <div className="h-2 w-2 rounded-full bg-[#00b67a] animate-pulse" title="System Ready" />
              </div>
 
              <div className="flex flex-col gap-6">
                
                {/* Offset Margin */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{t.watermarkMargin}</span>
                    <span className="text-xs font-mono font-black text-[#00b67a] bg-emerald-500/5 dark:bg-emerald-500/8 px-2.5 py-0.5 rounded border border-emerald-500/10">
                      {customMargin === 0 ? t.auto : `${customMargin} px`}
                    </span>
                  </div>
                  <div className="relative flex items-center py-2">
                    <input 
                      type="range" 
                      min="0" 
                      max="150" 
                      value={customMargin}
                      onChange={(e) => setCustomMargin(parseInt(e.target.value))}
                      className="w-full h-1 bg-slate-100 dark:bg-[#151c16] rounded-lg appearance-none cursor-pointer accent-[#00b67a] focus:outline-none"
                    />
                  </div>
                  <span className="text-[10px] text-slate-450 dark:text-slate-450 leading-normal font-semibold">{t.watermarkMarginDesc}</span>
                </div>
 
                {/* Blending Intensity */}
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{t.watermarkOpacity}</span>
                    <span className="text-xs font-mono font-black text-[#00b67a] bg-emerald-500/5 dark:bg-emerald-500/8 px-2.5 py-0.5 rounded border border-emerald-500/10">
                      {customOpacity === 0 ? t.auto : `${customOpacity}%`}
                    </span>
                  </div>
                  <div className="relative flex items-center py-2">
                    <input 
                      type="range" 
                      min="0" 
                      max="200" 
                      value={customOpacity}
                      onChange={(e) => setCustomOpacity(parseInt(e.target.value))}
                      className="w-full h-1 bg-slate-100 dark:bg-[#151c16] rounded-lg appearance-none cursor-pointer accent-[#00b67a] focus:outline-none"
                    />
                  </div>
                  <span className="text-[10px] text-slate-450 dark:text-slate-450 leading-normal font-semibold">{t.watermarkOpacityDesc}</span>
                </div>
 
                {/* Presets size selector */}
                <div className="flex flex-col gap-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">{t.maskPreset}</span>
                  <div className="grid grid-cols-3 gap-1.5 bg-slate-50 dark:bg-[#151c16]/55 p-1 rounded-xl border border-slate-150 dark:border-emerald-950/40">
                    {[0, 48, 96].map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setCustomMaskSize(size)}
                        className={`py-1.5 text-[10px] font-mono font-extrabold rounded-md transition-all duration-200 cursor-pointer ${
                          customMaskSize === size 
                            ? 'bg-white text-[#00b67a] shadow-xs border border-slate-200/50 dark:bg-emerald-500/10 dark:text-[#00b67a] dark:border-emerald-500/20' 
                            : 'text-slate-450 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        {size === 0 ? t.auto : `${size}px`}
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-slate-450 dark:text-slate-450 leading-normal font-semibold">{t.maskPresetDesc}</span>
                </div>
 
                {/* Force overlay recalculation */}
                <div className="flex items-center justify-between border border-slate-100/60 dark:border-emerald-950/40 bg-slate-50/50 dark:bg-emerald-950/5 rounded-xl p-3">
                  <div className="flex flex-col gap-0.5 pr-2">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Flame className="w-4 h-4 text-amber-500 fill-amber-500/10 animate-pulse" />
                      <span>{t.forceRemove}</span>
                    </span>
                    <span className="text-[9.5px] text-slate-400 dark:text-slate-450 leading-relaxed max-w-[190px] font-semibold">{t.forceRemoveDesc}</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={forceRemove} 
                      onChange={(e) => setForceRemove(e.target.checked)} 
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5.5 bg-slate-200 dark:bg-emerald-950/50 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-4.5 after:w-4.5 after:shadow-sm after:transition-all peer-checked:bg-[#00b67a]" />
                  </label>
                </div>
 
              </div>
            </section>
 
            {/* SUBPIXEL ALIGNMENT SHIELD */}
            <section className="bg-white dark:bg-[#0c100d]/90 border border-slate-200 dark:border-emerald-900/25 rounded-2xl p-5 shadow-xs flex flex-col items-center hidden lg:flex">
              <h4 className="text-[10px] font-black uppercase tracking-widest text-[#00b67a] self-start mb-3 flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[#00b67a] animate-ping" />
                <span>Preset Vector Visualizer</span>
              </h4>
              
              <div className="relative border border-slate-150 dark:border-emerald-950 rounded-xl overflow-hidden shadow-inner mb-4 bg-[#0a0d0a] p-1 w-full flex items-center justify-center">
                {/* HUD markings */}
                <span className="absolute top-2 left-2 text-[8px] font-mono text-emerald-500 opacity-60">CAM_01.LENS</span>
                <span className="absolute top-2 right-2 text-[8px] font-mono text-emerald-500 opacity-60">COORD_LEVEL_5</span>
                <div className="absolute top-1/2 left-0 right-0 border-t border-dashed border-emerald-500/5 pointer-events-none" />
                <div className="absolute left-1/2 top-0 bottom-0 border-l border-dashed border-emerald-500/5 pointer-events-none" />
                
                <canvas ref={maskPreviewCanvasRef} className="block shadow-md max-w-full rounded-lg" style={{ opacity: 0.95 }} />
              </div>
 
              <div className="text-center px-1">
                <h5 className="text-[11.5px] font-semibold text-slate-800 dark:text-slate-200 mb-1">Subpixel Target Envelope</h5>
                <p className="text-[10px] text-slate-450 dark:text-slate-400 leading-normal font-semibold">
                  Live anchor highlights coordinate bounding boxes before drawing direct mathematical division filters.
                </p>
              </div>
            </section>
          </aside>
 
          {/* RIGHT COLUMN: ACTIVE TARGET WORKSPACE */}
          <main className={`lg:col-span-8 flex flex-col gap-6 ${mobileActiveTab === 'results' ? 'flex' : 'hidden lg:flex'}`} id="workspace-board">
          
            {processedItems.length > 0 ? (
              <section className="flex flex-col gap-5 animate-fadeIn" id="resultsSection" style={{ contentVisibility: 'auto' }}>
              
                {/* Result Control Headers */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-emerald-900/15">
                  <h2 className="text-base font-bold text-slate-900 dark:text-emerald-105 flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-[#00b67a] animate-pulse" />
                    <span>
                      {t.results}{" "}
                      <span className="font-mono text-xs bg-emerald-500/5 dark:bg-emerald-950 border border-emerald-500/10 dark:border-emerald-900/30 text-[#00b67a] px-2.5 py-0.5 rounded-full ml-1.5 font-extrabold shadow-inner">
                        {processedItems.filter(item => !item.isConverting).length}
                      </span>
                    </span>
                  </h2>
                  <div className="flex items-center gap-1.5">
                    <button 
                      onClick={clearDatabase}
                      type="button"
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-550 dark:text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 hover:bg-rose-500/5 dark:hover:bg-rose-500/5 rounded-xl transition-all cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>{t.clearAll}</span>
                    </button>
                    <button 
                      onClick={downloadAllItems}
                      type="button"
                      disabled={processedItems.some(i => i.isConverting)}
                      className="inline-flex items-center gap-2 px-4.5 py-2.5 text-xs font-extrabold text-white bg-gradient-to-r from-[#00b67a] to-emerald-600 hover:from-[#00c584] hover:to-emerald-550 disabled:opacity-40 rounded-xl shadow-md shadow-emerald-500/5 cursor-pointer transition-all hover:scale-[1.01]"
                    >
                      <Download className="w-4 h-4" />
                      <span>{t.downloadAll}</span>
                    </button>
                  </div>
                </div>
 
                {/* Gallery List Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 animate-fadeIn">
                  {processedItems.map((item, index) => {
                    
                    // A: Processing state
                    if (item.isConverting) {
                      return (
                        <div key={item.id} className="relative bg-white dark:bg-[#0c100d]/90 border border-slate-205/85 dark:border-emerald-900/25 rounded-2xl p-6 flex flex-col items-center justify-center text-center gap-5 shadow-xs overflow-hidden min-h-[190px]">
                          <div className="absolute inset-x-0 bottom-0 h-1 bg-gradient-to-r from-emerald-400 via-[#00b67a] to-emerald-600 animate-pulse animate-[pulse_2s_infinite]" />
                          
                          <div className="flex justify-center p-3.5 text-[#00b67a] bg-emerald-500/5 border border-emerald-500/10 rounded-2xl">
                            <RefreshCw className="w-5.5 h-5.5 animate-spin text-[#00b67a]" />
                          </div>
                          <div className="flex flex-col gap-1 w-full max-w-[190px]">
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-205 truncate" title={item.originalName}>
                              {item.originalName}
                            </span>
                            <span className="text-[10px] text-[#00b67a] font-black uppercase tracking-wider">{t.processing}</span>
                          </div>
                          
                          {/* Progress slider bar */}
                          <div className="w-full bg-slate-100 dark:bg-emerald-950/40 rounded-full h-1.5 overflow-hidden border border-slate-200/10 dark:border-emerald-900/10">
                            <div 
                              className="bg-gradient-to-r from-emerald-400 via-[#00b67a] to-emerald-600 h-full transition-all duration-300 rounded-full"
                              style={{ width: `${(item.progress || 0) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono font-black text-[#00b67a]">
                            {Math.round((item.progress || 0) * 100)}%
                          </span>
                        </div>
                      );
                    }
 
                    // B: Fail state
                    if (!item.success) {
                      return (
                        <div key={item.id} className="bg-rose-500/5 dark:bg-rose-950/5 border border-rose-220/20 dark:border-rose-950/30 rounded-2xl p-5 flex items-start gap-4 shadow-sm">
                          <div className="p-3 bg-rose-500/10 text-rose-505 rounded-xl flex-shrink-0 border border-rose-500/10">
                            <AlertTriangle className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-100 block truncate" title={item.originalName}>
                              {item.originalName}
                            </span>
                            <span className="text-[9.5px] text-rose-600 bg-rose-500/10 dark:text-rose-400 border border-rose-500/15 px-2.5 py-1 rounded-md mt-3 inline-block font-bold font-mono uppercase tracking-widest">
                              {item.error || 'Processing Failure'}
                            </span>
                          </div>
                        </div>
                      );
                    }
 
                    // C: Valid Render outcomes
                    return (
                      <motion.div 
                        key={item.id} 
                        whileHover={{ y: -3 }}
                        transition={{ duration: 0.2 }}
                        className="bg-white dark:bg-[#0c100d]/90 border border-slate-200 dark:border-emerald-910/25 rounded-2xl overflow-hidden hover:border-[#00b67a]/40 dark:hover:border-[#00b67a]/30 hover:shadow-xl dark:hover:shadow-[0_12px_45px_rgba(0,0,0,0.45)] transition-all flex flex-col shadow-xs group"
                      >
                        <div 
                          onClick={() => {
                            setLightboxIndex(index);
                            setLightboxShowingOriginal(false);
                          }}
                          className="relative aspect-video bg-black overflow-hidden cursor-zoom-in"
                        >
                          {item.isVideo ? (
                            <video 
                              src={item.blobUrl} 
                              muted 
                              loop 
                              playsInline 
                              autoPlay 
                              className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-300"
                            />
                          ) : (
                            <img 
                              src={item.blobUrl} 
                              alt={item.filename} 
                              className="w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-300"
                            />
                          )}
 
                          {/* Corner Floating Ribbons */}
                          <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
                            {item.noWatermark ? (
                              <span className="text-[9px] font-black text-amber-500 bg-slate-950/85 backdrop-blur-md px-2.5 py-1 rounded border border-white/5 flex items-center gap-1 shadow-md">
                                <Info className="w-3.5 h-3.5 text-amber-500" />
                                <span className="uppercase tracking-wide">{t.badgeNoWatermark}</span>
                              </span>
                            ) : (
                              <span className="text-[9px] font-black text-[#00b67a] bg-slate-950/85 backdrop-blur-md px-2.5 py-1 rounded border border-white/5 flex items-center gap-1 shadow-md animate-fadeIn">
                                <Check className="w-3.5 h-3.5 text-[#00b67a]" />
                                <span className="uppercase tracking-wide">{t.badgeSuccess} ({item.margin}px)</span>
                              </span>
                            )}
                          </div>
 
                          {/* Overlay comparator slide text */}
                          <div className="absolute inset-x-0 bottom-0 bg-slate-950/80 backdrop-blur-xs p-2 text-center text-white text-[10.5px] font-bold opacity-0 group-hover:opacity-100 transition-all flex items-center justify-center gap-1.5 translate-y-1 group-hover:translate-y-0 duration-200">
                            <Eye className="w-4 h-4 text-[#00b67a]" />
                            <span>Compare original in Lightbox (Spacebar)</span>
                          </div>
                        </div>
 
                        {/* Info details / Action Download handles */}
                        <div className="p-4 flex items-center justify-between gap-4 bg-white/70 dark:bg-[#0c100d]/40 border-t border-slate-100 dark:border-emerald-950/40">
                          <div className="min-w-0 flex-1">
                            <span className="text-xs font-bold text-slate-900 dark:text-slate-105 block truncate" title={item.filename}>
                              {item.filename}
                            </span>
                            <span className="text-[10px] text-slate-450 dark:text-slate-500 block mt-0.5 font-mono font-bold uppercase tracking-wider">
                              {item.width} × {item.height} · {item.isVideo ? 'Video payload' : 'Lossless PNG'}
                            </span>
                          </div>
                          <a 
                            href={item.blobUrl} 
                            download={item.filename}
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100/50 dark:bg-emerald-950/20 hover:bg-[#00b67a] hover:text-white border border-slate-200 dark:border-emerald-950/40 hover:border-[#00b67a] text-slate-700 dark:text-slate-300 rounded-lg text-xs font-bold transition-all shadow-xs flex-shrink-0 cursor-pointer"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span>{t.download}</span>
                          </a>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              </section>
            ) : (
              /* EMPTY CHASSIS ONBOARDING DASHBOARD CARD */
              <section className="bg-white dark:bg-[#0c0f0d]/90 border border-slate-200 dark:border-emerald-900/25 rounded-2xl p-6 md:p-12 text-center flex flex-col items-center justify-center min-h-[440px] shadow-xs backdrop-blur-md animate-fadeIn" id="emptyWorkspaceOnboarding">
                
                {/* Glowing safe badge ring */}
                <div className="mb-6 relative">
                  <div className="w-20 h-20 bg-emerald-500/5 dark:bg-emerald-500/5 border border-emerald-500/10 dark:border-emerald-900/35 rounded-full flex items-center justify-center text-[#00b67a]">
                    <Shield className="w-9 h-9 text-[#00b67a]" />
                  </div>
                  {/* Verified small dynamic node */}
                  <span className="absolute -top-1 right-[-4px] flex h-5.5 w-5.5 bg-[#00b67a] rounded-full text-white items-center justify-center text-xs font-black shadow-lg">✓</span>
                </div>
 
                <h3 className="text-base md:text-lg font-extrabold text-slate-850 dark:text-slate-100 mb-2 tracking-tight">Verified Local Sandbox Canvas</h3>
                <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 max-w-md leading-relaxed mb-10 font-semibold">
                  Upload raw images or video segments. Subpixel alpha mapping neutralizes translucent pixel stacks locally with 100% data confidentiality.
                </p>
 
                {/* THREE-STEP WORKFLOW LABELS */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 w-full text-left">
                  <div className="bg-slate-50/50 dark:bg-[#0a0d0a]/40 border border-slate-150/40 dark:border-emerald-950/20 rounded-xl p-4 flex flex-col gap-2.5 transition-all hover:bg-white dark:hover:bg-[#0c0f0d]/60 hover:shadow-xs hover:border-slate-350 dark:hover:border-slate-800">
                    <span className="flex items-center justify-center w-7 h-7 bg-white dark:bg-[#141a15] border border-slate-200 dark:border-[#1c241d] text-[#00b67a] rounded-lg text-xs font-black font-mono">01</span>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">{t.step1Title}</h4>
                    <p className="text-[10px] text-slate-450 dark:text-slate-400 leading-relaxed font-semibold">{t.step1Desc}</p>
                  </div>
                  <div className="bg-slate-50/50 dark:bg-[#0a0d0a]/40 border border-slate-150/40 dark:border-emerald-950/20 rounded-xl p-4 flex flex-col gap-2.5 transition-all hover:bg-white dark:hover:bg-[#0c0f0d]/60 hover:shadow-xs hover:border-slate-350 dark:hover:border-slate-800">
                    <span className="flex items-center justify-center w-7 h-7 bg-white dark:bg-[#141a15] border border-slate-200 dark:border-[#1c241d] text-[#00b67a] rounded-lg text-xs font-black font-mono">02</span>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">{t.step2Title}</h4>
                    <p className="text-[10px] text-slate-450 dark:text-slate-400 leading-relaxed font-semibold">{t.step2Desc}</p>
                  </div>
                  <div className="bg-slate-50/50 dark:bg-[#0a0d0a]/40 border border-slate-150/40 dark:border-emerald-950/20 rounded-xl p-4 flex flex-col gap-2.5 transition-all hover:bg-white dark:hover:bg-[#0c0f0d]/60 hover:shadow-xs hover:border-slate-350 dark:hover:border-slate-800">
                    <span className="flex items-center justify-center w-7 h-7 bg-white dark:bg-[#141a15] border border-slate-200 dark:border-[#1c241d] text-[#00b67a] rounded-lg text-xs font-black font-mono">03</span>
                    <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">{t.step3Title}</h4>
                    <p className="text-[10px] text-slate-450 dark:text-slate-400 leading-relaxed font-semibold">{t.step3Desc}</p>
                  </div>
                </div>
              </section>
            )}
 
            {/* IN-DEPTH FAQ SHELVES */}
            <section className="bg-white dark:bg-[#0c0f0d]/90 border border-slate-200 dark:border-emerald-900/25 rounded-2xl p-5 shadow-xs" id="faq-accordions">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-[#00b67a] mb-5 flex items-center gap-2 pb-3.5 border-b border-slate-100 dark:border-[#161f18]">
                <HelpCircle className="w-4 h-4 text-[#00b67a]" />
                <span>{t.faqTitle || 'Frequently Answered Questions'}</span>
              </h3>
              
              <div className="flex flex-col gap-3">
                {/* FAQ 1 */}
                <div className="border border-slate-100 dark:border-emerald-950/30 rounded-xl overflow-hidden bg-slate-50/40 dark:bg-[#141a15]/30">
                  <button 
                    type="button"
                    onClick={() => setActiveFAQ(activeFAQ === 1 ? null : 1)}
                    className="w-full flex items-center justify-between p-4 text-left text-xs font-bold text-slate-800 dark:text-slate-205 hover:bg-slate-100/30 dark:hover:bg-emerald-950/15 transition-all cursor-pointer"
                  >
                    <span>What is the Nano Banana Watermark?</span>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-all duration-300 ${activeFAQ === 1 ? 'transform rotate-180 text-[#00b67a]' : ''}`} />
                  </button>
                  {activeFAQ === 1 && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      className="px-4 pb-4 pt-1.5 text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed border-t border-slate-100 dark:border-[#151d16] font-semibold animate-fadeIn"
                    >
                      It is an automated translucent layer applied by models (e.g. Gemini Video) at the bottom-right corner. It is composed of a light colored banana shape.
                    </motion.div>
                  )}
                </div>
 
                {/* FAQ 2 */}
                <div className="border border-slate-100 dark:border-emerald-950/30 rounded-xl overflow-hidden bg-slate-50/40 dark:bg-[#141a15]/30">
                  <button 
                    type="button"
                    onClick={() => setActiveFAQ(activeFAQ === 2 ? null : 2)}
                    className="w-full flex items-center justify-between p-4 text-left text-xs font-bold text-slate-800 dark:text-slate-205 hover:bg-slate-100/30 dark:hover:bg-emerald-950/15 transition-all cursor-pointer"
                  >
                    <span>How does Reverse Blending work?</span>
                    <ChevronDown className={`w-4 h-4 text-slate-455 transition-all duration-300 ${activeFAQ === 2 ? 'transform rotate-180 text-[#00b67a]' : ''}`} />
                  </button>
                  {activeFAQ === 2 && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      className="px-4 pb-4 pt-1.5 text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed border-t border-slate-100 dark:border-[#151d16] font-semibold animate-fadeIn"
                    >
                      A typical blending mixes pixels with an alpha value. Given the shape template and alpha we write: <code className="bg-slate-100 dark:bg-slate-950 px-1.5 py-0.5 border border-slate-200 dark:border-[#1d2720] rounded font-mono text-[10.5px] text-[#00b67a]">Original = (Img - Watermark * alpha) / (1 - alpha)</code>. This retrieves original pixel values exactly without synthetic fills.
                    </motion.div>
                  )}
                </div>
 
                {/* FAQ 3 */}
                <div className="border border-slate-100 dark:border-emerald-950/30 rounded-xl overflow-hidden bg-slate-50/40 dark:bg-[#141a15]/30">
                  <button 
                    type="button"
                    onClick={() => setActiveFAQ(activeFAQ === 3 ? null : 3)}
                    className="w-full flex items-center justify-between p-4 text-left text-xs font-bold text-slate-800 dark:text-slate-205 hover:bg-slate-100/30 dark:hover:bg-emerald-950/15 transition-all cursor-pointer"
                  >
                    <span>When to toggle Force Remove?</span>
                    <ChevronDown className={`w-4 h-4 text-slate-455 transition-all duration-300 ${activeFAQ === 3 ? 'transform rotate-180 text-[#00b67a]' : ''}`} />
                  </button>
                  {activeFAQ === 3 && (
                    <motion.div 
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      className="px-4 pb-4 pt-1.5 text-slate-500 dark:text-slate-400 text-[11px] leading-relaxed border-t border-slate-100 dark:border-[#151d16] font-semibold animate-fadeIn"
                    >
                      Toggle Force Remove when watermark contrast with backgrounds is too flat, causing detection to fail. It skips check steps and forces direct pixel recalculations.
                    </motion.div>
                  )}
                </div>
              </div>
            </section>
 
            {/* GOOGLE ADSENSE COMPLIANT SECURE FOOTER */}
            <footer className="mt-8 flex flex-col gap-6" id="adsense-footer">
              <div className="flex items-start gap-3 bg-emerald-500/5 border border-emerald-500/10 dark:border-emerald-900/15 rounded-2xl p-4">
                <span className="flex items-center justify-center w-5.5 h-5.5 rounded-full bg-emerald-50 dark:bg-emerald-950 border border-emerald-250 dark:border-emerald-900 text-[#00b67a] text-xs font-mono font-extrabold flex-shrink-0 shadow-xs">✓</span>
                <p className="text-[11.5px] text-slate-600 dark:text-slate-350 leading-relaxed font-semibold">
                  <strong>{t.privacyNote}</strong> All media file frames are processed locally inside your browser security sandbox. Your images and video segments are never uploaded to our servers or stored/saved anywhere on the web. Verifiable on open-source.
                </p>
              </div>

              <div className="border-t border-slate-200 dark:border-emerald-950/40 pt-6 pb-2 flex flex-col md:flex-row md:items-center md:justify-between gap-4 text-xs font-semibold text-slate-450 dark:text-slate-400">
                <div className="flex flex-col gap-1.5">
                  <p className="font-bold text-slate-700 dark:text-slate-205">© 2026 Watermark Remover. All rights reserved.</p>
                  <p className="text-[11px] leading-relaxed text-slate-450 dark:text-slate-450 max-w-xl">
                    Disclaimer: This web utility operates in-browser using secure WebAssembly (WASM) and canvas computation stacks. We are fully compliant with programmatic advertising specifications including CCPA, GDPR, and COPPA frameworks.
                  </p>
                </div>

                <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs">
                  <button 
                    type="button" 
                    onClick={() => setActivePolicyModal('privacy')}
                    className="hover:text-[#00b67a] transition-colors cursor-pointer focus:outline-none underline decoration-slate-300 dark:decoration-slate-750 hover:decoration-emerald-500 underline-offset-4"
                  >
                    Privacy Policy
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setActivePolicyModal('terms')}
                    className="hover:text-[#00b67a] transition-colors cursor-pointer focus:outline-none underline decoration-slate-300 dark:decoration-slate-750 hover:decoration-emerald-500 underline-offset-4"
                  >
                    Terms of Service
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setActivePolicyModal('about')}
                    className="hover:text-[#00b67a] transition-colors cursor-pointer focus:outline-none underline decoration-slate-300 dark:decoration-slate-750 hover:decoration-emerald-500 underline-offset-4"
                  >
                    About Us
                  </button>
                  <button 
                    type="button" 
                    onClick={() => setActivePolicyModal('contact')}
                    className="hover:text-[#00b67a] transition-colors cursor-pointer focus:outline-none underline decoration-slate-300 dark:decoration-slate-750 hover:decoration-emerald-500 underline-offset-4"
                  >
                    Contact Us
                  </button>
                </div>
              </div>
            </footer>
            
          </main>
        </div>
      </div>

      {/* LIGHTBOX SLIDE VIEW OVERLAY MODAL */}
      {lightboxIndex !== null && processedItems[lightboxIndex] && (
        <section className="fixed inset-0 bg-[#07080b]/98 backdrop-blur-2xl z-50 flex flex-col items-center justify-center p-4 md:p-8 select-none animate-fadeIn" id="lightbox">
          {/* Close trigger button */}
          <button 
            type="button"
            onClick={() => setLightboxIndex(null)}
            className="absolute top-5 right-5 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white border border border-white/10 flex items-center justify-center hover:scale-105 transition-all duration-300 cursor-pointer shadow-lg z-50"
          >
            <X className="w-4.5 h-4.5 text-slate-300 hover:text-white" />
          </button>

          {/* Media center view container */}
          <div className="relative max-w-5xl w-full max-h-[72vh] flex items-center justify-center">
            <div className="relative max-h-[72vh] flex items-center justify-center border border-slate-800/60 rounded-3xl overflow-hidden shadow-[0_34px_75px_-12px_rgba(0,0,0,0.95)]">
              {processedItems[lightboxIndex].isVideo ? (
                <video 
                  src={lightboxShowingOriginal ? processedItems[lightboxIndex].originalBlobUrl : processedItems[lightboxIndex].blobUrl}
                  muted
                  controls
                  loop
                  playsInline
                  autoPlay
                  onClick={() => setLightboxShowingOriginal(prev => !prev)}
                  className="max-w-full max-h-[72vh] object-contain cursor-pointer"
                />
              ) : (
                <img 
                  src={lightboxShowingOriginal ? processedItems[lightboxIndex].originalBlobUrl : processedItems[lightboxIndex].blobUrl}
                  alt="Lightbox View"
                  onClick={() => setLightboxShowingOriginal(prev => !prev)}
                  className="max-w-full max-h-[72vh] object-contain cursor-pointer"
                />
              )}

              {/* Quick click notification info, positioned absolutely inside the media envelope wrapper */}
              <div className="absolute bottom-5 left-1/2 transform -translate-x-1/2 bg-black/60 backdrop-blur-md text-slate-200 text-[10.5px] px-5 py-2.5 border border-white/10 rounded-full font-bold shadow-2xl pointer-events-none tracking-wide text-center whitespace-nowrap">
                {t.lightboxHint}
              </div>
            </div>
          </div>

          {/* Bottom Bar: Title & Toggle Pill aligned side-by-side inside a centered row grouping, exactly like the custom screenshot */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6 mt-6 px-4">
            <span className="text-xs font-semibold text-slate-300 truncate max-w-[240px]" title={processedItems[lightboxIndex].filename}>
              {lightboxShowingOriginal ? `${processedItems[lightboxIndex].originalName || processedItems[lightboxIndex].filename}` : processedItems[lightboxIndex].filename}
            </span>

            <div className="flex bg-[#14151c]/90 border border-[#2d2f38] rounded-full p-1 gap-1 shadow-inner items-center">
              <button
                type="button"
                onClick={() => setLightboxShowingOriginal(false)}
                className={`px-4 py-1.5 rounded-full text-[11px] font-extrabold tracking-wide transition-all duration-300 cursor-pointer ${!lightboxShowingOriginal ? 'bg-white text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {t.processed}
              </button>
              <button
                type="button"
                onClick={() => setLightboxShowingOriginal(true)}
                className={`px-4 py-1.5 rounded-full text-[11px] font-extrabold tracking-wide transition-all duration-300 cursor-pointer ${lightboxShowingOriginal ? 'bg-white text-slate-950 shadow-md' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {t.original}
              </button>
            </div>
          </div>

          {/* Navigation Controls: minimal bottom chevron disks with Lucide icons */}
          <div className="flex items-center justify-center gap-4 mt-6">
            <button
              type="button"
              onClick={() => {
                let target = lightboxIndex - 1;
                while (target >= 0 && !processedItems[target].success) {
                  target--;
                }
                if (target >= 0) {
                  setLightboxIndex(target);
                  setLightboxShowingOriginal(false);
                }
              }}
              disabled={lightboxIndex === 0}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 border border-white/5 text-slate-300 disabled:opacity-20 transition-all cursor-pointer shadow-lg"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => {
                let target = lightboxIndex + 1;
                while (target < processedItems.length && !processedItems[target].success) {
                  target++;
                }
                if (target < processedItems.length) {
                  setLightboxIndex(target);
                  setLightboxShowingOriginal(false);
                }
              }}
              disabled={lightboxIndex === processedItems.length - 1}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 border border-white/5 text-slate-300 disabled:opacity-20 transition-all cursor-pointer shadow-lg"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </section>
      )}

      {/* VIDEO PREVIEW & ADJUSTMENT MODAL */}
      {activeVideoTask && (
        <section className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 animate-fadeIn" id="videoPreviewModal">
          <div className="bg-white dark:bg-[#0a0d0a] rounded-3xl max-w-5xl lg:max-w-6xl w-full max-h-[92vh] overflow-hidden shadow-2xl border border-slate-200 dark:border-emerald-950/30 flex flex-col transition-all">
            
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-150 dark:border-emerald-950/30 flex-shrink-0 bg-slate-50/50 dark:bg-[#070a08]/50">
              <div className="flex items-center gap-2.5">
                <FileVideo className="w-5.5 h-5.5 text-[#00b67a] animate-pulse" />
                <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                  Video Settings & Watermark Fine-Tuning
                </h3>
              </div>
              <button 
                onClick={() => activeVideoTask.resolve(null)}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-emerald-950/20 border border-slate-200 dark:border-emerald-900/30 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-emerald-900/40 text-slate-500 dark:text-slate-400 cursor-pointer transition-all text-sm"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>
 
            {/* Modal Body with 2-Column Responsive Layout & Scrollable Column */}
            <div className="p-6 overflow-y-auto max-h-[calc(92vh-140px)] flex flex-col lg:grid lg:grid-cols-12 gap-8 bg-white dark:bg-[#0a0d0a]">
              
              {/* Left Column: Expanded Visual Media Box with Adaptive Proportions */}
              <div className="lg:col-span-7 xl:col-span-8 flex flex-col gap-4">
                <div className="bg-[#040604] rounded-2xl overflow-hidden h-[300px] sm:h-[400px] md:h-[460px] lg:h-[520px] w-full relative flex items-center justify-center border border-slate-900 dark:border-emerald-950/40 shadow-inner p-2.5 animate-fadeIn">
                  
                  {/* High-Tech Reticle Bounding markings */}
                  <div className="absolute top-4 left-4 w-3 h-3 border-t border-l border-emerald-550/30 pointer-events-none" />
                  <div className="absolute top-4 right-4 w-3 h-3 border-t border-r border-emerald-550/30 pointer-events-none" />
                  <div className="absolute bottom-4 left-4 w-3 h-3 border-b border-l border-emerald-550/30 pointer-events-none" />
                  <div className="absolute bottom-4 right-4 w-3 h-3 border-b border-r border-emerald-550/30 pointer-events-none" />
                  
                  <div className="absolute top-3 left-1/2 -translate-x-1/2 bg-slate-900/80 backdrop-blur-md px-2.5 py-0.5 rounded text-[8.5px] font-mono tracking-widest text-[#00b67a] border border-emerald-500/10 pointer-events-none shadow-xs">
                    FINE_ALIGN_PREVIEW
                  </div>

                  <canvas 
                    ref={modalCanvasRef} 
                    className="max-w-full max-h-full object-contain rounded-xl shadow-2xl"
                  />
                </div>
                
                <div className="flex items-start gap-2.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed pl-1">
                  <Info className="w-4 h-4 text-[#00b67a] flex-shrink-0 mt-0.5" />
                  <span>Real-time subpixel preview of the selected mask alignment. Move slider states to re-render mathematical blend properties instantly.</span>
                </div>
              </div>
 
              {/* Right Column: Setting Sliders & Switches with Pristine Dark Aesthetics */}
              <div className="lg:col-span-5 xl:col-span-4 flex flex-col gap-6">
                <div className="flex justify-between items-center pb-2 border-b border-slate-100 dark:border-emerald-950/60">
                  <h4 className="text-[11px] font-black uppercase tracking-wider text-slate-450 dark:text-emerald-500 flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-[#00b67a]" />
                    <span>Adjustment Sliders</span>
                  </h4>
                  <div className="h-2 w-2 rounded-full bg-[#00b67a] animate-pulse" />
                </div>

                {/* Margin Slider */}
                <div className="bg-slate-50/50 dark:bg-[#0c100d]/90 border border-slate-200/60 dark:border-emerald-950 rounded-xl p-4.5 flex flex-col gap-3.5 shadow-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-205">Watermark Margin</span>
                    <span className="text-xs font-mono font-black text-[#00b67a] bg-emerald-500/5 dark:bg-emerald-500/8 px-2.5 py-0.5 rounded border border-emerald-500/10">
                      {activeVideoTask.margin} px
                    </span>
                  </div>
                  <div className="relative flex items-center py-2">
                    <input 
                      type="range" 
                      min="10" 
                      max="150" 
                      value={activeVideoTask.margin}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setActiveVideoTask(prev => prev ? { ...prev, margin: val } : null);
                      }}
                      className="w-full h-1 bg-slate-100 dark:bg-[#151c16] rounded-lg appearance-none cursor-pointer accent-[#00b67a] focus:outline-none"
                    />
                  </div>
                  <span className="text-[10px] text-slate-450 dark:text-slate-450 leading-normal font-semibold">Controls size of bounding frame from video corners.</span>
                </div>
 
                {/* Intensity Slider */}
                <div className="bg-slate-50/50 dark:bg-[#0c100d]/90 border border-slate-200/60 dark:border-emerald-950 rounded-xl p-4.5 flex flex-col gap-3.5 shadow-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-205">Watermark intensity</span>
                    <span className="text-xs font-mono font-black text-[#00b67a] bg-emerald-500/5 dark:bg-emerald-500/8 px-2.5 py-0.5 rounded border border-emerald-500/10">
                      {activeVideoTask.intensity}%
                    </span>
                  </div>
                  <div className="relative flex items-center py-2">
                    <input 
                      type="range" 
                      min="10" 
                      max="200" 
                      value={activeVideoTask.intensity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        setActiveVideoTask(prev => prev ? { ...prev, intensity: val } : null);
                      }}
                      className="w-full h-1 bg-slate-100 dark:bg-[#151c16] rounded-lg appearance-none cursor-pointer accent-[#00b67a] focus:outline-none"
                    />
                  </div>
                  <span className="text-[10px] text-slate-450 dark:text-slate-450 leading-normal font-semibold">Alters the multiplier applied during alpha division.</span>
                </div>
 
                {/* Force Remove Toggle */}
                <div className="bg-slate-50/50 dark:bg-[#0c100d]/90 border border-slate-200/60 dark:border-emerald-900/20 rounded-xl p-4.5 flex items-center justify-between shadow-xs">
                  <div className="flex flex-col gap-0.5 min-w-0 pr-4">
                    <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Flame className="w-4 h-4 text-amber-500 fill-amber-500/10 flex-shrink-0 animate-pulse" />
                      <span>{t.forceRemove}</span>
                    </span>
                    <span className="text-[10px] text-slate-450 dark:text-slate-450 leading-normal font-semibold">Bypass strict transparency filters</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input 
                      type="checkbox" 
                      checked={activeVideoTask.force} 
                      onChange={(e) => {
                        const val = e.target.checked;
                        setActiveVideoTask(prev => prev ? { ...prev, force: val } : null);
                      }} 
                      className="sr-only peer"
                    />
                    <div className="w-10 h-5.5 bg-slate-200 dark:bg-emerald-950/50 rounded-full peer peer-focus:outline-none peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-white after:rounded-full after:h-4.5 after:w-4.5 after:shadow-sm after:transition-all peer-checked:bg-[#00b67a]" />
                  </label>
                </div>
 
              </div>
 
            </div>
 
            {/* Footer Buttons */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-[#070a08]/50 border-t border-slate-150 dark:border-emerald-950/30 flex items-center justify-end gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => activeVideoTask.resolve(null)}
                className="px-4.5 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100 border border-slate-200 dark:border-emerald-900/30 bg-white dark:bg-[#0c100d]/90 hover:bg-slate-50 dark:hover:bg-emerald-950/20 rounded-xl transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  activeVideoTask.resolve({
                    margin: activeVideoTask.margin,
                    intensity: activeVideoTask.intensity,
                    force: activeVideoTask.force
                  });
                }}
                className="px-5 py-2.5 text-xs font-extrabold text-white bg-gradient-to-r from-[#00b67a] to-emerald-600 hover:from-[#00c584] hover:to-emerald-500 rounded-xl shadow-md hover:shadow-emerald-500/10 dark:shadow-emerald-950/25 transition-all cursor-pointer hover:scale-[1.01] active:scale-95"
              >
                Start Conversion
              </button>
            </div>
 
          </div>
        </section>
      )}

      {/* IMMERSIVE COMPLIANCE LEGAL MODAL */}
      {activePolicyModal !== null && (
        <section className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 sm:p-6 animate-fadeIn" id="compliancePolicyModal">
          <div className="bg-white dark:bg-[#0a0d0a] rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-hidden shadow-2xl border border-slate-200 dark:border-emerald-950/40 flex flex-col transition-all">
            
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-150 dark:border-emerald-950/30 flex-shrink-0 bg-slate-50/50 dark:bg-[#070a08]/50">
              <div className="flex items-center gap-2.5">
                <Shield className="w-5.5 h-5.5 text-[#00b67a]" />
                <h3 className="text-base font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">
                  {activePolicyModal === 'privacy' && 'Privacy & Cookie Policy'}
                  {activePolicyModal === 'terms' && 'Terms of Service'}
                  {activePolicyModal === 'about' && 'About Our Service'}
                  {activePolicyModal === 'contact' && 'Contact Support & Feedback'}
                </h3>
              </div>
              <button 
                type="button"
                onClick={() => setActivePolicyModal(null)}
                className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-emerald-950/20 border border-slate-200 dark:border-emerald-900/30 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-emerald-900/40 text-slate-500 dark:text-slate-400 cursor-pointer transition-all text-sm"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Content Body */}
            <div className="p-6 overflow-y-auto text-xs md:text-sm text-slate-600 dark:text-slate-350 leading-relaxed space-y-4 font-semibold max-h-[calc(85vh-140px)]">
              {activePolicyModal === 'privacy' && (
                <>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">1. Data Ownership & Total In-Browser Privacy</p>
                  <p>Our application functions entirely on the client-side. We utilize modern WebAssembly compilation structures to process your images and video segments directly within your device’s sandbox stack. None of your media files (photos, frames, logos) are ever uploaded, processed, or saved on any servers. Your secrets remain absolutely yours.</p>
                  
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">2. Cookie Policy & Google AdSense Compliance</p>
                  <p>We use standard local storage configurations to store user interface choices (like Dark/Light mode theme state and language settings), which are stored exclusively on your browser. Our site may integrate Google AdSense or certified programmatic vendors who use vendor cookies to analyze search telemetry and display personalized, safe, interest-based advertisements.</p>

                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">3. CCPA, GDPR & COPPA Compliance</p>
                  <p>As no user identities or personal credentials are sent to our background services, our service adheres to stricter standards of user identity protection. You hold full rights to process your data without fear of profile aggregation. We do not solicit personal records from minors under any conditions.</p>
                </>
              )}

              {activePolicyModal === 'terms' && (
                <>
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">1. License & Scope of Usage</p>
                  <p>This web utility is offered to you entirely free of charge for processing personal, creative, or authorized media compositions. By launching this app, you agree to secure all required authorization rights before removing signatures, logos, transparent structures, or watermarks from your target files.</p>
                  
                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">2. Intellectual Property Disclaimer</p>
                  <p>We supply general matting, box blurs, and mathematical pixel division features. The ultimate responsibility of utilizing these outputs remains with the end user. We are not associated with any commercial trademarked entities, including TikTok or ByteDance.</p>

                  <p className="text-sm font-bold text-slate-800 dark:text-slate-100">3. Service Status & No-Warranty Terms</p>
                  <p>This service is compiled "AS IS" without warranties of absolute frame correctness. Due to differing color gamuts or heavy algorithmic compressions on watermarks, perfect removal of watermark shapes is not guaranteed on all compressed videos.</p>
                </>
              )}

              {activePolicyModal === 'about' && (
                <>
                  <p>Welcome to our state-of-the-art <strong>Watermark Remover</strong> utility! Built for ultimate security, privacy, and speed.</p>
                  <p>Traditional tools force users to upload their private assets onto remote clouds to execute calculations. This compromises your privacy, wastes your internet bandwidth, and creates server queues. We engineered our tool to execute native canvas pixel shaders and local multi-threaded loop structures compiled inside the client browser environment, producing near-lossless ratio blends in seconds.</p>
                  <p className="text-slate-400 dark:text-slate-400">Technical details: Built using React 18, Tailwind CSS, Lucide icons, and web-assembled math helpers running in modern browser engines.</p>
                </>
              )}

              {activePolicyModal === 'contact' && (
                <>
                  <p>Have recommendations, discovered an edge-case bug, or simply want to say hello? Our inbox is wide open!</p>
                  <div className="bg-slate-55 dark:bg-emerald-950/15 border border-slate-150 dark:border-emerald-950/40 p-4 rounded-xl flex flex-col gap-2 font-mono text-xs text-[#00b67a]">
                    <p className="font-bold text-slate-800 dark:text-slate-200">📬 Direct Support Email:</p>
                    <a href="mailto:mianlabib786@gmail.com" className="hover:underline text-sm font-extrabold text-emerald-500 dark:text-emerald-400">mianlabib786@gmail.com</a>
                  </div>
                  <p>We aim to respond to technical reports and general improvement inquiries within 24-48 business hours. Thank you for utilizing our privacy-first media sandbox!</p>
                </>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="px-6 py-4 bg-slate-50 dark:bg-[#070a08]/50 border-t border-slate-150 dark:border-emerald-950/30 flex items-center justify-end gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => setActivePolicyModal(null)}
                className="px-5 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-[#00b67a] to-emerald-600 hover:from-[#00c584] hover:to-emerald-500 rounded-xl transition-all cursor-pointer hover:scale-[1.01]"
              >
                Understood, Close
              </button>
            </div>

          </div>
        </section>
      )}

    </div>
  );
}
