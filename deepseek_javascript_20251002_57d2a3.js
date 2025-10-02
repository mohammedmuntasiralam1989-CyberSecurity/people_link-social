// models/Story.js
const storySchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  media: { type: String, required: true }, // Image or video URL
  mediaType: { type: String, enum: ['image', 'video'], required: true },
  caption: { type: String, maxlength: 150 },
  
  // Views and engagement
  views: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    viewedAt: { type: Date, default: Date.now }
  }],
  
  // Replies (for stories)
  replies: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    message: { type: String, maxlength: 200 },
    createdAt: { type: Date, default: Date.now }
  }],
  
  // Privacy
  visibility: { 
    type: String, 
    enum: ['public', 'followers', 'close_friends', 'private'], 
    default: 'public' 
  },
  
  // Expiration (24 hours for stories)
  expiresAt: { type: Date, required: true },
  
  createdAt: { type: Date, default: Date.now }
});

// Auto-delete expired stories
storySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });