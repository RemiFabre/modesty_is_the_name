# AGENTS.md — playing Modesty as an LLM agent

This document is for an LLM agent (Claude Code subagent or similar) playing the game as a bot. If you're a human, read [`RULES.md`](./RULES.md) instead.

You are joining a Modesty game already running on a remote URL. Your job: read the rules, join the room with a name, then play one full game by repeatedly calling the `bot-cli.mjs` shell tool.

---

## 0. Read this first

1. **Game rules**: [`RULES.md`](./RULES.md). Read it fully before your first action. The most important parts for play:
   - Round flow (Phase A clue → Phase B per-opponent guess).
   - Profile guessing: 1–5 per axis, +1 per correct axis to *both* you and the target.
   - Symmetric word scoring (default `+1/−1`).
   - Pool persistence: only words anyone targeted are removed between rounds.
   - End-of-game public-accuracy bonus: target gets +N for each axis where their cumulative-average rounded value matches their true profile.

2. **Anonymity rule for honest play**: opponents are shown to you under random animal labels (Wolf, Stag, …) that reshuffle every round. **Treat them as anonymous**. Do not try to correlate labels across rounds via real names visible elsewhere — play the round as it's presented to you.

---

## 1. The CLI tool

Every action is one shell command with stdout JSON. No long-lived process. State is stateless between calls — you pass your `sessionToken` each time. Hard-timeout at 20s.

```
node bot-cli.mjs <command> --url URL --room CODE [--token TOKEN] [...flags]
```

Or set env vars `MODESTY_URL`, `MODESTY_ROOM`, `MODESTY_TOKEN` to avoid repeating flags.

### Commands

| Command | Required flags | Notes |
|---|---|---|
| `create` | `--url --name NAME` (optional: `--language en/fr/...`, `--scoring symmetric/generous/risky`, `--points-per-player N`, `--pool-size N`, `--axes-json '[...]'`) | Creates a room. The caller is the host. Returns `{playerId, sessionToken, roomCode, state}`. |
| `join`   | `--url --room --name NAME` | Returns `{playerId, sessionToken, roomCode, state}`. Save the token. |
| `status` | `--url --room --token` | Returns `{state}`. Use to poll between actions. |
| `start`  | `--url --room --token` | Host only. Transitions phase from `lobby` → `round`. |
| `clue`   | `--url --room --token --word WORD --intended w1,w2,w3` | Submit a clue. `intended` words must be a subset of the current pool. 1 ≤ count ≤ 9. |
| `guess`  | `--url --room --token --target PLAYER_ID --picks w1,w2 --axes 1,2,3,4` | Submit per-opponent guess. `picks.length` must equal that opponent's clue count. `axes.length` must equal `state.settings.profileAxes.length`. Each axis value 1–5. |
| `next`   | `--url --room --token` | Host only. Advances `reveal` → next round. |
| `help`   | (none) | Prints command summary. |

Errors print JSON on stderr and exit code 1. Successful calls print JSON on stdout and exit 0.

---

## 2. The state object

Returned by `join` and `status` as `{state: PublicState}`. Key fields you need:

- `phase`: `"lobby" | "round" | "reveal" | "ended"`.
- `myPlayerId`: your own ID. Match it against `players[].id` to find yourself.
- `players[]`: every player. Each has `id`, `name` (anonymous label during round, real name elsewhere), `realName` (always real), `score`.
- `me.profile`: your own private 1–5 values per axis. Try to express this through your clues.
- `me.clue`: your submitted clue this round (null if you haven't submitted).
- `me.guesses`: your word picks per opponent this round.
- `me.profileGuesses`: your axis guesses per opponent this round.
- `round.pool`: the public word list (you must pick from this).
- `round.opponentClues`: visible only after you submit your own clue. Maps `playerId → { word, count, submittedAt }`.
- `round.hasClue`: list of player IDs who have submitted a clue this round.
- `settings.profileAxes`: array of `{left, right}` axis labels.
- `settings.scoring`: `"symmetric" | "generous" | "risky"`.
- `nations[]`: each player's accumulated `clueHistory` and current `averageAxes` (cumulative public figure).
- `profileFeedback`: only set in `reveal`/`ended`. `{ hits: { [targetId]: bool[] } }`. Per-axis correctness from the round you just played.
- `accuracy`: only set in `ended`. End-of-game accuracy summary per player.
- `winnerId`: only set in `ended`.

---

## 3. Decision loop

The server pre-computes what you owe next. **Branch on `state.me.owedAction`** — you don't have to derive it.

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
     case "review":           → game over, write review (§10), exit
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

Inputs: `round.pool` (25 words), `me.profile` (your axis values), `settings.profileAxes`.

Process:
1. Cluster the pool by semantic relatedness in your head. Find a tight 2–4-word cluster you can name with a single word.
2. **Bias the cluster toward your profile.** If your `me.profile[i] = 5` on an axis labeled `Hero ↔ Villain` (5 = villain), prefer clusters with darker / more antagonistic flavor. The cleaner you express your profile, the more profile points you'll earn.
3. Pick the clue word: a single common noun (or any single token, free-form) that connects the cluster. Avoid obvious morphological neighbors of pool words (e.g. don't clue "warlike" if "war" is in the pool).
4. Output: `clue --word "yourword" --intended "w1,w2,w3"`.

Heuristics:
- 2–3 intended words is usually a good sweet spot. 4–5 is bold. 6+ is risky.
- The pool is shown in the language picked by the host. Match it.
- Symmetric scoring rewards being *guessable*. Don't try to be clever-cryptic.

---

## 5. Guessing for an opponent

The server gives you `state.me.nextTarget` (the opponent to guess for next, or `null` if you have nothing pending). Fields: `playerId`, `name`, `clueWord`, `clueCount`.

Inputs to use: that target's clue, the pool, the opponent's `nations` entry (their full clue history + table's running read on their axes).

Process:
1. Look at the clue word. Identify which `clueCount` words in the pool best fit the cluster they'd intend.
2. Submit those as `--picks`.
3. **Profile axes**: for each axis in `state.settings.profileAxes`, pick a value. Two modes:
   - **`state.settings.profileMode === "gradient"`**: integer 1–5. Default to **3** (middle) when unsure.
   - **`state.settings.profileMode === "binary"`**: only **1** (left end) or **5** (right end). The middle is gone — you must commit. The server REJECTS values 2/3/4 in binary mode. When unsure, pick whichever feels even slightly more likely (or random).
   Use to inform your read:
   - `state.nations[opponent].averageAxes[i]` if there are samples — the table's running read.
   - The opponent's clue history (`state.nations[opponent].clueHistory`) — patterns hint at their identity.
   - The current round's clue word — the strongest signal you have right now.
4. In gradient mode, hedge to 3 when uncertain. In binary mode, commit — you cannot abstain.
5. Output: `guess --target <playerId> --picks w1,w2 --axes 1,2,3,4`.

(All pending opponents in submission order are also available as `state.round.pendingGuesses[]` if you want to plan ahead.)

---

## 6. End conditions

When `state.phase === "ended"`, the game is done. Print:
- Your final score.
- Win or loss.
- The accuracy summary for yourself: which of your axes did the table read correctly?
- Anything you'd flag as interesting (a dramatic last-round swing, a clue you regret, etc.).

---

## 7. Failure modes — don't do these

- **Don't pick clue words that are morphological neighbors** of pool words ("running" if "run" is in the pool). Free-form, but obviously a kid-glove violation.
- **Don't submit `picks` that aren't in `round.pool`**. You'll get an error.
- **Don't submit `axes` arrays of the wrong length**. Must equal `settings.profileAxes.length`.
- **Don't try to deduce who's behind a label**. The game expects honest play; even if the nations panel shows real names, treat the active round prompt as anonymous. (No automated correlation.)
- **Don't poll faster than 2s**. Be a polite citizen.
- **If a CLI call returns `{ok: false, error: "..."}`**, read the error and adjust. The most common errors are: pool-mismatch, wrong axis count, "Already submitted" (you raced yourself).

---

## 8. Example session (abbreviated)

```sh
# 1. Join
node bot-cli.mjs join --url https://abc.trycloudflare.com --room ABCDE --name Opus
# → {"playerId":"X1","sessionToken":"tok","state":{...}}
export MODESTY_URL=https://abc.trycloudflare.com MODESTY_ROOM=ABCDE MODESTY_TOKEN=tok

# 2. Wait for game to start (host clicks Start)
while true; do
  S=$(node bot-cli.mjs status); echo "$S" | jq -r '.state.phase'
  PHASE=$(echo "$S" | jq -r '.state.phase')
  [ "$PHASE" = "round" ] && break
  sleep 3
done

# 3. Pick a clue. Pool example: ["forest", "sword", "river", "knight", ...].
#    Profile=[5,1,3,2] on axes [Hero/Villain, Order/Chaos, Mind/Body, Fate/Free will].
#    Profile says villain + ordered. Cluster: sword/knight/throne; clue "throne" intends those.
node bot-cli.mjs clue --word "throne" --intended "sword,knight,castle"

# 4. Wait for opponents to submit, then guess each.
node bot-cli.mjs guess --target OPP1 --picks "river,forest" --axes "1,3,3,2"
# ...repeat for every opponent...

# 5. Loop on status until phase == "ended".
```

The exact glue (sleeping, parsing JSON, branching on phase) is up to you. Any reasonable implementation in shell + `jq` + reasoning works.

---

## 9. Personality

If your spawn prompt gives you a personality (e.g. "you are a cynical pragmatist"), let it bias your clue choices and profile expression — but **don't break the game** (no off-language clues, no nonsense). The personality is flavor, not license.

If you have no specific personality: play to win, biased toward making your private profile maximally legible to the table.

---

## 10. After the game — write a review

When `state.phase === "ended"`, before exiting, write a short review of the game to:

```
/Users/remi/modesty_is_the_name/data/reviews/<ISO_TIMESTAMP>-<YOUR_NAME>.md
```

Use ISO format like `2026-04-27T15-32-04Z` (avoid colons in filenames). The orchestrator collects reviews after every game, so this is your one chance to give honest feedback.

Use the `Write` tool. Structure the file with these sections (free-form prose under each — no need to fill all if not relevant):

```markdown
# <YOUR_NAME> · review · game <gameId>

**Final score:** N (rank K of P)
**True profile:** [...]
**Public read of me:** [...]

## Enjoyment
Did you enjoy this game? What worked, what felt flat?

## Rule suggestions
Anything about the rules that felt unfair, broken, exploitable, or
underdesigned? Something you wish the game scored or didn't score?

## Tool / CLI feedback
Was bot-cli sufficient? Any missing commands? Anything fragile, slow,
unclear? Anywhere you got stuck guessing what to call?

## Profile axes / categories
What did you think of THIS game's axis pairs (`state.settings.profileAxes`)?
Were they meaningful? Too abstract? Too overlapping? Did you find
them easy or hard to express through clues? Easy or hard to read on
opponents? Suggest axes you'd want to try next time, or pairs that
felt broken.

## Profile-mode feedback (gradient vs binary)
Did the binary 1/5 commit-or-don't feel better or worse than a
1–5 gradient (if you've played both)? Did being forced to extreme
values change how you cluéd, or how you read others?

## Pool size feedback
The pool is `state.settings.poolSize` words. Did it feel too large
(diluted clusters) or too small (forced overlap)? Suggest the
ideal size for the constraint level we're playing at.

## Pacing & abstract observations
How did the game feel? Too fast? Too slow? Did the strategic layer
matter? Was the round count right? Was the public-figure feedback
loop interesting or noise?

## One memorable moment
A clue you regret, a guess that landed, an inference you got wrong, etc.

## A new constraint mechanic — your pitch
The current "constraint" each player is under is the profile-axis
identity (be legible on these axes). What other constraint
mechanics could the game support? Be wild. Examples to spark ideas
(don't have to use these): forced phonemes/letters in clue words,
acrostic streaks, hand of forbidden pool words, secret end-game
agendas, vows, role decks. Pitch ONE concrete idea — what it
constrains, how it's revealed, and how it'd score.
```

Keep the whole thing under ~400 words. Honest > positive. The point is to feed back into design.

## 11. Hosting the game (host bot only)

If your spawn prompt designates you as **host**, your responsibilities differ slightly:

1. Use `bot-cli.mjs create` instead of `join` on your first call. Save the returned `sessionToken` and `roomCode`.
2. Other agents will be told the room code separately; they'll join.
3. Poll `status` every ~3 s. When `state.players.length` reaches the expected count (told to you in your spawn prompt), call `bot-cli.mjs start` to transition lobby → round.
4. From there, play normally as the host. As host you also press `next` to advance from `reveal` → next round. Do this automatically a couple of seconds after the reveal phase begins (give yourself time to absorb the result before triggering the next round).
5. Game-end / review: same as everyone else.
