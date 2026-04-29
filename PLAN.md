# Plan: stabilize, simplify, then add side-quest cards

Hand-off doc for the next agent. Read this and the codebase, ignore older
context. Three phases, in order. Don't skip ahead.

## Recap (read once, then move on)

`Modesty is the Name` is a browser-based simultaneous word-association
game played on phones, ~3-8 friends per game. Stack: Node + Socket.IO +
Express server (port 3000 default, 3010 for testing); Vite + React +
TypeScript client; shared types in `shared/`. The whole codebase is
under ~3k LoC.

Up until now there was a "profile axis" meta-layer (each player got a
hidden 1..5 vector on N axes; clues were supposed to express it,
opponents guessed it, end-of-game accuracy bonus). After playtests with
friends, we're removing it: the intellectual effort to express a profile
through clue choice overlaps too much with finding a clean word cluster,
so it doesn't add a real second layer. We're keeping everything else
(symmetric/generous/precision scoring modes, originality bonus, polyglot
cluster bonus, pool persistence, ELO, animal labels, time bank,
multi-language pools).

The new direction (phase 3): **secret goal cards** that bias each
player's strategy *orthogonally* to the cluster-finding loop — token-path
cards (spatial) and constraint cards (rule-based, free-form text).

## Phase 1 — bug fixes

Two real bugs from the playtest. Fix first so phase 2 doesn't introduce
or mask them. Both are small.

### Bug 1: round resolves while slow players are still composing

**Symptom.** 4-player game, two players were still picking words for
their clue. The other two had submitted clues, seen each other's clues,
and submitted guesses for each other. Round resolved — and advanced —
without the slow players ever submitting. Time banks were all deep
negative; that's display-only, not the trigger.

**Root cause.** In `server/rooms.ts` `tryResolveRound` (~line 710): the
check waits only for everyone who *submitted a clue* to have guessed
every *other clue-submitter*. Non-submitters are ignored. So fast
players can finish a "round" between themselves and freeze slow players
out.

**Fix.** Add this guard at the top of `tryResolveRound`, after the
existing `submitters.length < 2` check:

```ts
const connected = room.players.filter((p) => p.socketId !== null);
for (const p of connected) {
  if (!round.clues.has(p.id)) return; // someone connected hasn't clued yet
}
```

Disconnected players don't block resolution (so a rage-quit doesn't
stall the room forever). All-AFK still stalls, which is fine — the host
can just start a new game.

**Verify.** Two browser tabs, same room. Tab A submits a clue. Tab B
doesn't. Confirm phase stays `"round"` indefinitely. Submit B's clue,
both submit guesses, round resolves.

**Commit.** `fix: round resolution waits for all connected players to clue`

### Bug 2: clued + correctly-guessed words still appear in next round's pool

**Symptom.** Words that were definitely in someone's intended set and
definitely guessed correctly still show up in the next round's pool.

**Investigate before patching.** `carryPoolForward` (~line 508 in
`server/rooms.ts`) looks correct on inspection: it builds a `targeted`
set from every clue's `intended`, filters out targeted words, refills.
Don't trust the read — instrument and reproduce.

1. Add `console.log("[pool] targeted=", [...targeted], "survivors=", survivors)` in `carryPoolForward`.
2. Run dev server, two browser tabs. Play 2-3 rounds where you clue
   specific words. Compare server logs against the client display.
3. Three possibilities, each with a different fix:
   - **Server `targeted` is correct, client display is wrong** → bug is
     downstream of `carryPoolForward`, in `viewFor` or state broadcast.
     Trace `state.round.pool` from server through socket.
   - **Server `targeted` is missing words** → something mutates
     `room.round.clues` between resolve and `nextRound`. Find what.
   - **Both correct** → maybe a client cache / stale local-state issue.
     Reload the tab and recheck.
4. Fix the actual cause. Remove the log line.

**Verify.** Play a few rounds, intentionally cluing specific words.
After every round, neither tab should show any word that was in any
cluer's intended set that round.

**Commit.** Whatever the actual fix is. Write the message after you
find the cause.

## Phase 2 — strip the profile mechanic

Decision is final: profile axes, public figures, accuracy bonus, binary
vs gradient mode, the "Nations panel" axis bars, the per-axis hits in
reveal — all of it gone. Not toggled off, not deprecated. Removed.

### What counts as "the profile mechanic"

Settings, types, and constants in `shared/types.ts`:
`profileAxes`, `profileMode`, `publicFigures`, `publicAccuracyBonus`,
`PROFILE_AXIS_*`, `PROFILE_BINARY_LOW/HIGH`, `PROFILE_AXES_MIN/MAX`,
`AXIS_LABEL_MAX_LEN`, `PROFILE_PRESETS`, `DEFAULT_PROFILE_AXES`,
`ProfilePreset`, `ProfileMode`, `AxisPair`, `ProfileFeedback`,
`ProfileAccuracy`, `PublicNation`. `PublicMe.profile` and
`PublicMe.profileGuesses` go too. `PublicState.trueProfiles` and
`PublicState.accuracy` go.

