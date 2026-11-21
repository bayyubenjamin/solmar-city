// main.js — SOLMAR entrypoint: renderer, lights, camera, the game loop,
// input, and the wiring between every system (city, player, cars,
// traffic, police, missions, combat, HUD, audio, shots). The state
// machine is menu -> playing <-> paused, with busted as the fail state.

import * as THREE from 'three';
import { buildCity } from './city.js';
import { createPlayer, updatePlayer, teleportPlayer } from './player.js';
import {
  createCar, drivePlayerCar, nearestCar, enterCar, exitCar, CAR_NAMES, CAR_COLORS,
} from './vehicles.js';
import { createTraffic, scarePeds } from './traffic.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { tryPunch } from './combat.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';
import { applyShot } from './shots.js';
import { mulberry32, rand, pick, clamp, lerpAngle, dist2d } from './utils.js';

const rng = mulberry32(20261121);

// ---------- renderer / scene ----------
const container = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87bfe8);
scene.fog = new THREE.Fog(0x9fc8e8, 260, 520);

const camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 900);

const hemi = new THREE.HemisphereLight(0xbfe3ff, 0x8a7a5a, 0.85);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff2d0, 2.1);
sun.position.set(140, 220, 90);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.left = -260;
sun.shadow.camera.right = 260;
sun.shadow.camera.top = 260;
sun.shadow.camera.bottom = -260;
sun.shadow.camera.far = 700;
sun.shadow.bias = -0.0004;
scene.add(sun);

// ---------- systems ----------
const city = buildCity(scene, 1);
const player = createPlayer(scene, 0, 40);
const traffic = createTraffic(scene, city, 7);
const police = createPolice(scene, city, rng);
const missions = createMissions(scene, city);
const hud = createHud();
const audio = createAudio();

// ---------- game state ----------
const G = {
  scene, camera, renderer, city, player, traffic, police, missions, hud, audio,
  state: 'menu',
  money: 0,
  camYaw: 0,
  camPitch: 0.3,
  camDist: 9,
  playerCar: null,
  parkedCars: [],
  drivers: [],
  pendingSteal: null,
  punchTimer: 0,
  punchCooldown: 0,
  damageCooldown: 0,
  saveTimer: 0,
  mission3Armed: false,
  time: 0,
};
window.__solmar = G; // debug / play-test hook

// ---------- parked cars (some with a driver to steal from) ----------
function spawnParkedCars() {
  const spots = [];
  for (let i = 0; i < 14; i++) {
    const p = city.randomStreetPos(rng);
    // park at the roadside: shift off the lane
    const vertical = Math.abs(p.x % 46) < 8;
    const x = vertical ? p.x + (rng() < 0.5 ? 4.6 : -4.6) : p.x;
    const z = vertical ? p.z : p.z + (rng() < 0.5 ? 4.6 : -4.6);
    spots.push({ x, z, heading: vertical ? (rng() < 0.5 ? 0 : Math.PI) : (rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2) });
  }
  spots.forEach((s, i) => {
    const car = createCar(scene, s.x, s.z, s.heading, {
      kind: pick(rng, ['sedan', 'sedan', 'hatch', 'truck']),
      color: pick(rng, CAR_COLORS),
      name: pick(rng, CAR_NAMES),
    });
    G.parkedCars.push(car);
    // every third parked car has a driver standing by the door
    if (i % 3 === 0) {
      const driver = makeDriver(car);
      car.driver = driver;
      G.drivers.push(driver);
    }
  });
  // mission 2 target: the orange Sunrunner near Downtown — it has a
  // driver, so taking it is a real steal (and raises your wanted level)
  const target = createCar(scene, 46, 46, Math.PI / 2, {
    kind: 'sedan', color: 0xe8862e, name: 'Sunrunner',
  });
  G.parkedCars.push(target);
  G.sunrunner = target;
  const targetDriver = makeDriver(target);
  target.driver = targetDriver;
  G.drivers.push(targetDriver);
}

function makeDriver(car) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: 0x7a5ad8 });
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.66, 0.32), shirt);
  torso.position.y = 1.08;
  g.add(torso);
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.36, 0.32),
    new THREE.MeshLambertMaterial({ color: 0xc98e6b }));
  head.position.y = 1.6;
  g.add(head);
  const leg = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.68, 0.24),
    new THREE.MeshLambertMaterial({ color: 0x2e2e2e }));
  leg.position.y = 0.34;
  g.add(leg);
  g.position.set(car.pos.x + 2.2, 0, car.pos.z);
  scene.add(g);
  return { mesh: g, pos: g.position, fleeing: false, fleeDir: null, timer: 0, car };
}

