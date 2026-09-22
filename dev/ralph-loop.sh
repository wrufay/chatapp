#!/bin/bash
set -euo pipefail

MAX_ITERATIONS="${MAX_ITERATIONS:-10}"
SLEEP_SECONDS="${SLEEP_SECONDS:-2}"
AGENT_COMMAND="${AGENT_COMMAND:-opencode run --agent build @RALPH.md}"

cd "$(dirname "$0")"

echo "=== Ralph Loop ==="
echo "Max iterations: $MAX_ITERATIONS"
echo "Agent command: $AGENT_COMMAND"
echo ""

iteration=0

while [ "$iteration" -lt "$MAX_ITERATIONS" ]; do
  iteration=$((iteration + 1))
  echo "--- Iteration $iteration / $MAX_ITERATIONS ---"

  TODO_COUNT=$(grep -c '\[todo\]' TODO.md 2>/dev/null || echo "0")
  IN_PROGRESS_COUNT=$(grep -c '\[in_progress\]' TODO.md 2>/dev/null || echo "0")

  if [ "$TODO_COUNT" = "0" ] && [ "$IN_PROGRESS_COUNT" = "0" ]; then
    echo "All tickets complete. Exiting."
    break
  fi

  echo "Remaining: $TODO_COUNT todo, $IN_PROGRESS_COUNT in progress"

  if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if git diff --quiet && git diff --cached --quiet; then
      git pull --rebase --quiet 2>/dev/null || true
    else
      echo "Dirty working tree detected — resuming current work."
    fi
  fi

  # Run one agent pass. Override AGENT_COMMAND if you use a different CLI.
  # Example:
  # AGENT_COMMAND="claude -p @RALPH.md" ./ralph-loop.sh
  eval "$AGENT_COMMAND"

  sleep "$SLEEP_SECONDS"
done

echo "=== Ralph Loop finished after $iteration iterations ==="
