// shots.js — deterministic screenshot scenes. Reads ?shot=drive|chase|
// mission|city (and &seed=) and places the player, cars, police and the
// mission marker at fixed spots, starts the game immediately (no start
// menu), and frames the camera — so the same URL always renders the
// same picture and the screenshots can be retaken exactly.

import { teleportPlayer } from './player.js';
import { createCar, enterCar } from './vehicles.js';
import { queryParam } from './utils.js';

/** The four named shots and what each one stages. */
export const SHOT_NAMES = ['drive', 'chase', 'mission', 'city'];

/**
 * Apply a ?shot= scene. G is the game object from main.js.
 * Returns the shot name, or null when no ?shot= was given.
 */
export function applyShot(G) {
  const shot = queryParam('shot');
  if (!shot) return null;
  const seed = Number(queryParam('seed') || 1);
  void seed;
  const { scene, city, player, missions, police, traffic } = G;

  // common: game is already playing, HUD on, start menu hidden.
  // The shot owns the camera: lock yaw / distance / pitch so the
  // chase-cam and follow-cam lerps in main.js do not reframe it.
  G.state = 'playing';
  G.shotLock = true;
  G.hud.hideMenus();
  G.audio.start();

  if (shot === 'drive') {
    // Leo driving his Comet down the main avenue, traffic around him
    const car = createCar(scene, 0, 60, 0, { kind: 'sedan', color: 0xc23b2e, name: 'Comet' });
    G.parkedCars.push(car);
    enterCar(car, player);
    car.speed = 16;
    G.playerCar = car;
    G.camYaw = 0;
    G.camPitch = 0.32;
    G.camDist = 11;
    missions.begin();
    G.hud.showToast('SOLMAR — drive the avenue. E to exit, Shift to run on foot.');
  } else if (shot === 'chase') {
    // wanted 3: Leo flees south-to-north down the avenue, police on his
    // tail behind him, camera ahead looking back at the chase
    const car = createCar(scene, 0, 40, Math.PI, { kind: 'sedan', color: 0x2e6fc2, name: 'Vulture' });
    G.parkedCars.push(car);
    enterCar(car, player);
    car.speed = 20;
    G.playerCar = car;
    police.wanted = 3;
    police.update(0.01, player, car, () => {});
    // patrol cars behind, chasing in the same direction
    if (police.cars[0]) {
      police.cars[0].pos.set(-3, 0, 64);
      police.cars[0].heading = Math.PI;
    }
    if (police.cars[1]) {
      police.cars[1].pos.set(4, 0, 78);
      police.cars[1].heading = Math.PI;
    }
    G.camYaw = 0;
    G.camPitch = 0.3;
    G.camDist = 14;
    missions.begin();
    G.hud.showToast('WANTED ★★★ — lose the police!');
  } else if (shot === 'mission') {
    // Leo on foot at the Marina marker, beacon in frame beyond him
    teleportPlayer(player, 218, 50, Math.PI / 4);
    missions.begin();
    G.camYaw = -Math.PI / 4;
    G.camPitch = 0.3;
    G.camDist = 11;
    // a couple of pedestrians nearby for life
    G.hud.showToast('Mission 1: First Delivery — reach the yellow marker.');
  } else if (shot === 'city') {
    // wide view from the beach looking north over the whole skyline:
    // sand in the foreground, then the beach road, then Downtown towers
    teleportPlayer(player, 0, 222, Math.PI);
    missions.begin();
    G.camYaw = Math.PI;
    G.camPitch = 0.6;
    G.camDist = 55;
    G.hud.showToast('Solmar City — five districts, one sun.');
  } else {
    return null;
  }
  return shot;
}
