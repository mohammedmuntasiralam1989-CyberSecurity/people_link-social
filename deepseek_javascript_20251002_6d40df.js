// models/Story.js (Enhanced)
import mongoose from 'mongoose';

const storySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Media content
  media: [{
    url: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['image', 'video', 'text', 'poll', 'question'],
      required: true
    },
    duration: {
      type: Number, // seconds
      default: 5
    },
    order: {
      type: Number,
      default: 0
    },
    
    // Text story properties
    text: String,
    backgroundColor: String,
    textColor: String,
    font: String,
    
    // Interactive elements
    poll: {
      question: String,
      options: [{
        text: String,
        votes: [{
          user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
          },
          votedAt: {
            type: Date,
            default: Date.now
          }
        }]
      }]
    },
    
    question: {
      prompt: String,
      answers: [{
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        answer: String,
        answeredAt: {
          type: Date,
          default: Date.now
        }
      }]
    },
    
    // Music for reels
    music: {
      trackId: String,
      title: String,
      artist: String,
      startTime: Number,
      duration: Number
    },
    
    // Effects and filters
    filter: String,
    effects: [String],
    
    // Stickers and text overlays
    stickers: [{
      type: {
        type: String,
        enum: ['emoji', 'gif', 'location', 'mention', 'hashtag']
      },
      content: String,
      position: {
        x: Number,
        y: Number
      },
      rotation: Number,
      scale: Number
    }]
  }],
  
  // Engagement metrics
  views: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    viewedAt: {
      type: Date,
      default: Date.now
    },
    duration: Number // How long they watched
  }],
  
  replies: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    message: {
      type: String,
      maxlength: 200
    },
    repliedToMedia: Number, // Index of media item
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Privacy settings
  visibility: {
    type: String,
    enum: ['public', 'followers', 'close_friends', 'private'],
    default: 'public'
  },
  allowReplies: {
    type: Boolean,
    default: true
  },
  
  // Expiration
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 } // TTL index for auto-deletion
  },
  
  // Analytics
  viewCount: {
    type: Number,
    default: 0
  },
  replyCount: {
    type: Number,
    default: 0
  },
  
  // Highlights (saved stories)
  isHighlighted: {
    type: Boolean,
    default: false
  },
  highlight: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Highlight'
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes for better performance
storySchema.index({ user: 1, createdAt: -1 });
storySchema.index({ expiresAt: 1 });
storySchema.index({ visibility: 1, createdAt: -1 });

// Virtual for total views
storySchema.virtual('totalViews').get(function() {
  return this.views.length;
});

// Method to check if user can view story
storySchema.methods.canView = async function(userId) {
  if (this.visibility === 'public') return true;
  if (this.visibility === 'private' && this.user.toString() === userId) return true;
  
  const Relationship = mongoose.model('Relationship');
  const relationship = await Relationship.findOne({
    follower: userId,
    following: this.user
  });
  
  if (this.visibility === 'followers') {
    return relationship && relationship.status === 'accepted';
  }
  
  if (this.visibility === 'close_friends') {
    return relationship && relationship.isCloseFriend;
  }
  
  return false;
};

export default mongoose.model('Story', storySchema);