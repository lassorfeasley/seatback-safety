import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { CropRegion, ExportOptions } from './types';

/**
 * Extract a crop region from an image at full resolution
 */
export async function extractCrop(
  image: HTMLImageElement,
  region: CropRegion,
  options: {
    targetWidth?: number;
    format?: 'jpeg' | 'png';
    quality?: number;
  } = {}
): Promise<Blob> {
  const { targetWidth, format = 'jpeg', quality = 0.9 } = options;

  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Calculate output dimensions
  let outputWidth = region.width;
  let outputHeight = region.height;

  if (targetWidth && targetWidth < region.width) {
    const scale = targetWidth / region.width;
    outputWidth = Math.round(region.width * scale);
    outputHeight = Math.round(region.height * scale);
  }

  canvas.width = outputWidth;
  canvas.height = outputHeight;

  // Use high-quality image smoothing for thumbnails
  if (targetWidth) {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }

  // Draw the cropped region
  ctx.drawImage(
    image,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    outputWidth,
    outputHeight
  );

  // Convert to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob from canvas'));
        }
      },
      `image/${format}`,
      quality
    );
  });
}

/**
 * Generate a filename for a crop
 */
function generateFilename(
  region: CropRegion,
  index: number,
  format: 'jpeg' | 'png'
): string {
  const ext = format === 'jpeg' ? 'jpg' : 'png';
  const label = region.label
    ? region.label.replace(/[^a-zA-Z0-9-_]/g, '_')
    : `panel_${index + 1}`;
  return `${label}.${ext}`;
}

/**
 * Export all crops as a ZIP file with full-resolution and thumbnail folders
 */
export async function exportCrops(
  image: HTMLImageElement,
  regions: CropRegion[],
  options: ExportOptions
): Promise<void> {
  const {
    fullResolution = true,
    thumbnails = true,
    thumbnailWidth = 400,
    format = 'jpeg',
    quality = 0.9,
  } = options;

  if (regions.length === 0) {
    throw new Error('No regions to export');
  }

  const zip = new JSZip();
  const fullFolder = zip.folder('full');
  const thumbFolder = zip.folder('thumbnails');

  if (!fullFolder || !thumbFolder) {
    throw new Error('Failed to create ZIP folders');
  }

  // Process each region
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    const filename = generateFilename(region, i, format);

    // Full resolution
    if (fullResolution) {
      const fullBlob = await extractCrop(image, region, { format, quality });
      fullFolder.file(filename, fullBlob);
    }

    // Thumbnail
    if (thumbnails) {
      const thumbBlob = await extractCrop(image, region, {
        targetWidth: thumbnailWidth,
        format,
        quality: quality * 0.9, // Slightly lower quality for thumbnails
      });
      thumbFolder.file(filename, thumbBlob);
    }
  }

  // Generate and download ZIP
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().slice(0, 10);
  const zipFilename = `safety_card_panels_${timestamp}.zip`;

  saveAs(zipBlob, zipFilename);
}

/**
 * Create a rotated version of an image
 * The crop regions are axis-aligned on this rotated image
 */
function createRotatedImage(
  image: HTMLImageElement,
  rotation: number
): HTMLCanvasElement {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));

  // Calculate the bounding box of the rotated image
  const rotatedWidth = image.width * cos + image.height * sin;
  const rotatedHeight = image.width * sin + image.height * cos;

  const canvas = document.createElement('canvas');
  canvas.width = rotatedWidth;
  canvas.height = rotatedHeight;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Move to center, rotate, then draw image centered
  ctx.translate(rotatedWidth / 2, rotatedHeight / 2);
  ctx.rotate(radians);
  ctx.drawImage(image, -image.width / 2, -image.height / 2);

  return canvas;
}

/**
 * Extract a crop region from a rotated image
 * First rotates the image, then extracts the axis-aligned crop region
 */
export async function extractCropWithRotation(
  image: HTMLImageElement,
  region: CropRegion,
  rotation: number,
  options: {
    targetWidth?: number;
    format?: 'jpeg' | 'png';
    quality?: number;
  } = {}
): Promise<Blob> {
  const { targetWidth, format = 'jpeg', quality = 0.9 } = options;

  // First, create the rotated image
  const rotatedCanvas = createRotatedImage(image, rotation);

  // Now extract the crop from the rotated image
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Could not get canvas context');
  }

  // Calculate output dimensions
  let outputWidth = region.width;
  let outputHeight = region.height;

  if (targetWidth && targetWidth < region.width) {
    const scale = targetWidth / region.width;
    outputWidth = Math.round(region.width * scale);
    outputHeight = Math.round(region.height * scale);
  }

  canvas.width = outputWidth;
  canvas.height = outputHeight;

  // Use high-quality image smoothing
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // Draw the cropped region from the rotated image
  ctx.drawImage(
    rotatedCanvas,
    region.x,
    region.y,
    region.width,
    region.height,
    0,
    0,
    outputWidth,
    outputHeight
  );

  // Convert to blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to create blob from canvas'));
        }
      },
      `image/${format}`,
      quality
    );
  });
}

/**
 * Export all crops as a ZIP file with rotation applied
 * The image is rotated first, then axis-aligned crops are extracted
 */
export async function exportCropsWithRotation(
  image: HTMLImageElement,
  regions: CropRegion[],
  rotation: number,
  options: ExportOptions
): Promise<void> {
  const {
    fullResolution = true,
    thumbnails = true,
    thumbnailWidth = 400,
    format = 'jpeg',
    quality = 0.9,
  } = options;

  if (regions.length === 0) {
    throw new Error('No regions to export');
  }

  const zip = new JSZip();
  const fullFolder = zip.folder('full');
  const thumbFolder = zip.folder('thumbnails');

  if (!fullFolder || !thumbFolder) {
    throw new Error('Failed to create ZIP folders');
  }

  // Process each region
  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    const filename = generateFilename(region, i, format);

    // Full resolution
    if (fullResolution) {
      const fullBlob = await extractCropWithRotation(image, region, rotation, { format, quality });
      fullFolder.file(filename, fullBlob);
    }

    // Thumbnail
    if (thumbnails) {
      const thumbBlob = await extractCropWithRotation(image, region, rotation, {
        targetWidth: thumbnailWidth,
        format,
        quality: quality * 0.9,
      });
      thumbFolder.file(filename, thumbBlob);
    }
  }

  // Generate and download ZIP
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // Generate filename with timestamp
  const timestamp = new Date().toISOString().slice(0, 10);
  const zipFilename = `safety_card_panels_${timestamp}.zip`;

  saveAs(zipBlob, zipFilename);
}

/**
 * Download a single crop (not used in main flow but useful utility)
 */
export async function downloadSingleCrop(
  image: HTMLImageElement,
  region: CropRegion,
  options: {
    format?: 'jpeg' | 'png';
    quality?: number;
    asThumbnail?: boolean;
    thumbnailWidth?: number;
  } = {}
): Promise<void> {
  const {
    format = 'jpeg',
    quality = 0.9,
    asThumbnail = false,
    thumbnailWidth = 400,
  } = options;

  const blob = await extractCrop(image, region, {
    targetWidth: asThumbnail ? thumbnailWidth : undefined,
    format,
    quality,
  });

  const filename = generateFilename(region, 0, format);
  saveAs(blob, filename);
}

/**
 * Generate a unique ID for crop regions
 */
export function generateRegionId(): string {
  return `region-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
