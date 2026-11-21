// vehicles.js — cars: procedural low-poly models (sedan, hatchback, truck,
// police), simple arcade driving physics, and the enter / exit / steal
// interaction the player uses with E. A car is a THREE.Group with a
// heading, speed and steering angle; physics are circle-vs-building and
// circle-vs-car, no external physics library.

import * as THREE from 'three';
import { clamp, lerpAngle, dist2d } from './utils.js';

export const CAR_NAMES = ['Comet', 'Vulture', 'Sunrunner', 'Harbor', 'Dune', 'Marlin'];
export const CAR_COLORS = [0xc23b2e, 0x2e6fc2, 0xe8c832, 0x3aa655, 0xdddddd, 0x222222, 0xc27ba0, 0xe8862e];

/** Build a car mesh. kind: 'sedan' | 'hatch' | 'truck' | 'police'. */
export function makeCarMesh(color, kind = 'sedan') {
  const g = new THREE.Group();
  const paint = new THREE.MeshLambertMaterial({ color });
  const dark = new THREE.MeshLambertMaterial({ color: 0x1c2733 });
  const tyre = new THREE.MeshLambertMaterial({ color: 0x141414 });

  const long = kind === 'truck' ? 5.2 : kind === 'hatch' ? 3.6 : 4.4;
  const wide = 2.0;
  const body = new THREE.Mesh(new THREE.BoxGeometry(wide, 0.62, long), paint);
  body.position.y = 0.55;
  body.castShadow = true;
  g.add(body);
  const cabinLen = kind === 'truck' ? 1.6 : long * 0.42;
  const cabinZ = kind === 'truck' ? long / 2 - 1.2 : -0.2;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(wide * 0.86, 0.58, cabinLen), dark);
  cabin.position.set(0, 1.12, cabinZ);
  cabin.castShadow = true;
  g.add(cabin);
  if (kind === 'truck') {
    const bed = new THREE.Mesh(new THREE.BoxGeometry(wide * 0.92, 0.5, 2.2), paint);
    bed.position.set(0, 0.95, -1.2);
    g.add(bed);
  }
  // headlights + taillights
  const lightMat = new THREE.MeshLambertMaterial({ color: 0xfff6c0, emissive: 0x555533 });
  for (const sx of [-0.7, 0.7]) {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.18, 0.08), lightMat);
    hl.position.set(sx, 0.6, long / 2);
    g.add(hl);
  }
  const tailMat = new THREE.MeshLambertMaterial({ color: 0xaa1111, emissive: 0x330000 });
  for (const sx of [-0.7, 0.7]) {
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.16, 0.08), tailMat);
    tl.position.set(sx, 0.6, -long / 2);
    g.add(tl);
    // brake glow is driven by tail material emissive in main loop
    tl.userData.isTail = true;
  }
  // wheels
  const wheelGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.28, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const wheels = [];
  for (const [wx, wz] of [[-0.95, long / 2 - 0.9], [0.95, long / 2 - 0.9], [-0.95, -long / 2 + 0.9], [0.95, -long / 2 + 0.9]]) {
    const w = new THREE.Mesh(wheelGeo, tyre);
    w.position.set(wx, 0.36, wz);
    w.castShadow = true;
    g.add(w);
    wheels.push(w);
  }
  if (kind === 'police') {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x223344 }));
    bar.position.set(0, 1.55, -0.2);
    g.add(bar);
    const red = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.4),
      new THREE.MeshLambertMaterial({ color: 0xff2222, emissive: 0x881111 }));
    red.position.set(-0.28, 1.68, -0.2);
    g.add(red);
    const blue = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.4),
      new THREE.MeshLambertMaterial({ color: 0x2244ff, emissive: 0x111188 }));
    blue.position.set(0.28, 1.68, -0.2);
    g.add(blue);
    g.userData.lightRed = red;
    g.userData.lightBlue = blue;
  }
  g.userData.wheels = wheels;
  g.userData.length = long;
  g.userData.width = wide;
  return g;
}

/** Create a car entity and add it to the scene. */
export function createCar(scene, x, z, heading, opts = {}) {
  const kind = opts.kind || 'sedan';
  const color = opts.color ?? 0xdddddd;
  const mesh = makeCarMesh(color, kind);
  mesh.position.set(x, 0, z);
  mesh.rotation.y = heading;
  scene.add(mesh);
  const car = {
    mesh,
    pos: mesh.position,
    heading,
    speed: 0,
    steer: 0,
    kind,
    color,
    name: opts.name || 'Comet',
    driver: opts.driver || null, // a person object when occupied
    isPlayer: false,
    isPolice: kind === 'police',
    radius: 1.9,
    maxSpeed: kind === 'police' ? 34 : kind === 'truck' ? 24 : 30,
    accel: kind === 'truck' ? 10 : 14,
    braking: false,
    crashed: 0, // crash flash timer
  };
  return car;
}

