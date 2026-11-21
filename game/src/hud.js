// hud.js — everything on top of the 3D view: health, money, wanted
// stars, speed, the mission objective, toasts, the 2D minimap canvas,
// and the start / pause / busted menus. It also owns the save in
// localStorage (money, missions completed, wanted) and the Continue
// button that loads it.

import { kmh } from './utils.js';

const SAVE_KEY = 'solmar-save-v1';

/** Build the HUD. root is the #hud element in index.html. */
export function createHud() {
  const $ = (id) => document.getElementById(id);
  const els = {
    healthFill: $('health-fill'),
    healthText: $('health-text'),
    money: $('money'),
    stars: $('stars'),
    speed: $('speed'),
    speedUnit: $('speed-unit'),
    objective: $('objective'),
    toast: $('toast'),
    minimap: $('minimap'),
    menuStart: $('menu-start'),
    menuPause: $('menu-pause'),
    menuBusted: $('menu-busted'),
    missionDone: $('mission-done'),
    continueBtn: $('btn-continue'),
    bustedFine: $('busted-fine'),
    savedNote: $('saved-note'),
  };
  const mapCtx = els.minimap.getContext('2d');
  let toastTimer = 0;

  function showToast(text, ms = 4200) {
    els.toast.textContent = text;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms);
  }

  function showMissionDone(text) {
    els.missionDone.textContent = text;
    els.missionDone.classList.add('show');
    setTimeout(() => els.missionDone.classList.remove('show'), 4200);
  }

  function setStars(n) {
    let s = '';
    for (let i = 0; i < 5; i++) s += i < n ? '★' : '☆';
    els.stars.textContent = s;
    els.stars.classList.toggle('hot', n >= 3);
  }

  function update(state) {
    els.healthFill.style.width = Math.max(0, state.health) + '%';
    els.healthText.textContent = Math.round(Math.max(0, state.health));
    // low health: the bar flashes red so the danger reads at a glance
    els.healthFill.style.background = state.health < 30
      ? 'linear-gradient(90deg,#ff5a3c,#ff9a3c)'
      : 'linear-gradient(90deg,#37d67a,#a8e063)';
    els.money.textContent = '$' + Math.round(state.money);
    setStars(state.wanted);
    if (state.inCar) {
      els.speed.textContent = kmh(state.speed);
      els.speedUnit.textContent = 'km/h';
    } else {
      els.speed.textContent = state.running ? 'RUN' : 'ON FOOT';
      els.speedUnit.textContent = '';
    }
    els.objective.textContent = state.objective || '';
  }

  /** Draw the minimap: roads, beach, player, mission marker, police, cars. */
  function drawMinimap(city, player, playerCar, missionMarker, policeCars, stealableCars) {
    const W = els.minimap.width;
    const H = els.minimap.height;
    const scale = W / 520; // world -260..260 -> canvas
    const toX = (x) => (x + 260) * scale;
    const toY = (z) => (z + 260) * scale;
    mapCtx.clearRect(0, 0, W, H);
    // land
    mapCtx.fillStyle = '#20262b';
    mapCtx.fillRect(0, 0, W, H);
    mapCtx.fillStyle = '#3d4a3a';
    mapCtx.fillRect(0, 0, W, toY(244));
    // beach + sea
    mapCtx.fillStyle = '#e9d8a6';
    mapCtx.fillRect(0, toY(244), W, toY(292) - toY(244));
    mapCtx.fillStyle = '#2a7fa8';
    mapCtx.fillRect(0, toY(292), W, H - toY(292));
    // roads
    mapCtx.strokeStyle = '#565e68';
    mapCtx.lineWidth = 5;
    for (let i = 0; i < 11; i++) {
      const c = -230 + i * 46;
      mapCtx.beginPath();
      mapCtx.moveTo(toX(c), 0);
      mapCtx.lineTo(toX(c), toY(230));
      mapCtx.stroke();
      mapCtx.beginPath();
      mapCtx.moveTo(0, toY(c));
      mapCtx.lineTo(W, toY(c));
      mapCtx.stroke();
    }
    // mission marker
    if (missionMarker) {
      mapCtx.fillStyle = '#ffd23e';
      mapCtx.beginPath();
      mapCtx.arc(toX(missionMarker.x), toY(missionMarker.z), 6, 0, Math.PI * 2);
      mapCtx.fill();
      mapCtx.strokeStyle = '#7a5c00';
      mapCtx.lineWidth = 2;
      mapCtx.stroke();
    }
    // stealable cars
    mapCtx.fillStyle = '#37d67a';
    for (const car of stealableCars) {
      mapCtx.beginPath();
      mapCtx.arc(toX(car.pos.x), toY(car.pos.z), 2.5, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // police
    mapCtx.fillStyle = '#ff4444';
    for (const car of policeCars) {
      mapCtx.beginPath();
      mapCtx.arc(toX(car.pos.x), toY(car.pos.z), 3.5, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // player arrow
    const px = toX(player.pos.x);
    const py = toY(player.pos.z);
    mapCtx.save();
    mapCtx.translate(px, py);
    mapCtx.rotate(player.heading);
    mapCtx.fillStyle = '#ffffff';
    mapCtx.beginPath();
    mapCtx.moveTo(0, -7);
    mapCtx.lineTo(5, 6);
    mapCtx.lineTo(-5, 6);
    mapCtx.closePath();
    mapCtx.fill();
    mapCtx.restore();
  }

  function showMenu(which) {
    els.menuStart.classList.toggle('hidden', which !== 'start');
    els.menuPause.classList.toggle('hidden', which !== 'pause');
    els.menuBusted.classList.toggle('hidden', which !== 'busted');
  }

  function hideMenus() {
    showMenu(null);
  }

  function saveGame(state) {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: state.money,
        missionsDone: state.missionsDone,
        wanted: 0,
        savedAt: Date.now(),
      }));
      if (els.savedNote) els.savedNote.textContent = 'Progress saved';
    } catch (e) { /* storage unavailable: ignore */ }
  }

  function loadGame() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  }

  function hasSave() {
    return loadGame() !== null;
  }

  return {
    els,
    showToast,
    showMissionDone,
    update,
    drawMinimap,
    showMenu,
    hideMenus,
    saveGame,
    loadGame,
    hasSave,
  };
}
