// routes/settings.js
import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import User from '../models/User.js';

const router = express.Router();

// Get user settings
router.get('/', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id)
      .select('emailNotifications pushNotifications isPrivate');
    
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update privacy settings
router.patch('/privacy', authMiddleware, async (req, res) => {
  try {
    const { isPrivate, profileVisibility, messagePermissions } = req.body;

    const updateData = {};
    if (typeof isPrivate !== 'undefined') updateData.isPrivate = isPrivate;
    if (profileVisibility) updateData.profileVisibility = profileVisibility;
    if (messagePermissions) updateData.messagePermissions = messagePermissions;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      updateData,
      { new: true }
    ).select('isPrivate profileVisibility messagePermissions');

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Update notification settings
router.patch('/notifications', authMiddleware, async (req, res) => {
  try {
    const { emailNotifications, pushNotifications } = req.body;

    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        emailNotifications: emailNotifications !== undefined ? emailNotifications : req.user.emailNotifications,
        pushNotifications: pushNotifications !== undefined ? pushNotifications : req.user.pushNotifications
      },
      { new: true }
    ).select('emailNotifications pushNotifications');

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Change password
router.patch('/password', authMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user.id);
    
    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }

    // Update password
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Deactivate account
router.post('/deactivate', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;

    const user = await User.findById(req.user.id);
    
    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Password is incorrect' });
    }

    // Soft delete - mark as deactivated
    user.isDeactivated = true;
    user.deactivatedAt = new Date();
    await user.save();

    res.json({ message: 'Account deactivated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});