// ---------- input ----------
const keys = {};
let mouseDown = false;
let lastMouse = { x: 0, y: 0 };

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'Enter') {
    if (G.state === 'menu') startGame(false);
    else if (G.state === 'busted') respawnAfterBusted();
  }
  if (e.code === 'Escape') {
    if (G.state === 'playing') pauseGame();
    else if (G.state === 'paused') resumeGame();
  }
  if (e.code === 'KeyE' && G.state === 'playing') onEnterExitCar();
  if (e.code === 'KeyF' && G.state === 'playing') onPunch();
  if (e.code === 'KeyH' && G.state === 'playing') audio.horn();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

renderer.domElement.addEventListener('click', () => {
  if (G.state !== 'playing') return;
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  } else {
    onPunch();
  }
});
document.addEventListener('pointerlockchange', () => {
  // pointer lock is a convenience; drag-look works without it too
});
window.addEventListener('mousemove', (e) => {
  if (G.state !== 'playing') return;
  if (document.pointerLockElement === renderer.domElement) {
    G.camYaw += e.movementX * 0.0032;
    G.camPitch = clamp(G.camPitch + e.movementY * 0.0022, 0.08, 0.85);
  } else if (mouseDown) {
    G.camYaw += (e.clientX - lastMouse.x) * 0.005;
    G.camPitch = clamp(G.camPitch + (e.clientY - lastMouse.y) * 0.004, 0.08, 0.85);
  }
  lastMouse = { x: e.clientX, y: e.clientY };
});
window.addEventListener('mousedown', (e) => {
  if (e.target === renderer.domElement) mouseDown = true;
});
window.addEventListener('mouseup', () => { mouseDown = false; });
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------- menu buttons ----------
document.getElementById('btn-start').addEventListener('click', () => startGame(false));
document.getElementById('btn-continue').addEventListener('click', () => startGame(true));
document.getElementById('btn-resume').addEventListener('click', resumeGame);
document.getElementById('btn-restart').addEventListener('click', () => {
  G.money = 0;
  player.health = 100;
  police.clearWanted();
  missions.state.completedCount = 0;
  missions.state.allDone = false;
  missions.startMission(0);
  teleportPlayer(player, 0, 40, 0);
  resumeGame();
});
document.getElementById('btn-busted').addEventListener('click', respawnAfterBusted);
if (hud.hasSave()) hud.els.continueBtn.classList.remove('hidden');
else hud.els.continueBtn.classList.add('hidden');

// ---------- state changes ----------
function startGame(fromSave) {
  audio.start();
  if (fromSave) {
    const save = hud.loadGame();
    if (save) {
      G.money = save.money || 0;
      const done = Math.min(save.missionsDone || 0, 4);
      missions.state.completedCount = done;
      missions.startMission(done);
      hud.showToast('Welcome back, Leo. Progress loaded.');
    } else {
      missions.begin();
    }
  } else {
    G.money = 0;
    missions.begin();
  }
  missions.begin();
  G.state = 'playing';
  hud.hideMenus();
  hud.showToast(missions.objectiveText(), 6000);
}

function pauseGame() {
  G.state = 'paused';
  hud.showMenu('pause');
  if (document.pointerLockElement) document.exitPointerLock();
}

function resumeGame() {
  G.state = 'playing';
  hud.hideMenus();
}

function onBusted() {
  if (G.state !== 'playing') return;
  const fine = Math.min(G.money, 100 + police.wanted * 50);
  G.money -= fine;
  audio.busted();
  police.clearWanted();
  if (G.playerCar) {
    exitCar(G.playerCar, player);
    G.playerCar = null;
  }
  hud.els.bustedFine.textContent = 'Fine paid: $' + fine + ' — Mara is not happy.';
  G.state = 'busted';
  hud.showMenu('busted');
  hud.saveGame({ money: G.money, missionsDone: missions.state.completedCount });
  if (document.pointerLockElement) document.exitPointerLock();
}

function respawnAfterBusted() {
  player.health = 100;
  teleportPlayer(player, city.places.garage.x, city.places.garage.z, 0);
  G.state = 'playing';
  hud.hideMenus();
  hud.showToast('Back on your feet. Stay out of trouble, Leo.');
}

