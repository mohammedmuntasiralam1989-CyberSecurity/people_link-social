// services/hashtagService.js
import mongoose from 'mongoose';
import { Post, Story } from '../models/User.js';

export class HashtagService {
  constructor() {
    this.trendingCache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  // Extract and process hashtags from content
  async processHashtags(content, contentType, contentId) {
    const hashtags = this.extractHashtags(content);
    
    if (hashtags.length === 0) return [];

    // Update hashtag counts and trends
    await this.updateHashtagStats(hashtags, contentType, contentId);

    return hashtags;
  }

  extractHashtags(content) {
    const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
    const hashtags = [];
    let match;

    while ((match = hashtagRegex.exec(content)) !== null) {
      const tag = match[1].toLowerCase();
      if (tag.length >= 2 && tag.length <= 30) { // Valid hashtag length
        hashtags.push({
          tag,
          startIndex: match.index,
          endIndex: match.index + match[0].length
        });
      }
    }

    return hashtags;
  }

  async updateHashtagStats(hashtags, contentType, contentId) {
    const Hashtag = mongoose.model('Hashtag');
    const now = new Date();

    for (const { tag } of hashtags) {
      await Hashtag.findOneAndUpdate(
        { tag },
        {
          $inc: {
            totalUses: 1,
            [`usage.${contentType}`]: 1
          },
          $addToSet: {
            recentContent: {
              contentType,
              contentId,
              usedAt: now
            }
          },
          lastUsed: now,
          $setOnInsert: {
            firstUsed: now,
            tag
          }
        },
        { upsert: true, new: true }
      );
    }
  }

  // Get trending hashtags
  async getTrendingHashtags(options = {}) {
    const { limit = 20, period = '24h', category } = options;
    const cacheKey = `trending_${period}_${limit}_${category}`;

    // Check cache
    if (this.trendingCache.has(cacheKey)) {
      const cached = this.trendingCache.get(cacheKey);
      if (Date.now() - cached.timestamp < this.cacheTimeout) {
        return cached.data;
      }
    }

    const dateRange = this.getDateRange(period);
    const Hashtag = mongoose.model('Hashtag');

    const pipeline = [
      {
        $match: {
          lastUsed: dateRange,
          ...(category && { [`usage.${category}`]: { $gt: 0 } })
        }
      },
      {
        $project: {
          tag: 1,
          totalUses: 1,
          usage: 1,
          lastUsed: 1,
          growthRate: {
            $divide: [
              { $subtract: ['$totalUses', '$previousUses'] },
              '$previousUses'
            ]
          },
          engagementScore: {
            $add: [
              { $multiply: ['$totalUses', 1] },
              { $multiply: ['$postEngagement', 2] },
              { $multiply: ['$storyViews', 0.5] }
            ]
          }
        }
      },
      {
        $sort: { 
          engagementScore: -1,
          growthRate: -1,
          lastUsed: -1
        }
      },
      {
        $limit: limit
      }
    ];

    const trendingHashtags = await Hashtag.aggregate(pipeline);

    // Cache the results
    this.trendingCache.set(cacheKey, {
      data: trendingHashtags,
      timestamp: Date.now()
    });

    return trendingHashtags;
  }

  // Get hashtag suggestions
  async getHashtagSuggestions(query, options = {}) {
    const { limit = 10, excludeUsed = true } = options;
    const Hashtag = mongoose.model('Hashtag');

    let searchQuery = {
      tag: { $regex: query, $options: 'i' }
    };

    if (excludeUsed && options.userId) {
      // Exclude hashtags user recently used
      const usedHashtags = await this.getUserRecentHashtags(options.userId);
      searchQuery.tag.$not = { $in: usedHashtags };
    }

    const suggestions = await Hashtag.find(searchQuery)
      .sort({ totalUses: -1, lastUsed: -1 })
      .limit(limit)
      .select('tag totalUses');

    return suggestions;
  }

  async getUserRecentHashtags(userId, limit = 50) {
    const recentPosts = await Post.find({ user: userId })
      .select('hashtags')
      .sort({ createdAt: -1 })
      .limit(20);

    const hashtags = new Set();
    recentPosts.forEach(post => {
      post.hashtags.forEach(tag => hashtags.add(tag));
    });

    return Array.from(hashtags).slice(0, limit);
  }

  // Follow hashtag
  async followHashtag(userId, hashtag) {
    const HashtagFollow = mongoose.model('HashtagFollow');
    
    const follow = await HashtagFollow.findOneAndUpdate(
      { user: userId, hashtag },
      { followedAt: new Date() },
      { upsert: true, new: true }
    );

    // Update hashtag follower count
    await mongoose.model('Hashtag').updateOne(
      { tag: hashtag },
      { $inc: { followerCount: 1 } }
    );

    return follow;
  }

  // Get hashtag feed
  async getHashtagFeed(hashtag, options = {}) {
    const { page = 1, limit = 20, contentType = 'all' } = options;
    const skip = (page - 1) * limit;

    let contentQuery = { hashtags: { $in: [hashtag] } };
    
    if (contentType !== 'all') {
      contentQuery = { 
        ...contentQuery,
        _id: { $exists: true } // Placeholder for actual content type filtering
      };
    }

    const [posts, stories, total] = await Promise.all([
      contentType === 'all' || contentType === 'post' ?
        Post.find(contentQuery)
          .populate('user', 'name username avatar isVerified')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit) : [],
      
      contentType === 'all' || contentType === 'story' ?
        Story.find(contentQuery)
          .populate('user', 'name username avatar isVerified')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit) : [],
      
      this.getHashtagContentCount(hashtag, contentType)
    ]);

    return {
      posts,
      stories,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async getHashtagContentCount(hashtag, contentType) {
    const counts = await Promise.all([
      contentType === 'all' || contentType === 'post' ?
        Post.countDocuments({ hashtags: { $in: [hashtag] } }) : 0,
      
      contentType === 'all' || contentType === 'story' ?
        Story.countDocuments({ hashtags: { $in: [hashtag] } }) : 0
    ]);

    return counts.reduce((sum, count) => sum + count, 0);
  }

  getDateRange(period) {
    const now = new Date();
    let startDate;

    switch (period) {
      case '1h':
        startDate = new Date(now - 60 * 60 * 1000);
        break;
      case '24h':
        startDate = new Date(now - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        startDate = new Date(now - 30 * 24 * 60 * 60 * 1000);
        break;
      default:
        startDate = new Date(now - 24 * 60 * 60 * 1000);
    }

    return { $gte: startDate, $lte: now };
  }
}