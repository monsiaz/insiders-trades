#!/usr/bin/env bash
# deploy.sh — Sigma deploy (CLI-only, no GitHub auto-deploy race)
# Usage:  bash scripts/deploy.sh "commit message"
#         npm run deploy -- "commit message"

set -euo pipefail

PROD_URL="https://insiders-trades-sigma.vercel.app"
MSG="${1:-chore: deploy $(date +%Y-%m-%d)}"

# ── 1. Commit ──────────────────────────────────────────────────────────────────
echo ""
echo "▶ 1/4  Staging changes..."
git add -A

if git diff --cached --quiet; then
  echo "   Nothing to commit, working tree clean."
  COMMIT_SHA=$(git rev-parse --short HEAD)
else
  git commit -m "$MSG"
  COMMIT_SHA=$(git rev-parse --short HEAD)
  echo "   Committed: $COMMIT_SHA — $MSG"
fi

# ── 2. Deploy via Vercel CLI ───────────────────────────────────────────────────
echo ""
echo "▶ 2/4  Building & deploying to Vercel production..."
echo "   (GitHub auto-deploy is disabled — CLI is the single source of truth)"
DEPLOY_OUTPUT=$(vercel --prod --yes 2>&1)
echo "$DEPLOY_OUTPUT"

# Extract the deployment URL from vercel output
DEPLOY_URL=$(echo "$DEPLOY_OUTPUT" | grep -Eo 'https://insiders-trades-[a-z0-9]+-[a-z0-9-]+\.vercel\.app' | tail -1 || true)

# ── 3. Push to GitHub (history only) ──────────────────────────────────────────
echo ""
echo "▶ 3/4  Syncing commit to GitHub (history only)..."
git push origin main

# ── 4. Verify what's live ─────────────────────────────────────────────────────
echo ""
echo "▶ 4/4  Verifying production..."
sleep 5
LIVE_SHA=$(curl -sf "${PROD_URL}/api/version/" 2>/dev/null | grep -o '"sha":"[^"]*"' | cut -d'"' -f4 || echo "unknown")

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✓ Deploy complete!"
echo ""
echo "  Production : $PROD_URL"
if [[ -n "$DEPLOY_URL" ]]; then
  echo "  Deployment : $DEPLOY_URL"
fi
echo "  Local SHA  : $COMMIT_SHA"
echo "  Live SHA   : $LIVE_SHA"
echo ""
if [[ "$LIVE_SHA" == "$COMMIT_SHA"* ]] || [[ "$COMMIT_SHA" == "$LIVE_SHA"* ]]; then
  echo "  ✓ Live SHA matches commit — deployment confirmed."
else
  echo "  ⚠  SHA mismatch — Vercel CDN may still be propagating (normal for ~30s)."
  echo "     Re-run:  curl ${PROD_URL}/api/version/"
fi
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
