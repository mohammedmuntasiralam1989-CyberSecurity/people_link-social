// routes/posts.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import Post from '../models/Post.js';
import cache from '../redis/cache.js';

const router = express.Router();

// Get all posts (with pagination and caching)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    // Try to get from cache first
    const cacheKey = `posts_page_${page}_limit_${limit}`;
    const cachedPosts = await cache.getCached(cacheKey);
    
    if (cachedPosts) {
      return res.json(JSON.parse(cachedPosts));
    }

    const posts = await Post.find()
      .populate('user', 'name avatar isVerified')
      .populate('comments')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Post.countDocuments();

    // Cache the result
    await cache.setCached(cacheKey, JSON.stringify({
      posts,
      total,
      page,
      pages: Math.ceil(total / limit)
    }), 300); // 5 minutes

    res.json({
      posts,
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Create new post
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { content, imageUrl } = req.body;

    const post = new Post({
      user: req.user.id,
      content,
      imageUrl
    });

    await post.save();
    
    // Populate user data
    await post.populate('user', 'name avatar isVerified');

    // Invalidate cache
    await cache.invalidatePattern('posts_page_*');

    res.status(201).json(post);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Like/Unlike post
router.post('/:id/like', authMiddleware, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const likeIndex = post.likes.findIndex(
      like => like.user.toString() === req.user.id
    );

    if (likeIndex > -1) {
      // Unlike
      post.likes.splice(likeIndex, 1);
      await post.save();
      res.json({ liked: false, likesCount: post.likes.length });
    } else {
      // Like
      post.likes.push({ user: req.user.id });
      await post.save();
      res.json({ liked: true, likesCount: post.likes.length });
    }
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Add comment
router.post('/:id/comments', authMiddleware, async (req, res) => {
  try {
    const { content } = req.body;
    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const comment = {
      user: req.user.id,
      content,
      createdAt: new Date()
    };

    post.comments.push(comment);
    await post.save();

    // Populate user data in the new comment
    await post.populate('comments.user', 'name avatar');

    const newComment = post.comments[post.comments.length - 1];
    res.status(201).json(newComment);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});