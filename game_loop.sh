#!/bin/bash
export MODESTY_URL="https://consist-handed-shark-bookmarks.trycloudflare.com"
export MODESTY_ROOM="VE9S4"
export MODESTY_TOKEN="IZRAnteP7j2GV6f7RMbJHZ6ObWoTud7e"

# Helper function to pick a clue based on round and profile
pick_clue() {
  local round=$1
  local profile=$2
  
  # Parse profile values
  local war_peace=$(echo "$profile" | jq '.[0]')
  local freedom_control=$(echo "$profile" | jq '.[1]')
  local tradition_progress=$(echo "$profile" | jq '.[2]')
  local isolation_engagement=$(echo "$profile" | jq '.[3]')
  
  echo "Profile: War/Peace=$war_peace, Freedom/Control=$freedom_control, Trad/Prog=$tradition_progress, Isol/Eng=$isolation_engagement" >&2
  
  if [ "$round" -eq 1 ]; then
    echo "heroes|astronaut,star,prince"
  elif [ "$round" -eq 2 ]; then
    echo "spectrum|hike,torch,star"
  elif [ "$round" -eq 3 ]; then
    echo "vessel|yacht,hospital,tunnel"
  else
    # Default fallback
    echo "object|rock,tree,water"
  fi
}

# Helper function for better guessing
guess_for_opponent() {
  local opp_id=$1
  local clue_word=$2
  local clue_count=$3
  local pool=$4
  local nations=$5
  
  # Simple heuristic based on clue word
  local picks=""
  local axes="3,3,3,3"
  
  case "$clue_word" in
    "trench")
      picks="tunnel,drill,canyon"
      axes="4,2,3,3"
      ;;
    "bunker")
      picks="tunnel,brick,hospital"
      axes="4,2,3,3"
      ;;
    "research")
      picks="atlas,astronaut,hospital,video,star"
      axes="2,4,2,2"
      ;;
    "spectrum")
      picks="video,hike,astronaut"
      axes="3,3,4,4"
      ;;
    *)
      # Default: pick first count words that seem to fit
      picks=$(echo "$pool" | jq -r ".[0:$clue_count] | join(\",\")")
      axes="3,3,3,3"
      ;;
  esac
  
  echo "$picks|$axes"
}

ROUND=0
MAX_ROUNDS=10

while [ $ROUND -lt $MAX_ROUNDS ]; do
  STATUS=$(node bot-cli.mjs status 2>/dev/null)
  if [ -z "$STATUS" ]; then
    echo "Error getting status, retrying..." >&2
    sleep 2
    continue
  fi
  
  PHASE=$(echo "$STATUS" | jq -r '.state.phase')
  ROUND=$((ROUND + 1))
  
  echo ""
  echo "=== ROUND $ROUND, PHASE: $PHASE ==="
  
  # Check if game ended
  if [ "$PHASE" = "ended" ]; then
    echo "GAME ENDED!"
    echo "$STATUS" | jq '{
      myScore: (.state.players[] | select(.id == .state.myPlayerId) | .score),
      players: [.state.players[] | {name: .realName, score: .score, breakdown: .breakdown}],
      myProfile: .state.me.profile,
      profileFeedback: .state.profileFeedback,
      winnerId: .state.winnerId
    }' 2>/dev/null || echo "Could not parse final state"
    break
  fi
  
  MY_ID=$(echo "$STATUS" | jq -r '.state.myPlayerId')
  MY_CLUE=$(echo "$STATUS" | jq '.state.me.clue')
  MY_PROFILE=$(echo "$STATUS" | jq '.state.me.profile')
  POOL=$(echo "$STATUS" | jq '.state.round.pool')
  
  # Lobby phase
  if [ "$PHASE" = "lobby" ]; then
    echo "In lobby, waiting for game start..."
    sleep 3
    continue
  fi
  
  # Reveal phase
  if [ "$PHASE" = "reveal" ]; then
    echo "In reveal, waiting for next round..."
    sleep 3
    continue
  fi
  
  # Round phase
  if [ "$PHASE" = "round" ]; then
    # Submit clue if needed
    if [ "$MY_CLUE" = "null" ]; then
      echo "Submitting clue..."
      CLUE_INFO=$(pick_clue "$ROUND" "$MY_PROFILE")
      CLUE_WORD=$(echo "$CLUE_INFO" | cut -d'|' -f1)
      CLUE_INTENDED=$(echo "$CLUE_INFO" | cut -d'|' -f2)
      
      RESULT=$(node bot-cli.mjs clue --word "$CLUE_WORD" --intended "$CLUE_INTENDED" 2>&1)
      if echo "$RESULT" | grep -q '"ok":true'; then
        echo "Clue submitted: $CLUE_WORD for $CLUE_INTENDED"
      else
        echo "Error submitting clue: $RESULT"
      fi
      sleep 2
      continue
    fi
    
    # Submit guesses for opponents
    OPP_CLUES=$(echo "$STATUS" | jq '.state.round.opponentClues')
    MY_GUESSES=$(echo "$STATUS" | jq '.state.me.guesses')
    
    SUBMITTED_GUESS=false
    for OPP_ID in $(echo "$OPP_CLUES" | jq -r 'keys[]'); do
      # Check if already guessed
      ALREADY_GUESSED=$(echo "$MY_GUESSES" | jq ".\"$OPP_ID\"")
      if [ "$ALREADY_GUESSED" = "null" ]; then
        echo "Guessing for opponent: $OPP_ID"
        
        CLUE_WORD=$(echo "$OPP_CLUES" | jq -r ".\"$OPP_ID\".word")
        CLUE_COUNT=$(echo "$OPP_CLUES" | jq -r ".\"$OPP_ID\".count")
        
        GUESS_INFO=$(guess_for_opponent "$OPP_ID" "$CLUE_WORD" "$CLUE_COUNT" "$POOL" "")
        PICKS=$(echo "$GUESS_INFO" | cut -d'|' -f1)
        AXES=$(echo "$GUESS_INFO" | cut -d'|' -f2)
        
        RESULT=$(node bot-cli.mjs guess --target "$OPP_ID" --picks "$PICKS" --axes "$AXES" 2>&1)
        if echo "$RESULT" | grep -q '"ok":true'; then
          echo "Guess submitted for $OPP_ID: $PICKS with axes $AXES"
          SUBMITTED_GUESS=true
        else
          echo "Error submitting guess: $RESULT"
        fi
        break  # Only submit one guess per iteration
      fi
    done
    
    if [ "$SUBMITTED_GUESS" = "false" ]; then
      echo "All guesses submitted or waiting for more clues..."
    fi
    
    sleep 2
  fi
done

echo "Game loop completed!"