Server (`server/rooms.ts`): `Player.profile`,
`Player.profileScoreAsGuesser/Target`, `Player.accuracyBonus`,
`Player.hitsThisRound`, `Round.profileGuesses`, `Room.profileGuessSums`,
`Room.profileGuessSamples`, `randomProfile`, `validateAxisGuess`,
`cleanProfileAxes`, `applyPublicAccuracyBonus`, the profile section of
`tryResolveRound`. `submitGuess` no longer takes axes.

`server/persistence.ts`: drop `PlayerLog.trueProfile`, `publicAxes`,
`axisMatches`; drop `RoundLog.profileGuesses`; drop the
`profileGuesser/Target/accuracyBonus` keys from `PlayerLog.breakdown`.
Bump `version` to `2`. Old v1 logs on disk stay readable; we just don't
generate v1 anymore.

`server/index.ts`: update the `guess:submit` handler to drop the `axes`
parameter.

Client: every component touches profile somewhere.
- `Round.tsx` — `AxisGuess` component, the axes block in `GuessAction`,
  the profile-tip in the clue prompt.
- `Nations.tsx` — `AxisReading` component, `nation-axes` block. Whole
  panel collapses to clue history; consider renaming the file/component
  to `ClueHistory`.
- `Reveal.tsx` — `ProfileResults` component.
- `Ended.tsx` — `AxisRow`, `profile-readout`, the four profile
  `BreakdownRow`s, the publicAccuracyBonus row.
- `Lobby.tsx` — drop the "Profile play", "Profile axes",
  "Public-accuracy bonus" rows. Keep "Polyglot cluster bonus".
- `Home.tsx` — drop the Profile-play `ToggleField`, the
  `ProfileAxesEditor` and its embedded `NumberField` for accuracy bonus.
  Keep the Polyglot and Originality `ToggleField`s.

CSS: delete `.axis*`, `.nation-axes`, `.profile-result*`,
`.profile-readout`, `.axis-binary*` rules.

`bot-cli.mjs`: drop `--profile-mode`, `--axes-json`, `--public-figures`,
`--accuracy-bonus`. Keep `--polyglot-bonus`, `--originality-bonus`.
Update the `help` block accordingly.

`AGENTS.md`: section 5 (currently profile-guess guidance) becomes much
shorter. Drop "Profile axes" and "Profile-mode feedback" from the
review template.

`RULES.md`: remove the profile sections. Add a single placeholder
`## Side-quest cards (coming next)` so phase 3 has somewhere to land.

### Sequencing

Do small commits. After each one: `npx tsc --noEmit` clean, server boots.

1. `shared/types.ts` — types, settings, defaults.
2. `server/rooms.ts` — engine logic.
3. `server/persistence.ts` — schema bump.
4. `server/index.ts` — socket signature update.
5. `client/src/components/Round.tsx`
6. `client/src/components/Nations.tsx` (rename to `ClueHistory.tsx` if you want)
7. `client/src/components/Reveal.tsx`
8. `client/src/components/Ended.tsx`
9. `client/src/components/Lobby.tsx`
10. `client/src/pages/Home.tsx`
11. `client/src/styles.css` — purge dead rules.
12. `bot-cli.mjs`
13. `AGENTS.md`
14. `RULES.md`

### Verification

- `npx tsc --noEmit` clean.
- Server boots on port 3010.
- Two-browser-tab test: lobby → start → clue → guess → reveal → next →
  end. No browser-console errors.
- Bot-cli end-to-end: 2-player run between two terminals. Game ends,
  winner declared, log persisted, ELO updated.

### What stays after phase 2

Word pool with persistence, clue + guess submission, scoring (symmetric
/ generous / precision), originality bonus, polyglot bonus, pool draws
across multiple languages, animal labels for opponents during a round,
ELO across games, the time bank (display-only), per-language word lists
in `words/`.

## Phase 3 — side-quest cards

Don't start until phases 1 + 2 are committed. The previous mechanic was
"clueing should express your profile" — it died because the cognitive
work overlapped the cluster-finding work. Cards have to live somewhere
*orthogonal*: spatial layout (grid geometry) or word form (constraints
on the clue itself), not word meaning.

### Design (locked by user)

- **Cards drawn / kept**: configurable per game (settings), default 3
  drawn / 2 kept, but the host can change. Don't bake the numbers in
  anywhere; pull from settings.
- **Private by default.** A future per-game toggle will allow public
  goals, but public goals need different content from private ones (see
  next bullet) — for now just build private.
- **Why public is harder.** Geometric public goals leak word info: if
  the table knows you're chasing a square, the cluster of cells you're
  trying to score on becomes a hint to your intended words. So public
  cards can't be spatial. Public-mode card ideas (for the eventual
  public toggle, not v1):
  - Score-shape: "be the highest scorer in any single round",
    "have a round where every opponent guesses every word of yours",
    "lose less than X total points to misses across the game".
  - Behavioral: "submit at least one clue with ≥7 intended words",
    "your shortest clue is exactly 1 word", "you never repeat a clue
    word's first letter across the game".
  - Round-property: "be the only player to fully read a specific
    opponent in a round", "in some round, your guesses for all
    opponents are perfect".
  These don't tell opponents anything about your *intended sets*, only
  about your behavior. Lower hint leakage. Skip for v1.
