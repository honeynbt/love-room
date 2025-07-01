const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, 'public')));

const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);

  socket.on('join-room', ({ roomId, password }) => {
    try {
      socket.join(roomId);
      socket.roomId = roomId;

      if (!rooms.has(roomId)) {
        rooms.set(roomId, {
          password,
          users: []
        });
      }

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
    socket.to(roomId).emit('receive-message', message);
  });

  socket.on('send-reaction', ({ roomId, reaction }) => {
    socket.to(roomId).emit('receive-reaction', reaction);
  });

  socket.on('disconnect', () => {
    const roomId = socket.roomId;
    if (roomId && rooms.has(roomId)) {
      const room = rooms.get(roomId);
      room.users = room.users.filter(id => id !== socket.id);
      
      if (room.users.length === 0) {
        rooms.delete(roomId);
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
});