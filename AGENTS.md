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

```
1. Join with --name, save sessionToken.
2. Loop until state.phase === "ended":
   a. status → state
   b. Switch on phase:
      - "lobby": wait. If you're the host, start when you want. (You won't usually be host as a bot.)
      - "round": decide based on what you owe:
          • If me.clue is null: pick a clue (Phase A). See §4.
          • Else if there's an opponent in round.hasClue
            you haven't guessed (not in me.guesses):
            guess that opponent (Phase B). See §5.
          • Else: wait — you've done your part this round.
      - "reveal": just wait for host to advance, OR if you ARE host, run `next`.
      - "ended": done. Print final scoreboard summary.
   c. Sleep 2–4s before re-polling so the server isn't pounded.
3. Final state printout.
```

Don't poll faster than once every 2 seconds; the game runs at human pace.

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

Inputs: opponent's clue word, opponent's clue count, the pool, the opponent's `nations` entry (their full clue history + table's running read on their axes).

Process:
1. Look at the opponent's clue word. Identify which `count` words in the pool best fit the cluster they'd intend.
2. Submit those as `--picks`.
3. **Profile axes**: for each axis in `settings.profileAxes`, pick a 1–5 value. Use:
   - `nations[opponent].averageAxes[i]` if there's enough samples — this is the table's running read.
   - The opponent's clue history (`nations[opponent].clueHistory`) — the words they've used to clue so far hint at their identity.
   - The current round's clue word — the strongest signal you have right now.
4. If you have no read on an axis, default to **3** (middle). Don't pick extremes blindly.
5. Output: `guess --target OPP_ID --picks w1,w2 --axes 1,2,3,4`.

Find the opponent's `playerId` via `Object.entries(state.round.opponentClues)` — opponents are sorted by submission time elsewhere, but `id` is what you pass to `--target`.

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
