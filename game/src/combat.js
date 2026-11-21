// combat.js — bare-knuckle punching. F or left click swings in front of
// Leo; a pedestrian or police officer caught in the arc is knocked back
// and falls, and the crowd panics. Hitting a cop is a crime.

import * as THREE from 'three';
import { dist2d } from './utils.js';
import { scarePeds } from './traffic.js';

const PUNCH_RANGE = 2.6;
const PUNCH_ARC = 1.1; // radians either side of the facing direction

/** Swing a punch. Returns the list of pedestrians hit. onHit fires per
 *  victim (used for the mugging payout); onCrime fires once per swing
 *  that connects, so the wanted level rises once, not per victim. */
export function tryPunch(player, peds, police, onCrime, onHit) {
  const hits = [];
  const fx = Math.sin(player.heading);
  const fz = Math.cos(player.heading);
  for (const ped of peds) {
    const dx = ped.pos.x - player.pos.x;
    const dz = ped.pos.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > PUNCH_RANGE) continue;
    const dot = (dx * fx + dz * fz) / (d || 1);
    if (dot < Math.cos(PUNCH_ARC)) continue;
    // knockback + fall
    ped.pos.x += dx * 1.4;
    ped.pos.z += dz * 1.4;
    ped.mesh.rotation.x = -1.2;
    ped.fleeing = true;
    ped.panic = 4;
    const a = Math.atan2(dx, dz);
    ped.fleeDir = { x: Math.sin(a), z: Math.cos(a) };
    setTimeout(() => { ped.mesh.rotation.x = 0; }, 900);
    hits.push(ped);
    if (onHit) onHit(ped);
  }
  if (hits.length > 0) {
    scarePeds(peds, player.pos.x, player.pos.z, 14);
    if (onCrime) onCrime(1);
  }
  // punching a police car does nothing; punching near one counts as a crime
  if (police && onCrime) {
    for (const car of police.cars) {
      if (dist2d(car.pos.x, car.pos.z, player.pos.x, player.pos.z) < 12) {
        onCrime(1);
        break;
      }
    }
  }
  return hits;
}
