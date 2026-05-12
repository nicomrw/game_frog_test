const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const players = {};
const projectiles = {};
let projectileIdCounter = 0;

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Create a new player
  players[socket.id] = {
    id: socket.id,
    x: 400,
    y: 300,
    color: Math.floor(Math.random() * 16777215).toString(16),
  };

  // Send current players to the new player
  socket.emit('currentPlayers', players);

  // Broadcast the new player to all other players
  socket.broadcast.emit('newPlayer', players[socket.id]);

  socket.on('playerMovement', (movementData) => {
    if (players[socket.id]) {
      players[socket.id].x = movementData.x;
      players[socket.id].y = movementData.y;
      socket.broadcast.emit('playerMoved', players[socket.id]);
    }
  });

  socket.on('shootProjectile', (projectileData) => {
    const id = projectileIdCounter++;
    const newProjectile = {
      id: id,
      playerId: socket.id,
      x: projectileData.x,
      y: projectileData.y,
      targetX: projectileData.targetX,
      targetY: projectileData.targetY,
    };
    projectiles[id] = newProjectile;

    // Broadcast the new projectile to all players
    io.emit('newProjectile', newProjectile);

    // Remove projectile after a short duration (e.g., 2 seconds)
    setTimeout(() => {
      delete projectiles[id];
      io.emit('removeProjectile', id);
    }, 2000);
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
