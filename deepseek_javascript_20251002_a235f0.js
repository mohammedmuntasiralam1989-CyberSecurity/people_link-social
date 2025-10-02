// routes/stories.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import Story from '../models/Story.js';

const router = express.Router();

// Create story
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { media, mediaType, caption, visibility } = req.body;
    
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    const story = new Story({
      user: req.user.id,
      media,
      mediaType,
      caption,
      visibility: visibility || 'public',
      expiresAt
    });

    await story.save();
    await story.populate('user', 'name username avatar isVerified');

    res.status(201).json(story);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get stories for feed
router.get('/feed', authMiddleware, async (req, res) => {
  try {
    // Get users that current user follows
    const following = await Follow.find({ follower: req.user.id })
      .select('following');
    
    const followingIds = following.map(f => f.following);
    followingIds.push(req.user.id); // Include own stories

    const stories = await Story.find({
      user: { $in: followingIds },
      expiresAt: { $gt: new Date() }
    })
    .populate('user', 'name username avatar isVerified')
    .sort({ createdAt: -1 });

    // Group stories by user
    const storiesByUser = {};
    stories.forEach(story => {
      const userId = story.user._id.toString();
      if (!storiesByUser[userId]) {
        storiesByUser[userId] = {
          user: story.user,
          stories: []
        };
      }
      storiesByUser[userId].stories.push(story);
    });

    res.json(Object.values(storiesByUser));
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// View story
router.post('/:id/view', authMiddleware, async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    
    if (!story) {
      return res.status(404).json({ message: 'Story not found' });
    }

    // Check if already viewed
    const alreadyViewed = story.views.find(
      view => view.user.toString() === req.user.id
    );

    if (!alreadyViewed) {
      story.views.push({ user: req.user.id });
      await story.save();

      // Create view notification (only if not own story)
      if (story.user.toString() !== req.user.id) {
        await createNotification({
          type: 'story_view',
          fromUser: req.user.id,
          toUser: story.user,
          story: story._id,
          message: `${req.user.name} viewed your story`
        });
      }
    }

    res.json({ viewed: true, viewsCount: story.views.length });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});