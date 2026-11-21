// city.js — builds Solmar City, a procedural sun-soaked coastal city.
// A seeded generator draws the ground (roads, sidewalks, beach) onto one
// big canvas texture, raises varied buildings with window facades, plants
// palms and street lamps, and lays a sea plane along the south edge. It
// also owns the collision boxes and the road helpers the other systems
// (traffic, missions, police) use to stay on the streets.

import * as THREE from 'three';
import { mulberry32, rand, randInt, pick, clamp } from './utils.js';

export const ROAD_SPACING = 46;
export const ROAD_HALF = 6;
export const ROAD_COUNT = 11; // roads at -230 .. +230
export const CITY_HALF = 230;
export const BEACH_Z = 244; // sand starts here (south edge)
export const SEA_Z = 292; // water starts here
export const WORLD = { minX: -248, maxX: 248, minZ: -248, maxZ: 288 };

/** Road centre coordinates, both axes share the same grid. */
export function roadCentres() {
  const out = [];
  for (let i = 0; i < ROAD_COUNT; i++) out.push(-CITY_HALF + i * ROAD_SPACING);
  return out;
}

function makeFacadeTexture(rng, style) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 256);
  const cols = style === 0 ? 4 : style === 1 ? 6 : 3;
  const rows = style === 0 ? 10 : style === 1 ? 14 : 6;
  const cw = 128 / cols;
  const ch = 256 / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng() < 0.35;
      g.fillStyle = lit ? '#ffe9a8' : '#2c3e50';
      g.fillRect(x * cw + 4, y * ch + 5, cw - 8, ch - 10);
    }
  }
  // ground-floor shopfront band
  g.fillStyle = '#222831';
  g.fillRect(0, 256 - 22, 128, 22);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeGroundTexture() {
  const S = 2048;
  const c = document.createElement('canvas');
  c.width = S;
  c.height = S;
  const g = c.getContext('2d');
  // World mapping: x in [-300, 300], z in [-240, 360] -> canvas.
  const wx = (x) => ((x + 300) / 600) * S;
  const wz = (z) => ((z + 240) / 600) * S;
  const sx = (w) => (w / 600) * S;

  // base: warm concrete / dry grass
  g.fillStyle = '#8fa07f';
  g.fillRect(0, 0, S, S);
  // beach sand
  g.fillStyle = '#e9d8a6';
  g.fillRect(0, wz(BEACH_Z), S, wz(SEA_Z) - wz(BEACH_Z));
  // sea floor tint under the water plane
  g.fillStyle = '#2e7f9e';
  g.fillRect(0, wz(SEA_Z), S, S - wz(SEA_Z));

  const centres = roadCentres();
  // blocks (sidewalk slabs)
  g.fillStyle = '#b9b3a4';
  for (let i = 0; i < centres.length - 1; i++) {
    for (let j = 0; j < centres.length - 1; j++) {
      const x0 = centres[i] + ROAD_HALF + 2;
      const z0 = centres[j] + ROAD_HALF + 2;
      const w = ROAD_SPACING - 2 * (ROAD_HALF + 2);
      g.fillRect(wx(x0), wz(z0), sx(w), sx(w));
    }
  }
  // asphalt roads
  g.fillStyle = '#3c4148';
  for (const x of centres) {
    g.fillRect(wx(x - ROAD_HALF), 0, sx(ROAD_HALF * 2), S);
  }
  for (const z of centres) {
    g.fillRect(0, wz(z - ROAD_HALF), S, sx(ROAD_HALF * 2));
  }
  // centre dashes
  g.fillStyle = '#f5c542';
  for (const x of centres) {
    for (let z = -CITY_HALF; z < CITY_HALF; z += 12) {
      g.fillRect(wx(x) - 2, wz(z), 4, sx(6));
    }
  }
  for (const z of centres) {
    for (let x = -CITY_HALF; x < CITY_HALF; x += 12) {
      g.fillRect(wx(x), wz(z) - 2, sx(6), 4);
    }
  }
  // crosswalks: white stripes across each approach of every intersection
  g.fillStyle = '#e8e8e8';
  for (const x of centres) {
    for (const z of centres) {
      for (let k = -2; k <= 2; k++) {
        const off = k * 2.4;
        // stripes across the north-south road (above and below the crossing)
        g.fillRect(wx(x + off) - 1.6, wz(z - ROAD_HALF - 3.4), 3.2, sx(3.2));
        g.fillRect(wx(x + off) - 1.6, wz(z + ROAD_HALF + 0.2), 3.2, sx(3.2));
        // stripes across the east-west road (left and right of the crossing)
        g.fillRect(wx(x - ROAD_HALF - 3.4), wz(z + off) - 1.6, sx(3.2), 3.2);
        g.fillRect(wx(x + ROAD_HALF + 0.2), wz(z + off) - 1.6, sx(3.2), 3.2);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function makePalm(rng) {
  const group = new THREE.Group();
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6b48 });
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.38, 6, 6), trunkMat);
  trunk.position.y = 3;
  trunk.rotation.z = rand(rng, -0.08, 0.08);
  group.add(trunk);
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x2f8f4e });
  for (let i = 0; i < 6; i++) {
    const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.7, 3.4, 4), leafMat);
    const a = (i / 6) * Math.PI * 2;
    leaf.position.set(Math.cos(a) * 1.1, 6.4, Math.sin(a) * 1.1);
    leaf.rotation.z = Math.cos(a) * 1.1;
    leaf.rotation.x = -Math.sin(a) * 1.1;
    leaf.scale.set(1, 1, 0.28);
    group.add(leaf);
  }
  const nut = new THREE.Mesh(
    new THREE.SphereGeometry(0.4, 8, 6),
    new THREE.MeshLambertMaterial({ color: 0x6b4e2e })
  );
  nut.position.y = 6.1;
  group.add(nut);
  return group;
}

