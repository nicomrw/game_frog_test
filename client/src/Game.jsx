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

    function preload() {
      // Create a green texture for the player
      const graphics = this.add.graphics();
      graphics.fillStyle(0x00ff00, 1);
      graphics.fillRect(0, 0, 32, 32);
      graphics.generateTexture('frog', 32, 32);
      graphics.destroy();

      // Create a yellow texture for the projectile
      const projGraphics = this.add.graphics();
      projGraphics.fillStyle(0xffff00, 1);
      projGraphics.fillRect(0, 0, 8, 8);
      projGraphics.generateTexture('projectile', 8, 8);
      projGraphics.destroy();
    }

    function create() {
      const self = this;
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
      // Optional: Add color tint based on playerInfo.color if needed
      // localPlayer.setTint(parseInt('0x' + playerInfo.color));
    }

    function addOtherPlayer(self, playerInfo) {
      const otherPlayer = self.add.sprite(playerInfo.x, playerInfo.y, 'frog');
      // otherPlayer.setTint(parseInt('0x' + playerInfo.color));
      otherPlayers[playerInfo.id] = otherPlayer;
    }

    return () => {
      game.destroy(true);
      socket.disconnect();
    };
  }, []);

  return <div ref={gameRef} />;
};

export default Game;
