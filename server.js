// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

// Basic rate limiting (avoid abuse)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200
});
app.use(limiter);

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Serve main page at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'loveroom.html'));
});

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingInterval: 25000, // keepalive
  pingTimeout: 60000,
  transports: ['websocket', 'polling']
});

// roomId -> { password, users: [socketId, ...] }
const rooms = new Map();

// Periodic cleanup (safety)
setInterval(() => {
  rooms.forEach((room, roomId) => {
    if (!room.users || room.users.length === 0) {
      rooms.delete(roomId);
      console.log(`Cleaned empty room: ${roomId}`);
    }
  });
}, 5 * 60 * 1000);

// Helper: handle leaving room (used on leave-room + disconnect)
function handleLeave(socket, explicitRoomId) {
  const roomId = explicitRoomId || socket.roomId;
  if (!roomId) return;

  const room = rooms.get(roomId);
  if (!room) return;

  room.users = room.users.filter(id => id !== socket.id);
  socket.leave(roomId);

  if (room.users.length === 0) {
    rooms.delete(roomId);
    console.log(`Room deleted (no users): ${roomId}`);
  } else {
    socket.to(roomId).emit('user-disconnected', { userId: socket.id });
    console.log(`User ${socket.id} left room ${roomId}. Remaining: ${room.users.length}`);
  }
}

io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}, transport=${socket.conn.transport.name}`);

  // Optional health check
  socket.on('keepalive', () => {
    socket.emit('keepalive-ack');
  });

  socket.on('join-room', ({ roomId, password }) => {
    try {
      if (!roomId || !password) {
        socket.emit('invalid-password');
        return;
      }

      let room = rooms.get(roomId);

      if (room) {
        // Check password
        if (room.password !== password) {
          socket.emit('invalid-password');
          return;
        }
        // Max 2 users
        if (room.users.length >= 2) {
          socket.emit('room-full');
          return;
        }
      } else {
        // Create new room
        room = {
          password,
          users: []
        };
        rooms.set(roomId, room);
      }

      socket.join(roomId);
      socket.roomId = roomId;

      if (!room.users.includes(socket.id)) {
        room.users.push(socket.id);
      }

      const otherUsers = room.users.filter(id => id !== socket.id);

      // Send list of existing users to the new user
      socket.emit('existing-users', { users: otherUsers });

      // Notify others that a new user joined
      socket.to(roomId).emit('user-connected', { userId: socket.id });

      console.log(`User ${socket.id} joined room ${roomId}. Users: ${room.users.length}`);
    } catch (err) {
      console.error('join-room error:', err);
    }
  });

  socket.on('leave-room', ({ roomId }) => {
    handleLeave(socket, roomId);
  });

  // WebRTC signaling
  socket.on('sdp-offer', ({ offer, to }) => {
    if (!to) return;
    socket.to(to).emit('sdp-offer', { offer, from: socket.id });
  });

  socket.on('sdp-answer', ({ answer, to }) => {
    if (!to) return;
    socket.to(to).emit('sdp-answer', { answer, from: socket.id });
  });

  socket.on('ice-candidate', ({ candidate, to }) => {
    if (!to || !candidate) return;
    socket.to(to).emit('ice-candidate', { candidate, from: socket.id });
  });

  // Chat
  socket.on('send-message', ({ roomId, message }) => {
    const id = roomId || socket.roomId;
    if (!id) return;
    const sanitized = (message || '').toString().slice(0, 500);
    socket.to(id).emit('receive-message', sanitized);
  });

  // Typing indicator
  socket.on('typing', ({ roomId, isTyping }) => {
    const id = roomId || socket.roomId;
    if (!id) return;
    socket.to(id).emit('typing', { isTyping: !!isTyping });
  });

  // Reactions (💓 / 💋)
  socket.on('send-reaction', ({ roomId, reaction }) => {
    const id = roomId || socket.roomId;
    if (!id) return;
    if (!['heart', 'kiss'].includes(reaction)) return;
    socket.to(id).emit('receive-reaction', reaction);
  });

  // End session for both
  socket.on('end-session', ({ roomId }) => {
    const id = roomId || socket.roomId;
    if (!id) return;

    socket.to(id).emit('session-ended');
    rooms.delete(id);
    console.log(`Session ended and room deleted: ${id}`);
  });

  socket.on('disconnect', (reason) => {
    console.log(`Socket ${socket.id} disconnected: ${reason}`);
    handleLeave(socket);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`LoveRoom server running on http://localhost:${PORT}`);
});
