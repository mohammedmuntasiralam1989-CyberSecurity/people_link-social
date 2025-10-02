// routes/stories.js (Enhanced)
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import Story from '../models/Story.js';
import Highlight from '../models/Highlight.js';
import Notification from '../models/Notification.js';

const router = express.Router();

// Create story with multiple media
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { media, visibility, allowReplies, music, filter, stickers } = req.body;
    
    if (!media || media.length === 0) {
      return res.status(400).json({ message: 'At least one media item is required' });
    }

    // Set expiration (24 hours from now)
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    const story = new Story({
      user: req.user.id,
      media: media.map((item, index) => ({
        ...item,
        order: index
      })),
      visibility: visibility || 'public',
      allowReplies: allowReplies !== undefined ? allowReplies : true,
      expiresAt
    });

    await story.save();
    await story.populate('user', 'name username avatar isVerified');

    res.status(201).json(story);

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get stories feed (from followed users)
router.get('/feed', authMiddleware, async (req, res) => {
  try {
    // Get users that current user follows
    const Relationship = mongoose.model('Relationship');
    const following = await Relationship.find({ 
      follower: req.user.id,
      status: 'accepted'
    }).select('following');
    
    const followingIds = following.map(f => f.following);
    followingIds.push(req.user.id); // Include own stories

    const stories = await Story.find({
      user: { $in: followingIds },
      expiresAt: { $gt: new Date() }
    })
    .populate('user', 'name username avatar isVerified')
    .sort({ createdAt: -1 });

    // Group stories by user and check view status
    const storiesByUser = await Promise.all(
      Object.values(
        stories.reduce((acc, story) => {
          const userId = story.user._id.toString();
          if (!acc[userId]) {
            acc[userId] = {
              user: story.user,
              stories: []
            };
          }
          acc[userId].stories.push(story);
          return acc;
        }, {})
      ).map(async (userStories) => {
        // Check if current user has viewed any of these stories
        const hasUnviewed = userStories.stories.some(story => 
          !story.views.some(view => view.user.toString() === req.user.id)
        );
        
        return {
          ...userStories,
          hasUnviewed,
          totalStories: userStories.stories.length
        };
      })
    );

    res.json(storiesByUser);

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// View story
router.post('/:storyId/view', authMiddleware, async (req, res) => {
  try {
    const { duration, mediaIndex } = req.body;
    const story = await Story.findById(req.params.storyId);
    
    if (!story) {
      return res.status(404).json({ message: 'Story not found' });
    }

    // Check if user can view this story
    const canView = await story.canView(req.user.id);
    if (!canView) {
      return res.status(403).json({ message: 'Cannot view this story' });
    }

    // Check if already viewed
    const existingView = story.views.find(
      view => view.user.toString() === req.user.id
    );

    if (!existingView) {
      story.views.push({ 
        user: req.user.id,
        duration: duration || 0
      });
      story.viewCount = story.views.length;
      await story.save();

      // Create view notification (only if not own story)
      if (story.user.toString() !== req.user.id) {
        await Notification.create({
          user: story.user,
          type: 'story_view',
          fromUser: req.user.id,
          story: story._id,
          message: `${req.user.name} viewed your story`
        });
      }
    }

    res.json({ 
      viewed: true, 
      viewsCount: story.views.length,
      nextStory: await getNextStory(story, req.user.id)
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Reply to story
router.post('/:storyId/reply', authMiddleware, async (req, res) => {
  try {
    const { message, mediaIndex } = req.body;
    const story = await Story.findById(req.params.storyId);
    
    if (!story) {
      return res.status(404).json({ message: 'Story not found' });
    }

    if (!story.allowReplies) {
      return res.status(400).json({ message: 'Replies are not allowed for this story' });
    }

    const canView = await story.canView(req.user.id);
    if (!canView) {
      return res.status(403).json({ message: 'Cannot reply to this story' });
    }

    story.replies.push({
      user: req.user.id,
      message,
      repliedToMedia: mediaIndex || 0
    });

    story.replyCount = story.replies.length;
    await story.save();

    // Create reply notification
    if (story.user.toString() !== req.user.id) {
      await Notification.create({
        user: story.user,
        type: 'story_reply',
        fromUser: req.user.id,
        story: story._id,
        message: `${req.user.name} replied to your story`
      });
    }

    res.json({ 
      replied: true, 
      replyCount: story.replies.length 
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Vote on story poll
router.post('/:storyId/poll/:pollIndex/vote', authMiddleware, async (req, res) => {
  try {
    const { optionIndex } = req.body;
    const story = await Story.findById(req.params.storyId);
    
    if (!story) {
      return res.status(404).json({ message: 'Story not found' });
    }

    const mediaIndex = parseInt(req.params.pollIndex);
    const mediaItem = story.media[mediaIndex];
    
    if (!mediaItem || mediaItem.type !== 'poll') {
      return res.status(400).json({ message: 'Not a poll' });
    }

    // Remove existing vote
    mediaItem.poll.options.forEach(option => {
      option.votes = option.votes.filter(
        vote => vote.user.toString() !== req.user.id
      );
    });

    // Add new vote
    if (optionIndex >= 0 && optionIndex < mediaItem.poll.options.length) {
      mediaItem.poll.options[optionIndex].votes.push({
        user: req.user.id
      });
    }

    await story.save();

    res.json({ 
      voted: true,
      poll: mediaItem.poll 
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Answer story question
router.post('/:storyId/question/:questionIndex/answer', authMiddleware, async (req, res) => {
  try {
    const { answer } = req.body;
    const story = await Story.findById(req.params.storyId);
    
    if (!story) {
      return res.status(404).json({ message: 'Story not found' });
    }

    const mediaIndex = parseInt(req.params.questionIndex);
    const mediaItem = story.media[mediaIndex];
    
    if (!mediaItem || mediaItem.type !== 'question') {
      return res.status(400).json({ message: 'Not a question' });
    }

    // Remove existing answer
    mediaItem.question.answers = mediaItem.question.answers.filter(
      ans => ans.user.toString() !== req.user.id
    );

    // Add new answer
    mediaItem.question.answers.push({
      user: req.user.id,
      answer
    });

    await story.save();

    res.json({ 
      answered: true,
      question: {
        prompt: mediaItem.question.prompt,
        answers: mediaItem.question.answers
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Highlight management
router.post('/:storyId/highlight', authMiddleware, async (req, res) => {
  try {
    const { highlightId, title, cover } = req.body;
    const story = await Story.findById(req.params.storyId);
    
    if (!story) {
      return res.status(404).json({ message: 'Story not found' });
    }

    if (story.user.toString() !== req.user.id) {
      return res.status(403).json({ message: 'Cannot highlight this story' });
    }

    let highlight;

    if (highlightId) {
      // Add to existing highlight
      highlight = await Highlight.findById(highlightId);
      if (!highlight) {
        return res.status(404).json({ message: 'Highlight not found' });
      }
      
      if (!highlight.stories.includes(story._id)) {
        highlight.stories.push(story._id);
      }
    } else {
      // Create new highlight
      highlight = new Highlight({
        user: req.user.id,
        title: title || 'My Highlight',
        cover: cover || story.media[0].url,
        stories: [story._id]
      });
    }

    story.isHighlighted = true;
    story.highlight = highlight._id;

    await Promise.all([highlight.save(), story.save()]);

    res.json({ highlight, story });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Helper function to get next story
async function getNextStory(currentStory, userId) {
  const stories = await Story.find({
    user: currentStory.user,
    expiresAt: { $gt: new Date() },
    createdAt: { $gt: currentStory.createdAt }
  })
  .sort({ createdAt: 1 })
  .limit(1);

  return stories.length > 0 ? stories[0] : null;
}