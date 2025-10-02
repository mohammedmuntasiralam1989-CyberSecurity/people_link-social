// services/mediaFilterService.js
import sharp from 'sharp';
import ffmpeg from 'fluent-ffmpeg';
import { createCanvas, loadImage } from 'canvas';

export class MediaFilterService {
  constructor() {
    this.availableFilters = {
      // Instagram-like filters
      'clarendon': { brightness: 1.1, contrast: 1.2, saturation: 1.1 },
      'gingham': { brightness: 0.9, contrast: 1.1, saturation: 0.8 },
      'moon': { brightness: 0.8, contrast: 1.3, saturation: 0 },
      'lark': { brightness: 1.1, contrast: 1.1, saturation: 1.2 },
      'reyes': { brightness: 1.1, contrast: 0.9, saturation: 1.1 },
      'juno': { brightness: 1.1, contrast: 1.1, saturation: 1.3 },
      'slumber': { brightness: 0.9, contrast: 1.1, saturation: 0.8 },
      'crema': { brightness: 1.1, contrast: 1.1, saturation: 0.9 },
      'ludwig': { brightness: 1.1, contrast: 1.2, saturation: 1.1 },
      'aden': { brightness: 0.9, contrast: 1.1, saturation: 0.9 },
      
      // Vintage filters
      'vintage': { brightness: 0.9, contrast: 1.1, saturation: 0.8, sepia: 0.3 },
      'old-school': { brightness: 0.8, contrast: 1.2, saturation: 0.7, vignette: 0.2 },
      
      // Black & white
      'bw-strong': { brightness: 1, contrast: 1.3, grayscale: true },
      'bw-soft': { brightness: 1.1, contrast: 1.1, grayscale: true },
      
      // Color boost
      'vivid': { brightness: 1, contrast: 1.2, saturation: 1.4 },
      'dramatic': { brightness: 0.9, contrast: 1.4, saturation: 1.1 }
    };

    this.availableEffects = [
      'blur', 'sharpen', 'pixelate', 'vignette', 'noise', 
      'tilt-shift', 'bloom', 'glitch', 'duotone'
    ];
  }

  // Apply filter to image
  async applyImageFilter(imageBuffer, filterName, intensity = 1.0) {
    const filter = this.availableFilters[filterName];
    if (!filter) {
      throw new Error(`Filter '${filterName}' not found`);
    }

    let sharpInstance = sharp(imageBuffer);

    // Apply basic adjustments
    if (filter.brightness) {
      sharpInstance = sharpInstance.modulate({
        brightness: this.applyIntensity(filter.brightness, intensity)
      });
    }

    if (filter.contrast) {
      sharpInstance = sharpInstance.linear(
        this.applyIntensity(filter.contrast, intensity),
        this.calculateOffset(filter.contrast, intensity)
      );
    }

    if (filter.saturation) {
      sharpInstance = sharpInstance.modulate({
        saturation: this.applyIntensity(filter.saturation, intensity)
      });
    }

    // Apply special effects
    if (filter.grayscale) {
      sharpInstance = sharpInstance.grayscale();
    }

    if (filter.sepia) {
      sharpInstance = sharpInstance.tint({ r: 255, g: 240, b: 192 });
    }

    if (filter.vignette) {
      const vignetteIntensity = this.applyIntensity(filter.vignette, intensity);
      sharpInstance = sharpInstance.extend({
        top: 10, bottom: 10, left: 10, right: 10,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }).composite([{
        input: this.generateVignetteOverlay(100, 100, vignetteIntensity),
        blend: 'multiply'
      }]);
    }

    return await sharpInstance.toBuffer();
  }

  // Apply multiple filters in sequence
  async applyFilterStack(imageBuffer, filters) {
    let currentBuffer = imageBuffer;

    for (const { name, intensity = 1.0 } of filters) {
      currentBuffer = await this.applyImageFilter(currentBuffer, name, intensity);
    }

    return currentBuffer;
  }

  // Crop image
  async cropImage(imageBuffer, cropOptions) {
    const { x, y, width, height, aspectRatio } = cropOptions;

    let sharpInstance = sharp(imageBuffer);

    if (aspectRatio) {
      // Auto-crop to aspect ratio
      const metadata = await sharpInstance.metadata();
      const targetWidth = metadata.width;
      const targetHeight = Math.round(targetWidth / aspectRatio);

      if (targetHeight > metadata.height) {
        // Need to crop width instead
        const adjustedWidth = Math.round(metadata.height * aspectRatio);
        sharpInstance = sharpInstance.resize(adjustedWidth, metadata.height)
          .extract({
            left: Math.round((adjustedWidth - targetWidth) / 2),
            top: 0,
            width: targetWidth,
            height: metadata.height
          });
      } else {
        sharpInstance = sharpInstance.resize(targetWidth, targetHeight)
          .extract({
            left: 0,
            top: Math.round((metadata.height - targetHeight) / 2),
            width: targetWidth,
            height: targetHeight
          });
      }
    } else if (x !== undefined && y !== undefined && width && height) {
      // Manual crop
      sharpInstance = sharpInstance.extract({ left: x, top: y, width, height });
    }

    return await sharpInstance.toBuffer();
  }

