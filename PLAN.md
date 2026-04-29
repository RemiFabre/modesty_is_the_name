# Plan: stabilize, simplify, then redesign the meta-layer

This document is the single source of truth for the next mission. Any agent
(human or otherwise) should be able to read it cold and pick up where the
last one stopped. Tasks are sequenced; do them in order. Each task says
what's done, how to verify, and what to commit.

The current code on `main` works as a word-association game with a
profile-axis meta-layer. After playtests with friends, we're throwing the
profile mechanic out. The new direction is **secret side-quest cards**
(token paths, letter/sound constraints, etc.). Before any of that, we fix
two bugs that make the current build unsafe to play.

## Why each phase exists

1. **Bug fixes first.** Two real bugs from the last playtest. Fix them
   before touching anything else so we know the simplification didn't
   introduce them.
2. **Strip the profile mechanic.** Friends decided the profile-clueing
   intellectual effort overlaps too much with word-clueing — it doesn't add
   a distinct second layer. Remove it cleanly: settings, types, server
   logic, every UI surface, persistence schema, agent docs. No half-removed
   skeletons.
3. **Side-quest cards (new mechanic).** Hidden goal cards that bias each
   player's strategy without overlapping the word-association loop.
   Two flavors: spatial token-pattern goals, and rule-based vow goals.

## Phase 0: read this and the codebase

Before doing anything: skim `RULES.md`, `AGENTS.md`, `shared/types.ts`,
`server/rooms.ts`, `server/persistence.ts`, `server/words.ts`, every
component in `client/src/components/`, and `bot-cli.mjs`. The whole
codebase is small (under ~3k LoC). Don't skip — phase 2 touches every one
of those files.

Run `git log --oneline -20` to see recent context. Look at the most recent
commits especially: originality bonus, profile-off changes, em-dash purge.

## Phase 1: bug fixes (no behavior changes beyond fixing the bugs)

### Bug 1: round resolves while some players are still composing their clue

**Symptom (from the playtest):** in a 4-player game, two players were
mid-thought on the clue prompt. The other two had submitted their clues
quickly, started seeing each other's clues, and submitted their guesses
for each other. The round then resolved — and advanced to the next round —
without the slow players ever getting to submit. The timer banks were all
deep negative; nothing about the timer should have triggered any
auto-action because the time bank is display-only.

**Root cause (read from `server/rooms.ts` lines 710–722, function
`tryResolveRound`):**

```ts
const submitters = Array.from(round.clues.keys());
if (submitters.length < 2) return;
for (const guesserId of submitters) {
  const inner = round.guesses.get(guesserId) ?? new Map();
  for (const targetId of submitters) {
    if (targetId === guesserId) continue;
    if (!inner.has(targetId)) return; // missing guess; not yet
  }
}
// → resolve
```

The check waits for every clue-submitter to have guessed every *other
clue-submitter*. It does **not** wait for non-submitters. So if A and B
submit fast and guess each other, the round resolves, scoring only A and B
and freezing C and D out of that round entirely. RULES.md technically
permits this ("when every player who submitted a clue has submitted their
guesses for every other clue-giver, the round resolves automatically"),
but for couch play it feels like a bug. We need to fix the rule.

**Fix:** require every *connected* player to have submitted a clue before
the round resolves.

```ts
// at the top of tryResolveRound, after the existing `submitters.length < 2` guard:
const connectedPlayers = room.players.filter((p) => p.socketId !== null);
for (const p of connectedPlayers) {
  if (!round.clues.has(p.id)) return; // someone connected hasn't clued yet
}
```

If a player disconnects mid-round, this check no longer waits for them —
that's the right behavior (otherwise the round stalls forever when one
person rage-quits). Disconnects are explicit (socket gone, `player.socketId
=== null`).

If all players are AFK and never submit, the round stalls. That's correct
for friends-around-the-table mode — the host can `start` a new game if
they really want to abort.

