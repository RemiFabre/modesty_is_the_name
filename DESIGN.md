# Modesty is the Name — Design Document

A simultaneous-play, word-association party game inspired by Codenames, designed to be played in the browser on phones. Open source, no monetization.

This document captures the v1 spec, the longer-term strategic vision, the open questions, and the technical decisions behind the project.

---

## 1. Technology stack

### The question

Should we build a Node.js web server + cloudflared tunnel (the same setup used on the previous board game project), or build native Android / iOS apps?

### Recommendation: web app, hosted via Node.js + cloudflared for now

For this project specifically, the web-app path is the right call. Reasons, in order of importance:

1. **Zero install friction for friends.** Friends open a URL (or scan a QR code) on whatever phone they own and they're in. No App Store, no TestFlight, no signing, no "I have an old Android, will it work?". For a party game played a handful of times with friends, install friction would kill the project.
2. **Cross-platform for free.** Modern mobile browsers (Safari iOS, Chrome Android) handle everything we need: WebSockets, touch, viewport, vibration, etc.
3. **Iteration speed.** During a playtest you can ship a rule change in 30 seconds and ask everyone to refresh. With a native app you'd be rebuilding and redistributing.
4. **Cloudflared tunnel is excellent for playtests.** Free, no port-forwarding or hosting account needed, gives you a public HTTPS URL pointing at `localhost:3000`. We can later move to a real host (Fly.io / Railway / Render / Cloudflare Workers) once the rules stabilize, without rewriting the app.
5. **Open-source-friendly.** No App Store gatekeeping, no developer account fees, no review delays.

Native apps (React Native, Flutter, Swift, Kotlin) would multiply the timeline by 5–10× for a worse outcome here. If down the road you want a richer native experience, a web app can be wrapped in Capacitor or shipped as a PWA — that bridge exists when/if you need it.

### Concrete stack

- **Backend:** Node.js + **Express** (HTTP) + **Socket.IO** (real-time).
  - Rationale for Socket.IO over bare `ws`: it handles room-based broadcasting, automatic reconnection, and fallback transports. For a phone-on-flaky-wifi audience, the reconnection logic alone is worth it.
- **Frontend:** **Vite + React + TypeScript**. Single-page app served by the same Node server in production.
  - Rationale: React's component model fits the "lobby → entry phase → guessing phase → scoring" state machine cleanly. TypeScript catches a whole class of bugs that would otherwise show up mid-playtest. Vite gives us instant HMR.
  - Alternative considered: plain HTML/JS. Faster to start, but the UI has enough state (timers, per-opponent guess panels, animations between phases) that a framework will pay for itself within the first few hours.
  - Alternative considered: Svelte. Equally good choice; React picked only for ecosystem familiarity.
- **State:** In-memory on the Node server. No database for v1 — a game lives as long as the process. Good enough for parties; we can add Redis or SQLite persistence later if you want to support reconnects across restarts.
- **Game rooms:** Each game has a short room code (e.g. `BAOBAB`). Host creates a room, others join via URL like `https://<tunnel>.trycloudflare.com/r/BAOBAB`.
- **Local dev:** `npm start` runs server on `:3000`, `cloudflared tunnel --url http://localhost:3000` exposes it. We may script this as `npm run tunnel` for convenience.

### What I'd defer

- **Authentication.** Not needed — players just pick a name when they join the room.
- **Persistence.** Games are ephemeral.
- **Spectator mode, replay, stats.** All "v2 if we like the game".
- **Mobile-app shell.** Pure web first; PWA manifest is a 10-minute add later.

---

## 2. The Game

### 2.1 Core idea

Codenames has a great central mechanic — finding semantic links between words — but suffers from **role asymmetry**: two players (the spymasters) do nearly all the thinking while the rest wait. Modesty is the Name keeps the word-association mechanic but makes **everyone play simultaneously, every turn.** Every player is both a clue-giver and a guesser, every round.

This will probably make the game more "try-hard" / focused than Codenames. We accept that tradeoff: this is not the game you put on the table for a casual family Sunday — it's the game you play with friends who like word games.

### 2.2 v1 — Simultaneous Codenames

The minimum viable version. Rules:

**Setup**
- N players (designed for 3–8).
- A pool of **public words** in the center, e.g. 16–25 words drawn from a curated list, visible to everyone.
- One language per game, chosen at room creation.

