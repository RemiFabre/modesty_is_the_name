# AGENTS.md: playing Modesty as an LLM agent

This document is for an LLM agent (Claude Code subagent or similar) playing the game as a bot. If you're a human, read [`RULES.md`](./RULES.md) instead.

You are joining a Modesty game already running on a remote URL. Your job: read the rules, join the room with a name, then play one full game by repeatedly calling the `bot-cli.mjs` shell tool.

---

## 0. Read this first

1. **Game rules**: [`RULES.md`](./RULES.md). Read it fully before your first action. The most important parts for play:
   - Round flow (Phase A clue → Phase B per-opponent guess).
   - Scoring is symmetric: every correct word scores BOTH the guesser and the clue-giver.
   - Pool persistence: only words anyone targeted are removed between rounds.

2. **Anonymity rule for honest play**: opponents are shown to you under random animal labels (Wolf, Stag, …) that reshuffle every round. **Treat them as anonymous**. Do not try to correlate labels across rounds via real names visible elsewhere. Play the round as it's presented to you.

---

## 1. The CLI tool

Every action is one shell command with stdout JSON. No long-lived process. State is stateless between calls (you pass your `sessionToken` each time). Hard-timeout at 20s.

```
node bot-cli.mjs <command> --url URL --room CODE [--token TOKEN] [...flags]
```

Or set env vars `MODESTY_URL`, `MODESTY_ROOM`, `MODESTY_TOKEN` to avoid repeating flags.

### Commands

| Command | Required flags | Notes |
|---|---|---|
| `create` | `--url --name NAME` (optional: `--languages en,fr,es`, `--scoring symmetric/generous/precision`, `--points-per-player N`, `--pool-size N`, `--polyglot-bonus true`, `--originality-bonus true`) | Creates a room. The caller is the host. Returns `{playerId, sessionToken, roomCode, state}`. |
| `join`   | `--url --room --name NAME` | Returns `{playerId, sessionToken, roomCode, state}`. Save the token. |
| `status` | `--url --room --token` | Returns `{state}`. Use to poll between actions. |
| `start`  | `--url --room --token` | Host only. Transitions phase from `lobby` → `round`. |
| `clue`   | `--url --room --token --word WORD --intended w1,w2,w3` | Submit a clue. `intended` words must be a subset of the current pool. 1 ≤ count ≤ 9. |
| `guess`  | `--url --room --token --target PLAYER_ID --picks w1,w2` | Submit per-opponent guess. `picks.length` must equal that opponent's clue count. |
| `next`   | `--url --room --token` | Host only. Advances `reveal` → next round. |
| `help`   | (none) | Prints command summary. |

Errors print JSON on stderr and exit code 1. Successful calls print JSON on stdout and exit 0.

---

## 2. The state object

Returned by `join` and `status` as `{state: PublicState}`. Key fields you need:

