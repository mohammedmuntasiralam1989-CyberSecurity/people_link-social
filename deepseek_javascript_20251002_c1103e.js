// models/Hashtag.js
import mongoose from 'mongoose';

const hashtagSchema = new mongoose.Schema({
  tag: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true
  },
  
  // Usage statistics
  totalUses: {
    type: Number,
    default: 0
  },
  usage: {
    post: { type: Number, default: 0 },
    story: { type: Number, default: 0 },
    comment: { type: Number, default: 0 }
  },
  
  // Engagement metrics
  postEngagement: {
    type: Number,
    default: 0
  },
  storyViews: {
    type: Number,
    default: 0
  },
  
  // Follower count
  followerCount: {
    type: Number,
    default: 0
  },
  
  // Recent content using this hashtag
  recentContent: [{
    contentType: {
      type: String,
      enum: ['post', 'story', 'comment']
    },
    contentId: {
      type: mongoose.Schema.Types.ObjectId
    },
    usedAt: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Timestamps
  firstUsed: {
    type: Date,
    default: Date.now
  },
  lastUsed: {
    type: Date,
    default: Date.now
  },
  
  // Cached trending data
  trendingScore: {
    type: Number,
    default: 0
  },
  lastCalculated: Date
});

// Update trending score periodically
hashtagSchema.methods.calculateTrendingScore = function() {
  const now = new Date();
  const hoursSinceLastUse = (now - this.lastUsed) / (1000 * 60 * 60);
  
  // Score based on recent usage and engagement
  this.trendingScore = 
    (this.totalUses * 1) +
    (this.postEngagement * 2) +
    (this.storyViews * 0.5) -
    (hoursSinceLastUse * 0.1);
  
  this.lastCalculated = now;
  return this.trendingScore;
};

export default mongoose.model('Hashtag', hashtagSchema);