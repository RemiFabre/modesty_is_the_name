#!/usr/bin/env python3
"""Clean game loop for Modesty is the Name - Sonnet-2 game 5."""

import subprocess, json, time, sys, os

URL = "http://localhost:3010"
ROOM = "ZUYAC"
TOKEN = "0jbEB5xXNB84qBf5wKTPKDiYke1xgdAW"

def cli(*args):
    cmd = ["node", "bot-cli.mjs"] + list(args) + [
        "--url", URL, "--room", ROOM, "--token", TOKEN
    ]
    result = subprocess.run(cmd, capture_output=True, text=True,
                            cwd="/Users/remi/modesty_is_the_name", timeout=25)
    if result.returncode != 0:
        print(f"ERROR stderr: {result.stderr}")
        try:
            return json.loads(result.stdout)
        except:
            return {"ok": False, "error": result.stderr}
    return json.loads(result.stdout)

def get_state():
    return cli("status")["state"]

def pick_words_for_clue(clue_word, pool, count):
    """Semantic word picker based on clue word."""
    clue = clue_word.lower()

    # Semantic clusters
    clusters = {
        "gathering": ["village", "corn", "maple", "goose", "root", "sun"],
        "harvest": ["corn", "maple", "root", "sun", "village", "gravel"],
        "wilderness": ["dragon", "goose", "gravel", "root", "sun", "maple"],
        "alchemy": ["vinegar", "metal", "root", "cube", "spark", "cork"],
        "spectacle": ["circus", "dragon", "spark", "ball", "galaxy"],
        "nature": ["root", "corn", "maple", "sun", "gravel"],
        "fire": ["spark", "dragon", "metal", "sun"],
        "magic": ["dragon", "spark", "galaxy", "cube", "circus"],
        "farm": ["corn", "goose", "maple", "village", "root"],
        "science": ["robot", "metal", "cube", "vinegar", "spark"],
        "space": ["galaxy", "robot", "cube", "metal"],
        "kitchen": ["vinegar", "corn", "root", "metal", "vase"],
        "bottle": ["cork", "vinegar", "vase"],
        "ancient": ["dragon", "village", "maple", "root", "vase"],
        "travel": ["van", "robot", "galaxy", "goose"],
        "romance": ["love", "vase", "sun", "village"],
        "music": ["van", "ball", "circus", "spark"],
    }

    # Score each pool word
    scores = {}
    for w in pool:
        scores[w] = 0

    # Direct cluster match
    if clue in clusters:
        for w in clusters[clue]:
            if w in scores:
                scores[w] += 3

    # Partial match with cluster keys
    for key, words in clusters.items():
        if key in clue or clue in key:
            for w in words:
                if w in scores:
                    scores[w] += 2

    # Word-level semantic hints
    if any(x in clue for x in ["wild", "feral", "beast", "primal"]):
        for w in ["dragon", "goose", "gravel", "root"]:
            if w in scores: scores[w] += 2
    if any(x in clue for x in ["gather", "harvest", "crop", "village", "community"]):
        for w in ["corn", "maple", "root", "village", "goose"]:
            if w in scores: scores[w] += 2
    if any(x in clue for x in ["chem", "acid", "lab", "experiment", "alch"]):
        for w in ["vinegar", "metal", "cube", "cork"]:
            if w in scores: scores[w] += 2
    if any(x in clue for x in ["star", "space", "cosm", "galax"]):
        for w in ["galaxy", "robot", "cube"]:
            if w in scores: scores[w] += 2
    if any(x in clue for x in ["play", "fun", "circus", "game", "sport"]):
        for w in ["circus", "ball", "dragon", "spark"]:
            if w in scores: scores[w] += 2

    # Sort by score desc, pick top N
    ranked = sorted(pool, key=lambda w: -scores.get(w, 0))
    return ranked[:count]

