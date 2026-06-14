# Review — dashboard_perdidas_no_contestadas_split — APROBADO

## Trazabilidad

| R<n> | Test / Verificación | Estado |
|---|---|---|
| R1 | `R1/R4 - Dashboard renderiza una StatCard "Perdidas" con value = breakdown.ivr_hangup y el mismo formato que "Contestadas"` | ✅ |
| R2 | `R2/R5 - Dashboard renderiza una StatCard "No Contestadas" con value = breakdown.no_answer + breakdown.queue_no_agent y el mismo formato que "Contestadas"` | ✅ |
| R3 | `R3 - la suma de los valores de "Perdidas" y "No Contestadas" es igual a dispositions["NO ANSWER"].count para un payload de ejemplo` | ✅ |
| R4 | mismo test R1 (verifica formato `p.text-3xl`, sub-texto, `%`, igual que "Contestadas") | ✅ |
| R5 | mismo test R2 (formato idéntico) | ✅ |
| R6 | `R6 - el pct de "Perdidas" y "No Contestadas" se calcula sobre stats.total, no sobre dispositions["NO ANSWER"].count ni entre sí` (5% y 15%, no 20% ni 100% combinados) | ✅ |
| R7 | Inspección de código: grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, orden Total/Contestadas/Perdidas/No Contestadas, mismo grupo visual de KPIs | ✅ |
| R8 | `R8 - Total === Contestadas + Perdidas + No Contestadas + Ocupado + Fallidas para un payload de ejemplo` | ✅ |
| R9 | Inspección: `DispositionChart`/`HourlyChart` reciben `disp`/`hourly` sin cambios — sin diff en estos componentes | ✅ |
| R10 | `R10 - cuando dispositions["NO ANSWER"].breakdown es undefined, "Perdidas" y "No Contestadas" renderizan value=0 y pct=0 sin error` | ✅ |
| R11 | `R11 - cuando breakdown está presente pero falta una de sus claves (...), esa clave se trata como 0` | ✅ |
| R12 | `git diff backend/server.js` vacío — confirmado por el reviewer (ver abajo) | ✅ |
| R13 | Sin nuevas queries/escrituras CDR — feature 100% frontend, sin diff en `backend/` | ✅ |
| R14 | Sin nuevas dependencias npm — `package.json` (frontend/backend) sin diff | ✅ |
| R15 | Sin nuevas librerías de gráficos — `StatCard` reutilizado, sin nuevos imports | ✅ |
| R16 | Los 7 tests anteriores (R1,R2,R3,R6,R8,R10,R11) cubren exactamente lo pedido por R16 | ✅ |

Todos los tasks T1-T7 marcados `[x]` en `tasks.md`, consistentes con lo
implementado.

## Verificación de código (Dashboard.jsx)

Inspeccionado `frontend/src/components/Dashboard.jsx` líneas ~138-211:

- `noAnswerBreakdown = disp?.['NO ANSWER']?.breakdown ?? {}` (R10: default
  `{}` si `breakdown` es `undefined`).
- `lost = noAnswerBreakdown.ivr_hangup ?? 0` (R1).
- `noAnswer = (noAnswerBreakdown.no_answer ?? 0) + (noAnswerBreakdown.queue_no_agent ?? 0)` (R2, R11 — default por clave individual).
- `lostPct`/`noAnswerPct` calculados como `value / total` con el redondeo
  estándar (`Math.round((x / total) * 1000) / 10`), con guarda `total > 0`
  (R6, R10).
- `answered`, `busy`, `failed`, `answeredPct`, `busyPct`, `failedPct` sin
  cambios.
- Grid de KPIs: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, orden Total,
  Contestadas, Perdidas (`color="red"`, sub="colgó en IVR, del total"), No
  Contestadas (`color="amber"`, sub="sin respuesta, del total") — coincide
  exactamente con `design.md` §5.3 y `tasks.md` T3.
- Sin nuevos imports de `lucide-react`.
- No quedan referencias muertas a `noAnswer`/`lostPct` con el significado
  anterior de #23 (T4 verificado).

Código corresponde exactamente al diseño aprobado.

## Backend — sin cambios (R12)

```
git diff backend/server.js
```
→ salida vacía. Confirmado: ningún archivo de `backend/` tiene diff para
esta feature. R12/T1 cumplidos.

## Verificación especial: 2 fallos en Dashboard.test.jsx (R15/R17 de #23)

Se ejecutó `cd frontend && npx vitest run src/components/Dashboard.test.jsx`
con los cambios de #24 aplicados:

