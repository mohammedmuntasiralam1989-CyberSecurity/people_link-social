// routes/follows.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { Follow, User } from '../models/User.js';

const router = express.Router();

// Follow user
router.post('/:userId/follow', authMiddleware, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.user.id;

    if (targetUserId === currentUserId) {
      return res.status(400).json({ message: 'Cannot follow yourself' });
    }

    const targetUser = await User.findById(targetUserId);
    if (!targetUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if already following
    const existingFollow = await Follow.findOne({
      follower: currentUserId,
      following: targetUserId
    });

    if (existingFollow) {
      return res.status(400).json({ message: 'Already following this user' });
    }

    // Create follow relationship
    const follow = new Follow({
      follower: currentUserId,
      following: targetUserId
    });

    await follow.save();

    // Update counts
    await User.findByIdAndUpdate(currentUserId, { $inc: { followingCount: 1 } });
    await User.findByIdAndUpdate(targetUserId, { $inc: { followersCount: 1 } });

    // Create notification
    await createNotification({
      type: 'follow',
      fromUser: currentUserId,
      toUser: targetUserId,
      message: `${req.user.name} started following you`
    });

    res.json({ message: 'Successfully followed user', following: true });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Unfollow user
router.post('/:userId/unfollow', authMiddleware, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.user.id;

    const follow = await Follow.findOneAndDelete({
      follower: currentUserId,
      following: targetUserId
    });

    if (!follow) {
      return res.status(400).json({ message: 'Not following this user' });
    }

    // Update counts
    await User.findByIdAndUpdate(currentUserId, { $inc: { followingCount: -1 } });
    await User.findByIdAndUpdate(targetUserId, { $inc: { followersCount: -1 } });

    res.json({ message: 'Successfully unfollowed user', following: false });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user followers
router.get('/:userId/followers', authMiddleware, async (req, res) => {
  try {
    const userId = req.params.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const followers = await Follow.find({ following: userId })
      .populate('follower', 'name username avatar isVerified')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Follow.countDocuments({ following: userId });

    res.json({
      followers: followers.map(f => f.follower),
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user following
router.get('/:userId/following', authMiddleware, async (req, res) => {
  try {
    const userId = req.params.userId;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const following = await Follow.find({ follower: userId })
      .populate('following', 'name username avatar isVerified')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await Follow.countDocuments({ follower: userId });

    res.json({
      following: following.map(f => f.following),
      total,
      page,
      pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});