# Phase 3 — open design questions

Answer inline by writing your pick (and any notes) under each question.
The agent will read this file before continuing phase 3.2+.

Conventions: write `> ANSWER: A` or `> ANSWER: A — also do X` under the
question. Free-form is fine.

---

## Q1. Token granularity

When a guesser correctly identifies word `w` from cluer `C`'s intended set,
how many tokens does `C` get on that cell?

- **A. One token per cell per round.** If 3 guessers all read `w` correctly
  from C, C still gets ONE token at that cell that round. Re-clueing the
  same cell in a future round stacks a second token. Spatial cards count
  cells in shapes, not "popularity stacks." Simpler card design.
- **B. One token per correct-guess event.** 3 correct readers = 3 tokens at
  the same cell. Spatial cards have to deal with stacks; opens designs like
  "have a cell with ≥3 tokens" but adds visual + scoring complexity.

Agent leans **A**.

> ANSWER:

---

## Q2. Vow-card trust model

Vow cards are free-form constraints (e.g. "every clue word starts with the
same letter as your name") that the server can't verify. How are they scored
at game end?

- **A. Always credit.** If the player kept the card, it scores its bonus.
  Honor system, matches the polyglot/morphology cheating clauses already in
  RULES.md. Friends-and-family game. Simplest UI.
- **B. Self-attest.** End-of-game modal asks "did you actually keep [vow X]?"
  per kept card; player toggles yes/no, server credits accordingly.

Agent leans **A**.

> ANSWER:

---

## Q3. Phase machine for the card draft

Cards are dealt and picked once at game start. Where does that live?

- **A. New phase `"draft"` between `lobby` and `round`.** Server transitions
  `lobby → draft` when host starts; once every connected player has confirmed
  their picks, it transitions `draft → round` and round 1 begins. Round-1
  time bank doesn't start until everyone has finished drafting.
- **B. Reuse `round` phase with a `draftPending` flag.** Round 1 starts but
  clue submission is blocked until each player has drafted. Lighter touch on
  the existing state machine but the time bank is awkward.

Agent leans **A**.

> ANSWER:

---

## Q4. Default `cardsDrawn` / `cardsKept`

Plan default is "3 drawn / 2 kept." Confirm? Or different?

> ANSWER:

---

## Q5. Bounds on `cardsDrawn` / `cardsKept`

What min/max per setting? Examples:
- `cardsDrawn`: 1–6? `cardsKept`: 1–4?
- Constraint: `cardsKept ≤ cardsDrawn` (server clamps).

> ANSWER:

---

## Q6. Spatial card "shape" vocabulary

Pool grid is `poolRows × poolCols` (default 4 × 5). Which shapes feel
playable enough to be actual cards? Pick any number; mark "skip" if you
hate one.

- **Line of N** — N tokens in a straight line (row, column, or diagonal),
  N=3 or 4 tier-1, N=5 tier-2.
- **Square 2×2** — 4 tokens at the corners of a 2×2 block.
- **Square 3×3 frame** — 8 tokens framing a 3×3 area.
- **L-shape** — 3 tokens making an L (2-long + 1 perpendicular).
- **T-shape** — 4 tokens, three across + one stem.
- **Cross / plus** — 5 tokens in a plus shape.
- **Diagonal of N** — N tokens on one diagonal, N=3 tier-1, N=4 tier-2.
- **Two opposite corners** — tokens on cells (0,0) AND (rows-1, cols-1).
- **All four corners** — corners of the grid.
- **Full row** — every cell in some row has at least one token.
- **Full column** — same for a column.
- **Density: any 2×2 block** — at least 1 token in each cell of any 2×2.
- **Knight's tour fragment** — token sequence connected by chess-knight
  moves. (Probably skip — hard to compute, hard to play for.)
- **Other shapes you'd like:**

> ANSWER:

---

## Q7. Vow-card content vocabulary

These are free-form constraints, scored on honor. Mark the ones you'd
ship; suggest your own.

- "Every clue word you submit this game starts with a vowel."
- "Every clue word is exactly one syllable."
- "Your shortest clue this game intends ≥4 words."
- "You never repeat the same first letter across two consecutive clues."
- "You never use a clue word longer than 5 letters."
- "Every clue word contains the letter X (X = your choice)."
- "At least one of your clues is in a language different from the
  pool's first language." (only for polyglot games)
- "You give a one-word clue at least once." (count = 1 intended word)
- "All your clue words rhyme with each other." (honor)
- "Every clue word is a noun." (honor; loose definition)
- **Other vows you'd want:**

> ANSWER:

---

## Q8. Card bonus magnitude

How many points should a successful card pay? Compare to typical end-game
score: target is `pointsPerPlayer × players`, default `18 × N`. For 4 players
that's a 72-point game. A card hitting at, say, +6 is ~8% — meaningful but
not game-deciding. Options:

- **A. Tiered.** Tier 1 = +4, tier 2 = +6, tier 3 = +9. Mix at draft so
  picking matters. Vows are flat tier 1 unless they're hard.
- **B. Flat.** Every kept card pays +5 if hit. No tiers.
- **C. Triangular by difficulty count.** Define a difficulty "size" per
  card (e.g. line of 3 = 3, line of 5 = 5); reward = T(size). Self-balancing.

Agent leans **A**.

> ANSWER:

---

## Q9. What happens when a card is unhit at game end?

- **A. Zero points; no penalty.** Standard.
- **B. Negative.** Some cards advertise "but −X if you fail." Spicier.

Agent leans **A** for v1.

> ANSWER:

---

## Q10. Card visibility during play

While the game is running, can you see your own kept cards on a side
panel, or only at the draft modal + end of game?

- **A. Always visible to you.** Side panel or expandable card on the round
  screen. You're constantly reminded of your goal.
- **B. Only at draft + reveal.** You commit, then you have to remember.
  Lighter UI, more demanding.

Agent leans **A** (matches "private goal you're chasing" — you should be
able to glance at it).

> ANSWER:

---

## Q11. Cards setting toggle

Should cards be a per-game host toggle (`enableCards: true`) or always on
once we ship phase 3?

- **A. Toggle.** Default off; host opts in. Lets you keep playing the
  vanilla base game when you want.
- **B. Always on.** Once shipped, they're part of the game.

Agent leans **A** — matches your "play the base, evaluate, then add stuff"
working style.

> ANSWER:

---

## Q12. Anything else

Is there a card type, mechanic, or constraint you want me to consider that
isn't above? Anything you want me NOT to do?

> ANSWER:
