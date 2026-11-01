# Stout & Honour

**A gladiator brawler set in an Irish pub, starring Mike Lynch.** Mike went out for Halloween dressed as a gladiator. By closing time he is one: barred from the Colosseum Bar & Lounge by the new landlord, Commodus O'Dowd, who pours his pint down the sink, he fights his way back through the back rooms of the provinces, one bout at a time, in his own armour. Win the crowd. Mind your pint.

> What we do in the pub echoes in the parish.

Built for iPhone first: touch controls, landscape, home-screen install. It also plays in any desktop browser with a keyboard or gamepad. There are no image or audio files. Every character, prop and sound, plus the trad music, is generated in code at runtime.

## Play it on an iPhone

1. Open `index.html` from wherever this folder is hosted (see [Hosting](#hosting)).
2. In Safari, tap **Share → Add to Home Screen**. The game then launches full screen like an app and keeps working offline.
3. Hold the phone sideways. Turn the silent switch off if you want the fiddle and the crowd.

## Controls

| Action | Touch (landscape) | Keyboard | Gamepad |
|---|---|---|---|
| Move | Drag anywhere on the left half (floating stick) | WASD / arrows | Left stick / d-pad |
| Strike (tap ×3 = combo) | **STRIKE** | J or Z | A |
| Hurley Smash (breaks guards) | Hold **STRIKE**, release | Hold J | Hold A |
| Block / Parry | Hold **BLOCK**; tap just before a hit to parry | K or X | X / bumpers |
| Leg it (dodge, invincible) | **LEG IT** | L, C or Space | B |
| Taunt / Unleash Hell | **TAUNT** (becomes **UNLEASH HELL** at 90 craic) | I or V | Y |
| Pause | Beer mat, top right | Esc / P | Start |

Left-handed mode in Settings swaps the stick and the buttons.

## The house rules

- **White flash**: blockable. Tap BLOCK right before it lands to **parry**, which staggers the attacker for a 1.5× counter. Parried darts fly back at the thrower.
- **Red flash**: unblockable. Leg it. Dodging at the last moment earns an **OLÉ!**
- **Purple glow** (Commodus only): a counter stance. Don't swing. Wait.
- **The craic meter** fills with varied, stylish play and drains if you turtle or repeat yourself. It tops out at **ninety**, because the craic was ninety. At ninety you can **Unleash Hell**: the crowd rains flaming sambucas on every lad in the room.
- **When time is called**, the crowd decides the bout: 45 or more craic is thumbs up.
- **Pints** thrown by a happy crowd heal you, but they have to *settle* first, and a hurt lad will drink yours if you dawdle.

## Modes

- **The Legend of Lynchy**: seven story bouts, from the Battle of Germania (a stag party in the lounge) through Zucchabar, the Battle of Carthage (shopping-trolley chariots), Tigris of Galway and his Jack Russell, the Praetorian bouncers, and Commodus himself.
- **The Lock-In**: endless rounds after closing time, scaling up, with a boss every fifth round. Shh, the Guards.
- Difficulty: **Shandy**, **Pint of Plain** or **Poitín**.

## Hosting

Everything is static. There is no build step.

- **This repo (Hugo)**: the folder lives in the theme's `static/`, so any site built with this theme serves it at `/stout-and-honour/`.
- **GitHub Pages**: enable Pages for the repo and open `/static/stout-and-honour/`.
- **Locally**: `python3 -m http.server` inside this folder, then open `http://localhost:8000`. Opening the file directly also works.

## Files

| File | What's in it |
|---|---|
| `index.html` | Page shell, every menu screen, styles |
| `js/engine.js` | Maths helpers, save data, synthesised SFX, the trad music sequencer, announcer voice, touch/keyboard/gamepad input |
| `js/data.js` | Difficulty, looks, movesets and frame data, enemy archetypes, the story script, tips. **Tune the game here.** |
| `js/art.js` | All drawing: the pub, the rigged characters (IK legs), effects, HUD, on-screen controls, portraits |
| `js/game.js` | Simulation: fighters, combat, adaptive AI, the crowd, waves, hazards, pickups, camera |
| `js/ui.js` | Story flow, menus, results, boot and the fixed-step main loop |
| `sw.js`, `manifest.webmanifest`, `icons/` | Home-screen install and offline play |
| `DESIGN.md` | How the systems work, with diagrams |

Debug URL flags for testing: `?bout=3` (jump to a bout, zero-based), `?lockin`, `?auto` (autopilot), `?god`, `?speed=4`, `?mute`.
