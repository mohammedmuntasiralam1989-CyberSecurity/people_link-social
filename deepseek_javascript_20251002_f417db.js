// models/Message.js
const messageSchema = new mongoose.Schema({
  conversation: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Conversation', 
    required: true 
  },
  sender: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: true 
  },
  content: { 
    type: String, 
    required: true,
    maxlength: 5000 
  },
  media: [{
    type: String, // URL to media file
    mediaType: String // image, video, audio, file
  }],
  
  // Message status
  readBy: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    readAt: { type: Date, default: Date.now }
  }],
  
  // Reply to another message
  replyTo: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Message' 
  },
  
  // Reactions
  reactions: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    emoji: { type: String, required: true },
    createdAt: { type: Date, default: Date.now }
  }],
  
  createdAt: { type: Date, default: Date.now }
});

// models/Conversation.js
const conversationSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  
  // Group chat properties
  isGroup: { type: Boolean, default: false },
  groupName: { type: String },
  groupPhoto: { type: String },
  groupAdmins: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  
  // Last message for preview
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  
  // Privacy
  isBlocked: { type: Boolean, default: false },
  blockedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});