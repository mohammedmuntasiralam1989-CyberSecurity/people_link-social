// routes/reactions.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import Reaction from '../models/Reaction.js';
import Post from '../models/Post.js';
import Comment from '../models/Comment.js';
import Notification from '../models/Notification.js';

const router = express.Router();

// Available reactions with emojis
const REACTION_TYPES = {
  like: { emoji: '👍', label: 'Like' },
  love: { emoji: '❤️', label: 'Love' },
  haha: { emoji: '😂', label: 'Haha' },
  wow: { emoji: '😮', label: 'Wow' },
  sad: { emoji: '😢', label: 'Sad' },
  angry: { emoji: '😠', label: 'Angry' },
  care: { emoji: '🤗', label: 'Care' }
};

// Add reaction to content
router.post('/:targetType/:targetId', authMiddleware, async (req, res) => {
  try {
    const { targetType, targetId } = req.params;
    const { reactionType = 'like', customReaction } = req.body;

    // Validate target exists
    const target = await validateTarget(targetType, targetId);
    if (!target) {
      return res.status(404).json({ message: 'Target not found' });
    }

    // Check if reaction already exists
    let reaction = await Reaction.findOne({
      targetType,
      targetId,
      user: req.user.id
    });

    if (reaction) {
      // Update existing reaction
      reaction.reactionType = reactionType;
      reaction.emoji = REACTION_TYPES[reactionType]?.emoji || '👍';
      reaction.customReaction = customReaction;
      reaction.createdAt = new Date();
    } else {
      // Create new reaction
      reaction = new Reaction({
        targetType,
        targetId,
        user: req.user.id,
        reactionType,
        emoji: REACTION_TYPES[reactionType]?.emoji || '👍',
        customReaction
      });
    }

    await reaction.save();
    await reaction.populate('user', 'name username avatar');

    // Create notification for content owner (if not own content)
    if (target.user.toString() !== req.user.id) {
      await Notification.create({
        user: target.user,
        type: 'reaction',
        fromUser: req.user.id,
        [targetType]: targetId,
        message: `${req.user.name} reacted to your ${targetType}`
      });
    }

    // Get updated reaction counts
    const reactions = await Reaction.find({ targetType, targetId });
    const reactionCounts = reactions.reduce((acc, r) => {
      acc[r.reactionType] = (acc[r.reactionType] || 0) + 1;
      return acc;
    }, {});

    res.json({
      reaction: {
        id: reaction._id,
        type: reaction.reactionType,
        emoji: reaction.emoji,
        user: reaction.user
      },
      counts: {
        total: reactions.length,
        byType: reactionCounts
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Remove reaction
router.delete('/:targetType/:targetId', authMiddleware, async (req, res) => {
  try {
    const { targetType, targetId } = req.params;

    const reaction = await Reaction.findOneAndDelete({
      targetType,
      targetId,
      user: req.user.id
    });

    if (!reaction) {
      return res.status(404).json({ message: 'Reaction not found' });
    }

    // Get updated reaction counts
    const reactions = await Reaction.find({ targetType, targetId });
    const reactionCounts = reactions.reduce((acc, r) => {
      acc[r.reactionType] = (acc[r.reactionType] || 0) + 1;
      return acc;
    }, {});

    res.json({
      message: 'Reaction removed',
      counts: {
        total: reactions.length,
        byType: reactionCounts
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get reactions for content
router.get('/:targetType/:targetId', authMiddleware, async (req, res) => {
  try {
    const { targetType, targetId } = req.params;
    const { page = 1, limit = 20, reactionType } = req.query;

    const skip = (page - 1) * limit;

    let query = { targetType, targetId };
    if (reactionType) {
      query.reactionType = reactionType;
    }

    const reactions = await Reaction.find(query)
      .populate('user', 'name username avatar isVerified')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Reaction.countDocuments(query);

    // Group by reaction type for summary
    const allReactions = await Reaction.find({ targetType, targetId });
    const reactionSummary = allReactions.reduce((acc, reaction) => {
      acc[reaction.reactionType] = (acc[reaction.reactionType] || 0) + 1;
      return acc;
    }, {});

    // Current user's reaction
    const userReaction = await Reaction.findOne({
      targetType,
      targetId,
      user: req.user.id
    });

    res.json({
      reactions,
      summary: reactionSummary,
      totalReactions: allReactions.length,
      userReaction,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get top reactors (users with most reactions)
router.get('/:targetType/:targetId/top-reactors', authMiddleware, async (req, res) => {
  try {
    const { targetType, targetId } = req.params;

    const topReactors = await Reaction.aggregate([
      {
        $match: { targetType, targetId }
      },
      {
        $group: {
          _id: '$user',
          reactionCount: { $sum: 1 },
          lastReaction: { $max: '$createdAt' }
        }
      },
      {
        $sort: { reactionCount: -1, lastReaction: -1 }
      },
      {
        $limit: 10
      },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user'
        }
      },
      {
        $unwind: '$user'
      },
      {
        $project: {
          'user.name': 1,
          'user.username': 1,
          'user.avatar': 1,
          reactionCount: 1
        }
      }
    ]);

    res.json(topReactors);

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to validate target
async function validateTarget(targetType, targetId) {
  const models = {
    post: Post,
    comment: Comment,
    story: mongoose.model('Story'),
    message: mongoose.model('Message')
  };

  const Model = models[targetType];
  if (!Model) return null;

  return await Model.findById(targetId);
}