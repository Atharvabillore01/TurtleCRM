#!/usr/bin/env bash
# scripts/healthcheck.sh
# Checks every service health endpoint and exits 1 if any are down.
# Usage: ./scripts/healthcheck.sh [--wait]
#   --wait  retry for up to 120s instead of failing immediately

set -euo pipefail

WAIT_MODE=false
[[ "${1:-}" == "--wait" ]] && WAIT_MODE=true

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # no colour

FAILED=0

check_http() {
  local label=$1
  local url=$2
  local timeout=${3:-3}

  if curl -sf --connect-timeout "$timeout" "$url" > /dev/null 2>&1; then
    printf "  ${GREEN}✅${NC}  %-30s %s\n" "$label" "$url"
    return 0
  else
    printf "  ${RED}❌${NC}  %-30s %s\n" "$label" "$url"
    return 1
  fi
}

check_tcp() {
  local label=$1
  local host=$2
  local port=$3

  if nc -z -w 2 "$host" "$port" > /dev/null 2>&1; then
    printf "  ${GREEN}✅${NC}  %-30s %s:%s\n" "$label" "$host" "$port"
    return 0
  else
    printf "  ${RED}❌${NC}  %-30s %s:%s\n" "$label" "$host" "$port"
    return 1
  fi
}

run_checks() {
  FAILED=0

  echo ""
  echo "── Infrastructure ──────────────────────────────────────────"
  check_tcp  "PostgreSQL"            localhost 5432  || FAILED=$((FAILED + 1))
  check_tcp  "Redis"                 localhost 6379  || FAILED=$((FAILED + 1))
  check_tcp  "Zookeeper"             localhost 2181  || FAILED=$((FAILED + 1))
  check_tcp  "Kafka"                 localhost 29092 || FAILED=$((FAILED + 1))

  echo ""
  echo "── Backend Services ────────────────────────────────────────"
  check_http "auth-service"          "http://localhost:4000/health" || FAILED=$((FAILED + 1))
  check_http "otp-service"           "http://localhost:4001/health" || FAILED=$((FAILED + 1))
  check_http "user-service"          "http://localhost:4002/health" || FAILED=$((FAILED + 1))
  check_http "notification-service"  "http://localhost:4003/health" || FAILED=$((FAILED + 1))

  echo ""
  echo "── Frontend Apps ───────────────────────────────────────────"
  check_http "client-app"            "http://localhost:3000"        || FAILED=$((FAILED + 1))
  check_http "advisor-app"           "http://localhost:3001"        || FAILED=$((FAILED + 1))

  return $FAILED
}

echo ""
echo "Turtle Corporate — Service Health Check"
echo "======================================="

if $WAIT_MODE; then
  printf "${YELLOW}⏳ Waiting for services (up to 120s)...${NC}\n"
  DEADLINE=$((SECONDS + 120))

  while true; do
    run_checks 2>/dev/null && break
    if [[ $SECONDS -ge $DEADLINE ]]; then
      echo ""
      printf "${RED}Timed out waiting for services after 120s${NC}\n"
      exit 1
    fi
    printf "\n  ${YELLOW}Retrying in 5s...${NC}\n"
    sleep 5
  done
else
  run_checks || true
fi

echo ""
if [[ $FAILED -eq 0 ]]; then
  printf "${GREEN}✅  All services healthy.${NC}\n\n"
  exit 0
else
  printf "${RED}❌  $FAILED service(s) are down.${NC}\n\n"
  exit 1
fi