**Phase A — Clue (simultaneous, ~120 s)**
- Every player **simultaneously** writes a clue: a single word + a selection of **N public words** (1 ≤ N ≤ 9). The number `N` is implicit (the count of selected words).
- The clue-giver's selected words are their **secret intended set** — kept hidden from the other players until reveal. They are how the game knows which guesses were "right".
- Free-form text input in v1 for the clue word — no dictionary check, no anti-cheat. If a player cheats, the table will know.
- When a player submits their clue, the clock keeps running for the others, but they get a head start on Phase B.

**Phase B — Guess (per opponent, ~60 s each)**
- As soon as you've submitted your clue, you start seeing the clues of opponents who also submitted, **one at a time**, in submission order.
- For each opponent's clue `(word, N)`, you must select **exactly N** public words you believe that opponent intended.
- **v1 (friends playtest):** no timer enforcement. Timers are visual only. We just wait for everyone to submit their picks.
- **Future enforcement rule (when we add it):** if a player fails to lock in their N picks before time runs out, the resolution is **−N for that player, +0 for the spymaster**. The spymaster doesn't get penalized because of someone else's AFK; the negative is asymmetric so AFK is never strictly better than a bad guess.
- If no opponent has submitted yet, you wait.

**Scoring (v1, deliberately simple)**
- For each match between your guess and the opponent's intended set: **+1 to you, +1 to them**.
- For each miss: **−1 to you, −1 to them**.
- Symmetric penalties are intentional: they discourage sabotage clues and discourage spite-guessing the leader.

**Time management (v1)**

