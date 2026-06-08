#!/usr/bin/env bash
# init.sh — Issabel Monitor Analytics
# Verifica el entorno al inicio de cada sesión.
# Exit 0 = entorno listo. Exit 1 = hay errores críticos.

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0; FAIL=0

ok()   { echo -e "${GREEN}✅ $1${NC}"; PASS=$((PASS+1)); }
fail() { echo -e "${RED}❌ $1${NC}"; FAIL=$((FAIL+1)); }
warn() { echo -e "${YELLOW}⚠️  $1${NC}"; }

echo ""
echo "═══════════════════════════════════════════════"
echo "  Issabel Monitor Analytics — Verificación"
echo "  $(date '+%Y-%m-%d %H:%M')"
echo "═══════════════════════════════════════════════"
echo ""

# ── 1. Herramientas ────────────────────────────────
echo "── [1/6] Herramientas ──"
command -v node &>/dev/null && ok "Node.js: $(node --version)" || fail "Node.js no instalado"
command -v npm  &>/dev/null && ok "npm: $(npm --version)"       || fail "npm no instalado"
command -v git  &>/dev/null && ok "git: $(git --version | head -1)" || warn "git no disponible"
echo ""

# ── 2. Arnés ──────────────────────────────────────
echo "── [2/6] Estructura del arnés ──"
for f in AGENTS.md CHECKPOINTS.md CLAUDE.md feature_list.json; do
  [ -f "$f" ] && ok "$f" || fail "$f FALTA"
done
for f in docs/architecture.md docs/conventions.md docs/specs.md docs/verification.md docs/existing_code.md; do
  [ -f "$f" ] && ok "$f" || fail "$f FALTA"
done
for f in progress/current.md progress/history.md; do
  [ -f "$f" ] && ok "$f" || fail "$f FALTA"
done
for f in .claude/agents/leader.md .claude/agents/spec_author.md .claude/agents/implementer.md .claude/agents/reviewer.md; do
  [ -f "$f" ] && ok "$f" || fail "$f FALTA"
done
echo ""

# ── 3. Consistencia de feature_list.json ──────────
echo "── [3/6] Consistencia de features ──"
if command -v node &>/dev/null && [ -f feature_list.json ]; then
  node -e "
    const f = require('./feature_list.json');
    const ip = f.features.filter(x => x.status === 'in_progress');
    if (ip.length > 1) {
      console.log('MULTI_IP:' + ip.map(x=>x.name).join(', '));
    } else if (ip.length === 1) {
      console.log('ONE_IP:' + ip[0].name);
    } else {
      console.log('NO_IP');
    }
    // Check specs for sdd features in active states
    const fs2 = require('fs');
    const needs = f.features.filter(x => x.sdd && ['spec_ready','in_progress','done'].includes(x.status));
    let missing = [];
    needs.forEach(feat => {
      ['requirements.md','design.md','tasks.md'].forEach(file => {
        const p = 'specs/' + feat.name + '/' + file;
        if (!fs2.existsSync(p)) missing.push(p);
      });
    });
    if (missing.length > 0) console.log('MISSING_SPECS:' + missing.join('|'));
    else console.log('SPECS_OK:' + needs.length);
  " 2>/dev/null | while IFS= read -r line; do
    case "$line" in
      MULTI_IP:*)   fail "VIOLACIÓN: múltiples in_progress: ${line#MULTI_IP:}" ;;
      ONE_IP:*)     ok "Feature in_progress: ${line#ONE_IP:}" ;;
      NO_IP)        ok "Sin features in_progress (estado inicial)" ;;
      MISSING_SPECS:*) fail "Specs faltantes: ${line#MISSING_SPECS:}" ;;
      SPECS_OK:0)   ok "Sin features sdd activas aún" ;;
      SPECS_OK:*)   ok "Specs presentes para ${line#SPECS_OK:} feature(s) activas" ;;
    esac
  done
fi
echo ""

# ── 4. Repositorio existente ───────────────────────
echo "── [4/6] Código existente (v1.0) ──"
if [ -d "backend" ] && [ -f "backend/server.js" ]; then
  ok "backend/server.js existe"
  if [ -f "backend/config.json" ]; then
    ok "backend/config.json existe"
  else
    warn "backend/config.json no existe — copiar desde config.example.json"
  fi
  if [ -d "backend/node_modules" ]; then
    ok "backend/node_modules instalado"
    echo -n "  npm test backend... "
    if (cd backend && npm test --silent 2>/dev/null); then
      ok "tests backend: verde"
    else
      warn "tests backend: fallos (puede ser normal si aún no hay tests)"
    fi
  else
    warn "backend/node_modules no instalado — ejecutar: cd backend && npm install"
  fi
else
  warn "backend/server.js no encontrado. ¿Clonaste el repositorio?"
  warn "Ejecutar: git clone https://github.com/mordecai2508/issabel-monitor-entrantes.git ."
fi
echo ""

# ── 5. Frontend ────────────────────────────────────
echo "── [5/6] Frontend ──"
if [ -d "frontend" ] && [ -f "frontend/package.json" ]; then
  ok "frontend/package.json existe"
  if [ -d "frontend/node_modules" ]; then
    ok "frontend/node_modules instalado"
    echo -n "  npm run build frontend... "
    if (cd frontend && npm run build --silent 2>/dev/null); then
      ok "build frontend: sin errores"
    else
      fail "build frontend: hay errores (ejecutar: cd frontend && npm run build)"
    fi
  else
    warn "frontend/node_modules no instalado — ejecutar: cd frontend && npm install"
  fi
else
  warn "frontend/ no encontrado."
fi
echo ""

# ── 6. Resumen ─────────────────────────────────────
echo "── [6/6] Resumen ──"
echo ""
TOTAL=$((PASS+FAIL))
if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}✅ Todo verde: $PASS/$TOTAL checks pasaron${NC}"
  echo ""
  echo "El entorno está listo. Abre AGENTS.md para empezar."
  exit 0
else
  echo -e "${RED}❌ $FAIL/$TOTAL checks fallaron${NC}"
  echo ""
  echo "Resuelve los errores antes de tocar código."
  exit 1
fi
