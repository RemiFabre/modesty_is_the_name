# Modesty is the Name: Rules

A simultaneous-play word-association party game inspired by Codenames. 3–8 players, browser-based, ~20–40 minutes per game.

## Quick overview

Every player plays simultaneously every round. You give one clue, you guess what each opponent meant by their clue. The round resolves all at once. The first player to a target score triggers the end of the game.

---

## Setup

The host creates a room. Before starting, the host picks:

- **Languages**: one or more of English, French, Spanish, Portuguese, German, Italian, Polish, Dutch, Turkish, Czech. The pool draws roughly equally from each.
- **Scoring mode**: Symmetric (+1/−1), Generous (+2/−1), or Precision (T(N) all-or-nothing).
- **Polyglot cluster bonus** (optional, only meaningful with ≥2 languages).
- **Originality bonus** (optional).
- **Advanced (optional)**: pool size (default 20), per-player time bank, per-action top-ups, target points per player.

The host gets a shareable room link. Friends click the link, type a name, and land in the lobby. The host clicks **Start game** when ready; no further joins after that.

---

## A round

Each round has two overlapping phases for each player.

### Phase A: Clue (simultaneous)

Every player simultaneously:
1. Picks **1–9 public words** from the shared pool. These are your *intended* words.
2. Writes one **clue word** that connects them.

The clue word is free-form. The number of intended words is implicit (= however many you picked).

