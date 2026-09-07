# CASTLEFORGE 🏰⭐

The sequel to IslandForge. One static `index.html` — no build step, no dependencies,
Canvas 2D vector rendering. Deploys anywhere that serves static files (render.com etc.).

## Play it

- Open `index.html` directly in a browser, **or** serve the folder:
  `python3 -m http.server 8643` → http://localhost:8643
- Saves automatically to localStorage (autosave every ~6s + on tab hide).

## Controls

| Input | Action |
|---|---|
| Arrows / WASD / left stick | Walk |
| X / Space / south button | Talk, chop, pet, open, cheer, fire |
| C / west button | Build menu |
| V / north button | Royal Ledger (stats + hat picker) |
| Z / Esc / east button | Pause / cancel |
| M | Sound on/off |
| Touch | Virtual joystick (left half) + ACT / BUILD buttons |

Gamepads work through the same guarded `window.ArcadeController` shell
(`controller.js` from ses.q5labs.co) as IslandForge — fully optional.

## The game

Top-down kingdom builder, one quest at a time (39 quests), every quest drops a
royal chest (resources… or one of 6 silly hats). Seven ages, each unlocking a
new land as the fog rolls back:

1. **Campfire Age** — the Sunny Meadow
2. **Farming Age** — the Farmlands (a bridge appears over the river)
3. **Builder Age** — the Whisperwood
4. **Knight Age** — the Stone Hills (castle keep, sparring knights)
5. **Wizard Age** — the Wizard's Glade (Wizzo lives there)
6. **Dragon Age** — the Dragon Peaks (feed Sparky 20 bread → best friend forever)
7. **Starfall Age** — Starfall Crater (forge star metal, build the Star Beacon,
   light it, and send the fallen star home — fireworks, night sky, TO BE CONTINUED)

Homages: Sir Cluck's Nugget Fort (needs 3 chicken coops), pettable chickens,
the Pie-apult. Your avatar's outfit upgrades every age.

## Notes for the next session

- All data tables live near the top of the `<script>`: `AGES`, `REGIONS`,
  `RESDEF`, `BLD` (buildings), `GOALS` (the quest ladder), `HATS`.
- The world is deterministic (seeded), 3200×3200 px, regions are geometric
  (`regionAt`), so saves only store buildings + counters.
- Save key: `castleforge-save-v1`.
