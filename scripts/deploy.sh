#!/usr/bin/env bash
# deploy.sh — Sigma deploy script
# Usage: ./scripts/deploy.sh "commit message"
# Pushes to GitHub and waits for the Vercel auto-deploy to complete, then verifies alias.

set -euo pipefail

MSG="${1:-chore: deploy}"

echo "▶ Staging all changes..."
git add -A

# Only commit if there are staged changes
if git diff --cached --quiet; then
  echo "  Nothing to commit, working tree clean."
else
  git commit -m "$MSG"
fi

echo "▶ Pushing to GitHub (main)..."
git push origin main

echo "▶ Waiting for Vercel GitHub auto-deploy to start (10s)..."
sleep 10

echo "▶ Polling for new production deployment..."
DEPLOY_URL=""
for i in $(seq 1 30); do
  LATEST=$(vercel ls insiders-trades 2>/dev/null | awk '/Ready.*Production/{print $3; exit}')
  STATUS=$(vercel ls insiders-trades 2>/dev/null | awk '/Production/{print $5; exit}')
  if [[ -n "$LATEST" && "$STATUS" == "Ready" ]]; then
    DEPLOY_URL="$LATEST"
    break
  fi
  echo "  Attempt $i — waiting 10s..."
  sleep 10
done

if [[ -z "$DEPLOY_URL" ]]; then
  echo "✗ Timed out waiting for deploy. Check: https://vercel.com/simonazoulaypro-8345s-projects/insiders-trades"
  exit 1
fi

echo "▶ Latest production deploy: $DEPLOY_URL"
echo "▶ Ensuring alias points to it..."
vercel alias set "$DEPLOY_URL" insiders-trades-sigma.vercel.app

echo ""
echo "✓ Deploy complete!"
echo "  Live at: https://insiders-trades-sigma.vercel.app"
echo "  Deployment: $DEPLOY_URL"
echo ""
echo "  ⚠  Users may need a hard refresh (Cmd+Shift+R) to clear browser cache."