/** Arcade driving for the player's car. input: {f,b,l,r,handbrake}. */
export function drivePlayerCar(car, input, dt, city, otherCars) {
  const forward = input.f ? 1 : 0;
  const back = input.b ? 1 : 0;
  if (forward) car.speed += car.accel * dt;
  if (back) {
    car.speed -= (car.speed > 0.5 ? car.accel * 1.4 : car.accel * 0.6) * dt;
  }
  if (!forward && !back) {
    car.speed -= car.speed * 1.2 * dt;
    if (Math.abs(car.speed) < 0.1) car.speed = 0;
  }
  car.speed = clamp(car.speed, -10, car.maxSpeed);
  const steerTarget = (input.l ? 1 : 0) - (input.r ? 1 : 0);
  const steerMax = 0.55;
  car.steer += (steerTarget * steerMax - car.steer) * Math.min(1, dt * 8);
  const grip = input.handbrake ? 0.35 : 1;
  if (Math.abs(car.speed) > 0.5) {
    car.heading += (car.steer * car.speed * 0.055 * grip) * dt * (car.speed >= 0 ? 1 : -1);
  }
  if (input.handbrake && Math.abs(car.speed) > 8) {
    car.speed -= car.speed * 2.2 * dt;
  }
  car.braking = back || input.handbrake;
  // handbrake at speed = a skid: less grip, more slide, tyre screech
  car.skidding = !!input.handbrake && Math.abs(car.speed) > 8;
  const nx = car.pos.x + Math.sin(car.heading) * car.speed * dt;
  const nz = car.pos.z + Math.cos(car.heading) * car.speed * dt;
  car.pos.x = nx;
  car.pos.z = nz;
  // building + bounds collision: stop and bounce a little
  if (city.collideCircle(car.pos, car.radius)) {
    if (Math.abs(car.speed) > 6) car.crashed = 0.4;
    car.speed *= -0.25;
  }
  // car-vs-car soft collision
  for (const other of otherCars) {
    if (other === car) continue;
    const d = dist2d(car.pos.x, car.pos.z, other.pos.x, other.pos.z);
    const min = car.radius + other.radius - 0.4;
    if (d < min && d > 0.01) {
      const push = (min - d) / 2;
      const ux = (car.pos.x - other.pos.x) / d;
      const uz = (car.pos.z - other.pos.z) / d;
      car.pos.x += ux * push;
      car.pos.z += uz * push;
      other.pos.x -= ux * push;
      other.pos.z -= uz * push;
      if (Math.abs(car.speed) > 5) car.crashed = 0.35;
      car.speed *= 0.6;
      if (other.speed !== undefined) other.speed *= 0.7;
    }
  }
  car.mesh.rotation.y = car.heading;
  // spin wheels, flash brake lights
  const spin = car.speed * dt * 2.4;
  for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
  car.mesh.traverse((o) => {
    if (o.userData && o.userData.isTail) {
      o.material.emissive.setHex(car.braking ? 0xcc0000 : 0x330000);
    }
  });
  if (car.crashed > 0) car.crashed -= dt;
}

/** Nearest car within range of a point (for E to enter). */
export function nearestCar(cars, x, z, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const car of cars) {
    const d = dist2d(x, z, car.pos.x, car.pos.z);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** Steal / enter a car: if it has a driver, the driver flees on foot. */
export function enterCar(car, player) {
  let stole = false;
  if (car.driver) {
    stole = true;
    const driver = car.driver;
    car.driver = null;
    // driver climbs out and runs away from the car
    if (driver && driver.pos) {
      const a = Math.atan2(driver.pos.x - car.pos.x, driver.pos.z - car.pos.z);
      driver.fleeing = true;
      driver.fleeDir = { x: Math.sin(a), z: Math.cos(a) };
    }
  }
  car.isPlayer = true;
  player.inCar = car;
  player.mesh.visible = false;
  return stole;
}

/** Climb out of the player's car, stepping to its side. */
export function exitCar(car, player) {
  car.isPlayer = false;
  car.speed = 0;
  player.inCar = null;
  const side = Math.cos(car.heading);
  const fwd = Math.sin(car.heading);
  player.pos.set(car.pos.x + side * 2.2, 0, car.pos.z - fwd * 2.2);
  player.mesh.visible = true;
  player.heading = car.heading;
  player.mesh.rotation.y = car.heading;
}
