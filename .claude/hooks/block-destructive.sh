#!/bin/bash
# Read the full Bash invocation from stdin
CMD=$(jq -r '.tool_input.command')

# Patterns that should never run unattended
DANGEROUS='(^|[;&|`$(]| )(rm[[:space:]]+-[a-z]*[rRfF]|sudo[[:space:]]|chmod[[:space:]]+777|find[[:space:]].+-delete|find[[:space:]].+-exec[[:space:]]+rm)'

if echo "$CMD" | grep -Eq "$DANGEROUS"; then
  jq -n --arg cmd "$CMD" '{
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason: ("Blocked by safety hook: " + $cmd)
    }
  }'
  exit 0
fi

exit 0