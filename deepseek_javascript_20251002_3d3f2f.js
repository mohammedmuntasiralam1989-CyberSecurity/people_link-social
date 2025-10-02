// services/recommendationEngine.js
import tf from '@tensorflow/tfjs';
import natural from 'natural';
import { User, Post, Like, Follow } from '../models/User.js';

export class RecommendationEngine {
  constructor() {
    this.tf = tf;
    this.tokenizer = new natural.WordTokenizer();
    this.tfidf = new natural.TfIdf();
    this.userProfiles = new Map();
  }

  async initialize() {
    await this.loadUserProfiles();
    await this.trainContentModel();
  }

  // Content-based filtering
  async getContentBasedRecommendations(userId, limit = 10) {
    const user = await User.findById(userId);
    const userInterests = await this.extractUserInterests(userId);
    
    const allPosts = await Post.find({
      user: { $ne: userId }, // Exclude user's own posts
      visibility: 'public'
    })
    .populate('user', 'name username avatar')
    .limit(1000); // Limit for performance

    const scoredPosts = await Promise.all(
      allPosts.map(async post => ({
        post,
        score: await this.calculateContentScore(post, userInterests)
      }))
    );

    return scoredPosts
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(item => item.post);
  }

  // Collaborative filtering
  async getCollaborativeRecommendations(userId, limit = 10) {
    const similarUsers = await this.findSimilarUsers(userId, 5);
    const similarUserIds = similarUsers.map(user => user.userId);

    // Get posts liked by similar users that current user hasn't seen
    const recommendations = await Post.aggregate([
      {
        $match: {
          user: { $in: similarUserIds },
          _id: { 
            $nin: await this.getUserSeenPosts(userId) 
          }
        }
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
        $addFields: {
          engagementScore: {
            $add: [
              { $size: '$likes' },
              { $multiply: [{ $size: '$comments' }, 2] }
            ]
          },
          recencyScore: {
            $divide: [
              1,
              { $add: [1, { $dateDiff: { startDate: '$createdAt', endDate: new Date(), unit: 'hour' } }] }
            ]
          }
        }
      },
      {
        $project: {
          _id: 1,
          content: 1,
          image: 1,
          'user.name': 1,
          'user.username': 1,
          'user.avatar': 1,
          score: {
            $add: [
              '$engagementScore',
              { $multiply: ['$recencyScore', 10] }
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

    return recommendations;
  }

  // Trending content
  async getTrendingPosts(limit = 10) {
    const trendingPosts = await Post.aggregate([
      {
        $match: {
          createdAt: { 
            $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) // Last 24 hours
          },
          visibility: 'public'
        }
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
        $addFields: {
          engagementRate: {
            $divide: [
              { $add: [
                { $size: '$likes' },
                { $multiply: [{ $size: '$comments' }, 2] },
                { $size: '$shares' }
              ]},
              { $add: [1, { $size: '$views' }] }
            ]
          },
          timeDecay: {
            $exp: {
              $divide: [
                { $subtract: [new Date(), '$createdAt'] },
                -1000 * 60 * 60 * 6 // 6-hour half-life
              ]
            }
          }
        }
      },
      {
        $project: {
          _id: 1,
          content: 1,
          image: 1,
          'user.name': 1,
          'user.username': 1,
          'user.avatar': 1,
          score: {
            $multiply: ['$engagementRate', '$timeDecay']
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

    return trendingPosts;
  }

  // User similarity calculation
  async findSimilarUsers(userId, limit = 5) {
    const targetUserProfile = await this.getUserProfile(userId);
    const allUsers = await User.find({
      _id: { $ne: userId }
    }).limit(100); // Limit for performance

    const similarities = await Promise.all(
      allUsers.map(async user => ({
        userId: user._id,
        similarity: await this.calculateUserSimilarity(targetUserProfile, user)
      }))
    );

    return similarities
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  async calculateUserSimilarity(userA, userB) {
    // Implement similarity calculation based on:
    // - Followed users overlap
    // - Liked posts similarity
    // - Content preferences
    // - Engagement patterns

    const commonFollows = await this.getCommonFollows(userA._id, userB._id);
    const commonLikes = await this.getCommonLikes(userA._id, userB._id);
    const contentSimilarity = await this.calculateContentSimilarity(userA._id, userB._id);

    const similarityScore = 
      (commonFollows * 0.4) + 
      (commonLikes * 0.4) + 
      (contentSimilarity * 0.2);

    return similarityScore;
  }

  async extractUserInterests(userId) {
    const userPosts = await Post.find({ user: userId });
    const likedPosts = await Like.find({ user: userId })
      .populate('post');
    
    const allContent = [
      ...userPosts.map(post => post.content),
      ...likedPosts.map(like => like.post.content)
    ].join(' ');

    // Simple keyword extraction
    const tokens = this.tokenizer.tokenize(allContent.toLowerCase());
    const wordFrequencies = {};
    
    tokens.forEach(token => {
      if (token.length > 2) { // Ignore short words
        wordFrequencies[token] = (wordFrequencies[token] || 0) + 1;
      }
    });

    return Object.entries(wordFrequencies)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20) // Top 20 interests
      .map(([word]) => word);
  }

  async calculateContentScore(post, userInterests) {
    const postContent = post.content.toLowerCase();
    let score = 0;

    userInterests.forEach(interest => {
      if (postContent.includes(interest)) {
        score += 1;
      }
    });

    // Boost score for posts from followed users
    const isFollowing = await Follow.exists({
      follower: post.user._id,
      following: post.user._id
    });

    if (isFollowing) {
      score += 2;
    }

    return score;
  }

  async getUserProfile(userId) {
    if (this.userProfiles.has(userId)) {
      return this.userProfiles.get(userId);
    }

    const profile = {
      userId,
      interests: await this.extractUserInterests(userId),
      following: await this.getFollowingCount(userId),
      engagement: await this.getUserEngagementStats(userId)
    };

    this.userProfiles.set(userId, profile);
    return profile;
  }

  async loadUserProfiles() {
    // Pre-load profiles for active users
    const activeUsers = await User.find({
      lastActive: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
    }).limit(1000);

    for (const user of activeUsers) {
      await this.getUserProfile(user._id);
    }
  }

  async trainContentModel() {
    // Train ML model for content recommendations
    // This is a simplified version
    console.log('Training content recommendation model...');
  }

  // Helper methods
  async getCommonFollows(userA, userB) {
    const followsA = await Follow.find({ follower: userA }).select('following');
    const followsB = await Follow.find({ follower: userB }).select('following');
    
    const setA = new Set(followsA.map(f => f.following.toString()));
    const setB = new Set(followsB.map(f => f.following.toString()));
    
    return [...setA].filter(x => setB.has(x)).length;
  }

  async getCommonLikes(userA, userB) {
    const likesA = await Like.find({ user: userA }).select('post');
    const likesB = await Like.find({ user: userB }).select('post');
    
    const setA = new Set(likesA.map(l => l.post.toString()));
    const setB = new Set(likesB.map(l => l.post.toString()));
    
    return [...setA].filter(x => setB.has(x)).length;
  }

  async getFollowingCount(userId) {
    return Follow.countDocuments({ follower: userId });
  }

  async getUserEngagementStats(userId) {
    const [posts, likes, comments] = await Promise.all([
      Post.countDocuments({ user: userId }),
      Like.countDocuments({ user: userId }),
      Comment.countDocuments({ user: userId })
    ]);

    return { posts, likes, comments };
  }

  async getUserSeenPosts(userId) {
    // Get posts user has already seen (liked, commented, or viewed)
    const [likedPosts, commentedPosts] = await Promise.all([
      Like.find({ user: userId }).select('post'),
      Comment.find({ user: userId }).select('post')
    ]);

    return [
      ...likedPosts.map(l => l.post),
      ...commentedPosts.map(c => c.post)
    ];
  }
}