  // Resize image
  async resizeImage(imageBuffer, resizeOptions) {
    const { width, height, fit = 'cover', position = 'center' } = resizeOptions;

    return await sharp(imageBuffer)
      .resize(width, height, {
        fit,
        position,
        withoutEnlargement: true
      })
      .toBuffer();
  }

  // Rotate image
  async rotateImage(imageBuffer, angle) {
    return await sharp(imageBuffer)
      .rotate(angle)
      .toBuffer();
  }

  // Add text overlay
  async addTextOverlay(imageBuffer, textOptions) {
    const { text, x, y, fontSize = 24, color = '#ffffff', fontFamily = 'Arial' } = textOptions;
    
    const metadata = await sharp(imageBuffer).metadata();
    const canvas = createCanvas(metadata.width, metadata.height);
    const ctx = canvas.getContext('2d');

    // Draw original image
    const image = await loadImage(imageBuffer);
    ctx.drawImage(image, 0, 0);

    // Configure text
    ctx.font = `${fontSize}px ${fontFamily}`;
    ctx.fillStyle = color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

    // Add text shadow for better readability
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 2;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;

    // Draw text
    ctx.fillText(text, x, y);

    return canvas.toBuffer();
  }

  // Add sticker/emoji overlay
  async addStickerOverlay(imageBuffer, stickerOptions) {
    const { stickerUrl, x, y, width, height, rotation = 0 } = stickerOptions;

    const metadata = await sharp(imageBuffer).metadata();
    
    return await sharp(imageBuffer)
      .composite([{
        input: await this.loadSticker(stickerUrl, width, height, rotation),
        left: x,
        top: y,
        blend: 'over'
      }])
      .toBuffer();
  }

  // Apply video filter
  async applyVideoFilter(videoPath, filterName, outputPath) {
    const filter = this.availableFilters[filterName];
    if (!filter) {
      throw new Error(`Filter '${filterName}' not found`);
    }

    let ffmpegCommand = ffmpeg(videoPath);

    // Build FFmpeg filter complex
    const filterComplex = [];

    if (filter.brightness) {
      filterComplex.push(`eq=brightness=${(filter.brightness - 1) * 0.1}`);
    }

    if (filter.contrast) {
      filterComplex.push(`eq=contrast=${filter.contrast}`);
    }

    if (filter.saturation) {
      filterComplex.push(`eq=saturation=${filter.saturation}`);
    }

    if (filter.grayscale) {
      filterComplex.push('hue=s=0');
    }

    if (filterComplex.length > 0) {
      ffmpegCommand = ffmpegCommand.videoFilters(filterComplex.join(','));
    }

    return new Promise((resolve, reject) => {
      ffmpegCommand
        .output(outputPath)
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
  }

  // Generate preview for filter
  async generateFilterPreview(imageBuffer, filterName, size = { width: 100, height: 100 }) {
    const filteredImage = await this.applyImageFilter(imageBuffer, filterName);
    return await sharp(filteredImage)
      .resize(size.width, size.height)
      .toBuffer();
  }

  // Helper methods
  applyIntensity(baseValue, intensity) {
    return 1 + (baseValue - 1) * intensity;
  }

  calculateOffset(contrast, intensity) {
    return (1 - contrast) * 128 * intensity;
  }

  generateVignetteOverlay(width, height, intensity) {
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    const gradient = ctx.createRadialGradient(
      width / 2, height / 2, 0,
      width / 2, height / 2, Math.max(width, height) / 2
    );

    gradient.addColorStop(0, `rgba(0, 0, 0, 0)`);
    gradient.addColorStop(1, `rgba(0, 0, 0, ${intensity})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);

    return canvas.toBuffer();
  }

  async loadSticker(stickerUrl, width, height, rotation) {
    // Implementation for loading and preparing stickers
    // This could involve downloading from URL or loading from local storage
    const response = await fetch(stickerUrl);
    const stickerBuffer = await response.buffer();
    
    return await sharp(stickerBuffer)
      .resize(width, height)
      .rotate(rotation)
      .toBuffer();
  }

  // Get available filters with previews
  async getAvailableFilters(previewImageBuffer = null) {
    const filters = [];

    for (const [name, config] of Object.entries(this.availableFilters)) {
      const filterInfo = {
        name,
        config,
        preview: null
      };

      if (previewImageBuffer) {
        filterInfo.preview = await this.generateFilterPreview(
          previewImageBuffer, 
          name, 
          { width: 80, height: 80 }
        );
      }

      filters.push(filterInfo);
    }

    return filters;
  }
}