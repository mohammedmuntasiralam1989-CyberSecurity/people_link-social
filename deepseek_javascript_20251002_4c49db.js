// models/User.js (Extended)
import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  username: { type: String, unique: true, sparse: true },
  bio: { type: String, maxlength: 500 },
  avatar: { type: String },
  coverPhoto: { type: String },
  isVerified: { type: Boolean, default: false },
  isPrivate: { type: Boolean, default: false },
  
  // Profile stats
  followersCount: { type: Number, default: 0 },
  followingCount: { type: Number, default: 0 },
  postsCount: { type: Number, default: 0 },
  
  // Social links
  website: { type: String },
  location: { type: String },
  
  // Settings
  emailNotifications: { type: Boolean, default: true },
  pushNotifications: { type: Boolean, default: true },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Follow model
const followSchema = new mongoose.Schema({
  follower: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  following: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  createdAt: { type: Date, default: Date.now }
});

followSchema.index({ follower: 1, following: 1 }, { unique: true });

export const Follow = mongoose.model('Follow', followSchema);
export default mongoose.model('User', userSchema);