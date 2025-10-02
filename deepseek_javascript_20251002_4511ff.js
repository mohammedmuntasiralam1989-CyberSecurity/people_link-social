// models/Relationship.js
import mongoose from 'mongoose';

const relationshipSchema = new mongoose.Schema({
  // Basic follow relationship
  follower: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  following: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  
  // Friendship status
  status: {
    type: String,
    enum: ['pending', 'accepted', 'rejected', 'blocked'],
    default: 'pending'
  },
  
  // Friendship specific fields
  isFriend: { type: Boolean, default: false },
  friendshipDate: { type: Date },
  
  // Close friends feature (like Instagram)
  isCloseFriend: { type: Boolean, default: false },
  
  // Privacy settings for this relationship
  canSeePosts: { type: Boolean, default: true },
  canSeeStories: { type: Boolean, default: true },
  canMessage: { type: Boolean, default: true },
  
  // Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Compound index for unique relationships
relationshipSchema.index({ follower: 1, following: 1 }, { unique: true });

// Update user counts when relationship changes
relationshipSchema.post('save', async function() {
  await this.updateUserCounts();
});

relationshipSchema.post('remove', async function() {
  await this.updateUserCounts();
});

relationshipSchema.methods.updateUserCounts = async function() {
  const followerCount = await mongoose.model('Relationship').countDocuments({ 
    following: this.following,
    status: 'accepted'
  });
  
  const followingCount = await mongoose.model('Relationship').countDocuments({ 
    follower: this.follower,
    status: 'accepted'
  });
  
  const friendCount = await mongoose.model('Relationship').countDocuments({
    $or: [
      { follower: this.follower, isFriend: true },
      { following: this.follower, isFriend: true }
    ],
    status: 'accepted'
  });

  await mongoose.model('User').findByIdAndUpdate(this.following, {
    followersCount: followerCount
  });

  await mongoose.model('User').findByIdAndUpdate(this.follower, {
    followingCount: followingCount,
    friendsCount: friendCount
  });
};

export default mongoose.model('Relationship', relationshipSchema);