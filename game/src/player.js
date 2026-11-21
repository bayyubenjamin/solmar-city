// player.js — Leo on foot: a simple low-poly person built from boxes,
// third-person movement relative to the camera yaw, running with Shift,
// jumping with Space, and a walk-cycle bob. Collision is a circle against
// the city's building boxes (city.collideCircle).

import * as THREE from 'three';
import { clamp, lerpAngle } from './utils.js';

const WALK_SPEED = 6;
const RUN_SPEED = 11;
const JUMP_VELOCITY = 8.5;
const GRAVITY = 24;
const PLAYER_RADIUS = 0.7;

function makePersonMesh(shirtColor, pantsColor, skinColor) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const pants = new THREE.MeshLambertMaterial({ color: pantsColor });
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const hair = new THREE.MeshLambertMaterial({ color: 0x2b2118 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.72, 0.34), shirt);
  torso.position.y = 1.12;
  torso.castShadow = true;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.38, 0.34), skin);
  head.position.y = 1.68;
  head.castShadow = true;
  g.add(head);
  const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.14, 0.36), hair);
  hairTop.position.y = 1.9;
  g.add(hairTop);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.26), pants);
  legL.position.set(-0.16, 0.36, 0);
  legL.castShadow = true;
  g.add(legL);
  const legR = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.72, 0.26), pants);
  legR.position.set(0.16, 0.36, 0);
  legR.castShadow = true;
  g.add(legR);
  const armL = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), shirt);
  armL.position.set(-0.42, 1.14, 0);
  g.add(armL);
  const armR = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.62, 0.2), shirt);
  armR.position.set(0.42, 1.14, 0);
  g.add(armR);
  return { group: g, legL, legR, armL, armR, torso };
}

/** Create Leo at a street position. */
export function createPlayer(scene, startX, startZ) {
  const parts = makePersonMesh(0xd8d8d8, 0x2e4a6b, 0xc98e6b);
  parts.group.position.set(startX, 0, startZ);
  scene.add(parts.group);
  return {
    mesh: parts.group,
    parts,
    pos: parts.group.position, // alias: the group's position vector
    heading: 0,
    vy: 0,
    onGround: true,
    moving: false,
    running: false,
    walkPhase: 0,
    speed: 0,
    radius: PLAYER_RADIUS,
    health: 100,
  };
}

/**
 * Move the player with WASD relative to camYaw. input is {f,b,l,r,run,jump}.
 * Returns nothing; mutates player.
 */
export function updatePlayer(player, input, dt, city, camYaw) {
  let ix = 0;
  let iz = 0;
  if (input.f) iz += 1;
  if (input.b) iz -= 1;
  if (input.l) ix -= 1;
  if (input.r) ix += 1;
  const len = Math.hypot(ix, iz);
  player.moving = len > 0;
  player.running = !!input.run && player.moving;

  if (player.moving) {
    ix /= len;
    iz /= len;
    // camera-relative: forward is away from the camera (camYaw)
    const sin = Math.sin(camYaw);
    const cos = Math.cos(camYaw);
    const wx = ix * cos - iz * sin;
    const wz = ix * sin + iz * cos;
    const speed = player.running ? RUN_SPEED : WALK_SPEED;
    player.pos.x += wx * speed * dt;
    player.pos.z += wz * speed * dt;
    player.speed = speed;
    const targetHeading = Math.atan2(wx, wz);
    player.heading = lerpAngle(player.heading, targetHeading, Math.min(1, dt * 12));
    player.mesh.rotation.y = player.heading;
    city.collideCircle(player.pos, player.radius);
  } else {
    player.speed = 0;
  }

  // jump + gravity; landing resets the walk cycle so the stride does not snap
  if (input.jump && player.onGround) {
    player.vy = JUMP_VELOCITY;
    player.onGround = false;
  }
  if (!player.onGround) {
    player.vy -= GRAVITY * dt;
    player.pos.y += player.vy * dt;
    if (player.pos.y <= 0) {
      player.pos.y = 0;
      player.vy = 0;
      player.onGround = true;
      player.walkPhase = 0;
    }
  }

  // walk-cycle swing + bob
  if (player.moving) {
    player.walkPhase += dt * (player.running ? 13 : 9);
    const s = Math.sin(player.walkPhase);
    player.parts.legL.rotation.x = s * 0.7;
    player.parts.legR.rotation.x = -s * 0.7;
    player.parts.armL.rotation.x = -s * 0.5;
    player.parts.armR.rotation.x = s * 0.5;
    player.parts.torso.position.y = 1.12 + Math.abs(Math.cos(player.walkPhase)) * 0.06;
  } else {
    player.parts.legL.rotation.x *= 0.8;
    player.parts.legR.rotation.x *= 0.8;
    player.parts.armL.rotation.x *= 0.8;
    player.parts.armR.rotation.x *= 0.8;
    player.parts.torso.position.y = 1.12;
  }
}

/** Teleport the player (used by missions, busted respawn, shots). */
export function teleportPlayer(player, x, z, heading = 0) {
  player.pos.set(x, 0, z);
  player.heading = heading;
  player.mesh.rotation.y = heading;
  player.vy = 0;
  player.onGround = true;
}