```
Test Files  1 failed (1)
     Tests  2 failed | 9 passed (11)
```

Los 2 fallos son en `describe('Dashboard - indicadores de extensiones AMI
(R14-R17)')`, con el mismo error en ambos casos:

```
screen.getByText('Activas')
TestingLibraryElementError: Unable to find an element with the text: Activas.
```

**Verificación de preexistencia**: se hizo `git stash push -- 
frontend/src/components/Dashboard.jsx frontend/src/components/Dashboard.test.jsx`
para volver al estado del commit `311bbd9` (feature #23, antes de los
cambios de #24), y se re-ejecutó la suite:

```
Test Files  1 failed (1)
     Tests  2 failed | 2 passed (4)
```

Mismo error exacto (`getByText('Activas')` no encuentra el elemento), en la
misma sección `describe`. Tras confirmar, se restauró el trabajo de #24 con
`git stash pop` (confirmado: `Dashboard.jsx` y `Dashboard.test.jsx` vuelven a
mostrar los cambios de #24 en `git status`).

**Conclusión**: los 2 fallos son **100% preexistentes de la feature #23**
(`dashboard_cards_restructure`, commit `311bbd9`). La causa es que
`ExtensionsStatusCard` (refactor de #23) ya no renderiza un label "Activas"
independiente — muestra `active / total` combinado en una sola tarjeta
"Extensiones" — por lo que los tests `R15`/`R17` (escritos contra el diseño
anterior, presumiblemente de #22) quedaron desactualizados desde #23. **#24
no los introduce, no los empeora, y no los toca** — son deuda técnica de
tests preexistente, fuera del alcance de #24 (que es exclusivamente sobre las
tarjetas "Perdidas"/"No Contestadas").

Dado que:
1. Los 7 tests nuevos de #24 (R1, R2, R3, R6, R8, R10, R11) pasan
   correctamente.
2. Los 2 fallos existían de forma idéntica antes de #24, en el mismo archivo
   y la misma sección de tests no relacionada con esta feature.
3. La regla `require_tests_to_close` busca evitar que una feature cierre con
   regresiones **propias**, no exige que cada feature arregle deuda
   preexistente de otra.

Se considera que **#24 no introduce ninguna regresión** y puede aprobarse.

**Nota para housekeeping futuro**: los tests `R15`/`R17` de
`describe('Dashboard - indicadores de extensiones AMI (R14-R17)')` en
`frontend/src/components/Dashboard.test.jsx` deben actualizarse para
reflejar el diseño actual de `ExtensionsStatusCard` (#23), que combina
"Activas"/"Total" en una sola tarjeta "Extensiones" sin un label "Activas"
independiente. Esto debería resolverse en una futura feature de
housekeeping/test-debt, no como parte de #24.

## Verificación adicional

```
cd backend && npm test
Test Suites: 14 passed, 14 total
Tests:       342 passed, 342 total
```

```
cd frontend && npm run build
✓ 2320 modules transformed, built in ~14.7s, sin errores
```

## Invariantes (verificados vía tests R3/R8 con SAMPLE_DATA)

- `breakdown.ivr_hangup (5) + (breakdown.no_answer (8) + breakdown.queue_no_agent (7)) = 20 = dispositions['NO ANSWER'].count` ✅ (R3)
- `Total (100) = Contestadas (70) + Perdidas (5) + No Contestadas (15) + Ocupado (5) + Fallidas (5)` ✅ (R8)
- `pct(Perdidas) = 5%` (5/100), `pct(No Contestadas) = 15%` (15/100) — cada
  uno sobre `stats.total`, no sobre `dispositions['NO ANSWER'].count` (20%)
  ni suman 100% entre sí ✅ (R6)

## No-regresión v1.0: ✅
## Convenciones: ✅ (sin SQL nuevo, sin TypeScript, sin fetch directo, sin console.log de debug, sin nuevos imports innecesarios)
## Seguridad: ✅ (sin endpoints nuevos, sin acceso CDR adicional)
## Tests: ✅ (backend 342/342; frontend Dashboard.test.jsx 9/11 — 2 fallos preexistentes de #23, documentados, no introducidos ni agravados por #24)

**Decisión: APROBADO.**

**SIGUIENTE PASO OBLIGATORIO:** `git add -A && git commit -m
"feat(dashboard_perdidas_no_contestadas_split): <título>"`
Solo después del commit: marcar `done` en `feature_list.json` e iniciar la
siguiente feature.
