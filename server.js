const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000 // 2 minutes
  }
});

app.use(express.static(path.join(__dirname, "public")));

const roomPasswords = new Map();

// Password cleanup
setInterval(() => {
  const now = Date.now();
  for (const [roomId, data] of roomPasswords) {
    if (data.expires < now) {
      roomPasswords.delete(roomId);
    }
  }
}, 60 * 60 * 1000); // Hourly cleanup

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  socket.on("join-room", ({ roomId, password }) => {
    // Room capacity check
    const room = io.sockets.adapter.rooms.get(roomId);
    if (room && room.size >= 2) {
      socket.emit("room-full");
      return;
    }

    // Password handling
    const roomData = roomPasswords.get(roomId);
    if (!roomData) {
      roomPasswords.set(roomId, {
        password,
        expires: Date.now() + 24 * 60 * 60 * 1000 // 24h expiration
      });
    } else if (roomData.password !== password) {
      socket.emit("wrong-password");
      return;
    }

    socket.join(roomId);
    socket.roomId = roomId;
    console.log(`User ${socket.id} joined ${roomId}`);

    // Notify existing users
    if (io.sockets.adapter.rooms.get(roomId)?.size === 2) {
      socket.to(roomId).emit("ready");
    }
  });

  // Event handlers
  socket.on("chat", ({ roomId, message }) => {
    socket.to(roomId).emit("chat", { message });
  });

  socket.on("offer", ({ roomId, offer }) => {
    socket.to(roomId).emit("offer", offer);
  });

  socket.on("answer", ({ roomId, answer }) => {
    socket.to(roomId).emit("answer", { answer });
  });

  socket.on("ice", ({ roomId, candidate }) => {
    socket.to(roomId).emit("ice", { candidate });
  });

  socket.on("reaction", ({ roomId, type }) => {
    socket.to(roomId).emit("reaction", { type });
  });

  socket.on("typing", (roomId) => {
    socket.to(roomId).emit("typing");
  });

  socket.on("stop-typing", (roomId) => {
    socket.to(roomId).emit("stop-typing");
  });

  socket.on("check-room", (roomId, callback) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    callback(room ? { size: room.size } : null);
  });

  socket.on("ready", (roomId) => {
    socket.to(roomId).emit("ready");
  });

  socket.on("leave-room", (roomId) => {
    socket.leave(roomId);
    socket.to(roomId).emit("partner-left");
  });

  socket.on("disconnect", () => {
    if (socket.roomId) {
      const roomId = socket.roomId;
      socket.to(roomId).emit("partner-left");
      console.log(`User ${socket.id} left ${roomId}`);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`💖 LoveRoom server running at http://localhost:${PORT}`);
});