const express = require("express");
const http = require("http");
const path = require("path");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const roomUsers = {};

io.on("connection", (socket) => {
  console.log("A user connected:", socket.id);

  socket.on("join-room", (roomId) => {
    socket.join(roomId);
    console.log(`User ${socket.id} joined room ${roomId}`);

    if (!roomUsers[roomId]) {
      roomUsers[roomId] = new Set();
    }
    roomUsers[roomId].add(socket.id);

    socket.to(roomId).emit("chat", {
      message: Buffer.from("Your partner has joined! 💑").toString("base64")
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

    socket.on("ready", (roomId) => {
      socket.to(roomId).emit("ready");
    });


    socket.on("disconnect", () => {
      console.log(`User disconnected: ${socket.id}`);
      if (roomUsers[roomId]) {
        roomUsers[roomId].delete(socket.id);
        if (roomUsers[roomId].size === 0) {
          delete roomUsers[roomId];
          console.log(`Room ${roomId} cleaned up.`);
        } else {
          socket.to(roomId).emit("partner-left");
        }
      }
    });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`💖 LoveRoom server running at http://localhost:${PORT}`);
});
