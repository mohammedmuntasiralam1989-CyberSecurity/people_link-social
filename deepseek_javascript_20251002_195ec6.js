// socket/messaging.js (WebSocket/Socket.io)
import { Server } from 'socket.io';

export const setupSocketIO = (server) => {
  const io = new Server(server, {
    cors: {
      origin: process.env.CLIENT_URL,
      methods: ["GET", "POST"]
    }
  });

  // User socket connections map
  const userSockets = new Map();

  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // User authentication and joining
    socket.on('authenticate', (userId) => {
      userSockets.set(userId, socket.id);
      socket.join(`user_${userId}`);
    });

    // Send message
    socket.on('send_message', async (data) => {
      try {
        const { conversationId, content, media, replyTo } = data;
        
        // Save message to database
        const message = new Message({
          conversation: conversationId,
          sender: data.senderId,
          content,
          media,
          replyTo
        });

        await message.save();
        await message.populate('sender', 'name avatar');
        
        // Update conversation last message
        await Conversation.findByIdAndUpdate(conversationId, {
          lastMessage: message._id,
          updatedAt: new Date()
        });

        // Get conversation participants
        const conversation = await Conversation.findById(conversationId)
          .populate('participants', '_id');
        
        // Send to all participants
        conversation.participants.forEach(participant => {
          if (participant._id.toString() !== data.senderId) {
            io.to(`user_${participant._id}`).emit('new_message', {
              conversationId,
              message
            });
          }
        });

        // Send confirmation to sender
        socket.emit('message_sent', { message });

      } catch (error) {
        socket.emit('message_error', { error: 'Failed to send message' });
      }
    });

    // Typing indicators
    socket.on('typing_start', (data) => {
      const { conversationId, userId } = data;
      socket.to(`conversation_${conversationId}`).emit('user_typing', {
        userId,
        typing: true
      });
    });

    socket.on('typing_stop', (data) => {
      const { conversationId, userId } = data;
      socket.to(`conversation_${conversationId}`).emit('user_typing', {
        userId,
        typing: false
      });
    });

    // Message read receipts
    socket.on('mark_read', async (data) => {
      const { messageId, userId } = data;
      
      await Message.findByIdAndUpdate(messageId, {
        $addToSet: { readBy: { user: userId } }
      });

      // Notify sender that message was read
      const message = await Message.findById(messageId).populate('sender');
      if (message.sender._id.toString() !== userId) {
        io.to(`user_${message.sender._id}`).emit('message_read', {
          messageId,
          readBy: userId
        });
      }
    });

    socket.on('disconnect', () => {
      // Remove user from socket map
      for (let [userId, socketId] of userSockets.entries()) {
        if (socketId === socket.id) {
          userSockets.delete(userId);
          break;
        }
      }
      console.log('User disconnected:', socket.id);
    });
  });

  return io;
};