You only see the *count* of intended words others have picked (and their clue word, after you've submitted yours). You never see which specific words anyone else intended until end-of-round reveal.

### Phase B: Guess (per opponent, in submission order)

The moment you submit your clue, you start being shown opponents' clues one at a time, in the order they submitted. Opponents are shown by **anonymous animal labels** (Wolf, Fox, Owl…) that reshuffle every round; their real names come back at end-of-turn.

For each opponent's clue you must pick **exactly N** public words you think they intended (N = the number they announced).

Submit advances you to the next opponent. You wait if no opponent has submitted yet.

### Round resolution

When every connected player has submitted their clue and every clue-submitter has guessed for every other clue-submitter, the round resolves automatically.

---

## Scoring per round

For each pair `(guesser, target)` where the guesser submitted a guess for the target's clue:

Compute `hits` = number of guesser's picks that were in target's intended set. `misses` = picks − hits.

| Mode | Per-pair delta (applied to BOTH guesser and target) |
|---|---|
| **Symmetric** *(default)* | `hits − misses` |
| **Generous** | `2 × hits − misses` |
| **Precision** | All-or-nothing: `T(N) = N(N+1)/2` if every pick was correct, else `0`. T(N) → 1, 3, 6, 10, 15, 21, 28, 36, 45 for N=1..9. No negatives. |

The per-pair delta is added to **both** the guesser and the target. The whole game is symmetric: a clue that lands earns its giver and its reader the same number of points.

### Standings
Score is updated only at round resolve. During the round, standings show end-of-previous-round totals, by real name. Anonymity applies only to the per-clue prompt.

---

### Polyglot cluster bonus (optional)

If the lobby creator enables `polyglotBonus` AND the game has multiple languages active, an extra bonus is added to the per-pair delta when **all** intended words are correctly guessed.

The bonus is computed by partitioning the matched words into "horizontal slices" (each slice is one cluster of words from distinct languages) and summing T(slice_size).

**Example.** Matched picks: 3 English + 2 French + 1 Spanish.
- Slice 1: {EN, FR, ES} = 3 langs → T(3) = **6**
- Slice 2: {EN, FR} = 2 langs → T(2) = **3**
- Slice 3: {EN} = 1 lang → T(1) = **1**
- Total cluster bonus: **+10** to both guesser and clue-giver

The bonus scales naturally with the number of languages and rewards finding tight clusters that span the most languages possible. Single-language pools never trigger this bonus (there are no cross-language clusters to form).

### Originality bonus (optional)

If `originalityBonus` is enabled, every correctly-guessed word `w` is weighted by **how unique that pick was** instead of counting as 1. Concretely, `U(w) = 1 - (c(w) - 1) / max(N - 1, 1)`, where `c(w)` is the number of cluers (this round) whose intended set contained `w` and `N` is the number of cluers. So:

- Only one cluer picked `w` → `U = 1` (full credit).
- Two cluers picked `w` in a 5-player round → `U = 0.75`.
- Every cluer picked `w` → `U = 0` (the word carried no information, so it's worth nothing).

The same formula applies inside every scoring mode: in symmetric, `delta = Σ U(w) − misses`; in generous, `2·Σ U(w) − misses`; in precision (all-or-nothing), `delta = Σ U(w) · (N+1)/2`, which collapses to `T(N)` when every word was unique and to 0 when every word was shared. Symmetric to both guesser and clue-giver. Final per-pair delta is rounded to the nearest integer.

The point: discourage convergence on the obvious cluster (everyone clueing "animals" on a pool full of animals) and reward lateral connections nobody else saw.

## Cheating

Like the **same-family clue word** rule, polyglot mode and the cluster bonus run on good faith. Some patterns are obvious cheating but not enforced by the server:
- Cluing the literal language name ("English", "français", "español") to bind every word from that language.
- Picking intended words just by their language without semantic connection.
- Cluing a word from the same morphological family as a public word.
- Cluing with multiple words.

The game is for friends and family, not strangers. If a competitive online mode is ever added, automatic detection and/or post-game voting will go in then.

## Pool persistence

After a round resolves, the pool **partially carries over to the next round**:

- Words that were in *anyone's* intended set this round are removed and replaced with fresh random words from the dictionary.
- Words no one targeted **stay** in the pool. They're either uninteresting or genuinely hard.

Over multiple rounds, the pool drifts toward harder, less-obvious words. This is by design.

---

## Time bank

Each player has one personal clock. It ticks down only when you owe an action (your clue, or a guess for a visible opponent). When you submit a clue you get a top-up (default +120 s); each guess gives a smaller top-up (default +60 s). Capped at the max bank (default 4 min).

It's display-only. Nothing happens automatically when it hits zero (it goes red). For the friends-around-the-table version we just wait.

---

## End of game

When any player's score reaches `pointsPerPlayer × number_of_players` (default `18 × players`), the game ends after that round resolves. Highest score wins.

The final scoreboard reveals each player's score broken down into:
- **Words you guessed correctly** (the points you earned by reading others)
- **Words others got from you** (the points others earned you by reading your clues)

Both halves include any polyglot or originality bonus baked in.

---

## Side-quest cards (coming next)

A future addition will deal each player a small hand of **secret goal cards** at game start: spatial token-path cards (score by laying tokens on the pool grid in shapes) and free-form vow cards (constraints on the *form* of your clue words). Cards are private; they bias each player's play orthogonally to the cluster-finding loop. Details to come.

---

## Strategy notes

- **Clear cluing pays.** A clue that opponents can guess gets you word points. The strongest players are *legible*, not cryptic.
- **Precision mode rewards confidence.** A perfect 7-word clue is +28 in Precision. A miss is 0. Don't go big unless you have a clean read.
- **Anonymous labels reshuffle every round.** "Wolf" is a different real player each round. The accumulated clue history (in the Clue-history panel) is by real name, but any player who pays attention can correlate.
- **The pool drifts.** Targeted words leave; un-targeted ones stay. Late rounds tend to have weirder, harder words because the easy ones get cleared early.

---

## Lobby controls (full reference)

- **Languages**: pick one or more dictionaries. ~500–1100 single-token nouns per language.
- **Scoring**: `Symmetric` / `Generous` / `Precision`. See the table above.
- **Polyglot cluster bonus**: extra reward, only meaningful with ≥2 languages active.
- **Originality bonus**: weight correctly-guessed words by uniqueness across cluers.
- **Pool size**: number of public words at any time. 9 minimum, 40 maximum, 20 default.
- **Initial bank**: starting per-player clock (default 3 min).
- **Max bank**: cap on the bank after top-ups (default 4 min).
- **Top-up on clue submit**: added to your clock when you submit your clue (default 120 s).
- **Top-up per guess**: added to your clock per per-opponent guess submitted (default 60 s).
- **Points per player**: game ends when someone hits `this × players`. Default 18.
