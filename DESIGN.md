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
- Every player **simultaneously** writes a clue: a single word + a number (e.g. `truck, 3`).
- Meaning: "I'm asserting that exactly N of the public words are connected to my clue word."
- Free-form text input in v1 — no dictionary check, no anti-cheat. If a player cheats, the table will know.
- When a player submits their clue, the clock keeps running for the others, but they get a head start on Phase B.

**Phase B — Guess (per opponent, ~60 s each)**
- As soon as you've submitted your clue, you start seeing the clues of opponents who also submitted, **one at a time**, in submission order.
- For each opponent's clue `(word, N)`, you must select **exactly N** public words you believe that opponent intended.
- You cannot skip, you cannot pick fewer or more than N. If you genuinely have no idea, you still have to lock in N picks (or let the timer run out → no points).
- If no opponent has submitted yet, you wait.

**Scoring (v1, deliberately simple)**
- For each match between your guess and the opponent's intended set: **+1 to you, +1 to them**.
- For each miss: **−1 to you, −1 to them**.
- Symmetric penalties are intentional: they discourage sabotage clues and discourage spite-guessing the leader.

**Time management (v1)**
- Hard timer for the clue phase (120 s default) and the per-opponent guess phase (60 s default).
- When a timer hits zero, it goes red and shows negative time — but **does not** auto-submit or auto-skip. The player can still submit late; we don't kick anyone out.
- A player who fails to submit anything just scores zero for that interaction. The game continues regardless.
- **Robustness rule (important):** the game must never block on a single player. If someone goes AFK, the round still ends and resolves.

**End of game (v1)**
- Simplest option: a game is **one round**. After all clues + all guesses + scoring, the game ends and you can start a new one with a new word pool.
- Alternative we can ship as a setting: first to **50 points**, refreshing the public pool between rounds.

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

---

## 3. v2 — The Strategic / Geopolitical Layer

This is the bigger vision: each player is the leader of a country, their clue is a **public speech**, and the words flowing through the public pool shape both their own country's identity and the global discourse.

### 3.1 Living word pool

- Words that were used as clue-targets (i.e. were correctly guessed by at least one player) **leave the public pool** and **migrate into the proposing country's identity**.
- Each player has a hidden hand of, say, 5 words. At the end of each round, they choose one to **inject** into the public pool, replacing one that left.
- Pool size stays roughly stable (e.g., 16 ± a few). Some natural drift is fine.

This gives players agency over the public discourse: you can push themes you want to use as clues, or that you want others to be forced to engage with.

### 3.2 Country identity & policy axes

Each country has a profile on a small number of axes, e.g.:

- Peace ↔ War
- Exploit resources ↔ Preserve environment
- Freedom ↔ Control
- Isolation ↔ Engagement
- Tradition ↔ Progress

Each word the country has accumulated nudges these sliders. A country built on `forest, river, harvest, peace, child` looks very different from one built on `fire, iron, fortress, command, oath`.

**Open question: how does word → axis mapping happen?** Three options:

1. **Pre-tagged word list.** Curate a list where every word has axis weights. Total control, full author work, painful to scale and to multilingual.
2. **Embedding-based.** Use sentence embeddings to project each word onto each axis (e.g., `embedding(word)` projected onto `embedding("war") − embedding("peace")`). Cheap to compute (precomputable), feels magical when it works, occasionally weird. Multilingual is roughly free with multilingual embedding models.
3. **Player-voted.** At end of each round, all players vote each used word's position on each axis. Closest-to-mean vote earns bonus points (Keynesian beauty contest). This is the most beautiful design: players themselves *define* the public meaning, and there's an incentive to be aligned with the table's perception, not your own.

I lean toward a **hybrid**: pre-compute embedding-based starting weights so the game can run instantly with no input, and let player voting **adjust** them over the course of the game. This gives the meta-mechanic you described (closest-to-average gets points; the proposer's country drifts toward perceived meaning) without requiring votes on every word from turn one.

### 3.3 Strategic incentives this unlocks

- **Identity strategy.** A player aiming to win on the "Peace" axis steers their clues toward peace-coded public words.
- **Adversarial pool seeding.** You inject words into the pool that you can clue around but your opponents can't, or that pull their countries toward axes that hurt their position.
- **Tactical clue choice.** Sometimes the locally-optimal clue (max guesses) is strategically bad because it pulls your country in the wrong direction.

### 3.4 v2 scoring sketch (TBD)

Likely a mix of:
- Round points (the v1 +1 / −1 mechanic).
- End-of-game bonuses for axis position (e.g., reaching extremes, or matching a private "agenda card" each player drew at game start: "you wanted a country of peace and freedom").
- Beauty-contest bonuses on word-meaning votes.

This is intentionally hand-wavy — we shouldn't lock it down until v1 has been played enough to know what feels right.

---

## 4. Open questions / decisions to make before / during v1

These are things to decide before or during implementation. Not blockers for starting.

1. **Language for the first build.** French or English? (Affects the initial curated word pool.)
2. **Initial public-pool size.** Codenames uses 25. We probably want something in 16–25.
3. **Default timers.** 120 s clue, 60 s/opponent guess. Tunable in lobby?
4. **Number of public words a clue must point to.** Codenames allows 0–9. We probably want a min ≥ 1 and a max around `floor(pool_size / players)` to prevent silliness.
5. **What does the host see?** Same client as players, with extra "start game / next round" buttons? Or a separate "screen" view designed for projecting on a TV with a QR code?
6. **Disconnect handling.** If a phone drops Wifi mid-clue: does the player auto-rejoin to the same seat? Socket.IO can do this with a session token in localStorage. v1 nice-to-have.
7. **One round vs first-to-N.** Default to one round, allow longer in lobby.
8. **Curated word list for v1.** We need ~200–500 words to seed. There are open lists we can import; I'll suggest options in the implementation step.

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
