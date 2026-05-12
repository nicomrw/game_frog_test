import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { io } from 'socket.io-client';

const Game = () => {
  const gameRef = useRef(null);

  useEffect(() => {
    const socket = io('http://localhost:3001');

    const config = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      parent: gameRef.current,
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { y: 0 },
          debug: false,
        },
      },
      scene: {
        preload: preload,
        create: create,
        update: update,
      },
    };

    const game = new Phaser.Game(config);
    let cursors;
    let wasd;
    let localPlayer;
    const otherPlayers = {};
    const projectilesGroup = {};
    const enemiesGroup = {};

    function preload() {
      // Swamp background tile
      const bgGraphics = this.add.graphics();
      bgGraphics.fillStyle(0x1a2e1c, 1); // Dark swamp green
      bgGraphics.fillRect(0, 0, 64, 64);
      bgGraphics.fillStyle(0x2d4c2f, 1); // Lighter green patches
      bgGraphics.fillCircle(16, 16, 10);
      bgGraphics.fillCircle(48, 48, 8);
      bgGraphics.fillCircle(50, 16, 12);
      bgGraphics.generateTexture('bg_tile', 64, 64);
      bgGraphics.destroy();

      // Magic Frog (Green body, blue wizard hat)
      const frogGraphics = this.add.graphics();
      frogGraphics.fillStyle(0x00ff00, 1); // Frog body
      frogGraphics.fillRect(4, 12, 24, 20);
      frogGraphics.fillStyle(0x0000ff, 1); // Wizard hat base
      frogGraphics.fillRect(0, 8, 32, 4);
      frogGraphics.fillStyle(0x0000ff, 1); // Wizard hat tip
      frogGraphics.beginPath();
      frogGraphics.moveTo(8, 8);
      frogGraphics.lineTo(16, 0);
      frogGraphics.lineTo(24, 8);
      frogGraphics.closePath();
      frogGraphics.fillPath();
      frogGraphics.generateTexture('frog', 32, 32);
      frogGraphics.destroy();

      // Enemy Mushroom (Purple base, red cap with spots)
      const mushGraphics = this.add.graphics();
      mushGraphics.fillStyle(0x6a0dad, 1); // Purple stalk
      mushGraphics.fillRect(10, 16, 12, 16);
      mushGraphics.fillStyle(0xff0000, 1); // Red cap
      mushGraphics.beginPath();
      mushGraphics.arc(16, 16, 16, Math.PI, 0, false);
      mushGraphics.closePath();
      mushGraphics.fillPath();
      mushGraphics.fillStyle(0xffffff, 1); // White spots
      mushGraphics.fillCircle(8, 10, 3);
      mushGraphics.fillCircle(24, 10, 3);
      mushGraphics.fillCircle(16, 6, 4);
      mushGraphics.generateTexture('enemy_mushroom', 32, 32);
      mushGraphics.destroy();

      // Glowing projectile
      const projGraphics = this.add.graphics();
      projGraphics.fillStyle(0xffff00, 1);
      projGraphics.fillCircle(8, 8, 8);
      projGraphics.fillStyle(0xffffff, 1);
      projGraphics.fillCircle(8, 8, 4);
      projGraphics.generateTexture('projectile', 16, 16);
      projGraphics.destroy();
    }

    function create() {
      const self = this;

      // Add background
      this.add.tileSprite(400, 300, 800, 600, 'bg_tile');

      this.projectiles = this.physics.add.group();

      socket.on('currentPlayers', (players) => {
        Object.keys(players).forEach((id) => {
          if (players[id].id === socket.id) {
            addLocalPlayer(self, players[id]);
          } else {
            addOtherPlayer(self, players[id]);
          }
        });
      });

      socket.on('newPlayer', (playerInfo) => {
        addOtherPlayer(self, playerInfo);
      });

      socket.on('playerDisconnected', (id) => {
        if (otherPlayers[id]) {
          otherPlayers[id].destroy();
          delete otherPlayers[id];
        }
      });

      socket.on('playerMoved', (playerInfo) => {
        if (otherPlayers[playerInfo.id]) {
          otherPlayers[playerInfo.id].setPosition(playerInfo.x, playerInfo.y);
        }
      });

      socket.on('newProjectile', (projectileInfo) => {
        const projectile = self.physics.add.sprite(projectileInfo.x, projectileInfo.y, 'projectile');
        const angle = Phaser.Math.Angle.Between(
          projectileInfo.x,
          projectileInfo.y,
          projectileInfo.targetX,
          projectileInfo.targetY
        );
        const speed = 400;
        self.physics.velocityFromRotation(angle, speed, projectile.body.velocity);
        projectilesGroup[projectileInfo.id] = projectile;
      });

      socket.on('removeProjectile', (id) => {
        if (projectilesGroup[id]) {
          projectilesGroup[id].destroy();
          delete projectilesGroup[id];
        }
      });

      // --- ENEMY SOCKET LISTENERS ---
      socket.on('currentEnemies', (enemies) => {
        Object.keys(enemies).forEach((id) => {
          addEnemy(self, enemies[id]);
        });
      });

      socket.on('newEnemy', (enemyInfo) => {
        addEnemy(self, enemyInfo);
      });

      socket.on('enemyUpdates', (enemies) => {
        Object.keys(enemies).forEach((id) => {
          if (enemiesGroup[id]) {
            enemiesGroup[id].setPosition(enemies[id].x, enemies[id].y);
          }
        });
      });

      socket.on('enemyDestroyed', (id) => {
        if (enemiesGroup[id]) {
          // simple death animation scaling
          self.tweens.add({
            targets: enemiesGroup[id],
            scale: 0,
            duration: 200,
            onComplete: () => {
              if(enemiesGroup[id]){
                 enemiesGroup[id].destroy();
                 delete enemiesGroup[id];
              }
            }
          });
        }
      });
      // ------------------------------

      cursors = this.input.keyboard.createCursorKeys();
      wasd = this.input.keyboard.addKeys({
        up: Phaser.Input.Keyboard.KeyCodes.W,
        down: Phaser.Input.Keyboard.KeyCodes.S,
        left: Phaser.Input.Keyboard.KeyCodes.A,
        right: Phaser.Input.Keyboard.KeyCodes.D,
      });

      this.input.on('pointerdown', (pointer) => {
        if (!localPlayer) return;

        socket.emit('shootProjectile', {
          x: localPlayer.x,
          y: localPlayer.y,
          targetX: pointer.x,
          targetY: pointer.y,
        });
      });
    }

    function update() {
      if (!localPlayer) return;

      const speed = 200;
      localPlayer.setVelocity(0);

      if (cursors.left.isDown || wasd.left.isDown) {
        localPlayer.setVelocityX(-speed);
      } else if (cursors.right.isDown || wasd.right.isDown) {
        localPlayer.setVelocityX(speed);
      }

      if (cursors.up.isDown || wasd.up.isDown) {
        localPlayer.setVelocityY(-speed);
      } else if (cursors.down.isDown || wasd.down.isDown) {
        localPlayer.setVelocityY(speed);
      }

      // Normalize diagonal movement
      localPlayer.body.velocity.normalize().scale(speed);

      // Emit movement
      const x = localPlayer.x;
      const y = localPlayer.y;
      if (
        localPlayer.oldPosition &&
        (x !== localPlayer.oldPosition.x || y !== localPlayer.oldPosition.y)
      ) {
        socket.emit('playerMovement', { x, y });
      }

      localPlayer.oldPosition = { x, y };
    }

    function addLocalPlayer(self, playerInfo) {
      localPlayer = self.physics.add.sprite(playerInfo.x, playerInfo.y, 'frog');
      localPlayer.setCollideWorldBounds(true);
    }

    function addOtherPlayer(self, playerInfo) {
      const otherPlayer = self.add.sprite(playerInfo.x, playerInfo.y, 'frog');
      otherPlayers[playerInfo.id] = otherPlayer;
    }

    function addEnemy(self, enemyInfo) {
      if(!enemiesGroup[enemyInfo.id]){
        const enemy = self.add.sprite(enemyInfo.x, enemyInfo.y, 'enemy_mushroom');
        enemiesGroup[enemyInfo.id] = enemy;
      }
    }

    return () => {
      game.destroy(true);
      socket.disconnect();
    };
  }, []);

  return <div ref={gameRef} />;
};

export default Game;
