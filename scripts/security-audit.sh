#!/usr/bin/env bash
# DevPilot Security Audit Script
# Runs dependency vulnerability scan + CSP check + license audit

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "========================================="
echo "  DevPilot Security Audit"
echo "========================================="

FAILED=0

# 1. npm audit (production deps only)
echo ""
echo "--- [1/3] Dependency Vulnerability Scan ---"
if npm audit --omit=dev --registry https://registry.npmjs.org 2>&1; then
  echo -e "${GREEN}✓ No known vulnerabilities${NC}"
else
  echo -e "${RED}✗ Vulnerabilities found!${NC}"
  FAILED=1
fi

# 2. CSP Headers check (Tauri config)
echo ""
echo "--- [2/3] CSP Configuration Check ---"
Tauri_CONFIG="src-tauri/tauri.conf.json"
if [ -f "$Tauri_CONFIG" ]; then
  if grep -q '"csp"' "$Tauri_CONFIG"; then
    echo -e "${GREEN}✓ CSP configured in tauri.conf.json${NC}"
  else
    echo -e "${YELLOW}⚠ No CSP policy found in tauri.conf.json (add before production)${NC}"
  fi
else
  echo -e "${YELLOW}⚠ tauri.conf.json not found (backend not yet configured)${NC}"
fi

# 3. License audit
echo ""
echo "--- [3/3] License Compliance Check ---"
PROD_DEPS=$(npm ls --prod --depth=0 --json 2>/dev/null | grep '"name"' | sed 's/.*: "//;s/".*//' | grep -v '^devpilot$' || true)
if [ -n "$PROD_DEPS" ]; then
  echo "Production dependencies:"
  echo "$PROD_DEPS" | while read -r dep; do
    LIC=$(npm info "$dep" license 2>/dev/null || echo "unknown")
    echo "  $dep: $LIC"
  done
fi

echo ""
echo "========================================="
if [ $FAILED -eq 0 ]; then
  echo -e "${GREEN}  Security Audit: PASSED${NC}"
else
  echo -e "${RED}  Security Audit: FAILED${NC}"
  exit 1
fi
echo "========================================="