function onEnterExitCar() {
  if (G.playerCar) {
    exitCar(G.playerCar, player);
    G.playerCar = null;
    audio.setEngine(0, false);
    return;
  }
  const car = nearestCar([...G.parkedCars, ...traffic.cars], player.pos.x, player.pos.z, 4.5);
  if (!car) return;
  const stole = enterCar(car, player);
  G.playerCar = car;
  if (stole) {
    police.addWanted(1);
    G.pendingSteal = { name: car.name, color: car.color };
    hud.showToast(`You stole the ${car.name}! The police are coming.`);
    audio.horn();
  } else {
    hud.showToast(`Driving the ${car.name}.`);
  }
}

function onPunch() {
  if (G.playerCar || G.punchCooldown > 0) return;
  G.punchCooldown = 0.45;
  G.punchTimer = 0.3;
  audio.punch();
  const hits = tryPunch(player, traffic.peds, police,
    (n) => police.addWanted(n),
    () => {
      // mugging: a connected punch shakes a few dollars loose
      G.money += 5;
      audio.coin();
    });
  if (hits.length > 0) hud.showToast('You threw a punch. Someone saw that. (+$5)');
}

// ---------- per-frame updates ----------
function updateCamera(dt) {
  const target = G.playerCar ? G.playerCar.pos : player.pos;
  const targetHeading = G.playerCar ? -G.playerCar.heading : null;
  if (!G.shotLock && targetHeading !== null) {
    G.camYaw = lerpAngle(G.camYaw, targetHeading, Math.min(1, dt * 2.2));
  }
  const wantDist = G.playerCar ? 11.5 : 8.5;
  if (!G.shotLock) {
    G.camDist += (wantDist - G.camDist) * Math.min(1, dt * 3);
  }
  const hDist = Math.cos(G.camPitch) * G.camDist;
  const vDist = Math.sin(G.camPitch) * G.camDist + 1.4;
  const fx = -Math.sin(G.camYaw);
  const fz = Math.cos(G.camYaw);
  const cx = target.x + Math.sin(G.camYaw) * hDist;
  const cz = target.z - Math.cos(G.camYaw) * hDist;
  const cy = (target.y || 0) + vDist;
  camera.position.set(cx, cy, cz);
  camera.lookAt(target.x + fx * 3, (target.y || 0) + 1.6, target.z + fz * 3);
}

function updateDrivers(dt) {
  for (let i = G.drivers.length - 1; i >= 0; i--) {
    const d = G.drivers[i];
    if (!d.fleeing) continue;
    d.timer += dt;
    d.pos.x += d.fleeDir.x * 6 * dt;
    d.pos.z += d.fleeDir.z * 6 * dt;
    d.mesh.rotation.y = Math.atan2(d.fleeDir.x, d.fleeDir.z);
    if (d.timer > 6) {
      scene.remove(d.mesh);
      G.drivers.splice(i, 1);
    }
  }
}

function updatePlayerDamage(dt) {
  G.damageCooldown = Math.max(0, G.damageCooldown - dt);
  if (G.playerCar || G.damageCooldown > 0) return;
  const allCars = [...traffic.cars, ...police.cars];
  for (const car of allCars) {
    if (dist2d(car.pos.x, car.pos.z, player.pos.x, player.pos.z) < 2.2 && Math.abs(car.speed) > 3) {
      player.health -= 10;
      G.damageCooldown = 1;
      player.pos.x += Math.sin(Math.atan2(player.pos.x - car.pos.x, player.pos.z - car.pos.z)) * 2;
      player.pos.z += Math.cos(Math.atan2(player.pos.x - car.pos.x, player.pos.z - car.pos.z)) * 2;
      hud.showToast('You got hit by a car!');
      if (player.health <= 0) {
        player.health = 0;
        onBusted();
      }
      break;
    }
  }
  if (player.health < 100 && G.damageCooldown <= 0) {
    player.health = Math.min(100, player.health + 1.5 * dt);
  }
}

function gatherInput() {
  return {
    f: !!keys.KeyW || !!keys.ArrowUp,
    b: !!keys.KeyS || !!keys.ArrowDown,
    l: !!keys.KeyA,
    r: !!keys.KeyD,
    run: !!keys.ShiftLeft || !!keys.ShiftRight,
    jump: !!keys.Space,
    handbrake: !!keys.Space,
  };
}

