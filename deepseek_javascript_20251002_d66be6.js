// services/taggingService.js
import natural from 'natural';
import { User, Post } from '../models/User.js';

export class TaggingService {
  constructor() {
    this.tokenizer = new natural.WordTokenizer();
    this.tagger = new natural.BrillPOSTagger();
  }

  // Extract tags from text content
  async extractTags(content, options = {}) {
    const { extractUsers = true, extractLocations = true, extractHashtags = true } = options;
    const tags = {
      users: [],
      locations: [],
      hashtags: []
    };

    if (extractUsers) {
      tags.users = await this.extractUserMentions(content);
    }

    if (extractLocations) {
      tags.locations = this.extractLocationMentions(content);
    }

    if (extractHashtags) {
      tags.hashtags = this.extractHashtags(content);
    }

    return tags;
  }

  // Extract user mentions (@username)
  async extractUserMentions(content) {
    const mentionRegex = /@([a-zA-Z0-9._]+)/g;
    const mentions = [];
    let match;

    while ((match = mentionRegex.exec(content)) !== null) {
      const username = match[1];
      
      // Find user by username
      const user = await User.findOne({ username })
        .select('_id name username avatar isVerified');
      
      if (user) {
        mentions.push({
          user: user._id,
          username: user.username,
          name: user.name,
          avatar: user.avatar,
          isVerified: user.isVerified,
          startIndex: match.index,
          endIndex: match.index + match[0].length
        });
      }
    }

    return mentions;
  }

  // Extract location mentions
  extractLocationMentions(content) {
    const locationRegex = /@\[location\]\((.*?)\)/g;
    const locations = [];
    let match;

    while ((match = locationRegex.exec(content)) !== null) {
      const locationName = match[1];
      
      locations.push({
        name: locationName,
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }

    return locations;
  }

  // Extract hashtags (#tag)
  extractHashtags(content) {
    const hashtagRegex = /#([a-zA-Z0-9_]+)/g;
    const hashtags = [];
    let match;

    while ((match = hashtagRegex.exec(content)) !== null) {
      const tag = match[1].toLowerCase();
      
      hashtags.push({
        tag,
        startIndex: match.index,
        endIndex: match.index + match[0].length
      });
    }

    return hashtags;
  }

  // Process and apply tags to content
  async processContentTags(content, contentType, contentId) {
    const tags = await this.extractTags(content);

    // Update content with tags
    const updateData = {};
    
    if (tags.users.length > 0) {
      updateData.mentions = tags.users.map(tag => tag.user);
    }
    
    if (tags.hashtags.length > 0) {
      updateData.hashtags = tags.hashtags.map(tag => tag.tag);
    }

    if (tags.locations.length > 0) {
      updateData.locations = tags.locations.map(tag => tag.name);
    }

    // Update the content document
    const Model = mongoose.model(contentType.charAt(0).toUpperCase() + contentType.slice(1));
    await Model.findByIdAndUpdate(contentId, updateData);

    // Create notifications for mentioned users
    await this.createMentionNotifications(tags.users, contentType, contentId);

    return tags;
  }

  // Create notifications for mentioned users
  async createMentionNotifications(mentionedUsers, contentType, contentId) {
    const notifications = [];

    for (const mention of mentionedUsers) {
      notifications.push({
        user: mention.user,
        type: 'mention',
        fromUser: mention.user, // This should be the content creator
        [contentType]: contentId,
        message: `You were mentioned in a ${contentType}`
      });
    }

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }
  }

  // Search posts by hashtag
  async searchByHashtag(hashtag, options = {}) {
    const { page = 1, limit = 20, sort = 'recent' } = options;
    const skip = (page - 1) * limit;

    let sortOptions = {};
    switch (sort) {
      case 'recent':
        sortOptions = { createdAt: -1 };
        break;
      case 'popular':
        sortOptions = { likeCount: -1, createdAt: -1 };
        break;
      case 'trending':
        // Combine recency and engagement
        sortOptions = { 
          $sort: {
            $add: [
              { $size: '$likes' },
              { $multiply: [{ $size: '$comments' }, 2] }
            ]
          }
        };
        break;
    }

    const posts = await Post.find({
      hashtags: { $regex: hashtag, $options: 'i' },
      visibility: 'public'
    })
    .populate('user', 'name username avatar isVerified')
    .sort(sortOptions)
    .skip(skip)
    .limit(limit);

    const total = await Post.countDocuments({
      hashtags: { $regex: hashtag, $options: 'i' },
      visibility: 'public'
    });

    return {
      posts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  // Get trending hashtags
  async getTrendingHashtags(limit = 20, period = '7d') {
    const dateRange = this.getDateRange(period);

    const trendingHashtags = await Post.aggregate([
      {
        $match: {
          createdAt: dateRange,
          hashtags: { $exists: true, $ne: [] }
        }
      },
      {
        $unwind: '$hashtags'
      },
      {
        $group: {
          _id: '$hashtags',
          count: { $sum: 1 },
          engagement: {
            $sum: {
              $add: [
                { $size: '$likes' },
                { $multiply: [{ $size: '$comments' }, 2] }
              ]
            }
          },
          lastUsed: { $max: '$createdAt' }
        }
      },
      {
        $project: {
          hashtag: '$_id',
          count: 1,
          engagement: 1,
          lastUsed: 1,
          score: {
            $add: [
              { $multiply: ['$count', 1] },
              { $multiply: ['$engagement', 0.5] },
              {
                $divide: [
                  1,
                  {
                    $add: [
                      1,
                      {
                        $dateDiff: {
                          startDate: '$lastUsed',
                          endDate: new Date(),
                          unit: 'hour'
                        }
                      }
                    ]
                  }
                ]
              }
            ]
          }
        }
      },
      {
        $sort: { score: -1 }
      },
      {
        $limit: limit
      }
    ]);

    return trendingHashtags;
  }

  // Get related hashtags
  async getRelatedHashtags(hashtag, limit = 10) {
    const related = await Post.aggregate([
      {
        $match: {
          hashtags: hashtag,
          visibility: 'public'
        }
      },
      {
        $unwind: '$hashtags'
      },
      {
        $match: {
          hashtags: { $ne: hashtag }
        }
      },
      {
        $group: {
          _id: '$hashtags',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      },
      {
        $limit: limit
      }
    ]);

    return related;
  }

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
      default:
        startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
    }

    return { $gte: startDate, $lte: now };
  }
}