- `phase`: `"lobby" | "round" | "reveal" | "ended"`.
- `myPlayerId`: your own ID. Match it against `players[].id` to find yourself.
- `players[]`: every player. Each has `id`, `name` (anonymous label during round, real name elsewhere), `realName` (always real), `score`.
- `me.clue`: your submitted clue this round (null if you haven't submitted).
- `me.guesses`: your word picks per opponent this round.
- `round.pool`: the public word list (you must pick from this).
- `round.poolLangs`: object mapping each pool word to its canonical language (e.g. `{ "table": "en", "rivière": "fr" }`). Useful when polyglot bonus is on (group your intended words across languages).
- `state.settings.originalityBonus`: when true, your correctly-guessed words are weighted by how unique each pick is (only-you-picked = full, everyone-picked = zero). Avoid the obvious shared cluster, look for lateral angles.
- `round.opponentClues`: visible only after you submit your own clue. Maps `playerId → { word, count, submittedAt }`.
- `round.hasClue`: list of player IDs who have submitted a clue this round.
- `settings.scoring`: `"symmetric" | "generous" | "precision"`.
- `clueHistories[]`: each player's accumulated clue words so far in the game.
- `winnerId`: only set in `ended`.

---

## 3. Decision loop

The server pre-computes what you owe next. **Branch on `state.me.owedAction`** (you don't have to derive it).

```
1. Join (or rejoin with sessionToken)
2. Loop until phase === "ended":
   action = status.state.me.owedAction
   switch (action) {
     case "host_start":       → call `start` when state.players.length is the expected count
     case "wait_for_start":   → sleep 3s, re-poll
     case "submit_clue":      → pick clue + intended, call `clue` (see §4)
     case "submit_guess":     → state.me.nextTarget tells you whom; call `guess` (see §5)
     case "wait_for_others":  → you're done this round, sleep 3s, re-poll
     case "host_advance":     → call `next` to advance reveal → next round (sleep ~3s before, give time to read results)
     case "wait_for_advance": → sleep 3s, re-poll
     case "review":           → game over, write review (§7), exit
   }
   sleep 2-3s
```

**Token efficiency:** if you only need one field, use `--field PATH`:
```
node bot-cli.mjs status --token X --room Y --field state.me.owedAction
# → "submit_clue"

node bot-cli.mjs status --token X --room Y --field state.round.pendingGuesses
# → [{playerId,name,clueWord,clueCount}, ...]
```

Don't poll faster than once every 2 seconds.

---

## 4. Picking a clue

Inputs: `round.pool` (typically ~20-25 words).

Process:
1. Cluster the pool by semantic relatedness in your head. Find a tight 2–4-word cluster you can name with a single word. **Polyglot games**: `state.settings.languages` may contain multiple languages (the pool will be a mix). Cluster across languages freely; your clue word can be in *any* of those languages and target *any* mix of words from any language. Cross-language semantic links (e.g. an English clue binding `wave` + Spanish `marea` + French `port`) are *encouraged*. They're the most expressive plays.
2. Pick the clue word: a single common noun (or any single token, free-form) that connects the cluster. Avoid obvious morphological neighbors of pool words (e.g. don't clue "warlike" if "war" is in the pool).
3. Output: `clue --word "yourword" --intended "w1,w2,w3"`.

Heuristics:
- 2–3 intended words is usually a good sweet spot. 4–5 is bold. 6+ is risky.
- Symmetric scoring rewards being *guessable*. Don't try to be clever-cryptic.

---

## 5. Guessing for an opponent

The server gives you `state.me.nextTarget` (the opponent to guess for next, or `null` if you have nothing pending). Fields: `playerId`, `name`, `clueWord`, `clueCount`.

Inputs to use: that target's clue, the pool, the opponent's `clueHistories` entry (their full clue history).

Process:
1. Look at the clue word. Identify which `clueCount` words in the pool best fit the cluster they'd intend.
2. Submit those as `--picks`.
3. Output: `guess --target <playerId> --picks w1,w2`.

(All pending opponents in submission order are also available as `state.round.pendingGuesses[]` if you want to plan ahead.)

---

## 6. Failure modes: don't do these

- **Don't pick clue words that are morphological neighbors** of pool words ("running" if "run" is in the pool). Free-form, but obviously a kid-glove violation.
- **Don't submit `picks` that aren't in `round.pool`**. You'll get an error.
- **Don't try to deduce who's behind a label**. The game expects honest play; even if the clue-history panel shows real names, treat the active round prompt as anonymous. (No automated correlation.)
- **Don't poll faster than 2s**. Be a polite citizen.
- **If a CLI call returns `{ok: false, error: "..."}`**: read the error and adjust. The most common errors are: pool-mismatch, wrong picks count, "Already submitted" (you raced yourself).

---

## 7. After the game: write a review

When `state.phase === "ended"`, before exiting, write a short review of the game to:

```
/Users/remi/modesty_is_the_name/data/reviews/<ISO_TIMESTAMP>-<YOUR_NAME>.md
```

Use ISO format like `2026-04-29T15-32-04Z` (avoid colons in filenames). The orchestrator collects reviews after every game, so this is your one chance to give honest feedback.

Use the `Write` tool. Structure the file with these sections (free-form prose under each, no need to fill all if not relevant):

```markdown
# <YOUR_NAME> · review · game <gameId>

**Final score:** N (rank K of P)

## Enjoyment
Did you enjoy this game? What worked, what felt flat?

## Rule suggestions
Anything about the rules that felt unfair, broken, exploitable, or
underdesigned? Something you wish the game scored or didn't score?

## Tool / CLI feedback
Was bot-cli sufficient? Any missing commands? Anything fragile, slow,
unclear? Anywhere you got stuck guessing what to call?

## Pool size feedback
The pool is `state.settings.poolSize` words. Did it feel too large
(diluted clusters) or too small (forced overlap)? Suggest the
ideal size for the constraint level we're playing at.

## Polyglot feedback (only if `state.settings.languages.length > 1`)
The pool drew from multiple languages. Did the polyglot mix
make cluing harder, easier, or just different? Did you successfully
clue across language boundaries (e.g. an English clue picking up a
Spanish word in the pool)? Was the rough-equal-per-language
distribution apparent? Anything you'd change?

## Pacing & abstract observations
How did the game feel? Too fast? Too slow? Was the round count right?

## One memorable moment
A clue you regret, a guess that landed, an inference you got wrong, etc.
```

Keep the whole thing under ~400 words. Honest > positive. The point is to feed back into design.

## 8. Hosting the game (host bot only)

If your spawn prompt designates you as **host**, your responsibilities differ slightly:

1. Use `bot-cli.mjs create` instead of `join` on your first call. Save the returned `sessionToken` and `roomCode`.
2. Other agents will be told the room code separately; they'll join.
3. Poll `status` every ~3 s. When `state.players.length` reaches the expected count (told to you in your spawn prompt), call `bot-cli.mjs start` to transition lobby → round.
4. From there, play normally as the host. As host you also press `next` to advance from `reveal` → next round. Do this automatically a couple of seconds after the reveal phase begins (give yourself time to absorb the result before triggering the next round).
5. Game-end / review: same as everyone else.
