// police.js — the wanted system and the Solmar police. Crimes raise the
// wanted level (0–5 stars); the police send one patrol car per star, and
// those cars chase and ram the player. Get caught on foot, or boxed in
// while your car is stopped, and you are BUSTED. Stay clean and out of
// sight and the heat slowly cools off.

import * as THREE from 'three';
import { clamp, lerpAngle, dist2d } from './utils.js';
import { createCar } from './vehicles.js';

const MAX_WANTED = 5;

/** Create the police system. */
export function createPolice(scene, city, rng) {
  const cars = [];
  let wanted = 0;
  let bustTimer = 0;
  let cooldown = 0;
  let flash = 0;

  function spawnPoliceCar(playerPos) {
    const angle = rng() * Math.PI * 2;
    const x = playerPos.x + Math.sin(angle) * 55;
    const z = playerPos.z + Math.cos(angle) * 55;
    const car = createCar(scene, clamp(x, -230, 230), clamp(z, -230, 230), angle, {
      kind: 'police',
      color: 0x1c2733,
      name: 'Interceptor',
    });
    car.police = { stuck: 0 };
    cars.push(car);
    return car;
  }

  function wantedTargetCount() {
    return wanted;
  }

  return {
    cars,
    get wanted() {
      return wanted;
    },
    set wanted(v) {
      wanted = clamp(Math.round(v), 0, MAX_WANTED);
    },
    addWanted(n) {
      wanted = clamp(wanted + n, 0, MAX_WANTED);
      cooldown = 4; // fresh crime: no decay for a few seconds
    },
    clearWanted() {
      wanted = 0;
      bustTimer = 0;
    },
    update(dt, player, playerCar, onBusted) {
      cooldown = Math.max(0, cooldown - dt);
      flash += dt;
      // keep one patrol car per wanted star
      const want = wantedTargetCount();
      while (cars.length < want) spawnPoliceCar(player.pos);
      while (cars.length > want) {
        const car = cars.pop();
        car.mesh.visible = false;
        scene.remove(car.mesh);
      }
      // chase: steer toward the player, ram when close
      const target = playerCar || null;
      const tx = player.pos.x;
      const tz = player.pos.z;
      for (const car of cars) {
        const d = dist2d(car.pos.x, car.pos.z, tx, tz);
        // a patrol car that fell far behind respawns closer so the chase
        // never stalls on the far side of the city
        if (d > 130) {
          const a = Math.atan2(tx - car.pos.x, tz - car.pos.z) + Math.PI;
          car.pos.set(tx + Math.sin(a) * 60, 0, tz + Math.cos(a) * 60);
          car.speed = 12;
        }
        const desired = Math.atan2(tx - car.pos.x, tz - car.pos.z);
        car.heading = lerpAngle(car.heading, desired, Math.min(1, dt * 2.2));
        // on foot and caught: the patrol car stops and holds the player
        // instead of overshooting, so the bust timer fills reliably
        const speedTarget = !playerCar && d < 3 ? 0 : d > 12 ? 30 : 20;
        car.speed += (speedTarget - car.speed) * Math.min(1, dt * 1.2);
        car.pos.x += Math.sin(car.heading) * car.speed * dt;
        car.pos.z += Math.cos(car.heading) * car.speed * dt;
        if (city.collideCircle(car.pos, car.radius)) car.speed *= 0.5;
        car.mesh.rotation.y = car.heading;
        const spin = car.speed * dt * 2.4;
        for (const w of car.mesh.userData.wheels) w.rotation.x += spin;
        // flashing light bar
        const on = Math.floor(flash * 6) % 2 === 0;
        if (car.mesh.userData.lightRed) {
          car.mesh.userData.lightRed.material.emissive.setHex(on ? 0xff1111 : 0x220000);
          car.mesh.userData.lightBlue.material.emissive.setHex(on ? 0x111122 : 0x2233ff);
        }
        // ram the player's car
        if (playerCar && d < 4.5) {
          playerCar.speed *= 0.82;
          car.speed *= 0.9;
          if (Math.abs(playerCar.speed) < 1.5 && d < 4) {
            bustTimer += dt;
          } else {
            bustTimer = Math.max(0, bustTimer - dt * 2);
          }
        }
        // catch the player on foot
        if (!playerCar && d < 2.6) {
          bustTimer += dt * 1.6;
        }
      }
      if (cars.length === 0) bustTimer = Math.max(0, bustTimer - dt);
      if (bustTimer > 2.2) {
        bustTimer = 0;
        onBusted();
      }
      // wanted slowly cools off when clean and far from every patrol car
      if (wanted > 0 && cooldown <= 0) {
        let nearest = 999;
        for (const car of cars) {
          nearest = Math.min(nearest, dist2d(car.pos.x, car.pos.z, tx, tz));
        }
        if (nearest > 70) {
          this._decay = (this._decay || 0) + dt;
          if (this._decay > 9) {
            wanted = Math.max(0, wanted - 1);
            this._decay = 0;
          }
        } else {
          this._decay = 0;
        }
      }
    },
  };
}