/** Build the whole city into the scene. Returns the city object. */
export function buildCity(scene, seed = 1) {
  const rng = mulberry32(seed);
  const group = new THREE.Group();
  scene.add(group);
  const colliders = [];

  // --- ground ---
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(600, 600),
    new THREE.MeshLambertMaterial({ map: makeGroundTexture() })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, 0, 60);
  ground.receiveShadow = true;
  group.add(ground);

  // --- sea (animated in update) ---
  const seaMat = new THREE.MeshLambertMaterial({
    color: 0x2a7fa8,
    transparent: true,
    opacity: 0.92,
  });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 90), seaMat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(0, 0.4, SEA_Z + 45);
  group.add(sea);

  // --- buildings ---
  const facades = [makeFacadeTexture(rng, 0), makeFacadeTexture(rng, 1), makeFacadeTexture(rng, 2)];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x4a4a52 });
  const centres = roadCentres();
  const paletteDowntown = [0xd8c9b0, 0xb9c4cc, 0xc9b8a8, 0xa8b8c9, 0xd0d0d0];
  const paletteOld = [0xe8a34c, 0xdd6b5e, 0x5ea88f, 0xe8d44c, 0x7fb3d5, 0xc97ba8];
  const paletteHills = [0xe8dcc0, 0xd8c8a8, 0xc8b89a, 0xe0d0b8];
  let buildingCount = 0;

  for (let i = 0; i < centres.length - 1; i++) {
    for (let j = 0; j < centres.length - 1; j++) {
      const x0 = centres[i] + ROAD_HALF + 2;
      const z0 = centres[j] + ROAD_HALF + 2;
      const size = ROAD_SPACING - 2 * (ROAD_HALF + 2); // ~30
      const cx = x0 + size / 2;
      const cz = z0 + size / 2;
      const distCentre = Math.sqrt(cx * cx + cz * cz);
      const isPark = rng() < 0.1;
      if (isPark) {
        // small park: green slab + a couple of palms
        const park = new THREE.Mesh(
          new THREE.BoxGeometry(size * 0.9, 0.3, size * 0.9),
          new THREE.MeshLambertMaterial({ color: 0x5d8a4a })
        );
        park.position.set(cx, 0.15, cz);
        group.add(park);
        const p1 = makePalm(rng);
        p1.position.set(cx - 8, 0.3, cz - 6);
        group.add(p1);
        const p2 = makePalm(rng);
        p2.position.set(cx + 9, 0.3, cz + 7);
        group.add(p2);
        continue;
      }
      const downtown = distCentre < 90;
      const oldTown = cx < -120;
      const hills = cz < -150;
      let h;
      let palette;
      if (downtown) {
        h = rand(rng, 26, 78);
        palette = paletteDowntown;
      } else if (oldTown) {
        h = rand(rng, 8, 18);
        palette = paletteOld;
      } else if (hills) {
        h = rand(rng, 6, 12);
        palette = paletteHills;
      } else {
        h = rand(rng, 10, 30);
        palette = paletteDowntown;
      }
      const w = rand(rng, size * 0.55, size * 0.85);
      const d = rand(rng, size * 0.55, size * 0.85);
      const tint = pick(rng, palette);
      const facade = pick(rng, facades);
      const sideMat = new THREE.MeshLambertMaterial({ map: facade, color: tint });
      const mats = [sideMat, sideMat, roofMat, roofMat, sideMat, sideMat];
      const b = new THREE.Mesh(boxGeo, mats);
      b.scale.set(w, h, d);
      b.position.set(cx, h / 2, cz);
      b.castShadow = true;
      b.receiveShadow = true;
      group.add(b);
      // rooftop box (AC / penthouse)
      if (h > 20 && rng() < 0.6) {
        const top = new THREE.Mesh(
          new THREE.BoxGeometry(w * 0.3, 2.4, d * 0.3),
          new THREE.MeshLambertMaterial({ color: 0x6a6a72 })
        );
        top.position.set(cx + rand(rng, -3, 3), h + 1.2, cz + rand(rng, -3, 3));
        group.add(top);
      }
      colliders.push({ minX: cx - w / 2, maxX: cx + w / 2, minZ: cz - d / 2, maxZ: cz + d / 2 });
      buildingCount++;
    }
  }

  // --- palms along the beachfront and a few avenues ---
  for (let x = -220; x <= 220; x += 18) {
    if (rng() < 0.85) {
      const palm = makePalm(rng);
      palm.position.set(x + rand(rng, -3, 3), 0, BEACH_Z + rand(rng, 4, 14));
      group.add(palm);
    }
  }
  for (let z = -220; z <= 200; z += 34) {
    const palm = makePalm(rng);
    palm.position.set(-CITY_HALF - 10, 0, z);
    group.add(palm);
  }

  // --- street lamps at intersections (simple, emissive tip) ---
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x2e3138 });
  const lampMat = new THREE.MeshLambertMaterial({ color: 0xfff2b0, emissive: 0x776622 });
  const poleGeo = new THREE.CylinderGeometry(0.12, 0.16, 7, 6);
  const tipGeo = new THREE.SphereGeometry(0.45, 8, 6);
  for (const x of centres) {
    for (const z of centres) {
      if ((x + z) % 92 !== 0) continue;
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(x + ROAD_HALF + 1.4, 3.5, z + ROAD_HALF + 1.4);
      group.add(pole);
      const tip = new THREE.Mesh(tipGeo, lampMat);
      tip.position.set(x + ROAD_HALF + 1.4, 7.1, z + ROAD_HALF + 1.4);
      group.add(tip);
    }
  }

  // --- marina: a pier and two boats near the east edge ---
  const pier = new THREE.Mesh(
    new THREE.BoxGeometry(8, 1, 60),
    new THREE.MeshLambertMaterial({ color: 0x8a6b48 })
  );
  pier.position.set(236, 0.5, 60);
  group.add(pier);
  const boatMat = new THREE.MeshLambertMaterial({ color: 0xe8e8e8 });
  for (const [bx, bz, s] of [[244, 40, 1], [244, 84, 0.8]]) {
    const boat = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4 * s, 1.4, 12 * s), boatMat);
    hull.position.y = 0.7;
    boat.add(hull);
    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(2.6 * s, 1.6, 4 * s),
      new THREE.MeshLambertMaterial({ color: 0x3a6ea8 })
    );
    cabin.position.set(0, 2, -1);
    boat.add(cabin);
    boat.position.set(bx, 0.2, bz);
    boat.rotation.y = 0.2;
    group.add(boat);
  }

  // named places the missions use
  const places = {
    marina: { x: 228, z: 60 },
    garage: { x: -138, z: -92 }, // Mara's garage, Old Town
    beachfront: { x: 46, z: 226 },
    downtown: { x: 0, z: 0 },
    hills: { x: -92, z: -184 },
  };

  // --- collision helpers ---
  function collideCircle(pos, radius) {
    // pos is a THREE.Vector3 (uses x,z). Pushes it out of building boxes
    // and the world bounds. Returns true when a collision happened.
    let hit = false;
    for (const b of colliders) {
      const cx = clamp(pos.x, b.minX, b.maxX);
      const cz = clamp(pos.z, b.minZ, b.maxZ);
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < radius * radius) {
        if (d2 > 0.0001) {
          const d = Math.sqrt(d2);
          pos.x = cx + (dx / d) * radius;
          pos.z = cz + (dz / d) * radius;
        } else {
          // centre inside the box: push out along the smallest axis
          const pushL = pos.x - (b.minX - radius);
          const pushR = b.maxX + radius - pos.x;
          const pushB = pos.z - (b.minZ - radius);
          const pushF = b.maxZ + radius - pos.z;
          const m = Math.min(pushL, pushR, pushB, pushF);
          if (m === pushL) pos.x = b.minX - radius;
          else if (m === pushR) pos.x = b.maxX + radius;
          else if (m === pushB) pos.z = b.minZ - radius;
          else pos.z = b.maxZ + radius;
        }
        hit = true;
      }
    }
    if (pos.x < WORLD.minX) { pos.x = WORLD.minX; hit = true; }
    if (pos.x > WORLD.maxX) { pos.x = WORLD.maxX; hit = true; }
    if (pos.z < WORLD.minZ) { pos.z = WORLD.minZ; hit = true; }
    if (pos.z > WORLD.maxZ) { pos.z = WORLD.maxZ; hit = true; }
    return hit;
  }

  function isOnRoad(x, z) {
    if (Math.abs(x) > CITY_HALF || Math.abs(z) > CITY_HALF) return false;
    const nearX = centres.some((c) => Math.abs(x - c) <= ROAD_HALF);
    const nearZ = centres.some((c) => Math.abs(z - c) <= ROAD_HALF);
    return nearX || nearZ;
  }

  function randomStreetPos(rngFn) {
    const vertical = rngFn() < 0.5;
    const c = pick(rngFn, centres);
    const along = rand(rngFn, -CITY_HALF + 10, CITY_HALF - 10);
    const lane = pick(rngFn, [-3, 3]);
    if (vertical) return { x: c + lane, z: along };
    return { x: along, z: c + lane };
  }

  function randomSidewalkPos(rngFn) {
    const vertical = rngFn() < 0.5;
    const c = pick(rngFn, centres);
    const along = rand(rngFn, -CITY_HALF + 10, CITY_HALF - 10);
    const side = pick(rngFn, [-9, 9]);
    if (vertical) return { x: c + side, z: along };
    return { x: along, z: c + side };
  }

  return {
    group,
    colliders,
    places,
    buildingCount,
    collideCircle,
    isOnRoad,
    randomStreetPos,
    randomSidewalkPos,
    update(dt, t) {
      // gentle sea swell
      sea.position.y = 0.4 + Math.sin(t * 0.7) * 0.12;
      seaMat.opacity = 0.9 + Math.sin(t * 0.5) * 0.03;
    },
  };
}
