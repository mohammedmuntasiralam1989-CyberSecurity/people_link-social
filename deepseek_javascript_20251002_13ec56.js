// services/videoStreamingService.js
import AWS from 'aws-sdk';
import crypto from 'crypto';

export class VideoStreamingService {
  constructor() {
    this.s3 = new AWS.S3({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION
    });

    this.cloudfront = new AWS.CloudFront();
  }

  // Generate signed URL for secure video streaming
  generateSignedUrl(videoKey, expiresIn = 3600) {
    const params = {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: videoKey,
      Expires: expiresIn
    };

    return this.s3.getSignedUrl('getObject', params);
  }

  // Generate CloudFront signed URL for better performance
  generateCloudFrontSignedUrl(videoKey, expiresIn = 3600) {
    const cloudFrontUrl = `https://${process.env.CLOUDFRONT_DOMAIN}/${videoKey}`;
    const policy = this.createCloudFrontPolicy(cloudFrontUrl, expiresIn);
    const signature = crypto.createSign('RSA-SHA1')
      .update(policy)
      .sign(process.env.CLOUDFRONT_PRIVATE_KEY, 'base64');

    return `${cloudFrontUrl}?Policy=${policy}&Signature=${signature}&Key-Pair-Id=${process.env.CLOUDFRONT_KEY_PAIR_ID}`;
  }

  createCloudFrontPolicy(resource, expiresIn) {
    const policy = {
      Statement: [{
        Resource: resource,
        Condition: {
          DateLessThan: {
            'AWS:EpochTime': Math.floor(Date.now() / 1000) + expiresIn
          }
        }
      }]
    };

    return Buffer.from(JSON.stringify(policy)).toString('base64');
  }

  // Adaptive bitrate streaming with HLS
  async setupHLSStreaming(videoKey, qualities) {
    const streamConfig = {
      masterPlaylist: this.generateMasterPlaylist(videoKey, qualities),
      qualityUrls: {}
    };

    // Generate quality-specific playlists
    for (const quality of qualities) {
      streamConfig.qualityUrls[quality] = 
        this.generateQualityPlaylist(videoKey, quality);
    }

    return streamConfig;
  }

  generateMasterPlaylist(videoKey, qualities) {
    let playlist = '#EXTM3U\n';
    
    qualities.forEach(quality => {
      const { width, height, bitrate } = this.getQualityConfig(quality);
      playlist += `#EXT-X-STREAM-INF:PROGRAM-ID=1,BANDWIDTH=${bitrate},RESOLUTION=${width}x${height}\n`;
      playlist += `${videoKey}/${quality}/playlist.m3u8\n`;
    });

    return playlist;
  }

  generateQualityPlaylist(videoKey, quality) {
    // Generate HLS segments for specific quality
    // This would typically be done during video processing
    return `${videoKey}/${quality}/playlist.m3u8`;
  }

  getQualityConfig(quality) {
    const configs = {
      '1080p': { width: 1920, height: 1080, bitrate: 4000000 },
      '720p': { width: 1280, height: 720, bitrate: 2500000 },
      '480p': { width: 854, height: 480, bitrate: 1000000 },
      '360p': { width: 640, height: 360, bitrate: 700000 }
    };

    return configs[quality] || configs['720p'];
  }

  // Video analytics tracking
  async trackVideoView(videoId, userId, data) {
    const viewData = {
      videoId,
      userId,
      timestamp: new Date(),
      ...data
    };

    // Store in database or analytics service
    await this.saveViewAnalytics(viewData);
  }

  async saveViewAnalytics(viewData) {
    // Implementation for storing view analytics
    console.log('Video view tracked:', viewData);
  }
}