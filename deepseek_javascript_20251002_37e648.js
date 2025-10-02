// models/Comment.js
import mongoose from 'mongoose';

const commentSchema = new mongoose.Schema({
  // Target content
  targetType: {
    type: String,
    enum: ['post', 'story', 'video'],
    required: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'targetType'
  },
  
  // Comment content
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    maxlength: 1000,
    trim: true
  },
  
  // Media in comments
  media: [{
    url: String,
    type: {
      type: String,
      enum: ['image', 'video', 'gif']
    },
    thumbnail: String
  }],
  
  // Reply system
  parentComment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment',
    default: null
  },
  replies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  depth: {
    type: Number,
    default: 0
  },
  
  // Mentions in comment
  mentions: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  
  // Reactions on comment
  reactions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    type: {
      type: String,
      enum: ['like', 'love', 'haha', 'wow', 'sad', 'angry']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Engagement metrics
  likeCount: {
    type: Number,
    default: 0
  },
  replyCount: {
    type: Number,
    default: 0
  },
  
  // Moderation
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: Date,
  isHidden: {
    type: Boolean,
    default: false
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for performance
commentSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
commentSchema.index({ parentComment: 1 });
commentSchema.index({ user: 1, createdAt: -1 });

// Update reply count when replies are added/removed
commentSchema.methods.updateReplyCount = async function() {
  this.replyCount = await mongoose.model('Comment').countDocuments({
    parentComment: this._id
  });
  await this.save();
};

// Virtual for thread (comment + all replies)
commentSchema.virtual('thread').get(function() {
  return {
    comment: this,
    replies: this.replies
  };
});

export default mongoose.model('Comment', commentSchema);