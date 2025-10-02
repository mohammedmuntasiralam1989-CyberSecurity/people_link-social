// services/videoProcessor.js
import ffmpeg from 'fluent-ffmpeg';
import cloudinary from 'cloudinary';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export class VideoProcessor {
  constructor() {
    this.supportedFormats = ['mp4', 'mov', 'avi', 'mkv', 'webm'];
    this.maxFileSize = 100 * 1024 * 1024; // 100MB
  }

  async processVideoUpload(file, options = {}) {
    const { userId, purpose = 'post', quality = 'auto' } = options;
    
    try {
      // Validate file
      await this.validateVideoFile(file);

      // Generate unique file name
      const fileId = uuidv4();
      const tempPath = file.path;
      const outputDir = path.join(__dirname, '../temp', fileId);

      // Create output directory
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Process video for different qualities
      const processingResults = await this.processVideoQualities(tempPath, outputDir, quality);

      // Generate thumbnail
      const thumbnailPath = await this.generateVideoThumbnail(tempPath, outputDir);

      // Upload to cloud storage
      const uploadResults = await this.uploadToCloud(processingResults, thumbnailPath, userId, purpose);

      // Clean up temporary files
      await this.cleanupTempFiles(tempPath, outputDir);

      return uploadResults;

    } catch (error) {
      await this.cleanupTempFiles(file.path);
      throw error;
    }
  }

  async validateVideoFile(file) {
    // Check file size
    if (file.size > this.maxFileSize) {
      throw new Error(`File too large. Maximum size is ${this.maxFileSize / 1024 / 1024}MB`);
    }

    // Check file format
    const extension = path.extname(file.originalname).toLowerCase().slice(1);
    if (!this.supportedFormats.includes(extension)) {
      throw new Error(`Unsupported video format. Supported formats: ${this.supportedFormats.join(', ')}`);
    }

    // Basic video validation using ffprobe
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(file.path, (err, metadata) => {
        if (err) {
          reject(new Error('Invalid video file'));
        } else if (!metadata.streams.find(stream => stream.codec_type === 'video')) {
          reject(new Error('No video stream found'));
        } else {
          resolve(metadata);
        }
      });
    });
  }

  async processVideoQualities(inputPath, outputDir, targetQuality) {
    const qualities = {
      '1080p': { width: 1920, height: 1080, bitrate: '4000k' },
      '720p': { width: 1280, height: 720, bitrate: '2500k' },
      '480p': { width: 854, height: 480, bitrate: '1000k' },
      '360p': { width: 640, height: 360, bitrate: '700k' }
    };

    const results = {};
    const processingPromises = [];

    for (const [qualityName, config] of Object.entries(qualities)) {
      const outputPath = path.join(outputDir, `${qualityName}.mp4`);
      
      const promise = this.encodeVideo(inputPath, outputPath, config)
        .then(() => {
          results[qualityName] = {
            path: outputPath,
            width: config.width,
            height: config.height,
            bitrate: config.bitrate
          };
        });

      processingPromises.push(promise);
    }

    await Promise.all(processingPromises);
    return results;
  }

  encodeVideo(inputPath, outputPath, config) {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .output(outputPath)
        .videoCodec('libx264')
        .size(`${config.width}x${config.height}`)
        .videoBitrate(config.bitrate)
        .fps(30)
        .outputOptions([
          '-preset fast',
          '-profile:v high',
          '-level 4.0',
          '-pix_fmt yuv420p',
          '-movflags +faststart',
          '-crf 23'
        ])
        .on('start', (commandLine) => {
          console.log('FFmpeg process started:', commandLine);
        })
        .on('progress', (progress) => {
          console.log(`Processing: ${progress.percent}% done`);
        })
        .on('end', () => {
          console.log('FFmpeg process finished');
          resolve();
        })
        .on('error', (err) => {
          console.error('FFmpeg error:', err);
          reject(err);
        })
        .run();
    });
  }

  async generateVideoThumbnail(videoPath, outputDir, timestamp = '00:00:01') {
    return new Promise((resolve, reject) => {
      const thumbnailPath = path.join(outputDir, 'thumbnail.jpg');
      
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

  async uploadToCloud(qualities, thumbnailPath, userId, purpose) {
    const uploadResults = {
      qualities: {},
      thumbnail: null,
      duration: 0,
      dimensions: { width: 0, height: 0 }
    };

    // Upload thumbnail
    const thumbnailResult = await cloudinary.v2.uploader.upload(thumbnailPath, {
      folder: `peoplelink/users/${userId}/thumbnails`,
      resource_type: 'image'
    });
    uploadResults.thumbnail = thumbnailResult.secure_url;

    // Upload each video quality
    for (const [quality, data] of Object.entries(qualities)) {
      const result = await cloudinary.v2.uploader.upload(data.path, {
        resource_type: 'video',
        folder: `peoplelink/users/${userId}/videos/${purpose}`,
        transformation: [
          { quality: 'auto' },
          { format: 'mp4' }
        ]
      });

      uploadResults.qualities[quality] = {
        url: result.secure_url,
        width: data.width,
        height: data.height,
        bitrate: data.bitrate,
        size: result.bytes
      };

      // Get duration and dimensions from the first quality
      if (quality === '1080p') {
        uploadResults.duration = result.duration;
        uploadResults.dimensions = {
          width: result.width,
          height: result.height
        };
      }
    }

    return uploadResults;
  }

  async generateHLSStream(videoPath, outputDir) {
    // Generate HLS streams for adaptive bitrate streaming
    const manifestPath = path.join(outputDir, 'stream.m3u8');
    
    return new Promise((resolve, reject) => {
      ffmpeg(videoPath)
        .outputOptions([
          '-profile:v baseline',
          '-level 3.0',
          '-start_number 0',
          '-hls_time 10',
          '-hls_list_size 0',
          '-f hls'
        ])
        .output(manifestPath)
        .on('end', () => resolve(manifestPath))
        .on('error', reject)
        .run();
    });
  }

  async cleanupTempFiles(...paths) {
    for (const filePath of paths) {
      try {
        if (fs.existsSync(filePath)) {
          if (fs.lstatSync(filePath).isDirectory()) {
            fs.rmSync(filePath, { recursive: true });
          } else {
            fs.unlinkSync(filePath);
          }
        }
      } catch (error) {
        console.error('Error cleaning up temp file:', error);
      }
    }
  }
}