function updateMissions(dt) {
  // the mission measures from where you are — in a car, that is the car
  const here = G.playerCar ? G.playerCar.pos : player.pos;
  const ctx = {
    x: here.x,
    z: here.z,
    inCar: !!G.playerCar,
    carName: G.playerCar ? G.playerCar.name : null,
    wanted: police.wanted,
    stolenCarName: G.pendingSteal ? G.pendingSteal.name : null,
    stolenCarColor: G.pendingSteal ? G.pendingSteal.color : null,
    addMoney: (n) => { G.money += n; },
    onStep: () => {
      hud.showToast(missions.objectiveText(), 5000);
    },
    onComplete: (def) => {
      audio.coin();
      hud.showMissionDone(`Mission complete: ${def.title} — +$${def.reward}`);
      hud.saveGame({ money: G.money, missionsDone: missions.state.completedCount });
      if (missions.state.allDone) {
        hud.showToast('All missions complete! Solmar is yours, Leo. You can keep driving.', 6000);
      }
    },
  };
  missions.update(dt, ctx);
  G.pendingSteal = null;
  // mission 3: the heat arrives the moment it starts
  if (missions.state.index === 2 && missions.state.step === 0 && police.wanted < 2) {
    police.wanted = 2;
    hud.showToast('The police spotted the swap — WANTED ★★', 5000);
  }
}

// ---------- main loop ----------
const clock = new THREE.Clock();

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  G.time += dt;

  if (G.state === 'playing') {
    const input = gatherInput();
    // camera orbit with arrow keys (mouse-free look, handy for testing)
    if (keys.ArrowLeft) G.camYaw -= dt * 2.2;
    if (keys.ArrowRight) G.camYaw += dt * 2.2;

    if (G.playerCar) {
      drivePlayerCar(G.playerCar, input, dt, city, [...traffic.cars, ...police.cars]);
      if (G.playerCar.crashed > 0.3) {
        audio.crash(1);
        scarePeds(traffic.peds, G.playerCar.pos.x, G.playerCar.pos.z, 10);
      }
      // handbrake skid screech, throttled so it does not stutter
      G.skidTimer = Math.max(0, (G.skidTimer || 0) - dt);
      if (G.playerCar.skidding && G.skidTimer <= 0) {
        audio.skid();
        G.skidTimer = 0.4;
      }
    } else {
      updatePlayer(player, input, dt, city, G.camYaw);
    }

    // punch arm swing
    G.punchCooldown = Math.max(0, G.punchCooldown - dt);
    if (G.punchTimer > 0) {
      G.punchTimer -= dt;
      player.parts.armR.rotation.x = -1.6;
    }

    traffic.update(dt, player.pos, false, G.playerCar);
    police.update(dt, player, G.playerCar, onBusted);
    updateMissions(dt);
    missions.updateBeacon(dt, G.time);
    updateDrivers(dt);
    updatePlayerDamage(dt);
    city.update(dt, G.time);

    // audio follows the world
    audio.setEngine(G.playerCar ? G.playerCar.speed : 0, !!G.playerCar);
    audio.setSiren(police.wanted > 0);

    // autosave
    G.saveTimer += dt;
    if (G.saveTimer > 25) {
      G.saveTimer = 0;
      hud.saveGame({ money: G.money, missionsDone: missions.state.completedCount });
    }

    // HUD + minimap
    hud.update({
      health: player.health,
      money: G.money,
      wanted: police.wanted,
      inCar: !!G.playerCar,
      speed: G.playerCar ? G.playerCar.speed : 0,
      running: player.running,
      objective: missions.objectiveText(),
    });
    hud.drawMinimap(city, player, G.playerCar, missions.markerPos(), police.cars, G.parkedCars);
  } else if (G.state === 'menu') {
    // slow orbit over the city behind the start screen
    G.camYaw += dt * 0.05;
    camera.position.set(Math.sin(G.camYaw) * 120, 70, Math.cos(G.camYaw) * 120 - 40);
    camera.lookAt(0, 0, 40);
    city.update(dt, G.time);
  }

  updateCamera(dt);
  renderer.render(scene, camera);
}

// ---------- boot ----------
spawnParkedCars();
const shot = applyShot(G);
if (!shot) {
  hud.showMenu('start');
  if (hud.hasSave()) hud.els.continueBtn.classList.remove('hidden');
}
loop();
