# CASTLE FORGE: BANNERS & BATTLES — the war design (decided)

John's direction: "Age of Empires direction. Raise armies. Opponents
appear in other lands. A little harder than the just-for-kids stuff,
but still fun. Lots of sprites." Everything below is DECIDED —
implement as written, tune numbers for fun. Keep the game's existing
code style and cheery vector art; this is an evolution, not a rewrite.

## The Rival Banners (opponents in other lands)

Three rival lords appear in the far corners of existing regions as you
age up — each a small enemy castle compound (keep + 2 towers + tents +
banner) that was "always there beyond the trees":

- **SIR BRAMBLE** — green banner, THE WHISPERWOOD deep-west (age 5+).
  Gentle tutorial rival.
- **LADY THISTLE** — purple banner, THE STONE HILLS deep-south (age 6+).
  Mid rival, favors archers.
- **KING CINDER** — red banner, THE DRAGON PEAKS north-east (age 7).
  The final rival, cavalry + big raids.

Rivals patrol near their keeps and launch RAIDS on a timer. They never
exist (spawn nothing, cost nothing) before age 5 — old players' worlds
stay peaceful until the war age arrives.

## Armies (yours)

- **KNIGHT** — melee, sturdy. Trained at the existing TRAINING YARD.
- **ARCHER** — ranged pew. New building: ARCHERY RANGE (age 5).
- **CAVALRY** — fast, strong charge. New building: STABLE (age 6).
- Costs food/iron/gold per unit; army cap = 6 + 3 per BANNER TENT (new,
  cheap, age 5) up to 24 per player. Training = walk to the building,
  press X, unit marches out with a little fanfare.
- Rock-paper-scissors LIGHT: cavalry > archers > knights > cavalry
  (soft damage bonuses, not hard counters).

**One-button command (kid-first, depth underneath):** your units form a
WAR BAND that loosely follows you. The WAR HORN (west button near your
banner-bearer, or a HORN entry in the build wheel — pick what fits the
existing input flow best) cycles three stances with big toasts + horn
sounds: **FOLLOW ME → HOLD HERE → CHARGE!** (charge = attack nearest
enemy/keep). In 2P each player has their own band and horn.

## Combat (bloodless, readable, a little harder)

- Real-time auto-engage when enemies are in range; melee bonks, arrows
  arc. The PLAYER can fight too: X near a foe = sword bonk (reuse the
  interact verb; small cooldown swing).
- Units losing all hearts POP into stars and "run home" (yours respawn
  as trainable slots; theirs run to their keep). Nothing dies. No blood.
- Enemy raids can damage buildings → RUBBLE state (sad little pile,
  building inert) → repair with X + half cost. Nothing is ever lost
  forever; the castle keep itself can be damaged but never destroyed.
- GUARD TOWERS get teeth: auto-fire pebble-arrows at raiders in range.
- **Raids are telegraphed**: horn + "⚔ RAID FROM THE WEST!" banner +
  marching-banner arrow pointing at the incoming party, a generous ~20s
  before arrival; raiders path toward your keep, fight what they meet,
  and retreat when beaten (or after wrecking a couple buildings).
- **WAR COUNCIL difficulty** (set at the War Table, changeable
  anytime): GENTLE (rare tiny raids — little-sibling mode) / STANDARD
  (default) / FIERCE (bigger, more frequent). "A little harder" lives
  in STANDARD; FIERCE is for when the boys get good.

## Conquest & the finale

March your band to a rival keep, beat its defenders, bonk the keep
until its banner drops → the rival **SURRENDERS AND JOINS YOU**: their
compound flies your banner, the lord waves and feasts, you gain a
tribute trickle (small resource drip) + a themed hat. Defeat all three
→ **THE PEACE FESTIVAL**: every lord feasts at your castle, fireworks,
"THE REALM IS ONE" — the game's second finale (the existing quest
finale is untouched).

## Quests — the War Council line (~10 new, after the existing 39)

New building at age 5: **WAR TABLE** (the council). Its questline:
build the range → train 3 knights → CHEER them (of course) → repel a
scripted gentle first raid → build the banner tent → march west →
defeat Sir Bramble → then Thistle (age 6), then Cinder (age 7), then
the Peace Festival. Every quest drops a royal chest as ever; the
existing 39 quests and their pacing are untouched.

## Sprites (John: "lots of sprites")

Little animated soldiers in the game's exact vector style: knights
with swords + shields (walk bob, bonk swing), archers with bows (draw
+ loose), cavalry on chunky horses (gallop), rival lords with capes,
banner-bearers, marching raid columns with banners, guard-tower
arrows, star-pops, repair hammers, feast tables. Pooled; combat cap
~24 per side on screen (Canvas 2D on a Pi 5 — verify, don't assume).

## Laws

- Old saves LOAD PERFECTLY and stay peaceful until age 5 (war fields
  absent from old saves default sanely; new fields only written when
  the war layer is active — the 2P save discipline precedent).
- 1P/2P both fully supported; keyboard + the game's own touch UI keep
  working (touch gets a HORN button beside ACT/BUILD).
- No game over, no permanent loss, no blood; "harder" = pressure and
  preparation, never punishment.
- House perf rules: pooled sprites, no per-frame allocations, no
  shadowBlur/backdrop-filter additions. The Pi is the final judge.
- START pause global; SELECT+START untouched (shell-reserved).

## The kingdom fights with you (John: "wizards go to battle too")

Existing fantasy buildings become war assets — if you built it, it
shows up:

- **WIZARD** — own a WIZARD TOWER → the wizard joins your war band as a
  hero unit (pointy hat, staff): slow walker, periodic SPARKLE BLAST
  (AoE star-bonk on a clustered group, big readable windup + rainbow
  poof). One wizard per tower, cap 2. Rivals duck and cover.
- **THE DRAGON** — own a DRAGON PERCH → sounding CHARGE! near a rival
  keep calls a DRAGON FLYOVER: the dragon swoops the target in a
  cinematic pass, rainbow-fire bonks the defenders hard, circles home.
  Long cooldown (once per battle), utterly spectacular, the reward for
  reaching the Dragon Age. During FIERCE raids it also scrambles to
  defend your keep once.
- **Rival heroes answer in kind**: Bramble has a burly WOODSMAN
  champion, Thistle a hawk-archer captain, Cinder a small drake of his
  own (the final battle is dragon vs drake overhead while the bands
  clash below — THE shot of the expansion).
- Flavor beats: chickens scatter squawking when raiders pass the coop;
  villagers cheer from windows during defenses; the blacksmith hammers
  faster while you're at war ("stuff like that" — sprinkle life, cheap
  sprites only).
