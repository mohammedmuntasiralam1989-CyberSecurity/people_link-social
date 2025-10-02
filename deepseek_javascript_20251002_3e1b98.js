// routes/relationships.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import Relationship from '../models/Relationship.js';
import User from '../models/User.js';
import Notification from '../models/Notification.js';

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

    // Check if relationship already exists
    let relationship = await Relationship.findOne({
      follower: currentUserId,
      following: targetUserId
    });

    if (relationship) {
      if (relationship.status === 'blocked') {
        return res.status(400).json({ message: 'Cannot follow this user' });
      }
      
      if (relationship.status === 'accepted') {
        return res.status(400).json({ message: 'Already following this user' });
      }
    } else {
      // Create new relationship
      relationship = new Relationship({
        follower: currentUserId,
        following: targetUserId,
        status: targetUser.isPrivate ? 'pending' : 'accepted'
      });

      await relationship.save();
    }

    // Create notification for target user
    if (relationship.status === 'pending') {
      await Notification.create({
        user: targetUserId,
        type: 'follow_request',
        fromUser: currentUserId,
        message: `${req.user.name} wants to follow you`
      });
    } else {
      await Notification.create({
        user: targetUserId,
        type: 'follow',
        fromUser: currentUserId,
        message: `${req.user.name} started following you`
      });
    }

    res.json({
      status: relationship.status,
      message: relationship.status === 'pending' 
        ? 'Follow request sent' 
        : 'Successfully followed user'
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Accept follow request
router.post('/:userId/accept', authMiddleware, async (req, res) => {
  try {
    const followerId = req.params.userId;
    
    const relationship = await Relationship.findOneAndUpdate(
      {
        follower: followerId,
        following: req.user.id,
        status: 'pending'
      },
      { 
        status: 'accepted',
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!relationship) {
      return res.status(404).json({ message: 'Follow request not found' });
    }

    // Create acceptance notification
    await Notification.create({
      user: followerId,
      type: 'follow_accept',
      fromUser: req.user.id,
      message: `${req.user.name} accepted your follow request`
    });

    res.json({ message: 'Follow request accepted', relationship });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Unfollow user
router.post('/:userId/unfollow', authMiddleware, async (req, res) => {
  try {
    const relationship = await Relationship.findOneAndDelete({
      follower: req.user.id,
      following: req.params.userId
    });

    if (!relationship) {
      return res.status(400).json({ message: 'Not following this user' });
    }

    res.json({ message: 'Successfully unfollowed user' });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Send friend request
router.post('/:userId/friend-request', authMiddleware, async (req, res) => {
  try {
    const targetUserId = req.params.userId;
    const currentUserId = req.user.id;

    if (targetUserId === currentUserId) {
      return res.status(400).json({ message: 'Cannot send friend request to yourself' });
    }

    // Create bidirectional relationships
    const relationships = await Promise.all([
      Relationship.findOneAndUpdate(
        { follower: currentUserId, following: targetUserId },
        { 
          status: 'pending',
          isFriend: false
        },
        { upsert: true, new: true }
      ),
      Relationship.findOneAndUpdate(
        { follower: targetUserId, following: currentUserId },
        { 
          status: 'pending',
          isFriend: false
        },
        { upsert: true, new: true }
      )
    ]);

    // Create notification
    await Notification.create({
      user: targetUserId,
      type: 'friend_request',
      fromUser: currentUserId,
      message: `${req.user.name} sent you a friend request`
    });

    res.json({ message: 'Friend request sent' });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Accept friend request
router.post('/:userId/accept-friend', authMiddleware, async (req, res) => {
  try {
    const friendId = req.params.userId;
    const currentUserId = req.user.id;

    // Update both relationships
    const relationships = await Promise.all([
      Relationship.findOneAndUpdate(
        { follower: friendId, following: currentUserId },
        { 
          status: 'accepted',
          isFriend: true,
          friendshipDate: new Date()
        },
        { new: true }
      ),
      Relationship.findOneAndUpdate(
        { follower: currentUserId, following: friendId },
        { 
          status: 'accepted',
          isFriend: true,
          friendshipDate: new Date()
        },
        { new: true }
      )
    ]);

    // Create notification
    await Notification.create({
      user: friendId,
      type: 'friend_accept',
      fromUser: currentUserId,
      message: `${req.user.name} accepted your friend request`
    });

    res.json({ message: 'Friend request accepted', isFriend: true });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user relationships
router.get('/:userId/relationships', authMiddleware, async (req, res) => {
  try {
    const userId = req.params.userId;
    const currentUserId = req.user.id;

    const [followers, following, friends, pendingRequests] = await Promise.all([
      // Followers
      Relationship.find({ 
        following: userId,
        status: 'accepted'
      }).populate('follower', 'name username avatar isVerified'),
      
      // Following
      Relationship.find({ 
        follower: userId,
        status: 'accepted'
      }).populate('following', 'name username avatar isVerified'),
      
      // Friends (mutual follows)
      Relationship.find({
        $or: [
          { follower: userId, isFriend: true },
          { following: userId, isFriend: true }
        ],
        status: 'accepted'
      }).populate('follower following', 'name username avatar isVerified'),
      
      // Pending follow requests (for current user)
      Relationship.find({
        following: currentUserId,
        status: 'pending'
      }).populate('follower', 'name username avatar isVerified')
    ]);

    // Current user's relationship with target user
    const currentRelationship = await Relationship.findOne({
      follower: currentUserId,
      following: userId
    });

    res.json({
      followers: followers.map(r => r.follower),
      following: following.map(r => r.following),
      friends: friends.map(r => 
        r.follower._id.toString() === userId ? r.following : r.follower
      ),
      pendingRequests: pendingRequests.map(r => r.follower),
      currentRelationship: {
        isFollowing: currentRelationship?.status === 'accepted',
        isFriend: currentRelationship?.isFriend,
        status: currentRelationship?.status,
        isCloseFriend: currentRelationship?.isCloseFriend
      }
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Toggle close friends
router.post('/:userId/close-friend', authMiddleware, async (req, res) => {
  try {
    const relationship = await Relationship.findOneAndUpdate(
      {
        follower: req.user.id,
        following: req.params.userId,
        status: 'accepted'
      },
      { 
        isCloseFriend: req.body.isCloseFriend,
        updatedAt: new Date()
      },
      { new: true }
    );

    if (!relationship) {
      return res.status(404).json({ message: 'Relationship not found' });
    }

    res.json({ 
      isCloseFriend: relationship.isCloseFriend,
      message: relationship.isCloseFriend 
        ? 'Added to close friends' 
        : 'Removed from close friends'
    });

  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});