// routes/search.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { User, Post, Story } from '../models/User.js';

const router = express.Router();

// Global search
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { q, type, page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({ message: 'Search query too short' });
    }

    const searchQuery = q.trim();
    let results = {};

    // Search users
    if (!type || type === 'users') {
      const users = await User.find({
        $or: [
          { name: { $regex: searchQuery, $options: 'i' } },
          { username: { $regex: searchQuery, $options: 'i' } },
          { bio: { $regex: searchQuery, $options: 'i' } }
        ]
      })
      .select('name username avatar bio isVerified followersCount')
      .sort({ followersCount: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit);

      const totalUsers = await User.countDocuments({
        $or: [
          { name: { $regex: searchQuery, $options: 'i' } },
          { username: { $regex: searchQuery, $options: 'i' } },
          { bio: { $regex: searchQuery, $options: 'i' } }
        ]
      });

      results.users = {
        data: users,
        total: totalUsers,
        page,
        pages: Math.ceil(totalUsers / limit)
      };
    }

    // Search posts
    if (!type || type === 'posts') {
      const posts = await Post.find({
        $or: [
          { content: { $regex: searchQuery, $options: 'i' } },
          { hashtags: { $in: [new RegExp(searchQuery, 'i')] } }
        ],
        visibility: 'public'
      })
      .populate('user', 'name username avatar isVerified')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

      const totalPosts = await Post.countDocuments({
        $or: [
          { content: { $regex: searchQuery, $options: 'i' } },
          { hashtags: { $in: [new RegExp(searchQuery, 'i')] } }
        ],
        visibility: 'public'
      });

      results.posts = {
        data: posts,
        total: totalPosts,
        page,
        pages: Math.ceil(totalPosts / limit)
      };
    }

    // Search hashtags
    if (!type || type === 'hashtags') {
      const hashtagPosts = await Post.aggregate([
        { $match: { 
          hashtags: { $in: [new RegExp(searchQuery, 'i')] },
          visibility: 'public'
        }},
        { $unwind: '$hashtags' },
        { $match: { hashtags: { $regex: searchQuery, $options: 'i' } } },
        { $group: {
          _id: '$hashtags',
          count: { $sum: 1 },
          recentPost: { $first: '$$ROOT' }
        }},
        { $sort: { count: -1 } },
        { $skip: skip },
        { $limit: limit }
      ]);

      results.hashtags = hashtagPosts;
    }

    res.json(results);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Search suggestions
router.get('/suggestions', authMiddleware, async (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.trim().length < 1) {
      return res.json({ users: [], hashtags: [] });
    }

    const searchQuery = q.trim();

    // User suggestions
    const userSuggestions = await User.find({
      $or: [
        { name: { $regex: searchQuery, $options: 'i' } },
        { username: { $regex: searchQuery, $options: 'i' } }
      ]
    })
    .select('name username avatar isVerified')
    .limit(5);

    // Hashtag suggestions
    const hashtagSuggestions = await Post.aggregate([
      { $match: { 
        hashtags: { $in: [new RegExp(searchQuery, 'i')] }
      }},
      { $unwind: '$hashtags' },
      { $match: { hashtags: { $regex: searchQuery, $options: 'i' } } },
      { $group: {
        _id: '$hashtags',
        count: { $sum: 1 }
      }},
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);

    res.json({
      users: userSuggestions,
      hashtags: hashtagSuggestions
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});