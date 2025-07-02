const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

// Rate limiting middleware
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

// Room cleanup interval
setInterval(() => {
  rooms.forEach((room, roomId) => {
    if (room.users.length === 0) {
      // Room empty for too long - clean up
      rooms.delete(roomId);
      console.log(`Cleaned up empty room: ${roomId}`);
    }
  });
}, 300000); // 5 minutes

io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  socket.on('check-room', ({ roomId }, callback) => {
    callback({ exists: rooms.has(roomId) });
  });

  socket.on('join-room', ({ roomId, password }) => {
  try {
    if (rooms.has(roomId)) {
      const room = rooms.get(roomId);
      // Room full check
      if (room.users.length >= 2) {
        socket.emit('room-full');
        return;
      }
      // Password verification for all users
      if (room.password !== password) {
        socket.emit('invalid-password');
        return;
      }
    } else {
      // Create new room with provided password
      if (!password) {
        socket.emit('invalid-password');
        return;
      }
      rooms.set(roomId, {
        password: password, // Use user-provided password
        users: []
      });
    }

      socket.join(roomId);
      socket.roomId = roomId;

      const room = rooms.get(roomId);
      room.users.push(socket.id);

      const otherUsers = room.users.filter(id => id !== socket.id);
      if (otherUsers.length > 0) {
        socket.to(roomId).emit('user-connected', { userId: socket.id });
        socket.emit('existing-users', { users: otherUsers });
      }

      console.log(`User ${socket.id} joined room ${roomId}`);
    } catch (err) {
      console.error('Join error:', err);
    }
  });

  socket.on('leave-room', ({ roomId }) => {
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.users = room.users.filter(id => id !== socket.id);
      
      if (room.users.length === 0) {
        // Start countdown to delete empty room
        setTimeout(() => {
          if (rooms.get(roomId)?.users.length === 0) {
            rooms.delete(roomId);
          }
        }, 5000);
      } else {
        socket.to(roomId).emit('user-disconnected', { userId: socket.id });
      }
    }
  });

  socket.on('sdp-offer', ({ offer, to }) => {
    socket.to(to).emit('sdp-offer', { offer, from: socket.id });
  });

  socket.on('sdp-answer', ({ answer, to }) => {
    socket.to(to).emit('sdp-answer', { answer, from: socket.id });
  });

  socket.on('ice-candidate', ({ candidate, to }) => {
    socket.to(to).emit('ice-candidate', { candidate, from: socket.id });
  });

  socket.on('send-message', ({ roomId, message }) => {
    // Basic message sanitization
    const sanitizedMessage = message.toString().substring(0, 500);
    socket.to(roomId).emit('receive-message', sanitizedMessage);
  });

  socket.on('send-reaction', ({ roomId, reaction }) => {
    if (['heart', 'kiss'].includes(reaction)) {
      socket.to(roomId).emit('receive-reaction', reaction);
    }
  });

  socket.on('typing', ({ roomId, isTyping }) => {
    socket.to(roomId).emit('typing', { isTyping });
  });

  socket.on('end-session', ({ roomId }) => {
  socket.to(roomId).emit('session-ended');
  // Clean up room
  rooms.delete(roomId);
});

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.users = room.users.filter(id => id !== socket.id);
      
      if (room.users.length === 0) {
        // Start countdown to delete empty room
        setTimeout(() => {
          if (rooms.get(roomId)?.users.length === 0) {
            rooms.delete(roomId);
          }
        }, 5000);
      } else {
        socket.to(roomId).emit('user-disconnected', { userId: socket.id });
      }
    }
    console.log(`User disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Current rooms: ${rooms.size}`);
});