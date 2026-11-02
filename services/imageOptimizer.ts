/**
 * Image optimization utilities for high-performance camera and gallery uploads.
 * Reduces raw 10MB-30MB captures to crisp ~250KB-400KB JPEGs (1080p-1440p)
 * preserving loco markings, pantograph details, and text while drastically
 * accelerating uploads over Tailscale, mobile tunnels, and local networks.
 */

export async function optimizeBase64Image(
  dataUrl: string,
  maxDimension = 1920,
  quality = 0.80
): Promise<string> {
  if (!dataUrl || !dataUrl.startsWith('data:image')) {
    return dataUrl;
  }

  // If already under 350KB, check if resizing is even needed
  // (Base64 string length ~ 470,000 characters is ~350KB)
  if (dataUrl.length < 450000 && !dataUrl.startsWith('data:image/png')) {
    // Already compact
    return dataUrl;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      try {
        let { width, height } = img;

        // Resize down to maxDimension preserving aspect ratio
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(dataUrl);
          return;
        }

        // Use high quality image smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const optimized = canvas.toDataURL('image/jpeg', quality);

        // If for any bizarre reason optimized was larger, return original
        if (optimized.length > dataUrl.length && dataUrl.startsWith('data:image/jpeg')) {
          resolve(dataUrl);
        } else {
          resolve(optimized);
        }
      } catch (e) {
        console.warn('Image optimization fallback to original', e);
        resolve(dataUrl);
      }
    };

    img.onerror = () => {
      resolve(dataUrl);
    };

    img.src = dataUrl;
  });
}

export async function compressFile(
  file: File,
  maxDimension = 1920,
  quality = 0.80
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const rawDataUrl = reader.result as string;
      try {
        const optimized = await optimizeBase64Image(rawDataUrl, maxDimension, quality);
        resolve(optimized);
      } catch {
        resolve(rawDataUrl);
      }
    };
    reader.onerror = (err) => reject(err);
    reader.readAsDataURL(file);
  });
}

/**
 * Validates that an image string is either a valid stored URL or a well-formed base64 image payload.
 */
export function isValidImageData(dataUrl: string | null | undefined): boolean {
  if (!dataUrl || typeof dataUrl !== 'string') return false;
  if (dataUrl.startsWith('/storage/') || dataUrl.startsWith('http://') || dataUrl.startsWith('https://')) {
    return true;
  }
  if (!dataUrl.startsWith('data:image/')) return false;
  const commaIdx = dataUrl.indexOf(',');
  if (commaIdx === -1) return false;
  const base64Part = dataUrl.slice(commaIdx + 1).replace(/[^A-Za-z0-9+/=]/g, '');
  return base64Part.length >= 100;
}

