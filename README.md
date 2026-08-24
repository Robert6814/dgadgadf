# Vanguard Duel — v1 (MVP rules engine)

A working, from-scratch Cardfight!! Vanguard engine you can play online against your brother.
Turn structure, ride, call, attack/boost/guard, drive checks, damage checks, and triggers are
all real and enforced by the server — not just a shared table where you police the rules yourselves.

## Run it

```bash
npm install
npm start
```

Then open **http://localhost:3000** in two browser tabs (or windows) — the first two
connections get auto-paired into a game. To play with your brother over your home network
instead of two tabs on one machine:

1. Find your machine's LAN IP (e.g. `192.168.1.23`) — `ipconfig` on Windows, `ifconfig`/`ip addr`
   on Mac/Linux.
2. He opens `http://<your-LAN-IP>:3000` from his own device on the same WiFi.
3. You open `http://localhost:3000` (or your own LAN IP) — whoever connects first is Player 1.

To play over the actual internet (not just the same WiFi) you'd need to either port-forward
your router to that machine, or deploy this to a small always-on host (Render, Fly.io, a
cheap VPS, etc.) — happy to help with that step whenever you're ready for it.

## What's implemented

- Full turn loop: Stand/Draw → Ride → Main (call rearguards) → Battle → End
- Mulligan at the start of the game
- Riding (grade-legal), calling rearguards to the 5 circle positions, boosting
- Attack → Guard (call guardians from hand, **or intercept with a front-row rearguard**) →
  Drive Check (Vanguard attacks only, **Twin Drive at grade 3+**) → Damage comparison →
  Damage Check (with trigger resolution) → 6-damage loss condition
- Four trigger types: Critical, Draw, Front, Heal, all functionally resolved
- Deck-out loss condition
- A tiny scripted-skill hook (`data/cards.js` → `skill` field) so unique card effects can be
  added incrementally — two example skills are already wired up (`draw1` on ride, `powerUpSelf`
  on attack) to prove the pattern works end to end
- **A public, ordered event feed** (`game.events`, sent to the client as `state.events`) —
  every ride, drive check, damage check, trigger, skill, guard, intercept, and battle result is
  emitted as a sequenced event. The client replays these in order as a big centered reveal
  popup (ride/drive/damage checks) and a corner toast queue (everything else), so ability/effect
  resolution order is actually visible turn to turn, not just implied by the log.
- **Twin Drive** — a grade 3+ Vanguard performs two drive checks instead of one; the battle strip
  and the reveal popup both flag it.
- **Intercept** — during the guard step, a defending front-row rearguard (FL/FR) that hasn't
  already acted this turn can drop back to the guardian circle to add its shield, same as calling
  a guardian from hand. Interceptable units are highlighted in blue on the board.

## Known simplifications (fast-follow candidates)

- **No Stride, Legion, or G-Zone.** This models the earlier/simpler ruleset (pre-Stride), not
  the current overDress/Divinez format. (Twin Drive at grade 3 is modeled; the grade-4 Stride
  Triple Drive is not, since there's no G-Zone yet.)
- **Card data is original placeholder data, not the real card pool.** There's no official free
  public API for Vanguard card data — Bushiroad doesn't publish one. `data/cards.js` has two
  small original 50-card decks with realistic stats so the engine has something legal to run on.
  If you want the real card pool, the engine doesn't care where the data comes from — you'd
  swap in a dataset from something like a fan-maintained card API/GitHub dataset (several exist,
  quality varies) and keep the same `{name, clan, grade, power, shield, critical, trigger, skill}`
  shape.
- **Boost adds full power**, not the partial-boost math some formats use — a deliberate
  simplification, easy to tune in `gameEngine.js` (`boostPower` calc in `declareAttack`).
- **Trigger power always goes to the attacker** rather than letting you choose which unit to
  boost — reasonable for v1 since boosting the attacker is almost always correct anyway.
- **Intercept has no "cannot intercept" keyword restriction** — in the current v1 ruleset, any
  untapped front-row rearguard can intercept. Some cards in later formats are explicitly
  restricted from intercepting; the `skill` hook is where you'd add that flag if you add such cards.

## Project layout

```
server.js            Express + WebSocket server, pairs players, relays actions
engine/gameEngine.js  The actual rules engine — state machine, all game logic
data/cards.js         Card pool + deck lists
public/               Browser client (HTML/CSS/vanilla JS, no build step)
```

## Adding a new card skill

In `data/cards.js`, add a `skill` field to a card, e.g.:

```js
skill: { on: 'ride', effect: 'draw1' }
```

Then in `engine/gameEngine.js`, extend `_runSkill()` to handle new `effect` values. This is
intentionally minimal right now — a real implementation would want a proper effect-scripting
system (cost/trigger/resolution, targeting, timing windows) once you're past a handful of cards.