Two timer concepts, both **display-only in v1** (no auto-submit, no auto-skip, no kick — we're playing with friends in the same room, we just wait):

1. **Per-phase timers** (countdown shown on screen):
   - Clue phase: **120 s** default.
   - Per-opponent guess phase: **60 s** default.
   - When a timer hits zero, it goes red and shows negative time. The player can still submit.

2. **Per-player time bank** (chess-clock-style, BGA-inspired):
   - Each player has a personal time budget.
   - Initial: **3 min**, Max: **4 min** (configurable in lobby).
   - The bank is decremented while the player is in an active phase (still owing a clue, or owing a guess for the current opponent).
   - When a player completes a phase quickly, leftover time is banked back, capped at the max — so playing fast accrues a small advantage over a long game.
   - When a bank hits zero, it just shows red. **Not enforced in v1.**

All four values (clue timer, guess timer, initial bank, max bank) are tunable in the lobby.

**Robustness for the future (not v1):** the game must never block on a single player. We'll add this when we go beyond the in-room playtest.

**End of game**
- **First to N points**, where **N = 10 × number_of_players**. Public pool is refreshed at the start of each new round.

### 2.3 Anti-sabotage / Nash thoughts

A real concern: as someone approaches victory, others are tempted to give nonsense clues so they can't be guessed (denying the leader points), and to spite-guess the leader's clue.

The symmetric −1/+1 scoring already discourages this somewhat — you hurt yourself when you sabotage. We should **see how the symmetric scoring plays out before adding bonuses**. If sabotage is still common, candidate fixes:

- **Best-guesser bonus:** the player with the highest guess accuracy this round gets +X bonus points. Creates a "defector" incentive — even if the table agrees to throw, one player's secret strategy is to play honestly and scoop the bonus.
- **Threshold bonus:** finding all of an opponent's words gets a bonus (+2 maybe), making "I'll guess two right and one wrong on purpose" suboptimal.

I'd ship v1 with neither of these and add them only if playtests show sabotage is dominant.

### 2.4 Word validation (multilingual question)

You asked how robust this could be. Honest answer:

- **Existence check (is "truck" a real word?)** Easy. Open-source wordlists exist for many languages:
  - English: `enable1` (~170k forms), SCOWL.
  - French: lexique.org (~140k forms with lemmas + part-of-speech).
  - Most European languages: Hunspell dictionaries (the same ones LibreOffice uses), available pre-packaged for ~100 languages.
  - Implementation cost: small. A `Set<string>` lookup per submission.

- **Same-family check (is the clue too close to a public word?)** Genuinely hard.
  - Stemming (Porter / Snowball) is fast but coarse — `universe`/`university` collide, `sing`/`singer` may or may not depending on the stemmer.
  - Lemmatization is better but needs language-specific resources and still misses semantic variants.
  - Edit-distance heuristics (Levenshtein < 2) catch typos but miss `dog`/`puppy` and falsely flag `cat`/`car`.
  - Realistic robust approach: lemmatize + a small curated denylist. Manageable for one language, painful for many.
  - **My recommendation: don't ship this in v1 at all.** It will produce false rejections that frustrate players more than the rare cheat it catches. Ship it as a v2 feature with a per-language toggle.

- **Multilingual scope.** One language per game, chosen at room creation. No mixing. Word pool comes from a per-language curated list (we'll start with one — let's say French or English, your call).

### 2.5 Public word pool — composition and refresh

Open question for v1. Two main options:

- **Static per game.** Draw 25 words once at game start, they don't change. Simple, exactly like Codenames.
- **Living pool.** Words used in the previous round disappear / are replaced by new ones. Sets up the strategic layer described below.

I'd ship **static-per-game** in v1 to keep things simple, and use the living-pool mechanic as the entry point to v2.

(Note: with the first-to-N format, "static per game" actually means **fresh pool per round** — confirmed below in §4.)

---

## 3. v2 Brainstorm — Constraints + Strategic Layer

After the first playtest, two things became clear:

- **The game is too unconstrained.** With 25 freely-pickable words and a 1–9 count, a clue-giver always has many easy combinations. Codenames gets its tension from the fact that only ~8 of the 25 words are "yours" — the rest are deadweight or worse. Modesty needs a similar pressure.
- **There's no strategic layer yet.** Round-to-round, all that carries over is points. Nothing accumulates, nothing drifts, nothing tells a story. The user's original "country leader / public speech" intuition pointed at this gap; we still don't have a clean mechanic for it.

This section brainstorms both layers. Each layer has multiple concrete options with explicit tradeoffs. None are decided yet. The plan is to playtest v1 with friends, then pick **one tactical option + one strategic option** to add as v1.5, with a third add only if the table says "this is too thin".

### 3.A Tactical constraint mechanics

These are alternatives or supplements to "any word, any number 1-9" — the goal is to make clue-giving genuinely hard, like Codenames-spymastering hard.

#### A1. Asymmetric private maps (Codenames-faithful)

At round start, each player gets their own private map of the 25 public words:

- ~8 **friends** — only these can be in your intended set. You may not clue toward neutrals or enemies.
- ~3 **enemies** — heavy penalty if guessed for any opponent's clue (regardless of whether they intended them).
- ~1 **assassin** — severe penalty if you ever pick it (instant round loss / -10 / etc).
- rest neutral.

Maps overlap arbitrarily. A word that's a "friend" to Alice might be Bob's "assassin". Maps are private; no one sees yours.

**Why it works:** strong, faithful, well-understood pressure on both clue-giving and guessing. The asymmetry is rich because every word means something different to every player.

**Tradeoffs:**
- Adds a non-trivial UI: each player needs a private overlay on the pool (color tint per cell, only visible to them).
- The "intended must be subset of friends" constraint means short-friend players have very few clue options. May feel unfair on bad draws.
- Anonymity is harder to preserve — patterns in someone's intended set leak which words are their "friends".

**Cost to build:** medium. Server-side: per-player map structure, validation in submitClue. Client-side: tinted pool overlay. Reveal screen needs to show all maps.

#### A2. Forbidden words + favorite words (lite)

A softer version. Each player has, privately:
- 3 **forbidden** words you cannot include in your intended set.
- 3 **favorite** words that grant a +1 bonus if guessed correctly for one of your clues.

No assassin. Neutrals are still scoreable.

**Why it works:** introduces meaningful constraint without the cognitive load of full Codenames-mode. Easy to add on top of v1.

**Tradeoffs:**
- Less intense than A1 — a clue-giver still has ~22 valid intended choices.
- Doesn't solve the "war connects to too many words" exploit: bias is private, not public.

**Cost to build:** low. One small private list per player, two lines of validation.

#### A3. Hand-of-clues

Instead of free-form clue word: each player has a hand of K clue words to choose from. Hand replenishes from a deck. The intended set is still free.

**Why it works:** turns clue-giving into a resource-management game. You don't always have the perfect word; you have to make do with what's in hand.

**Tradeoffs:**
- Different feel from Codenames — closer to a card game.
- Hand needs to be language-aware and large enough that hands are varied. Authoring overhead.
- Loses the "free-form clever clue" satisfaction that makes Codenames fun.

**Cost to build:** medium. Card deck structure, draw mechanic, UI for selecting from hand.

**My pick for tactical:** **A1 (asymmetric private maps)** is the most faithful and strongest mechanic, and the user's transcript directly mentioned wanting "full Codenames mode". Worth the implementation cost. A2 is a fallback if A1 feels too heavy after building it.

### 3.B Strategic layer mechanics

These run *across rounds*, giving the game a long-term arc. The user's intuition is that something needs to "drift" or "accumulate" over the game.

#### B1. Private agenda cards

At game start, each player draws **1–2 secret agenda cards**. Each card defines a bonus condition that pays out at game end. Examples:
- "Score 5+ cumulative points from clues whose intended set contained an animal." (+10)
- "Successfully clue 3 different food words across the game." (+8)
- "End the game with the highest score among players who never used a one-word clue twice." (+15)
- "Accumulate at least 4 'water-related' words into your country." (depends on B2)

Agenda cards are revealed at game end; bonus points are added to scores. Winner = highest after bonuses.

**Why it works:** every player has an additional private goal that biases their play subtly. Watching opponents you can sometimes guess their agenda from their clue patterns — adds a layer of social inference. Very low UI cost.

**Tradeoffs:**
- Authoring agenda cards is design work — they need to be roughly balanced.
- Bonus points can swing the game; we need to tune so agendas aren't game-deciding (current points still matter most).
- Some agendas need word categorization (animals, food, water-related) — depends on having tags.

**Cost to build:** low–medium. Card pool, draw at game start, scoring at game end, UI to display your card during the game (so you remember).

#### B2. Word ownership & themed accumulation

Words you successfully clue (an opponent guesses one) **migrate from the public pool into your country**. Over the game, each player builds up a personal collection. Two scoring tracks:

- **Round points** — current +1/-1 mechanic.
- **Country score** — at game end, your country is scored against axes (peace/war, freedom/control, etc.) or against your private agenda card (depends on B3).

Combined with **word injection** (B4) the public pool becomes a battleground.

**Why it works:** every clue is a long-term commitment. "I cleverly cluéd this dragon" → now dragon is in my country forever, contributing to my "wartime" axis. There's a real cost to thematically wandering. Creates emergent narratives.

**Tradeoffs:**
- Requires word→theme/axis mapping (B3 below).
- The pool shrinks unless words are added back — needs B4 (injection) to balance.
- More state to track; reveal screens get busier.

**Cost to build:** medium. Per-player country collection, axis aggregation logic, end-of-game scoring.

#### B3. Word→axis tagging strategy

If we go with B2 (ownership) or some agenda cards depend on tags, we need word→axis weights. Three approaches:

| Approach | Effort | Quality | Multilingual |
|---|---|---|---|
| **Manually tagged JSON** | Tedious (1000 words × N axes = lots) | Excellent | Per-language work |
| **Embedding-based** (precomputed) | Low (one-time script) | Good, occasionally weird | Free with multilingual model |
| **Player-voted** (live) | None upfront | Best (table consensus) | Free, but slow gameplay |

Best path: **embedding-based for v2, player-voted as a v3 enhancement.** The embedding script projects each word onto pre-defined axis pairs (e.g., embedding("peace") − embedding("war")) → produces a [-1, 1] weight. Run once, store in JSON.

#### B4. Word injection

Each player has a private **hand** of K (e.g., 5) words drawn from the language's full word list. Between rounds, each player picks 1 word from their hand to **inject** into the public pool, replacing a word that was used.

**Why it works:** explicit player agency over the public landscape. You push themes you can clue, or that handicap an opponent. Hands replenish from deck. Adds a satisfying decision point each round.

**Tradeoffs:**
- More game state to manage.
- Slows down between rounds (a deliberation phase).
- Could leak agenda information ("Alice keeps injecting nature words").

**Cost to build:** low–medium.

#### B5. Public reputation / live profile

A new idea worth highlighting because it might be the **"missing idea"** the user gestured at.

Each clue you give produces a **public profile vector** for your country, computed from your accumulated successful intentions (using B3 axis weights). The vector is **visible to everyone in real time**. Imagine a small radar chart on each player's name in the lobby/reveal screens.

This means:
- Your strategy is partially public — anyone can see what kind of country you're building.
- Other players can read this and *react*: echo your direction (dilute your distinctiveness) or counter-position (push opposite axes).
- You can fake-signal: deliberately clue against your true agenda for a few rounds to mislead.
- It creates a *political* dimension where players are constantly reading each other.

**Why it might be the missing piece:** the user's "country leader giving public speeches" framing already implies that the country's direction is *visible*. Codenames is private-information; Modesty's strategic layer becomes interesting precisely because the strategic information is *public* (your accumulated direction) while the tactical information stays private (your hidden agenda card, your asymmetric map).

The mechanic that makes this not flat: your **agenda is private**, but your **profile is public**. So opponents can read where you're going but not why or to what target. This is a clean asymmetry that creates real strategic depth without huge new mechanics.

**Cost to build:** medium. Radar chart component, profile aggregation, real-time updates. Depends on B2 + B3.

### 3.C Recommended combinations

Three coherent v2 packages, smallest to most ambitious:

**v1.5 — minimal gentle bump.** A2 (forbidden + favorites) + B1 (agenda cards). About a weekend's work. Adds private constraint and private long-term goal. Doesn't change the round flow or UI structure.

**v2 — the "ah, I see what you're doing" version.** A1 (asymmetric maps) + B1 (agendas) + B4 (injection). Several days' work. Real Codenames-faithful tactical layer + secret long-term objectives + agency over the pool. Most likely to be a satisfying full game.

**v2.5 — the political version.** A1 + B1 + B2 (ownership) + B3 (embeddings) + B4 + B5 (public profiles). Maybe a week of work. The full "country leader" vision: hidden tactical maps, hidden agendas, public profile evolution, pool injection, themed scoring. High-variance, high-effort, but uniquely yours if it works.

### 3.D Open design questions

These are the questions worth thinking about before committing to any path:

1. **How much asymmetry per round?** A1 with very narrow friend lists is brutal; with wide friend lists it's barely a constraint. Tuning parameter.
2. **How loud should the agenda be?** If agenda bonuses are 10+, they'll dominate; if 1-2, they're flavor. Probably 5–10% of expected total score.
3. **Can words be re-clued?** Once a word is in someone's country (B2), can a future round include it again? Probably no — adds pressure, simplifies state.
4. **Are agendas drawn together or independently?** Drawing from a shared deck means at most one player gets each card → enforces variety. Independent draws can result in two players having identical agendas — interesting in a different way (a race).
5. **Anonymity vs profile.** B5's public profiles fight v1's per-round anonymity. We may need: profiles are public *only at end of round*, names tied to profiles are revealed alongside the round results.
6. **Game length.** First-to-N is friendly to short games but B-layer mechanics need 5+ rounds to develop a country. Consider switching to "fixed N rounds, highest score wins" for v2.

---

## 4. v1 decisions (locked)

1. **Languages.** Both **English and French** supported. The room creator picks the language at creation time. They get a shareable link; friends clicking the link land in the lobby. The creator presses **Start game** when ready; no further joins after that.
2. **Public pool size.** **25 words** per round.
3. **Lobby-tunable values.** Four:
   - Clue phase timer (default **120 s**)
   - Per-opponent guess timer (default **60 s**)
   - Initial per-player time bank (default **3 min**)
   - Max per-player time bank (default **4 min**)
4. **Clue number range.** **1–9** (matches Codenames range).
5. **Host UI.** Identical to player UI **except** the host owns lobby creation and the "Start game" / "Next round" buttons. During gameplay everyone sees the same thing — and importantly **each player only sees their own score**, not others'. End-of-game reveals the full scoreboard.
6. **Disconnect / reconnect.** Implemented in v1. Socket.IO session token stored in `localStorage` so a player who refreshes or drops Wi-Fi rejoins their seat.
7. **Game length.** **First to 10 × players** points. Fresh public pool every round.
8. **Word list.** Authored by us, ~200–500 words per language, biased toward themes that will plug into v2: core values, prosperity / poverty, war / peace, freedom / control, geography, governance, environment, technology. Generic enough to still feel like a fun word-association game.

---

## 5. Suggested first concrete steps

In the order I'd take them:

1. Scaffold the Node + Vite + React + Socket.IO project. Single repo, single `npm start`. (~30 min)
2. Lobby: create room, join via code, show players. (~1 hr)
3. Draw a public word pool from a hardcoded list of ~100 starter words. Display it. (~20 min)
4. Phase A (clue submission) with timer. (~1 hr)
5. Phase B (guessing carousel through opponents) with timer. (~1.5 hr)
6. Scoring + reveal screen. (~1 hr)
7. Playtest with friends, iterate.

Each of these is a single commit (or a small handful). The strategic layer is intentionally not in this list — it lives behind a clean v1 baseline.

---

## 6. Project conventions

- Public repo: `github.com/RemiFabre/modesty_is_the_name`.
- **Commit very often.** One commit per discrete unit of work.
- **No author/co-author trailers** in commit messages — plain messages only.
- **Push is manual.** Owner pushes; collaborators (including AI assistants) do not.
