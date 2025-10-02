// models/Reaction.js
import mongoose from 'mongoose';

const reactionSchema = new mongoose.Schema({
  // Target content (post, comment, story, etc.)
  targetType: {
    type: String,
    enum: ['post', 'comment', 'story', 'message'],
    required: true
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: 'targetType'
  },
  
  // User who reacted
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Reaction type with emoji support
  reactionType: {
    type: String,
    enum: ['like', 'love', 'haha', 'wow', 'sad', 'angry', 'care'],
    default: 'like'
  },
  emoji: {
    type: String,
    default: '👍'
  },
  
  // Custom reaction (if allowed)
  customReaction: {
    type: String,
    maxlength: 10 // Emoji or short text
  },
  
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Compound index for unique reactions
reactionSchema.index({ targetType: 1, targetId: 1, user: 1 }, { unique: true });

// Update reaction counts on save
reactionSchema.post('save', async function() {
  await this.updateReactionCounts();
});

reactionSchema.post('remove', async function() {
  await this.updateReactionCounts();
});

reactionSchema.methods.updateReactionCounts = async function() {
  const Reaction = mongoose.model('Reaction');
  
  // Get all reactions for this target
  const reactions = await Reaction.find({
    targetType: this.targetType,
    targetId: this.targetId
  });

  // Count by reaction type
  const reactionCounts = reactions.reduce((acc, reaction) => {
    acc[reaction.reactionType] = (acc[reaction.reactionType] || 0) + 1;
    return acc;
  }, {});

  // Update the target document
  const modelName = this.targetType.charAt(0).toUpperCase() + this.targetType.slice(1);
  const Model = mongoose.model(modelName);
  
  await Model.findByIdAndUpdate(this.targetId, {
    reactionCounts,
    totalReactions: reactions.length,
    lastReactionAt: new Date()
  });
};

export default mongoose.model('Reaction', reactionSchema);