- **Tokens go on cells, not words.** The pool is a stable spatial grid
  (refactor in 3.1). When the pool refreshes a word, the cell is reused
  with a new word, but any tokens that were on that cell stay. The
  tokens form a path on the grid, independent of which words occupy the
  cells at any moment.
- **Vow / constraint cards are free-form text, honor system.** No
  server-side validation of letter constraints, sound constraints, etc.
  Cards just say what they require; players follow them; the table
  judges at end-of-game (or just trusts each other, like polyglot's
  cheating clause). The server scores cards but doesn't verify them
  beyond "did you click 'I held this card' at end-of-game" (or even
  simpler: just believe everyone). This keeps card content
  expressive without locking us into a phonetic database.

### Build sequence

1. **Pool grid layout.** Refactor pool from `string[]` to a spatial
   structure. Either `string[][]` (grid of strings) or
   `Cell[]` with `{ row, col, word }`. Pool-size becomes `rows × cols`,
   exposed as two settings (or one with a smart factoring). Update
   server, client display, carry-forward logic. Cells are stable across
   rounds; words slot in/out.
2. **Token state.** `Player.tokens: { row: number; col: number }[]`.
   Broadcast in `PublicState`. At round resolve, when a guesser
   correctly identifies word `w` from cluer `C`'s intended set, append
   `C`'s token list with the cell coordinates of `w` *that round*.
   Tokens persist across pool refreshes (they live on cells).
3. **Goal-card framework.** New folder `cards/`. Each card is a JS
   module exporting `{ id, name, description, family: "spatial" | "vow",
   evaluate(ctx) -> number }`. The evaluate function for spatial cards
   inspects the player's tokens; for vow cards it returns the
   declared bonus if the player self-reports holding the vow (or
   we just always credit and trust the table).
   Default card pool: ~10-15 cards split across families. Mark a
   difficulty tier (1-3) for balance. Drawing samples across tiers.
4. **Lobby card draft.** When a game starts (not lobby), the server
   deals N cards per player from the deck (N = `cardsDrawn` setting).
   Player picks K (= `cardsKept` setting) in a small modal before the
   first clue phase begins. The pick is locked once the round starts.
5. **End-of-game card resolution + reveal.** After the win trigger
   fires, evaluate every player's chosen cards, sum the bonus, add to
   their final score. Reveal screen shows each player's chosen cards
   and whether they hit them.

### Verification per build step

- After (1): can play a full game with the new grid pool. No regression.
- After (2): tokens accumulate on cells. Can verify by inspecting state
  after a round resolves.
- After (3): a single test card can be loaded, evaluated, and returns
  a number. Unit test for the evaluator if test infra exists.
- After (4): two browser tabs, host starts game, both players see card
  draft modal, both pick, game proceeds normally.
- After (5): full game ends with card bonuses applied to scores and
  visible on Ended screen.

## Working style

- **Commit often.** Per the user's standing convention. No co-author
  trailer. Don't push.
- **Update this PLAN.md as you finish phases.** Mark each phase done
  with a one-line result and the commit SHA range. Helps the next
  agent.
- **Don't claim a phase is done without manual browser verification.**
  Two-tab test, eyes on the screen.
- **Open design questions go to the user**, not your judgment. The user
  is opinionated and present.

## File reference

```
shared/types.ts            – shared types + settings shape
server/rooms.ts            – game engine, round resolution
server/index.ts            – Socket.IO handlers
server/persistence.ts      – game-log JSON + ELO persistence
server/words.ts            – pool drawing
server/elo.ts              – pairwise FIDE-style ELO
client/src/pages/Home.tsx  – game-creation form
client/src/pages/Room.tsx  – router shell, dispatches to phase components
client/src/components/    – Lobby, Round, Reveal, Ended, Nations, WordPool
client/src/styles.css      – all CSS, single file
bot-cli.mjs                – CLI for agents
host-helper.sh             – background watchdog calling round:next
AGENTS.md                  – agent player guide
RULES.md                   – user-facing rules
DESIGN.md                  – older design notes (mostly obsolete; ignore)
```

## Status

- **Phase 1: done.** Bug 1 fixed in `f26e475` (round resolution waits for
  all connected players to clue). Bug 2 fixed in `d629a53`
  (`carryPoolForward` now excludes both survivors AND targeted words from
  the fresh draw; reproed with a 2.5% → 0% rate over 2000 trials).
- **Phase 2: done.** Profile mechanic stripped end-to-end in `468bc30`
  (server, types, client, bot-cli, dead helper scripts deleted),
  CSS purge in `cbb691e`, AGENTS.md in `2d5d7ae`, RULES.md in `ead0ad7`.
  Persistence schema bumped to `version: 2`. End-to-end smoke via
  bot-cli passes. Browser/phone manual verification deferred to user.
- **Phase 3: not started.** Side-quest cards.
