// socket/chatHandler.js
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import Message from '../models/Message.js';
import Conversation from '../models/Conversation.js';

export class ChatHandler {
  constructor(server) {
    this.io = new Server(server, {
      cors: {
        origin: process.env.CLIENT_URL,
        methods: ["GET", "POST"]
      }
    });
    
    this.userSockets = new Map();
    this.onlineUsers = new Set();
    
    this.initializeMiddleware();
    this.initializeHandlers();
  }

  initializeMiddleware() {
    // Socket authentication middleware
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication error'));
      }

      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        socket.userId = decoded.userId;
        next();
      } catch (error) {
        next(new Error('Authentication error'));
      }
    });
  }

  initializeHandlers() {
    this.io.on('connection', (socket) => {
      console.log('User connected:', socket.userId);
      
      this.handleConnection(socket);
      this.handleMessages(socket);
      this.handleTyping(socket);
      this.handlePresence(socket);
      this.handleCalls(socket);
      this.handleDisconnection(socket);
    });
  }

  handleConnection(socket) {
    // Store user socket
    this.userSockets.set(socket.userId, socket.id);
    this.onlineUsers.add(socket.userId);

    // Join user to their personal room
    socket.join(`user_${socket.userId}`);

    // Broadcast online status
    socket.broadcast.emit('user_online', { userId: socket.userId });

    // Send current online users
    socket.emit('online_users', Array.from(this.onlineUsers));

    // Join conversation rooms
    this.joinConversationRooms(socket);
  }

  async joinConversationRooms(socket) {
    try {
      const conversations = await Conversation.find({
        participants: socket.userId
      });
      
      conversations.forEach(conversation => {
        socket.join(`conversation_${conversation._id}`);
      });
    } catch (error) {
      console.error('Error joining conversation rooms:', error);
    }
  }

  handleMessages(socket) {
    // Send message
    socket.on('send_message', async (data) => {
      try {
        const { conversationId, content, media, replyTo, temporaryId } = data;
        
        // Save message to database
        const message = new Message({
          conversation: conversationId,
          sender: socket.userId,
          content,
          media,
          replyTo
        });

        await message.save();
        await message.populate('sender', 'name username avatar isVerified');
        
        if (replyTo) {
          await message.populate('replyTo');
        }

        // Update conversation last message
        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: message._id,
          updatedAt: new Date()
        });

        // Get conversation with participants
        const conversation = await Conversation.findById(conversationId)
          .populate('participants', '_id name avatar');

        // Emit to all participants
        this.io.to(`conversation_${conversationId}`).emit('new_message', {
          message,
          conversationId,
          temporaryId // For client-side message tracking
        });

        // Send push notifications to offline users
        conversation.participants.forEach(participant => {
          if (participant._id.toString() !== socket.userId && 
              !this.onlineUsers.has(participant._id.toString())) {
            this.sendPushNotification(participant._id, {
              title: message.sender.name,
              body: content.length > 50 ? content.substring(0, 50) + '...' : content,
              data: { conversationId, messageId: message._id }
            });
          }
        });

      } catch (error) {
        socket.emit('message_error', { 
          error: 'Failed to send message',
          temporaryId: data.temporaryId 
        });
      }
    });

    // Message reactions
    socket.on('react_to_message', async (data) => {
      try {
        const { messageId, emoji } = data;
        
        const message = await Message.findById(messageId);
        if (!message) return;

        // Remove existing reaction from same user
        message.reactions = message.reactions.filter(
          reaction => reaction.user.toString() !== socket.userId
        );

        // Add new reaction
        message.reactions.push({
          user: socket.userId,
          emoji,
          createdAt: new Date()
        });

        await message.save();
        await message.populate('reactions.user', 'name avatar');

        // Broadcast reaction
        this.io.to(`conversation_${message.conversation}`).emit('message_reacted', {
          messageId,
          reactions: message.reactions
        });

      } catch (error) {
        socket.emit('reaction_error', { error: 'Failed to add reaction' });
      }
    });

    // Mark messages as read
    socket.on('mark_messages_read', async (data) => {
      try {
        const { conversationId, messageIds } = data;
        
        await Message.updateMany(
          { 
            _id: { $in: messageIds },
            conversation: conversationId
          },
          { 
            $addToSet: { readBy: { user: socket.userId, readAt: new Date() } }
          }
        );

        // Notify other participants
        socket.to(`conversation_${conversationId}`).emit('messages_read', {
          conversationId,
          readerId: socket.userId,
          messageIds
        });

      } catch (error) {
        console.error('Error marking messages as read:', error);
      }
    });
  }

  handleTyping(socket) {
    const typingUsers = new Map();

    socket.on('typing_start', (data) => {
      const { conversationId } = data;
      
      typingUsers.set(conversationId, true);
      
      socket.to(`conversation_${conversationId}`).emit('user_typing', {
        userId: socket.userId,
        conversationId,
        typing: true
      });
    });

    socket.on('typing_stop', (data) => {
      const { conversationId } = data;
      
      typingUsers.delete(conversationId);
      
      socket.to(`conversation_${conversationId}`).emit('user_typing', {
        userId: socket.userId,
        conversationId,
        typing: false
      });
    });
  }

  handlePresence(socket) {
    socket.on('update_presence', (data) => {
      const { status, customStatus } = data;
      
      socket.broadcast.emit('user_presence_updated', {
        userId: socket.userId,
        status,
        customStatus,
        lastSeen: new Date()
      });
    });
  }

  handleCalls(socket) {
    socket.on('call_user', (data) => {
      const { targetUserId, callType, offer } = data;
      
      socket.to(`user_${targetUserId}`).emit('incoming_call', {
        callerId: socket.userId,
        callType,
        offer,
        callId: generateCallId()
      });
    });

    socket.on('call_answer', (data) => {
      const { callId, answer } = data;
      
      socket.broadcast.emit('call_answered', {
        callId,
        answer
      });
    });

    socket.on('call_ice_candidate', (data) => {
      const { callId, candidate } = data;
      
      socket.broadcast.emit('call_ice_candidate', {
        callId,
        candidate
      });
    });

    socket.on('call_end', (data) => {
      const { callId } = data;
      
      socket.broadcast.emit('call_ended', { callId });
    });
  }

  handleDisconnection(socket) {
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.userId);
      
      this.userSockets.delete(socket.userId);
      this.onlineUsers.delete(socket.userId);

      // Broadcast offline status
      socket.broadcast.emit('user_offline', { userId: socket.userId });
    });
  }

  sendPushNotification(userId, notification) {
    // Integrate with FCM, APNS, or other push services
    console.log('Sending push notification:', userId, notification);
  }
}

function generateCallId() {
  return Math.random().toString(36).substring(2, 15);
}