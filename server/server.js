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

const enemies = {};
let enemyIdCounter = 0;

// Game Loop Configuration
const TICK_RATE = 30; // 30 updates per second
const TICK_INTERVAL = 1000 / TICK_RATE;

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Create a new player
  players[socket.id] = {
    id: socket.id,
    x: 400,
    y: 300,
    color: Math.floor(Math.random() * 16777215).toString(16),
  };

  // Send current state to the new player
  socket.emit('currentPlayers', players);
  socket.emit('currentEnemies', enemies);

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

    // Calculate velocity for server-side position updates
    const angle = Math.atan2(projectileData.targetY - projectileData.y, projectileData.targetX - projectileData.x);
    const speed = 400; // Match client speed
    const vx = Math.cos(angle) * speed;
    const vy = Math.sin(angle) * speed;

    const newProjectile = {
      id: id,
      playerId: socket.id,
      x: projectileData.x,
      y: projectileData.y,
      vx: vx,
      vy: vy,
      targetX: projectileData.targetX,
      targetY: projectileData.targetY,
      createdAt: Date.now()
    };
    projectiles[id] = newProjectile;

    // Broadcast the new projectile to all players
    io.emit('newProjectile', {
      id: id,
      playerId: socket.id,
      x: projectileData.x,
      y: projectileData.y,
      targetX: projectileData.targetX,
      targetY: projectileData.targetY,
    });
  });

  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerDisconnected', socket.id);
  });
});

// Enemy Spawner
setInterval(() => {
  // Only spawn if there are players
  if (Object.keys(players).length === 0) return;

  // Cap enemies
  if (Object.keys(enemies).length >= 50) return;

  const id = enemyIdCounter++;

  // Spawn randomly near edges
  let x, y;
  if (Math.random() < 0.5) {
    x = Math.random() < 0.5 ? -50 : 850;
    y = Math.random() * 600;
  } else {
    x = Math.random() * 800;
    y = Math.random() < 0.5 ? -50 : 650;
  }

  const newEnemy = {
    id: id,
    x: x,
    y: y,
    hp: 3,
    speed: 50 + Math.random() * 30 // random speed
  };

  enemies[id] = newEnemy;
  io.emit('newEnemy', newEnemy);

}, 2000); // Spawn an enemy every 2 seconds


// Server Game Loop
let lastTickTime = Date.now();

setInterval(() => {
  const now = Date.now();
  const dt = (now - lastTickTime) / 1000;
  lastTickTime = now;

  let enemiesUpdated = false;

  // 1. Update Projectiles
  for (const projId in projectiles) {
    const proj = projectiles[projId];
    proj.x += proj.vx * dt;
    proj.y += proj.vy * dt;

    // Remove if older than 2 seconds
    if (now - proj.createdAt > 2000) {
      delete projectiles[projId];
      io.emit('removeProjectile', projId);
    }
  }

  // 2. Update Enemies & Check Collisions
  for (const enemyId in enemies) {
    const enemy = enemies[enemyId];

    // Find nearest player
    let nearestPlayer = null;
    let minDist = Infinity;

    for (const playerId in players) {
      const p = players[playerId];
      const dist = Math.hypot(p.x - enemy.x, p.y - enemy.y);
      if (dist < minDist) {
        minDist = dist;
        nearestPlayer = p;
      }
    }

    if (nearestPlayer) {
      // Move towards nearest player
      const angle = Math.atan2(nearestPlayer.y - enemy.y, nearestPlayer.x - enemy.x);
      enemy.x += Math.cos(angle) * enemy.speed * dt;
      enemy.y += Math.sin(angle) * enemy.speed * dt;
      enemiesUpdated = true;
    }

    // Check collision with projectiles
    for (const projId in projectiles) {
      const proj = projectiles[projId];
      const dist = Math.hypot(proj.x - enemy.x, proj.y - enemy.y);

      // Simple radius check
      if (dist < 20) {
        enemy.hp -= 1;

        // Destroy projectile
        delete projectiles[projId];
        io.emit('removeProjectile', projId);

        if (enemy.hp <= 0) {
          delete enemies[enemyId];
          io.emit('enemyDestroyed', enemyId);
          break; // Stop checking other projectiles for this enemy
        }
      }
    }
  }

  if (enemiesUpdated) {
     io.emit('enemyUpdates', enemies);
  }

}, TICK_INTERVAL);


const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
