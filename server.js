const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000
  }
});

app.use(express.static(path.join(__dirname, "public")));

const roomPasswords = new Map();

// Password expiry cleanup
setInterval(() => {
  const now = Date.now();
  for (const [roomId, data] of roomPasswords) {
    if (data.expires < now) roomPasswords.delete(roomId);
  }
}, 60 * 60 * 1000);

io.on("connection", (socket) => {
  socket.on("join-room", ({ roomId, password }) => {
    const room = io.sockets.adapter.rooms.get(roomId);
    const numClients = room ? room.size : 0;

    if (numClients >= 2) {
      socket.emit("room-full");
      return;
    }

    const roomData = roomPasswords.get(roomId);
    if (!roomData) {
      roomPasswords.set(roomId, {
        password,
        expires: Date.now() + 24 * 60 * 60 * 1000
      });
    } else if (roomData.password !== password) {
      socket.emit("wrong-password");
      return;
    }

    socket.join(roomId);
    socket.roomId = roomId;

    if (numClients === 0) {
      socket.emit("init-host");
    } else {
      socket.to(roomId).emit("partner-joined");
    }
  });

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

  socket.on("leave-room", (roomId) => {
    socket.leave(roomId);
    socket.to(roomId).emit("partner-left");
  });

  socket.on("disconnect", () => {
    if (socket.roomId) {
      socket.to(socket.roomId).emit("partner-left");
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`💖 LoveRoom running at http://localhost:${PORT}`);
});