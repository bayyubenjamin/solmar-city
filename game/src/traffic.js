// traffic.js — the city's moving life: AI cars that drive the road grid
// (right-hand lanes, turning at intersections, slowing for the car ahead)
// and pedestrians who walk the sidewalks and flee from danger. Both are
// kept in small pools and respawn near the player so the streets always
// feel busy without simulating the whole map.

import * as THREE from 'three';
import { mulberry32, rand, randInt, pick, clamp, lerpAngle, dist2d } from './utils.js';
import { createCar, makeCarMesh, CAR_COLORS } from './vehicles.js';

const PED_SHIRTS = [0xd85a5a, 0x5a8fd8, 0x5ad88f, 0xd8c85a, 0x9b5ad8, 0xe8e8e8, 0x3a3a3a];

function makePedestrianMesh(rng) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: pick(rng, PED_SHIRTS) });
  const pants = new THREE.MeshLambertMaterial({ color: pick(rng, [0x2e2e2e, 0x3a4a6b, 0x6b4a2e]) });
  const skin = new THREE.MeshLambertMaterial({ color: pick(rng, [0xc98e6b, 0x8a5a3a, 0xe8b98a]) });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.66, 0.32), shirt);
  torso.position.y = 1.08;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32), skin);
  head.position.y = 1.6;
  g.add(head);
  const legL = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.24), pants);
  legL.position.set(-0.15, 0.34, 0);
  g.add(legL);
  const legR = legL.clone();
  legR.position.x = 0.15;
  g.add(legR);
  g.userData.legL = legL;
  g.userData.legR = legR;
  return g;
}