**Verify:**
1. Manually: open two browser tabs as two players in the same room. Have
   one submit a clue, the other not. Confirm the round does NOT resolve
   even after the first player has done everything they can do (which in
   this case is just submit their own clue — they can't guess for someone
   who hasn't clued). Then have the second player submit. Confirm guesses
   resolve only after both have done everything.
2. Add a unit test for `tryResolveRound` if the test infra exists; if not,
   skip — manual verification is sufficient for now.

**Commit:** `fix: round resolution waits for all connected players to clue`

### Bug 2: clued + correctly-guessed words remain in the pool

**Symptom:** after a round, words that were definitely in someone's
intended set and definitely guessed correctly still appear in the next
round's pool.

**Code under suspicion:** `carryPoolForward` in `server/rooms.ts` lines
508–533. On inspection it looks correct: it builds a `targeted` set from
every clue's `intended` array, filters out targeted words from the prev
pool, and refills with fresh draws.

**Most likely actual cause** (untested hypothesis, verify before fixing):

- The previous round's `room.round.clues` may have been mutated or
  partially overwritten somewhere between the resolution snapshot
  (line 780) and the call to `nextRound` (line 856). The resolution path
  pushes a deep copy via `snapshotRound`, but `room.round.clues` itself is
  the live Map. If anything in the reveal path resets it, `carryPoolForward`
  sees fewer intended words than it should.
- Or: a client-side bug. Maybe the UI carries stale state across rounds
  and the server's pool is correct. To rule this out, add a server log
  line in `carryPoolForward` that prints `targeted` and `survivors`, then
  reproduce the bug and compare with the client display.

**Fix steps:**
1. Add a temporary `console.log("[pool] targeted:", [...targeted], "survivors:", survivors)` in `carryPoolForward`.
2. Reproduce the bug (run two browser tabs, play a couple of rounds where
   you clue specific words, watch the server stdout).
3. If the server log shows the right `targeted` set but the client still
   displays old words, the bug is in `viewFor` / state broadcasting — the
   pool sent to the client is wrong somewhere downstream. Trace from
   `viewFor` (line 878+) through `state.round.pool`.
4. If the server log shows missing words from `targeted`, the bug is in
   the resolution path (something mutating `clues` between snapshot and
   carry). Find what.
5. Fix the actual root cause, remove the log line.

**Verify:** play 2–3 rounds in two browser tabs, intentionally clueing
specific words. After each round, confirm in both tabs that the pool no
longer contains any word that was in any cluer's intended set this round.

**Commit:** `fix: pool carry-forward removes all targeted words` (or
whatever the actual root cause is — write the commit message after you
find it).

## Phase 2: strip the profile mechanic

The decision: the profile-axis layer is gone. Not toggled off, not
deprecated, not behind a feature flag — physically removed from the code.

### What "profile mechanic" includes

- `profileAxes`, `profileMode`, `publicFigures`, `publicAccuracyBonus` in
  settings, plus their `binary`/`gradient` mode logic.
- `Player.profile`, `Player.profileScoreAsGuesser`, `Player.profileScoreAsTarget`,
  `Player.accuracyBonus`, `Player.hitsThisRound`.
- `Round.profileGuesses`, `Room.profileGuessSums`, `Room.profileGuessSamples`.
- `PROFILE_AXIS_*`, `PROFILE_BINARY_LOW/HIGH`, `PROFILE_AXES_MIN/MAX`,
  `AXIS_LABEL_MAX_LEN`, `PROFILE_PRESETS`, `DEFAULT_PROFILE_AXES`,
  `ProfilePreset`, `ProfileMode`, `AxisPair`.
- `randomProfile()`, `validateAxisGuess()`, `applyPublicAccuracyBonus()`,
  `cleanProfileAxes()`.
- `PublicMe.profile`, `PublicMe.profileGuesses`, `PublicNation`,
  `ProfileFeedback`, `ProfileAccuracy`, `state.trueProfiles`,
  `state.accuracy`, `state.profileFeedback`.
- `bot-cli` flags: `--profile-mode`, `--axes-json`, `--public-figures`,
  `--accuracy-bonus`. The `--originality-bonus` flag and the polyglot
  flag stay, those are unrelated.
- Client components: `Nations.tsx` axis bars, `Reveal.tsx` profile
  results, `Round.tsx` axes block + `AxisGuess` component, `Ended.tsx`
  profile-readout + `AxisRow` + breakdown rows for profile, `Lobby.tsx`
  profile-axes display, `Home.tsx` `ToggleField` for profile play +
  `ProfileAxesEditor`.
- CSS: `.axis*`, `.nation-axes`, `.profile-result*`, `.profile-readout`,
  `.axis-binary*`. Dead.
- Persistence schema: `PlayerLog.trueProfile`, `PlayerLog.publicAxes`,
  `PlayerLog.axisMatches`, `RoundLog.profileGuesses`,
  `PlayerLog.breakdown.profileGuesser/profileTarget/accuracyBonus`. The
  saved JSON files will get a smaller schema. Old logs become read-only.
- Docs: every mention in `RULES.md`, `AGENTS.md`, the originality
  RULES.md section that talks about profile, the `g1-*.md` review files
  (leave those alone — they're playtest history).

### Sequence

Do these in order. Each commit is small and reviewable. After each commit
run `npx tsc --noEmit` and the dev server (`PORT=3010 npx tsx server/index.ts`)
to confirm nothing broke.

1. **`shared/types.ts`**: rip out the profile fields from `RoomSettings`,
   delete the profile-related types and constants, update
   `DEFAULT_SETTINGS`. Update `PublicState`/`PublicMe`/`PublicRound` to
   drop the profile fields. `state.profileFeedback`, `state.trueProfiles`,
   `state.accuracy` removed.
2. **`server/rooms.ts`**: delete profile-handling code. Simplify
   `tryResolveRound` to only do word scoring + originality bonus +
   polyglot bonus. Delete `applyPublicAccuracyBonus`, `randomProfile`,
   `validateAxisGuess`, `cleanProfileAxes`. Remove `profileGuesses` from
   `Round`, `profileGuessSums`/`Samples` from `Room`. Remove profile
   fields from `Player`. `submitGuess` no longer takes axes. Update the
   room-create / settings paths to not initialize profile state.
3. **`server/persistence.ts`**: drop profile-related fields from
   `RoundLog` and `PlayerLog`. Bump `version` to `2`. Add a comment that
   v1 logs (with profile data) still exist on disk and the analyzer can
   read both.
4. **`server/index.ts`**: update the socket handlers to match the new
   `submitGuess` signature.
5. **`client/src/components/Round.tsx`**: delete `AxisGuess`, the axes
   block in `GuessAction`, the profile-tip in `InstructionPrompt`, the
   `state.me.profile` display.
6. **`client/src/components/Nations.tsx`**: delete `AxisReading`. The
   "Nations panel" becomes purely a clue-history view. Consider renaming
   it to "Clue history" — it's no longer a "nation" of any kind.
7. **`client/src/components/Reveal.tsx`**: delete `ProfileResults`.
8. **`client/src/components/Ended.tsx`**: delete `AxisRow`, the
   `profile-readout` div, the four profile-related `BreakdownRow`s. The
   end screen becomes word-only.
9. **`client/src/components/Lobby.tsx`**: drop the "Polyglot cluster
   bonus" / "Profile play" / "Profile axes" / "Public-accuracy bonus"
   list items. Keep the polyglot toggle's display since polyglot stays.
10. **`client/src/pages/Home.tsx`**: drop the Profile play `ToggleField`,
    the `ProfileAxesEditor` invocation, the helper
    `ProfileAxesEditor`/`NumberField` for accuracy bonus. Keep the
    Polyglot and Originality toggles.
11. **`client/src/styles.css`**: delete `.axis*`, `.nation-axes`,
    `.profile-result*`, `.profile-readout`, `.axis-binary*` rules. Some
    of these have several CSS blocks — search for each prefix.
12. **`bot-cli.mjs`**: delete `--profile-mode`, `--axes-json`,
    `--public-figures`, `--accuracy-bonus` flags + their parsing.
    Update `help`. Keep `--polyglot-bonus`, `--originality-bonus`.
13. **`AGENTS.md`**: rewrite section 5 (currently "Guessing for an
    opponent" with profile guidance). Profile-mode discussion goes away.
    Update review template (drop "Profile axes" / "Profile-mode
    feedback").
14. **`RULES.md`**: rewrite the entire profile/Nations/end-of-game
    sections. The game becomes: pool → clue → guess → score → repeat.
    Add a placeholder line `## Side-quest cards (coming next)` so the
    next phase has somewhere to land.
15. **One commit per file group** (1–4 server-side; 5–11 client/UI;
    12–14 docs). The commit message format is a short imperative
    sentence: `remove profile-axis types from shared/types`,
    `remove profile scoring from server/rooms`, etc.

### Verification

After all of phase 2 is committed:
- `npx tsc --noEmit` clean.
- Server starts on 3010, lobby renders, two browser tabs can join, host
  can start, a clue can be submitted, a guess can be submitted, scores
  appear, round advances, game ends. No JS errors in the browser console
  (open DevTools).
- Bot-cli still drives a game end-to-end. Use a 2-player run between two
  shells:
  ```
  node bot-cli.mjs create --url http://localhost:3010 --name Host --pool-size 15 --points-per-player 10 --fields roomCode,sessionToken
  # then in another shell:
  node bot-cli.mjs join --url http://localhost:3010 --room <CODE> --name Friend
  # play a round each, observe end.
  ```
- ELO file (`data/elo.json`) survives the schema bump. If old games can
  no longer be reloaded, that's fine — they're history, not state.

### What stays after phase 2

- Word pool, clue submission, guess submission, scoring (symmetric /
  generous / precision).
- Originality bonus (per-word uniqueness weight).
- Polyglot cluster bonus.
- Pool persistence (carry-forward of un-targeted words, fixed in phase 1).
- Animal labels for opponents during a round.
- ELO across games.
- Time bank (display only).
- Per-language word lists in `words/`.
- The 9-game tournament tooling and `data/overnight/STATUS.md` history
  (purely for archival reference).

## Phase 3: side-quest cards

This is the redesign. Don't start until phases 1 + 2 are committed.

### Vision

Each player privately holds 2 secret goal cards (drawn 3, kept 2) that
shape their play in a way that *doesn't* overlap with the word-association
loop. Cards come in two families:

- **Spatial / token cards.** When an opponent correctly identifies a word
  from your intended set, you place a token of your color on that word's
  cell in the pool. The pool needs a stable spatial layout — a grid, not
  a flowing list. End-of-game checks the pattern your tokens form against
  your goal cards. Examples: "tokens form a triangle of any size",
  "tokens cover at least one corner and the center", "tokens form a
  straight line of length ≥ 3", "no two of your tokens are adjacent".
- **Rule / vow cards.** Constraints on your clues themselves, evaluated
  per round. Examples: "no clue word containing the letter E", "all your
  clue words must share the same first letter as the round number",
  "every clue word must be exactly 5 letters", "your clue words are all
  homophonous with another English word". Score: +N if you held the vow
  every round, partial credit for almost.

Both families are *additive* to the existing word-game scoring. The card
bonuses fire only at game end. They don't change the round loop's
mechanics.

### Open design questions to settle before building

These need a quick chat with the user, not assumed:

1. **How many cards per player?** Pitch was "draw 3, keep 2". Confirm.
2. **Public or private?** User leaned private but flagged "maybe public".
   Private is the harder design (asymmetric info, post-game "ah-ha"
   reveal). Public is closer to a Codenames-of-Goals — everyone knows
   what everyone is chasing, opens up blocking. **Recommend** starting
   private and unlocking public as a per-game toggle.
3. **How do tokens interact with pool persistence?** When a word is
   targeted-and-removed, do the tokens on it persist? **Recommend** yes,
   the spatial layout outlives the words — the underlying pool is a grid
   of cells, words slot in and out, tokens are on the cell.
4. **Geometry vocabulary.** What patterns count? "Triangle", "line",
   "rectangle" need precise grid-coord definitions. Start with the
   simplest 3 patterns; expand from playtest feedback.
5. **Vow card precision.** Letter constraints are easy ("no E"). "Sound"
   constraints (e.g., "no plosives") need a phonetic database — too much
   for v1. Start with letter-class constraints only.
6. **Card balance.** Some cards are way easier than others. Without
   playtests we don't know which. Ship 12–15 cards, mark roughly
   equal-difficulty in 3 tiers, draw across tiers.

### Build sequence (after design questions settle)

1. **Pool grid layout.** Refactor the pool from `string[]` to a
   stable spatial structure (`{ row, col, word }[]`, or `string[][]`).
   Update everything that touches the pool (server, client display,
   carry-forward). Pool size becomes `rows × cols`.
2. **Token state.** Add `Player.tokens: { row, col }[]` and broadcast it
   in `PublicState`. Place tokens at round resolution: when a guesser
   correctly identifies word w from cluer C's intended set, append to
   C's token list the cell where w sat in the pool *that round*.
3. **Goal cards.** Add a `cards/` data folder with one JSON file per
   card type. Card schema: `{ id, name, description, family: "spatial"
   | "vow", evaluate: (state) => number }`. The evaluate function lives
   server-side (cards are JS modules, not pure data, since geometry
   needs code). At room creation, draw 3 random cards per player; they
   choose 2 in lobby.
4. **End-of-game card resolution.** After the win-trigger fires, evaluate
   each player's chosen cards. Their bonus is the sum. Display in the
   end screen alongside word scores.
5. **Lobby UI for card draft.** Player picks 2 of 3 dealt cards. Hidden
   from other players if private mode.
6. **Reveal at end-of-game.** Show every player's chosen cards and
   whether they hit them.

### Why this is "different in shape" from the profile mechanic

The profile mechanic asked players to *embed identity into clue choice*,
which is the same cognitive act as finding a clean cluster — that's why
friends called it redundant. Card goals ask for something *orthogonal*:
either a spatial pattern (which is about pool layout, not clue meaning)
or a rule constraint (which is about word form, not word meaning). Both
are decoupled from the cluster-finding loop, so they don't double-tax
the same brain muscle.

## Working style

- **Commit often** (per the user's standing convention). One commit per
  bug fix; small commits per profile-removal step. No co-author trailer.
  Don't push.
- **Update this file** as you finish each phase. Mark sections done with
  a brief result note. The next agent reads here first.
- **If you're stuck on a design call, stop and ask the user.** Don't
  guess on the open questions in phase 3.
- **Self-test by running the dev server in two browser tabs.** Most bugs
  show up in two-player flow; you can't catch them by reading code alone.
  Don't claim a phase is done until you've manually walked through one
  full game in the browser.

## Status as of writing

- Codebase on `main`, latest commit: `5a58173 Profile play off skips
  axes everywhere; binary mode shows two labelled buttons` (or whatever
  is HEAD when you read this — `git log -1` to confirm).
- Server *not* running. Originality bonus implemented; G1 tournament
  data exists in `data/games/1777327540962-ZN4CE.json` and
  `data/reviews/g1-*.md` for reference but is not load-bearing for this
  mission.
- The whole `data/` directory is gitignored; nothing in it is canonical.
- Phase 1 not started. Phase 2 not started. Phase 3 not started.

## Quick reference: file layout

```
shared/types.ts            – all shared types, settings shape
server/rooms.ts            – the game engine (round resolution lives here)
server/index.ts            – Socket.IO handlers
server/persistence.ts      – game-log JSON schema + ELO
server/words.ts            – pool drawing
server/elo.ts              – pairwise FIDE-style ELO
client/src/pages/Home.tsx  – game-creation form
client/src/pages/Room.tsx  – router shell, dispatches to phase components
client/src/components/Lobby.tsx, Round.tsx, Reveal.tsx, Ended.tsx, Nations.tsx, WordPool.tsx
client/src/styles.css      – all styling, single file
bot-cli.mjs                – CLI for agents
host-helper.sh             – background watchdog that calls round:next on reveal
AGENTS.md                  – agent player guide
RULES.md                   – game rules (user-facing)
DESIGN.md                  – older design notes (mostly obsolete; phase 2 will leave it as-is)
```
