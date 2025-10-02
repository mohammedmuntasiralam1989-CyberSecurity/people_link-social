// services/analyticsService.js
import mongoose from 'mongoose';
import { Post, User, Like, Comment, Follow } from '../models/User.js';

export class AnalyticsService {
  constructor() {
    this.cache = new Map();
  }

  // User analytics
  async getUserAnalytics(userId, period = '7d') {
    const cacheKey = `user_analytics_${userId}_${period}`;
    
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const dateRange = this.getDateRange(period);
    
    const analytics = {
      overview: await this.getUserOverview(userId, dateRange),
      engagement: await this.getUserEngagement(userId, dateRange),
      audience: await this.getUserAudience(userId),
      content: await this.getUserContentPerformance(userId, dateRange)
    };

    this.cache.set(cacheKey, analytics);
    setTimeout(() => this.cache.delete(cacheKey), 300000); // 5 minute cache

    return analytics;
  }

  async getUserOverview(userId, dateRange) {
    const [posts, likes, comments, followers, following] = await Promise.all([
      Post.countDocuments({ 
        user: userId, 
        createdAt: dateRange 
      }),
      Like.countDocuments({ 
        user: userId, 
        createdAt: dateRange 
      }),
      Comment.countDocuments({ 
        user: userId, 
        createdAt: dateRange 
      }),
      this.getNewFollowers(userId, dateRange),
      this.getNewFollowing(userId, dateRange)
    ]);

    return {
      posts,
      likes,
      comments,
      newFollowers: followers,
      newFollowing: following,
      engagementRate: await this.calculateEngagementRate(userId, dateRange)
    };
  }

  async getUserEngagement(userId, dateRange) {
    const dailyEngagement = await this.getDailyEngagement(userId, dateRange);
    const postPerformance = await this.getPostPerformance(userId, dateRange);
    const audienceActivity = await this.getAudienceActivity(userId, dateRange);

    return {
      dailyEngagement,
      postPerformance,
      audienceActivity,
      bestPerformingPosts: await this.getBestPerformingPosts(userId, dateRange)
    };
  }

  // Platform-wide analytics (for admin)
  async getPlatformAnalytics(period = '7d') {
    const dateRange = this.getDateRange(period);

    const [
      totalUsers,
      newUsers,
      activeUsers,
      totalPosts,
      totalLikes,
      totalComments,
      userGrowth,
      engagementTrends
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ createdAt: dateRange }),
      this.getActiveUsers(dateRange),
      Post.countDocuments({ createdAt: dateRange }),
      Like.countDocuments({ createdAt: dateRange }),
      Comment.countDocuments({ createdAt: dateRange }),
      this.getUserGrowthTrend(dateRange),
      this.getEngagementTrends(dateRange)
    ]);

    return {
      overview: {
        totalUsers,
        newUsers,
        activeUsers,
        totalPosts,
        totalLikes,
        totalComments,
        avgEngagementRate: await this.getAverageEngagementRate(dateRange)
      },
      growth: userGrowth,
      engagement: engagementTrends,
      popularContent: await this.getPopularContent(dateRange),
      userDemographics: await this.getUserDemographics()
    };
  }

  // Real-time analytics
  async getRealtimeAnalytics() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const [
      activeUsersNow,
      postsLastHour,
      likesLastHour,
      commentsLastHour,
      topPosts
    ] = await Promise.all([
      this.getActiveUsers({ start: oneHourAgo }),
      Post.countDocuments({ createdAt: { $gte: oneHourAgo } }),
      Like.countDocuments({ createdAt: { $gte: oneHourAgo } }),
      Comment.countDocuments({ createdAt: { $gte: oneHourAgo } }),
      this.getTopPosts(oneHourAgo, 5)
    ]);

    return {
      activeUsers: activeUsersNow,
      postsLastHour,
      likesLastHour,
      commentsLastHour,
      topPosts,
      systemHealth: await this.getSystemHealth()
    };
  }

  // Helper methods
  getDateRange(period) {
    const now = new Date();
    let startDate;

    switch (period) {
      case '24h':
        startDate = new Date(now - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(now - 90 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
    }

    return { $gte: startDate, $lte: now };
  }

  async getDailyEngagement(userId, dateRange) {
    return Post.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          createdAt: dateRange
        }
      },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
          },
          posts: { $sum: 1 },
          likes: { $sum: { $size: '$likes' } },
          comments: { $sum: { $size: '$comments' } },
          shares: { $sum: { $size: '$shares' } }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);
  }

  async getActiveUsers(dateRange) {
    return User.countDocuments({
      lastActive: dateRange
    });
  }

  async calculateEngagementRate(userId, dateRange) {
    const posts = await Post.find({ 
      user: userId, 
      createdAt: dateRange 
    });

    if (posts.length === 0) return 0;

    const totalEngagement = posts.reduce((sum, post) => 
      sum + post.likes.length + post.comments.length, 0
    );

    const followers = await Follow.countDocuments({ following: userId });
    
    return followers > 0 ? (totalEngagement / followers) * 100 : 0;
  }

  async getBestPerformingPosts(userId, dateRange, limit = 5) {
    return Post.aggregate([
      {
        $match: {
          user: new mongoose.Types.ObjectId(userId),
          createdAt: dateRange
        }
      },
      {
        $addFields: {
          engagementScore: {
            $add: [
              { $size: '$likes' },
              { $multiply: [{ $size: '$comments' }, 2] },
              { $multiply: [{ $size: '$shares' }, 3] }
            ]
          }
        }
      },
      {
        $sort: { engagementScore: -1 }
      },
      {
        $limit: limit
      },
      {
        $project: {
          content: 1,
          image: 1,
          engagementScore: 1,
          likes: { $size: '$likes' },
          comments: { $size: '$comments' },
          shares: { $size: '$shares' }
        }
      }
    ]);
  }

  async getPopularContent(dateRange, limit = 10) {
    return Post.aggregate([
      {
        $match: {
          createdAt: dateRange,
          visibility: 'public'
        }
      },
      {
        $addFields: {
          engagementScore: {
            $add: [
              { $size: '$likes' },
              { $multiply: [{ $size: '$comments' }, 2] },
              { $multiply: [{ $size: '$shares' }, 3] }
            ]
          }
        }
      },
      {
        $sort: { engagementScore: -1 }
      },
      {
        $limit: limit
      },
      {
        $lookup: {
          from: 'users',
          localField: 'user',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          content: 1,
          image: 1,
          'user.name': 1,
          'user.username': 1,
          engagementScore: 1
        }
      }
    ]);
  }

  async getSystemHealth() {
    // Check database connection
    const dbStatus = mongoose.connection.readyState === 1 ? 'healthy' : 'unhealthy';
    
    // Check Redis connection
    const redisStatus = 'healthy'; // Implement actual check
    
    // Check external services
    const externalServices = {
      cloudinary: 'healthy',
      email: 'healthy',
      push: 'healthy'
    };

    return {
      database: dbStatus,
      redis: redisStatus,
      externalServices,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      timestamp: new Date().toISOString()
    };
  }
}