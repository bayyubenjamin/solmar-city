// missions.js — Leo's story: five jobs for Mara Voss, played in order.
// Each mission has an intro line, a chain of objectives (go to a marker,
// steal a car, lose the police, collect packages, race the checkpoints)
// and a cash reward. A tall yellow beacon marks the current objective in
// the world and on the minimap; reaching it advances the chain.

import * as THREE from 'three';
import { dist2d } from './utils.js';

const MISSION_DEFS = [
  {
    id: 1,
    title: 'First Delivery',
    intro: 'Mara Voss: "Leo, you owe me. Take this package to the Marina. No stops, no questions."',
    reward: 120,
    steps: [
      { type: 'goto', text: 'Deliver the package to the Marina pier', x: 228, z: 60 },
    ],
    done: 'Package delivered. Mara is pleased — for now.',
  },
  {
    id: 2,
    title: 'Borrowed Wheels',
    intro: 'Mara Voss: "I need a Sunrunner, the orange one parked near Downtown. Bring it to my garage in Old Town."',
    reward: 250,
    steps: [
      { type: 'steal', text: 'Steal the orange Sunrunner near Downtown', x: 46, z: 46, carName: 'Sunrunner', carColor: 0xe8862e },
      { type: 'gotoCar', text: 'Drive the Sunrunner to Mara\'s garage', x: -138, z: -92 },
    ],
    done: 'The Sunrunner is Mara\'s now. She pays without smiling.',
  },
  {
    id: 3,
    title: 'Hot Pursuit',
    intro: 'Mara Voss: "The cops saw the swap. Lose them, Leo — get to the Beachfront and stay clean."',
    reward: 300,
    steps: [
      { type: 'wanted', text: 'The police are onto you — reach wanted level 2', level: 2 },
      { type: 'escape', text: 'Lose the police, then reach the Beachfront', x: 46, z: 226 },
    ],
    done: 'You shook them off. The beach air never tasted so good.',
  },
  {
    id: 4,
    title: 'Three Drops',
    intro: 'Mara Voss: "Three packages scattered around the city. Collect them all, quick and quiet."',
    reward: 350,
    steps: [
      { type: 'goto', text: 'Collect package 1 of 3 — Hills', x: -92, z: -184 },
      { type: 'goto', text: 'Collect package 2 of 3 — Marina', x: 184, z: 138 },
      { type: 'goto', text: 'Collect package 3 of 3 — Old Town', x: -184, z: -46 },
      { type: 'goto', text: 'Bring the packages back to Mara\'s garage', x: -138, z: -92 },
    ],
    done: 'All three drops collected. Mara counts them twice.',
  },
  {
    id: 5,
    title: 'Sunset Run',
    intro: 'Mara Voss: "Last job, Leo. Race the checkpoints to the Beachfront — beat the sunset and your debt is gone."',
    reward: 500,
    steps: [
      { type: 'goto', text: 'Checkpoint 1 — Downtown crossing', x: 0, z: -92 },
      { type: 'goto', text: 'Checkpoint 2 — Marina road', x: 138, z: 92 },
      { type: 'goto', text: 'Checkpoint 3 — Beachfront finish', x: 46, z: 226 },
    ],
    done: 'You beat the sunset. Mara tears up the debt — Leo is free.',
  },
];

function makeBeacon() {
  const g = new THREE.Group();
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(1.6, 1.6, 26, 12, 1, true),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })
  );
  beam.position.y = 13;
  g.add(beam);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.6, 2.4, 24),
    new THREE.MeshBasicMaterial({ color: 0xffd23e, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.15;
  g.add(ring);
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.9, 2.2, 4),
    new THREE.MeshBasicMaterial({ color: 0xffd23e })
  );
  arrow.position.y = 6.5;
  arrow.rotation.x = Math.PI;
  g.add(arrow);
  return g;
}

/** Create the mission system. */
export function createMissions(scene, city) {
  const beacon = makeBeacon();
  beacon.visible = false;
  scene.add(beacon);
  const state = {
    index: 0, // current mission (0-based)
    step: 0,
    active: false,
    completedCount: 0,
    allDone: false,
    targetCar: null,
  };

  function currentDef() {
    return MISSION_DEFS[state.index] || null;
  }

  function currentStep() {
    const def = currentDef();
    return def ? def.steps[state.step] : null;
  }

  function placeBeacon() {
    const step = currentStep();
    if (!step || step.type === 'wanted') {
      beacon.visible = false;
      return;
    }
    beacon.visible = true;
    beacon.position.set(step.x || 0, 0, step.z || 0);
  }

  function startMission(i) {
    state.index = i;
    state.step = 0;
    state.active = true;
    state.allDone = false;
    placeBeacon();
  }

  function objectiveText() {
    const def = currentDef();
    if (!def) return 'All missions complete — Solmar is yours, Leo.';
    const step = currentStep();
    return `Mission ${def.id}: ${def.title} — ${step ? step.text : ''}`;
  }

  return {
    state,
    defs: MISSION_DEFS,
    beacon,
    startMission,
    objectiveText,
    currentDef,
    currentStep,
    /** Begin the first mission (called when the game starts). */
    begin() {
      if (!state.active && state.completedCount === 0) startMission(0);
    },
    /** The car the current step wants stolen, if any. */
    wantedCar() {
      const step = currentStep();
      if (step && step.type === 'steal') return step;
      return null;
    },
    /**
     * Advance the mission chain. ctx: {x, z, inCar, carName, wanted,
     * onStep, onComplete, addMoney}.
     */
    update(dt, ctx) {
      if (!state.active) return;
      const def = currentDef();
      if (!def) return;
      const step = currentStep();
      if (!step) return;
      const d = step.x !== undefined ? dist2d(ctx.x, ctx.z, step.x, step.z) : 999;
      let advance = false;
      if (step.type === 'goto' && d < 5) advance = true;
      if (step.type === 'gotoCar' && ctx.inCar && d < 6) advance = true;
      if (step.type === 'steal' && ctx.stolenCarName === step.carName
        && (step.carColor === undefined || ctx.stolenCarColor === step.carColor)) advance = true;
      if (step.type === 'wanted' && ctx.wanted >= step.level) advance = true;
      if (step.type === 'escape' && ctx.wanted === 0 && d < 6) advance = true;
      if (!advance) return;
      state.step++;
      if (ctx.onStep) ctx.onStep(step);
      if (state.step >= def.steps.length) {
        // mission complete
        state.completedCount++;
        if (ctx.addMoney) ctx.addMoney(def.reward);
        if (ctx.onComplete) ctx.onComplete(def);
        if (state.index + 1 < MISSION_DEFS.length) {
          startMission(state.index + 1);
        } else {
          state.active = false;
          state.allDone = true;
          beacon.visible = false;
        }
      } else {
        placeBeacon();
      }
    },
    updateBeacon(dt, t) {
      if (beacon.visible) {
        beacon.rotation.y = t * 0.8;
        beacon.children[2].position.y = 6.5 + Math.sin(t * 2.4) * 0.5;
        // the ground ring breathes so the marker catches the eye
        const s = 1 + Math.sin(t * 3) * 0.12;
        beacon.children[1].scale.set(s, s, 1);
      }
    },
    markerPos() {
      const step = currentStep();
      if (!step || step.x === undefined) return null;
      return { x: step.x, z: step.z };
    },
  };
}
