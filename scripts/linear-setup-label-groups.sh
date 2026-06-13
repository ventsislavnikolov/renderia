#!/usr/bin/env bash
# One-time-per-Linear-workspace label-group setup.
# Sandcastle's MCP-based init does not create label GROUPS (mutually exclusive label sets).
# Linear's official MCP exposes label CRUD but not group-creation in most workspaces,
# so this script uses Linear's GraphQL API directly.
#
# Usage:
#   LINEAR_API_KEY=lin_api_xxx bash scripts/linear-setup-label-groups.sh
#
# Idempotent: skips groups/labels that already exist.
set -euo pipefail

: "${LINEAR_API_KEY:?set LINEAR_API_KEY before running}"

API="https://api.linear.app/graphql"
H_AUTH="Authorization: $LINEAR_API_KEY"
H_JSON="Content-Type: application/json"

graphql() {
  local query="$1"
  curl -sS -X POST "$API" -H "$H_AUTH" -H "$H_JSON" \
    --data "$(jq -nc --arg q "$query" '{query:$q}')"
}

list_labels() {
  graphql 'query { issueLabels(first: 250) { nodes { id name isGroup parent { id name } } } }'
}

find_label_id() {
  local name="$1"
  echo "$LABELS" | jq -r --arg n "$name" '.data.issueLabels.nodes[] | select(.name == $n) | .id' | head -1
}

create_group() {
  local name="$1"
  local existing
  existing=$(find_label_id "$name") || existing=""
  if [[ -n "${existing:-}" ]]; then
    echo "  group '$name' exists ($existing)"
    echo "$existing"
    return 0
  fi
  local query="mutation { issueLabelCreate(input: { name: \"$name\", isGroup: true }) { issueLabel { id name } } }"
  local resp
  resp=$(graphql "$query")
  local id
  id=$(echo "$resp" | jq -r '.data.issueLabelCreate.issueLabel.id // empty')
  if [[ -z "$id" ]]; then
    echo "  ✘ failed to create group '$name': $resp" >&2
    return 1
  fi
  echo "  ✓ created group '$name' ($id)"
  echo "$id"
}

create_child() {
  local parent_id="$1" name="$2"
  local existing
  existing=$(echo "$LABELS" | jq -r --arg n "$name" --arg p "$parent_id" \
    '.data.issueLabels.nodes[] | select(.name == $n and (.parent.id // "") == $p) | .id' | head -1)
  if [[ -n "${existing:-}" ]]; then
    echo "    label '$name' under group exists"
    return 0
  fi
  local query="mutation { issueLabelCreate(input: { name: \"$name\", parentId: \"$parent_id\" }) { issueLabel { id name } } }"
  local resp
  resp=$(graphql "$query")
  local id
  id=$(echo "$resp" | jq -r '.data.issueLabelCreate.issueLabel.id // empty')
  if [[ -z "$id" ]]; then
    echo "    ✘ failed to create label '$name': $resp" >&2
    return 1
  fi
  echo "    ✓ created '$name'"
}

create_freestanding() {
  local name="$1"
  local existing
  existing=$(find_label_id "$name") || existing=""
  if [[ -n "${existing:-}" ]]; then
    echo "  free-standing label '$name' exists"
    return 0
  fi
  local query="mutation { issueLabelCreate(input: { name: \"$name\" }) { issueLabel { id name } } }"
  graphql "$query" >/dev/null
  echo "  ✓ created free-standing label '$name'"
}

echo "▶ Fetching existing labels"
LABELS=$(list_labels)

echo "▶ Free-standing labels"
create_freestanding "Sandcastle"

echo "▶ type group"
TYPE_ID=$(create_group "type")
LABELS=$(list_labels) # refresh
for t in bug task tracer improvement feature blocked; do
  create_child "$TYPE_ID" "$t"
done

echo "▶ module group"
MODULE_ID=$(create_group "module")
LABELS=$(list_labels) # refresh
# adjust to your default module set
for m in auth api ui infra; do
  create_child "$MODULE_ID" "$m"
done

echo "✓ Done. Label groups exist workspace-wide. Re-run anytime — idempotent."
