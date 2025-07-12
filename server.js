const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);

// Configure CORS for Socket.IO
const io = socketIo(server, {
  cors: {
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://playful-monstera-e9a479.netlify.app",
      // Add your production domain here
    ],
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.use(cors());
app.use(express.json());

// Store connected users
const connectedUsers = new Map();
const activeRooms = new Map();

// Basic health check endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'Hey krishnaa Socket.IO Server is running!',
    connectedUsers: connectedUsers.size,
    activeRooms: activeRooms.size
  });
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle user authentication
  socket.on('authenticate', (userData) => {
    connectedUsers.set(socket.id, {
      ...userData,
      socketId: socket.id,
      lastSeen: new Date()
    });
    
    // Broadcast updated online users list
    const onlineUsers = Array.from(connectedUsers.values()).map(user => user.id);
    io.emit('onlineUsers', onlineUsers);
    
    console.log(`User ${userData.name} authenticated`);
  });

  // Handle joining chat rooms
  socket.on('joinRoom', (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);
  });

  // Handle sending messages
  socket.on('sendMessage', (messageData) => {
    console.log('Message received:', messageData);
    
    // Broadcast to room if it's a group chat, otherwise to specific user
    if (messageData.groupId) {
      socket.to(messageData.groupId).emit('newMessage', messageData);
    } else if (messageData.receiverId) {
      // Find receiver's socket
      const receiverSocket = Array.from(connectedUsers.entries())
        .find(([socketId, user]) => user.id === messageData.receiverId);
      
      if (receiverSocket) {
        socket.to(receiverSocket[0]).emit('newMessage', messageData);
      }
    }
    
    // Echo back to sender for confirmation
    socket.emit('messageDelivered', messageData);
  });

  // Handle typing indicators
  socket.on('userTyping', (data) => {
    const user = connectedUsers.get(socket.id);
    if (user && data.receiverId) {
      const receiverSocket = Array.from(connectedUsers.entries())
        .find(([socketId, userData]) => userData.id === data.receiverId);
      
      if (receiverSocket) {
        socket.to(receiverSocket[0]).emit('userTyping', {
          userId: user.id,
          isTyping: data.isTyping
        });
      }
    }
  });

  // Handle call initiation
  socket.on('initiateCall', (callData) => {
    console.log('Call initiated:', callData);
    
    // Find receiver's socket
    const receiverSocket = Array.from(connectedUsers.entries())
      .find(([socketId, user]) => user.name === callData.contactName);
    
    if (receiverSocket) {
      socket.to(receiverSocket[0]).emit('incomingCall', {
        ...callData,
        callerId: socket.id,
        callerName: connectedUsers.get(socket.id)?.name
      });
    }
    
    // Confirm call initiation to caller
    socket.emit('callInitiated', callData);
  });

  // Handle call acceptance
  socket.on('acceptCall', (callData) => {
    console.log('Call accepted:', callData);
    socket.to(callData.callerId).emit('callAccepted', callData);
  });

  // Handle call rejection
  socket.on('rejectCall', (callData) => {
    console.log('Call rejected:', callData);
    socket.to(callData.callerId).emit('callRejected', callData);
  });

  // Handle call end
  socket.on('callEnded', (callData) => {
    console.log('Call ended:', callData);
    socket.broadcast.emit('callEnded', callData);
  });

  // Handle WebRTC signaling for video/voice calls
  socket.on('offer', (data) => {
    socket.to(data.target).emit('offer', {
      offer: data.offer,
      caller: socket.id
    });
  });

  socket.on('answer', (data) => {
    socket.to(data.target).emit('answer', {
      answer: data.answer,
      answerer: socket.id
    });
  });

  socket.on('ice-candidate', (data) => {
    socket.to(data.target).emit('ice-candidate', {
      candidate: data.candidate,
      sender: socket.id
    });
  });

  // Handle group creation
  socket.on('createGroup', (groupData) => {
    const groupId = `group_${Date.now()}`;
    activeRooms.set(groupId, {
      ...groupData,
      id: groupId,
      createdAt: new Date(),
      members: groupData.members || []
    });
    
    // Join creator to the group
    socket.join(groupId);
    
    // Notify group members
    groupData.members?.forEach(memberId => {
      const memberSocket = Array.from(connectedUsers.entries())
        .find(([socketId, user]) => user.id === memberId);
      
      if (memberSocket) {
        socket.to(memberSocket[0]).emit('groupCreated', {
          ...groupData,
          id: groupId
        });
      }
    });
    
    socket.emit('groupCreated', { ...groupData, id: groupId });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
    
    // Remove user from connected users
    connectedUsers.delete(socket.id);
    
    // Broadcast updated online users list
    const onlineUsers = Array.from(connectedUsers.values()).map(user => user.id);
    io.emit('onlineUsers', onlineUsers);
  });

  // Handle connection errors
  socket.on('error', (error) => {
    console.error('Socket error:', error);
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Hey krishnaa Server running on port ${PORT}`);
  console.log(`📡 Socket.IO server ready for connections`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});
