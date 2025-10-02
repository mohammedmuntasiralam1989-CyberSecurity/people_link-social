// models/Notification.js
const notificationSchema = new mongoose.Schema({
  user: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  type: {
    type: String,
    enum: [
      'like', 'comment', 'share', 'follow', 
      'mention', 'message', 'story_view',
      'post_approved', 'tagged'
    ],
    required: true
  },
  fromUser: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  // Related content
  post: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
  comment: { type: mongoose.Schema.Types.ObjectId, ref: 'Comment' },
  story: { type: mongoose.Schema.Types.ObjectId, ref: 'Story' },
  message: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  
  // Notification content
  message: { type: String, required: true },
  isRead: { type: Boolean, default: false },
  
  createdAt: { type: Date, default: Date.now }
});

// Utility function to create notifications
export const createNotification = async (notificationData) => {
  try {
    const notification = new Notification(notificationData);
    await notification.save();
    
    // Real-time notification via Socket.io
    const io = getIO(); // Get Socket.io instance
    io.to(`user_${notificationData.user}`).emit('new_notification', notification);
    
    return notification;
  } catch (error) {
    console.error('Error creating notification:', error);
  }
};