def guess_axes_binary(clue_word, nations_entry, avg_axes):
    """Binary axis guessing (1 or 5 only)."""
    clue = clue_word.lower()

    # Axes: Brave(1)<->Cautious(5), Wild(1)<->Civilized(5), Solitary(1)<->Social(5), Playful(1)<->Serious(5)

    brave_signals = ["dragon", "fire", "storm", "charge", "rush", "wild", "spectacle", "roar", "blaze", "duel", "fight", "warrior", "dare"]
    cautious_signals = ["shield", "fort", "safe", "guard", "shelter", "wall", "fence", "hide", "retreat"]

    wild_signals = ["wilderness", "beast", "feral", "chaos", "jungle", "dragon", "goose", "wild", "primal", "savage", "raw"]
    civil_signals = ["village", "city", "law", "order", "library", "garden", "temple", "metal", "cube", "robot", "refined"]

    solo_signals = ["hermit", "alone", "lone", "shadow", "solitude", "mountain", "cave", "recluse", "wolf", "silence"]
    social_signals = ["gathering", "village", "circus", "ball", "party", "crowd", "team", "market", "festival", "harvest"]

    playful_signals = ["circus", "ball", "game", "play", "fun", "trick", "joke", "dance", "prank", "spectacle", "spark"]
    serious_signals = ["metal", "cube", "gravel", "stone", "law", "war", "death", "gravity", "harvest", "root", "alchemy"]

    def pick_axis(clue, pos_signals, neg_signals, avg):
        for s in pos_signals:
            if s in clue:
                return 1
        for s in neg_signals:
            if s in clue:
                return 5
        # Use running average as tiebreaker
        if avg is not None:
            return 1 if avg <= 3 else 5
        return 1  # default to left pole when uncertain

    a0 = pick_axis(clue, brave_signals, cautious_signals, avg_axes[0] if avg_axes else None)
    a1 = pick_axis(clue, wild_signals, civil_signals, avg_axes[1] if avg_axes else None)
    a2 = pick_axis(clue, solo_signals, social_signals, avg_axes[2] if avg_axes else None)
    a3 = pick_axis(clue, playful_signals, serious_signals, avg_axes[3] if avg_axes else None)

    return [a0, a1, a2, a3]

def pick_clue(profile, pool, axes):
    """Pick a clue word and intended words expressing the profile."""
    # Profile [1,1,1,1]: Brave, Wild, Solitary, Playful
    # Express the identity through cluster choice

    print(f"  Profile: {profile}")
    print(f"  Pool: {pool}")

    # Strategy: find clusters that resonate with my profile
    # Brave+Wild+Solitary+Playful = trickster/rogue/wild spirit

    # Try clusters with strong profile signal
    brave_wild_playful = {
        w for w in pool if w in ["dragon", "spark", "circus", "ball", "goose", "galaxy", "sun"]
    }
    brave_wild_solo = {
        w for w in pool if w in ["dragon", "gravel", "root", "metal", "goose", "maple"]
    }

    # Prioritize clusters that express multiple axes
    # Round 1 was spectacle(dragon,circus,spark). Now pick differently.

    candidates = [
        # (clue, intended_list, reasoning)
        ("romp",    [w for w in pool if w in ["goose", "ball", "circus"]][:3], "wild+playful chase"),
        ("drifter", [w for w in pool if w in ["van", "goose", "gravel"]][:3], "solitary+wild traveler"),
        ("feral",   [w for w in pool if w in ["goose", "dragon", "gravel"]][:3], "wild+solitary"),
        ("frolic",  [w for w in pool if w in ["goose", "ball", "sun"]][:3], "playful+wild"),
        ("stray",   [w for w in pool if w in ["goose", "van", "gravel"]][:3], "solitary+wild"),
        ("rogue",   [w for w in pool if w in ["dragon", "spark", "metal"]][:3], "brave+wild"),
        ("eruption",[w for w in pool if w in ["spark", "dragon", "sun"]][:3], "wild+brave"),
        ("maverick",[w for w in pool if w in ["van", "goose", "dragon"]][:3], "brave+solitary"),
        ("carnival",[w for w in pool if w in ["circus", "ball", "dragon"]][:3], "playful+wild"),
        ("rampage", [w for w in pool if w in ["dragon", "goose", "gravel"]][:3], "wild+brave"),
        ("forage",  [w for w in pool if w in ["root", "corn", "maple"]][:3], "solitary+wild"),
        ("prankster",[w for w in pool if w in ["goose", "ball", "circus"]][:3], "playful+brave"),
        ("loner",   [w for w in pool if w in ["gravel", "root", "van"]][:3], "solitary"),
        ("flare",   [w for w in pool if w in ["spark", "sun", "galaxy"]][:3], "brave+wild"),
        ("trickster",[w for w in pool if w in ["goose", "circus", "ball"]][:3], "playful+wild"),
        ("wanderer",[w for w in pool if w in ["van", "gravel", "galaxy"]][:3], "solitary+wild"),
    ]

    # Pick first candidate with 3 valid words
    for clue_word, intended, reason in candidates:
        intended = [w for w in intended if w in pool]
        if len(intended) >= 2:
            # Pad to 3 if possible
            if len(intended) < 3:
                for w in pool:
                    if w not in intended and len(intended) < 3:
                        intended.append(w)
            intended = intended[:3]
            print(f"  Chosen clue: '{clue_word}' -> {intended} ({reason})")
            return clue_word, intended

    # Fallback: any 3 words with first random clue
    print("  Fallback clue")
    return "chaos", pool[:3]

