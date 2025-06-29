const roomPasswords = {};
const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, "public")));

const roomUsers = {};

io.on("connection", (socket) => {
  console.log("🔌 A user connected:", socket.id);

  // JOIN ROOM with password protection
  socket.on("join-room", ({ roomId, password }) => {
    socket.roomId = roomId;

    if (!roomPasswords[roomId]) {
      roomPasswords[roomId] = password;
      console.log(`🔐 Password set for room ${roomId}`);
    } else {
      if (roomPasswords[roomId] !== password) {
        socket.emit("wrong-password");
        return;
      }
    }

    socket.join(roomId);
    console.log(`✅ User ${socket.id} joined room ${roomId}`);

    if (!roomUsers[roomId]) roomUsers[roomId] = new Set();
    roomUsers[roomId].add(socket.id);

    socket.to(roomId).emit("chat", {
      message: Buffer.from("Your partner has joined! 💑").toString("base64")
    });

    socket.to(roomId).emit("ready");
  });

  // Handle Chat
  socket.on("chat", ({ roomId, message }) => {
    if (socket.roomId === roomId) {
      socket.to(roomId).emit("chat", { message });
    }
  });

  // WebRTC Signaling: Offer
  socket.on("offer", ({ roomId, offer }) => {
    if (socket.roomId === roomId) {
      socket.to(roomId).emit("offer", offer);
    }
  });

  // WebRTC Signaling: Answer
  socket.on("answer", ({ roomId, answer }) => {
    if (socket.roomId === roomId) {
      socket.to(roomId).emit("answer", { answer });
    }
  });

  // ICE Candidate Relay
  socket.on("ice", ({ roomId, candidate }) => {
    if (socket.roomId === roomId) {
      socket.to(roomId).emit("ice", { candidate });
    }
  });

  // Notify partner to start call
  socket.on("ready", (roomId) => {
    if (socket.roomId === roomId) {
      socket.to(roomId).emit("ready");
    }
  });

  // Emoji reaction relay 💋 💓
  socket.on("reaction", ({ roomId, type }) => {
    if (socket.roomId === roomId) {
      socket.to(roomId).emit("reaction", { type });
    }
  });

  // Handle disconnection
  socket.on("disconnect", () => {
  const roomId = socket.roomId;
  console.log(`❌ User disconnected: ${socket.id}`);

  if (roomId && roomUsers[roomId]) {
    roomUsers[roomId].delete(socket.id);

    if (roomUsers[roomId].size === 0) {
      delete roomUsers[roomId];
      delete roomPasswords[roomId];
      console.log(`🧹 Cleaned up empty room ${roomId}`);
    } else {
      socket.to(roomId).emit("partner-left");
    }
  }
});

});

const PORT = process.env.PORT || 3000;
app.get("/", (req, res) => {
  res.redirect("/room" + Math.floor(Math.random() * 10000));
});

server.listen(PORT, () => {
  console.log(`💖 LoveRoom server running at http://localhost:${PORT}`);
});
