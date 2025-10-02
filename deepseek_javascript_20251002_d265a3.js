// models/Share.js
import mongoose from 'mongoose';

const shareSchema = new mongoose.Schema({
  // Original content being shared
  originalContentType: {
    type: String,
    enum: ['post', 'story', 'reel', 'video'],
    required: true
  },
  originalContentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'originalContentType'
  },
  
  // User who is sharing
  sharedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Share content (optional caption)
  caption: {
    type: String,
    maxlength: 500
  },
  
  // Share type
  shareType: {
    type: String,
    enum: ['share', 'repost', 'forward'],
    default: 'share'
  },
  
  // Destination (for forwarding)
  destination: {
    type: String,
    enum: ['timeline', 'story', 'message', 'group'],
    default: 'timeline'
  },
  
  // Target user/group (for direct shares)
  targetUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  targetGroup: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group'
  },
  
  // Privacy settings for this share
  visibility: {
    type: String,
    enum: ['public', 'friends', 'private'],
    default: 'public'
  },
  
  // Engagement
  likes: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  comments: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Comment'
  }],
  
  // Analytics
  viewCount: {
    type: Number,
    default: 0
  },
  shareCount: {
    type: Number,
    default: 0
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Update original content's share count
shareSchema.post('save', async function() {
  await this.updateOriginalContentShareCount();
});

shareSchema.methods.updateOriginalContentShareCount = async function() {
  const shareCount = await mongoose.model('Share').countDocuments({
    originalContentType: this.originalContentType,
    originalContentId: this.originalContentId
  });

  const modelName = this.originalContentType.charAt(0).toUpperCase() + 
                   this.originalContentType.slice(1);
  const Model = mongoose.model(modelName);
  
  await Model.findByIdAndUpdate(this.originalContentId, {
    shareCount
  });
};

export default mongoose.model('Share', shareSchema);