def main():
    print("Starting clean game loop...")
    rounds_played = 0

    while True:
        try:
            state = get_state()
        except Exception as e:
            print(f"Error getting state: {e}")
            time.sleep(3)
            continue

        phase = state["phase"]
        action = state["me"]["owedAction"]
        print(f"\nPhase: {phase} | Action: {action}")

        if phase == "ended":
            print("GAME ENDED")
            with open("/tmp/final_state.json", "w") as f:
                json.dump(state, f, indent=2)
            print(f"Final state saved to /tmp/final_state.json")
            break

        if action == "submit_clue":
            rounds_played += 1
            print(f"--- Round {rounds_played} ---")
            profile = state["me"]["profile"]
            pool = state["round"]["pool"]
            axes = state["settings"]["profileAxes"]

            clue_word, intended = pick_clue(profile, pool, axes)

            result = cli("clue", "--word", clue_word, "--intended", ",".join(intended))
            print(f"Clue result: {result}")

        elif action == "submit_guess":
            target = state["me"]["nextTarget"]
            target_id = target["playerId"]
            clue_word = target["clueWord"]
            clue_count = target["clueCount"]
            pool = state["round"]["pool"]

            # Get nations info for this player
            nations_entry = next((n for n in state["nations"] if n["playerId"] == target_id), None)
            avg_axes = nations_entry["averageAxes"] if nations_entry else [None]*4

            print(f"  Guessing for {target['name']}: clue='{clue_word}' count={clue_count}")

            picks = pick_words_for_clue(clue_word, pool, clue_count)
            axes_guess = guess_axes_binary(clue_word, nations_entry, avg_axes)

            print(f"  Picks: {picks}")
            print(f"  Axes: {axes_guess}")

            result = cli("guess",
                "--target", target_id,
                "--picks", ",".join(picks),
                "--axes", ",".join(str(a) for a in axes_guess)
            )
            print(f"  Guess result: {result}")

        elif action in ("wait_for_others", "wait_for_advance", "wait_for_start"):
            print("  Waiting...")
            time.sleep(3)
            continue

        elif action == "review":
            print("GAME OVER - time to write review")
            with open("/tmp/final_state.json", "w") as f:
                json.dump(state, f, indent=2)
            break

        else:
            print(f"  Unknown action: {action}")
            time.sleep(3)
            continue

        time.sleep(2)

    print("Loop complete.")

if __name__ == "__main__":
    main()
