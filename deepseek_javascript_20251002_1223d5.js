// routes/shares.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import Share from '../models/Share.js';
import Post from '../models/Post.js';
import Notification from '../models/Notification.js';

const router = express.Router();

// Share content
router.post('/:contentType/:contentId', authMiddleware, async (req, res) => {
  try {
    const { contentType, contentId } = req.params;
    const { caption, shareType = 'share', destination = 'timeline', targetUser } = req.body;

    // Validate original content exists
    const originalContent = await validateContent(contentType, contentId);
    if (!originalContent) {
      return res.status(404).json({ message: 'Content not found' });
    }

    // Check if user can share this content
    if (!await canShareContent(originalContent, req.user.id)) {
      return res.status(403).json({ message: 'Cannot share this content' });
    }

    // Create share record
    const share = new Share({
      originalContentType: contentType,
      originalContentId: contentId,
      sharedBy: req.user.id,
      caption,
      shareType,
      destination,
      targetUser,
      visibility: req.body.visibility || 'public'
    });

    await share.save();
    await share.populate('sharedBy', 'name username avatar');
    await share.populate('originalContentId');

    // If sharing to timeline, create a new post
    if (destination === 'timeline') {
      await createSharePost(share, originalContent);
    }

    // If sharing to story, create a story
    if (destination === 'story') {
      await createShareStory(share, originalContent);
    }

    // Create notifications
    await createShareNotifications(share, originalContent);

    res.status(201).json({
      share,
      message: `Content shared to ${destination}`
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get shares for content
router.get('/:contentType/:contentId', authMiddleware, async (req, res) => {
  try {
    const { contentType, contentId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const shares = await Share.find({
      originalContentType: contentType,
      originalContentId: contentId
    })
    .populate('sharedBy', 'name username avatar isVerified')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

    const total = await Share.countDocuments({
      originalContentType: contentType,
      originalContentId: contentId
    });

    res.json({
      shares,
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

// Get user's shares
router.get('/user/:userId', authMiddleware, async (req, res) => {
  try {
    const { userId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const shares = await Share.find({ sharedBy: userId })
      .populate('originalContentId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Share.countDocuments({ sharedBy: userId });

    res.json({
      shares,
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

// Delete share
router.delete('/:shareId', authMiddleware, async (req, res) => {
  try {
    const share = await Share.findOneAndDelete({
      _id: req.params.shareId,
      sharedBy: req.user.id
    });

    if (!share) {
      return res.status(404).json({ message: 'Share not found' });
    }

    // Also delete the associated post/story if it exists
    if (share.destination === 'timeline') {
      await Post.findOneAndDelete({ 
        shareSource: share._id 
      });
    }

    res.json({ message: 'Share deleted successfully' });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Forward to message
router.post('/:contentType/:contentId/forward', authMiddleware, async (req, res) => {
  try {
    const { contentType, contentId } = req.params;
    const { targetUsers, targetGroups, message } = req.body;

    if ((!targetUsers || targetUsers.length === 0) && 
        (!targetGroups || targetGroups.length === 0)) {
      return res.status(400).json({ message: 'No targets specified' });
    }

    const originalContent = await validateContent(contentType, contentId);
    if (!originalContent) {
      return res.status(404).json({ message: 'Content not found' });
    }

    const shares = [];

    // Forward to individual users
    if (targetUsers && targetUsers.length > 0) {
      for (const targetUserId of targetUsers) {
        const share = new Share({
          originalContentType: contentType,
          originalContentId: contentId,
          sharedBy: req.user.id,
          caption: message,
          shareType: 'forward',
          destination: 'message',
          targetUser: targetUserId,
          visibility: 'private'
        });

        await share.save();
        shares.push(share);

        // Create message notification
        await Notification.create({
          user: targetUserId,
          type: 'share',
          fromUser: req.user.id,
          message: `${req.user.name} shared a ${contentType} with you`
        });
      }
    }

    // Forward to groups (implementation depends on group system)
    if (targetGroups && targetGroups.length > 0) {
      for (const groupId of targetGroups) {
        // Group sharing logic here
      }
    }

    res.json({
      shares,
      message: `Content forwarded to ${shares.length} targets`
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper functions
async function validateContent(contentType, contentId) {
  const models = {
    post: Post,
    story: mongoose.model('Story'),
    reel: mongoose.model('Reel'),
    video: mongoose.model('Video')
  };

  const Model = models[contentType];
  if (!Model) return null;

  return await Model.findById(contentId);
}

async function canShareContent(content, userId) {
  // Check content privacy settings
  if (content.visibility === 'private') {
    return false;
  }

  if (content.visibility === 'friends') {
    // Check if user is friends with content owner
    const isFriend = await Relationship.exists({
      $or: [
        { follower: userId, following: content.user, isFriend: true },
        { follower: content.user, following: userId, isFriend: true }
      ],
      status: 'accepted'
    });
    
    return isFriend;
  }

  return true;
}

async function createSharePost(share, originalContent) {
  const post = new Post({
    user: share.sharedBy,
    content: share.caption || `Shared ${share.originalContentType}`,
    shareSource: share._id,
    originalPost: share.originalContentId,
    isShare: true,
    visibility: share.visibility
  });

  await post.save();
  return post;
}

async function createShareStory(share, originalContent) {
  const Story = mongoose.model('Story');
  
  const story = new Story({
    user: share.sharedBy,
    media: originalContent.image || originalContent.video,
    mediaType: originalContent.image ? 'image' : 'video',
    caption: share.caption,
    shareSource: share._id,
    originalContent: share.originalContentId,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
  });

  await story.save();
  return story;
}

async function createShareNotifications(share, originalContent) {
  // Notify original content owner
  if (originalContent.user.toString() !== share.sharedBy.toString()) {
    await Notification.create({
      user: originalContent.user,
      type: 'share',
      fromUser: share.sharedBy,
      [share.originalContentType]: share.originalContentId,
      message: `${share.sharedBy.name} shared your ${share.originalContentType}`
    });
  }

  // Notify target user if it's a direct share
  if (share.targetUser && share.targetUser.toString() !== share.sharedBy.toString()) {
    await Notification.create({
      user: share.targetUser,
      type: 'share_receive',
      fromUser: share.sharedBy,
      share: share._id,
      message: `${share.sharedBy.name} shared a ${share.originalContentType} with you`
    });
  }
}