/** Create the traffic system (AI cars + pedestrians). */
export function createTraffic(scene, city, seed = 7) {
  const rng = mulberry32(seed);
  const cars = [];
  const peds = [];
  const centres = [];
  for (let i = 0; i < 11; i++) centres.push(-230 + i * 46);

  function spawnAICar(far) {
    const p = city.randomStreetPos(rng);
    const vertical = Math.abs(p.x % 46) < 8;
    const heading = vertical ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const car = createCar(scene, p.x, p.z, heading, {
      kind: pick(rng, ['sedan', 'sedan', 'hatch', 'truck']),
      color: pick(rng, CAR_COLORS),
    });
    car.ai = {
      speed: rand(rng, 7, 12),
      targetSpeed: rand(rng, 7, 12),
      vertical,
      lane: 3,
    };
    cars.push(car);
    return car;
  }

  function spawnPed() {
    const p = city.randomSidewalkPos(rng);
    const mesh = makePedestrianMesh(rng);
    mesh.position.set(p.x, 0, p.z);
    scene.add(mesh);
    const vertical = Math.abs(p.x % 46) < 12;
    const dir = rng() < 0.5 ? 1 : -1;
    const ped = {
      mesh,
      pos: mesh.position,
      heading: vertical ? (dir > 0 ? 0 : Math.PI) : (dir > 0 ? Math.PI / 2 : -Math.PI / 2),
      speed: rand(rng, 1.2, 2.2),
      vertical,
      dir,
      fleeing: false,
      fleeDir: null,
      walkPhase: rand(rng, 0, 6),
      panic: 0,
    };
    mesh.rotation.y = ped.heading;
    peds.push(ped);
    return ped;
  }

  for (let i = 0; i < 14; i++) spawnAICar();
  for (let i = 0; i < 22; i++) spawnPed();

  function turnAtIntersection(car) {
    // at an intersection, sometimes turn 90 degrees
    const onX = centres.some((c) => Math.abs(car.pos.x - c) < 4);
    const onZ = centres.some((c) => Math.abs(car.pos.z - c) < 4);
    if (onX && onZ && rng() < 0.35) {
      car.heading += (rng() < 0.5 ? 1 : -1) * (Math.PI / 2);
      car.ai.vertical = !car.ai.vertical;
    }
  }

  function updateAICar(car, dt, allCars, playerPos) {
    const ai = car.ai;
    // slow down for the car ahead on the same road
    let ahead = 99;
    for (const other of allCars) {
      if (other === car) continue;
      const dx = other.pos.x - car.pos.x;
      const dz = other.pos.z - car.pos.z;
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < 14 && side < 3) ahead = Math.min(ahead, along);
    }
    // also yield to the player's car when it cuts in front
    if (playerPos) {
      const dx = playerPos.x - car.pos.x;
      const dz = playerPos.z - car.pos.z;
      const fx = Math.sin(car.heading);
      const fz = Math.cos(car.heading);
      const along = dx * fx + dz * fz;
      const side = Math.abs(dx * fz - dz * fx);
      if (along > 0 && along < 9 && side < 3) ahead = Math.min(ahead, along);
    }
    const want = ahead < 10 ? 0 : ai.targetSpeed;
    car.speed += (want - car.speed) * Math.min(1, dt * 1.5);
    car.pos.x += Math.sin(car.heading) * car.speed * dt;
    car.pos.z += Math.cos(car.heading) * car.speed * dt;
    // keep inside the city; U-turn at the edge
    if (Math.abs(car.pos.x) > 238 || Math.abs(car.pos.z) > 238) {
      car.heading += Math.PI;
      car.ai.vertical = !car.ai.vertical;
      car.pos.x = clamp(car.pos.x, -238, 238);
      car.pos.z = clamp(car.pos.z, -238, 238);
    }
    turnAtIntersection(car);
    car.mesh.rotation.y = car.heading;
    const spin = car.speed * dt * 2.4;
    for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  }

  function updatePed(ped, dt, playerPos, danger) {
    if (ped.fleeing || ped.panic > 0) {
      const d = ped.fleeDir || { x: 1, z: 0 };
      ped.pos.x += d.x * 5.5 * dt;
      ped.pos.z += d.z * 5.5 * dt;
      ped.heading = Math.atan2(d.x, d.z);
      ped.panic = Math.max(0, ped.panic - dt);
      if (ped.panic <= 0) ped.fleeing = false;
    } else {
      const step = ped.speed * ped.dir * dt;
      if (ped.vertical) ped.pos.z += step;
      else ped.pos.x += step;
      // turn around at the block ends
      if (Math.abs(ped.pos.x) > 236 || Math.abs(ped.pos.z) > 236) ped.dir *= -1;
      // sometimes change direction at an intersection
      if (rng() < dt * 0.05) ped.dir *= -1;
      ped.heading = ped.vertical ? (ped.dir > 0 ? 0 : Math.PI) : (ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    }
    city.collideCircle(ped.pos, 0.6);
    ped.mesh.rotation.y = ped.heading;
    ped.walkPhase += dt * (ped.fleeing ? 14 : 8);
    const s = Math.sin(ped.walkPhase);
    ped.mesh.userData.legL.rotation.x = s * 0.6;
    ped.mesh.userData.legR.rotation.x = -s * 0.6;
    // flee when the player is close and dangerous (punching / speeding car)
    if (danger && dist2d(ped.pos.x, ped.pos.z, playerPos.x, playerPos.z) < 7) {
      ped.fleeing = true;
      ped.panic = 2.5;
      const a = Math.atan2(ped.pos.x - playerPos.x, ped.pos.z - playerPos.z);
      ped.fleeDir = { x: Math.sin(a), z: Math.cos(a) };
    }
  }

  return {
    cars,
    peds,
    spawnAICar,
    spawnPed,
    update(dt, playerPos, danger, playerCar) {
      const allCars = [...cars];
      if (playerCar) allCars.push(playerCar);
      for (const car of cars) updateAICar(car, dt, allCars, playerPos);
      for (const ped of peds) updatePed(ped, dt, playerPos, danger);
      // respawn traffic far from the player so streets stay busy
      for (const car of cars) {
        if (dist2d(car.pos.x, car.pos.z, playerPos.x, playerPos.z) > 260) {
          const p = city.randomStreetPos(rng);
          car.pos.set(p.x, 0, p.z);
        }
      }
      for (const ped of peds) {
        if (dist2d(ped.pos.x, ped.pos.z, playerPos.x, playerPos.z) > 200) {
          const p = city.randomSidewalkPos(rng);
          ped.pos.set(p.x, 0, p.z);
          ped.fleeing = false;
          ped.panic = 0;
        }
      }
    },
  };
}

/** Make every nearby pedestrian panic (used after a punch / crash). */
export function scarePeds(peds, x, z, radius) {
  for (const ped of peds) {
    if (dist2d(ped.pos.x, ped.pos.z, x, z) < radius) {
      ped.fleeing = true;
      ped.panic = 3;
      const a = Math.atan2(ped.pos.x - x, ped.pos.z - z);
      ped.fleeDir = { x: Math.sin(a), z: Math.cos(a) };
    }
  }
}
