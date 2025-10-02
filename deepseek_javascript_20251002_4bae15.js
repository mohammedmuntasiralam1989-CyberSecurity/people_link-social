// routes/comments.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import Comment from '../models/Comment.js';
import Post from '../models/Post.js';
import Notification from '../models/Notification.js';

const router = express.Router();

// Add comment
router.post('/:targetType/:targetId', authMiddleware, async (req, res) => {
  try {
    const { targetType, targetId } = req.params;
    const { content, parentCommentId, media } = req.body;

    // Validate target exists
    const target = await validateTarget(targetType, targetId);
    if (!target) {
      return res.status(404).json({ message: 'Target not found' });
    }

    // Extract mentions from content
    const mentionRegex = /@(\w+)/g;
    const mentions = [];
    let match;
    
    while ((match = mentionRegex.exec(content)) !== null) {
      const username = match[1];
      const user = await User.findOne({ username });
      if (user) {
        mentions.push(user._id);
      }
    }

    // Calculate depth for nested replies
    let depth = 0;
    let parentComment = null;

    if (parentCommentId) {
      parentComment = await Comment.findById(parentCommentId);
      if (parentComment) {
        depth = parentComment.depth + 1;
        
        // Limit reply depth to prevent infinite nesting
        if (depth > 5) {
          return res.status(400).json({ message: 'Maximum reply depth reached' });
        }
      }
    }

    // Create comment
    const comment = new Comment({
      targetType,
      targetId,
      user: req.user.id,
      content,
      media,
      parentComment: parentCommentId,
      depth,
      mentions
    });

    await comment.save();
    await comment.populate('user', 'name username avatar isVerified');

    // Update parent comment's replies if this is a reply
    if (parentComment) {
      parentComment.replies.push(comment._id);
      await parentComment.updateReplyCount();
      await parentComment.save();
    }

    // Update target's comment count
    await updateTargetCommentCount(targetType, targetId);

    // Create notifications
    await createCommentNotifications(comment, target, parentComment, mentions);

    res.status(201).json(comment);

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get comments for content
router.get('/:targetType/:targetId', authMiddleware, async (req, res) => {
  try {
    const { targetType, targetId } = req.params;
    const { 
      page = 1, 
      limit = 20, 
      sort = 'newest',
      includeReplies = false 
    } = req.query;

    const skip = (page - 1) * limit;
    let sortOptions = {};

    switch (sort) {
      case 'newest':
        sortOptions = { createdAt: -1 };
        break;
      case 'oldest':
        sortOptions = { createdAt: 1 };
        break;
      case 'popular':
        sortOptions = { likeCount: -1, createdAt: -1 };
        break;
      default:
        sortOptions = { createdAt: -1 };
    }

    // Base query for top-level comments
    let query = { 
      targetType, 
      targetId,
      parentComment: null 
    };

    if (includeReplies) {
      // Get all comments including replies
      query = { targetType, targetId };
    }

    const comments = await Comment.find(query)
      .populate('user', 'name username avatar isVerified')
      .populate('mentions', 'name username')
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit));

    // If including replies, we need to structure them as threads
    let structuredComments = comments;
    if (includeReplies) {
      structuredComments = await structureCommentsAsThreads(comments);
    }

    const total = await Comment.countDocuments(query);

    res.json({
      comments: structuredComments,
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

// Get comment replies
router.get('/:commentId/replies', authMiddleware, async (req, res) => {
  try {
    const { commentId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const replies = await Comment.find({ parentComment: commentId })
      .populate('user', 'name username avatar isVerified')
      .populate('mentions', 'name username')
      .sort({ createdAt: 1 }) // Oldest first for replies
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Comment.countDocuments({ parentComment: commentId });

    res.json({
      replies,
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

// Update comment
router.put('/:commentId', authMiddleware, async (req, res) => {
  try {
    const { content, media } = req.body;

    const comment = await Comment.findOneAndUpdate(
      { 
        _id: req.params.commentId,
        user: req.user.id // Only owner can edit
      },
      { 
        content,
        media,
        isEdited: true,
        editedAt: new Date(),
        updatedAt: new Date()
      },
      { new: true }
    ).populate('user', 'name username avatar isVerified');

    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    res.json(comment);

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Delete comment
router.delete('/:commentId', authMiddleware, async (req, res) => {
  try {
    const comment = await Comment.findOne({
      _id: req.params.commentId,
      user: req.user.id
    });

    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    // If it's a parent comment, also delete all replies
    if (comment.parentComment === null) {
      await Comment.deleteMany({ parentComment: comment._id });
    } else {
      // If it's a reply, remove from parent's replies array
      const parentComment = await Comment.findById(comment.parentComment);
      if (parentComment) {
        parentComment.replies = parentComment.replies.filter(
          replyId => replyId.toString() !== comment._id.toString()
        );
        await parentComment.updateReplyCount();
        await parentComment.save();
      }
    }

    await Comment.findByIdAndDelete(comment._id);

    // Update target's comment count
    await updateTargetCommentCount(comment.targetType, comment.targetId);

    res.json({ message: 'Comment deleted successfully' });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Like/Unlike comment
router.post('/:commentId/like', authMiddleware, async (req, res) => {
  try {
    const comment = await Comment.findById(req.params.commentId);
    
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    const existingLikeIndex = comment.reactions.findIndex(
      reaction => reaction.user.toString() === req.user.id
    );

    if (existingLikeIndex > -1) {
      // Unlike
      comment.reactions.splice(existingLikeIndex, 1);
    } else {
      // Like
      comment.reactions.push({
        user: req.user.id,
        type: 'like'
      });
    }

    comment.likeCount = comment.reactions.length;
    await comment.save();

    // Create notification for comment owner
    if (comment.user.toString() !== req.user.id && existingLikeIndex === -1) {
      await Notification.create({
        user: comment.user,
        type: 'comment_like',
        fromUser: req.user.id,
        comment: comment._id,
        message: `${req.user.name} liked your comment`
      });
    }

    res.json({ 
      liked: existingLikeIndex === -1,
      likeCount: comment.likeCount 
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper functions
async function validateTarget(targetType, targetId) {
  const models = {
    post: Post,
    story: mongoose.model('Story'),
    video: mongoose.model('Video')
  };

  const Model = models[targetType];
  if (!Model) return null;

  return await Model.findById(targetId);
}

async function updateTargetCommentCount(targetType, targetId) {
  const models = {
    post: Post,
    story: mongoose.model('Story'),
    video: mongoose.model('Video')
  };

  const Model = models[targetType];
  if (!Model) return;

  const commentCount = await Comment.countDocuments({ targetType, targetId });
  await Model.findByIdAndUpdate(targetId, { commentCount });
}

async function createCommentNotifications(comment, target, parentComment, mentions) {
  const notifications = [];

  // Notification to target owner (if not own content)
  if (target.user.toString() !== comment.user.toString()) {
    notifications.push({
      user: target.user,
      type: 'comment',
      fromUser: comment.user,
      [comment.targetType]: comment.targetId,
      comment: comment._id,
      message: `${comment.user.name} commented on your ${comment.targetType}`
    });
  }

  // Notification to parent comment owner (if replying)
  if (parentComment && parentComment.user.toString() !== comment.user.toString()) {
    notifications.push({
      user: parentComment.user,
      type: 'comment_reply',
      fromUser: comment.user,
      comment: comment._id,
      parentComment: parentComment._id,
      message: `${comment.user.name} replied to your comment`
    });
  }

  // Notifications to mentioned users
  for (const mentionedUserId of mentions) {
    if (mentionedUserId.toString() !== comment.user.toString()) {
      notifications.push({
        user: mentionedUserId,
        type: 'mention',
        fromUser: comment.user,
        comment: comment._id,
        message: `${comment.user.name} mentioned you in a comment`
      });
    }
  }

  // Create all notifications
  await Notification.insertMany(notifications);
}

async function structureCommentsAsThreads(comments) {
  // Group comments by parent
  const commentMap = new Map();
  const topLevelComments = [];

  comments.forEach(comment => {
    commentMap.set(comment._id.toString(), {
      ...comment.toObject(),
      replies: []
    });
  });

  comments.forEach(comment => {
    const commentObj = commentMap.get(comment._id.toString());
    
    if (comment.parentComment) {
      const parent = commentMap.get(comment.parentComment.toString());
      if (parent) {
        parent.replies.push(commentObj);
      }
    } else {
      topLevelComments.push(commentObj);
    }
  });

  return topLevelComments;
}