// services/mediaProcessor.js
import ffmpeg from 'fluent-ffmpeg';
import cloudinary from 'cloudinary';
import fs from 'fs';
import path from 'path';

// Cloudinary configuration
cloudinary.v2.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

export class MediaProcessor {
  constructor() {
    this.supportedFormats = {
      image: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      video: ['mp4', 'mov', 'avi', 'webm', 'mkv']
    };
  }

  async processUpload(file, options = {}) {
    const { type, userId, purpose } = options;
    
    try {
      // Validate file type
      if (!this.isSupportedFormat(file.originalname, type)) {
        throw new Error(`Unsupported ${type} format`);
      }

      let result;

      if (type === 'image') {
        result = await this.processImage(file, userId, purpose);
      } else if (type === 'video') {
        result = await this.processVideo(file, userId, purpose);
      }

      // Clean up temporary file
      await this.cleanupTempFile(file.path);

      return result;
    } catch (error) {
      await this.cleanupTempFile(file.path);
      throw error;
    }
  }

  async processImage(file, userId, purpose) {
    const transformations = this.getImageTransformations(purpose);
    
    const result = await cloudinary.v2.uploader.upload(file.path, {
      folder: `peoplelink/users/${userId}/${purpose}`,
      transformation: transformations,
      resource_type: 'image',
      quality: 'auto',
      fetch_format: 'auto'
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      format: result.format,
      width: result.width,
      height: result.height,
      size: result.bytes
    };
  }

  async processVideo(file, userId, purpose) {
    // Generate thumbnail
    const thumbnailPath = await this.generateVideoThumbnail(file.path);
    
    // Upload thumbnail
    const thumbnailResult = await cloudinary.v2.uploader.upload(thumbnailPath, {
      folder: `peoplelink/users/${userId}/thumbnails`,
      resource_type: 'image'
    });

    // Upload video with optimizations
    const videoResult = await cloudinary.v2.uploader.upload(file.path, {
      resource_type: 'video',
      folder: `peoplelink/users/${userId}/videos`,
      transformation: [
        { quality: 'auto' },
        { format: 'mp4' },
        { fetch_format: 'auto' }
      ],
      eager: [
        { width: 640, height: 360, crop: 'limit', format: 'mp4' },
        { width: 320, height: 180, crop: 'limit', format: 'mp4' }
      ]
    });

    // Clean up thumbnail file
    await this.cleanupTempFile(thumbnailPath);

    return {
      url: videoResult.secure_url,
      thumbnail: thumbnailResult.secure_url,
      publicId: videoResult.public_id,
      duration: videoResult.duration,
      format: videoResult.format,
      width: videoResult.width,
      height: videoResult.height,
      size: videoResult.bytes,
      versions: videoResult.eager // Different quality versions
    };
  }

  async generateVideoThumbnail(videoPath, timestamp = '00:00:01') {
    return new Promise((resolve, reject) => {
      const thumbnailPath = videoPath + '_thumbnail.jpg';
      
      ffmpeg(videoPath)
        .screenshots({
          timestamps: [timestamp],
          filename: path.basename(thumbnailPath),
          folder: path.dirname(thumbnailPath),
          size: '640x360'
        })
        .on('end', () => resolve(thumbnailPath))
        .on('error', reject);
    });
  }

  getImageTransformations(purpose) {
    const transformations = [];
    
    switch (purpose) {
      case 'avatar':
        transformations.push(
          { width: 200, height: 200, crop: 'thumb', gravity: 'face' },
          { radius: 'max' }
        );
        break;
      
      case 'cover':
        transformations.push(
          { width: 1200, height: 400, crop: 'fill' }
        );
        break;
      
      case 'post':
        transformations.push(
          { width: 1080, height: 1080, crop: 'limit' },
          { quality: 'auto' }
        );
        break;
      
      case 'story':
        transformations.push(
          { width: 1080, height: 1920, crop: 'fill' },
          { quality: 'auto' }
        );
        break;
      
      default:
        transformations.push(
          { width: 800, height: 600, crop: 'limit' },
          { quality: 'auto' }
        );
    }

    return transformations;
  }

  async generateBlurhash(imagePath) {
    // Generate blurhash for image placeholders
    return new Promise((resolve) => {
      // Implementation for blurhash generation
      // This is a simplified version
      resolve('LEHV6nWB2yk8pyo0adR*.7kCMdnj');
    });
  }

  async compressImage(inputPath, outputPath, quality = 80) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .output(outputPath)
        .outputOptions([
          '-q:v', quality,
          '-compression_level', '6'
        ])
        .on('end', resolve)
        .on('error', reject)
        .run();
    });
  }

  isSupportedFormat(filename, type) {
    const extension = filename.split('.').pop().toLowerCase();
    return this.supportedFormats[type].includes(extension);
  }

  async cleanupTempFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error('Error cleaning up temp file:', error);
    }
  }

  // Generate multiple image sizes for responsive design
  async generateResponsiveImages(file, userId) {
    const sizes = [320, 640, 768, 1024, 1280, 1920];
    const results = {};

    for (const size of sizes) {
      const result = await cloudinary.v2.uploader.upload(file.path, {
        folder: `peoplelink/users/${userId}/responsive`,
        transformation: [
          { width: size, crop: 'limit' },
          { quality: 'auto' },
          { format: 'webp' }
        ]
      });

      results[size] = result.secure_url;
    }

    return results;
  }
}