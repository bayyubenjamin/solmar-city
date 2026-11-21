# SOLMAR — an open-world crime game

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/bayyubenjamin/solmar-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/bayyubenjamin/solmar-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

**SOLMAR** is a complete open-world crime game in the spirit of GTA 6, built
for the make.fun bounty gta6-01. It runs offline in a desktop browser from
static files — no network, no build step, no account. Everything (the city,
the characters, the cars, the story, the sounds) is original.

## The game

You are **Leo**, a cab driver in debt to **Mara Voss**, a garage owner and
loan shark. Work off the debt across five story missions in **Solmar City**,
a sun-soaked coastal city with five districts: Downtown, Old Town, Marina,
Beachfront and the Hills.

- **Open world on foot and by car** — a procedural 3D city (three.js):
  a road grid with traffic, sidewalks full of pedestrians, palms, a beach
  and a living sea, street lamps and a bright midday sun with shadows.
- **Cars to steal and drive** — walk up to any parked car and press E.
  Steal one with a driver still in it and the police come running. Chase
  camera, handbrake turns, brake lights, skid and crash effects.
- **Traffic and pedestrians** — AI cars drive the grid, turn at
  intersections and queue behind you; pedestrians walk the sidewalks and
  flee when things get loud.
- **Wanted level and police** — 0–5 stars. Stealing, hitting pedestrians
  and punching cops raise the heat; patrol cars chase and ram you. Get
  caught and you are BUSTED (fine + respawn at Mara's garage). Stay clean
  and far away and the heat cools off.
- **Five story missions** — deliveries, a stolen Sunrunner, a police
  escape, three drops and a sunset race, each with a yellow beacon in the
  world and on the minimap, intro dialogue and a cash reward.
- **Combat** — punch with F or a mouse click; the crowd panics.
- **HUD with minimap** — health, money, wanted stars, speed, the current
  objective, and a live 2D minimap (roads, beach, you, the mission marker,
  police and stealable cars).
- **Start, pause, save** — start screen, pause menu, and progress saved
  to localStorage (Continue loads it).
- **Sound** — every sound is synthesized live with the Web Audio API:
  engine hum, police siren, horn, crashes, punches and a quiet chord-pad
  soundtrack. No audio files.

## How to run

```sh
node serve.ts
# open http://localhost:8080 in desktop Chrome
```

Or open `game/index.html` from any static file server. No build step.

## Controls

| Key | Action |
|---|---|
| WASD | Move / drive |
| Mouse | Look (click the game to lock the pointer; drag also works) |
| Arrow keys | Look left / right |
| Shift | Run |
| Space | Jump (on foot) / handbrake (driving) |
| E | Enter, exit or steal a car |
| F / click | Punch |
| H | Horn |
| Esc | Pause / resume |
| Enter | Start / continue after BUSTED |

## Missions

1. **First Delivery** — take a package to the Marina pier. ($120)
2. **Borrowed Wheels** — steal the orange Sunrunner and bring it to Mara's garage. ($250)
3. **Hot Pursuit** — the police are onto you; lose them and reach the Beachfront. ($300)
4. **Three Drops** — collect three packages around the city. ($350)
5. **Sunset Run** — race the checkpoints to the Beachfront before sunset. ($500)

## Tips

- Stealing a car with its driver still inside raises your wanted level
  by one star — an empty parked car is free.
- The wanted level cools off if you stay clean and far from every
  patrol car for a while; the beach and the Hills are good places to hide.
- A connected punch shakes $5 loose from a pedestrian, but the crowd
  remembers it — and so do the police.
- Your car is faster than any patrol car on a straight road; use the
  long avenues to break a chase, then cut through Old Town to lose them.

## Screenshots

The four screenshots in `screenshots/` are real renders of the game,
staged deterministically with `?shot=` (`drive`, `chase`, `mission`,
`city` — see `shots.json` and `game/src/shots.js`).

## Structure

- `game/index.html` — canvas, HUD, minimap, import map for three.js.
- `game/vendor/three.min.js` — official three.js r160 module build (vendored).
- `game/src/main.js` — entrypoint, game loop, input, camera, state machine.
- `game/src/city.js` — procedural city, roads, buildings, beach, sea, collisions.
- `game/src/player.js` — Leo on foot: movement, camera-relative controls, jump.
- `game/src/vehicles.js` — car models, arcade driving, enter/exit/steal.
- `game/src/traffic.js` — AI traffic and pedestrians.
- `game/src/police.js` — wanted level and police pursuit.
- `game/src/missions.js` — the five story missions and their beacons.
- `game/src/combat.js` — punching.
- `game/src/hud.js` — HUD, minimap, menus, save/load.
- `game/src/audio.js` — procedural Web Audio sound.
- `game/src/shots.js` — deterministic `?shot=` screenshot scenes.
- `game/src/utils.js` — seeded random, clamps, geometry helpers.
- `main.ts` — the submission program (copies game/ + screenshots/, writes dossier.json).
- `serve.ts` — tiny local static server for play-testing.

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=ga8gqeqs&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
