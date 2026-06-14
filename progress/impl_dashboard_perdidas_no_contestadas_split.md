# Informe de implementación — dashboard_perdidas_no_contestadas_split (feature #24)

## Resumen

Separa la `StatCard` única "No Contestadas" (introducida por #23) en dos
`StatCard` independientes:

- **"Perdidas"** = `dispositions['NO ANSWER'].breakdown.ivr_hangup` (colgó en
  IVR/menú).
- **"No Contestadas"** = `breakdown.no_answer + breakdown.queue_no_agent`
  (sin respuesta + cola sin agente real).

Cada tarjeta calcula su propio `pct` sobre `stats.total` (no sobre
`dispositions['NO ANSWER'].count` ni entre sí). Cambio exclusivamente en
`frontend/src/components/Dashboard.jsx` + tests en
`frontend/src/components/Dashboard.test.jsx`. Sin cambios de backend (R12,
confirmado por T1).

## Archivos modificados

- `frontend/src/components/Dashboard.jsx`:
  - Líneas ~138-146 (antes): se eliminan las variables agregadas `noAnswer =
    disp?.['NO ANSWER']?.count ?? 0` y `lostPct = disp?.['NO
    ANSWER']?.pct ?? 0`.
  - Se añade `noAnswerBreakdown = disp?.['NO ANSWER']?.breakdown ?? {}` (R10:
    default `{}` si `breakdown` es `undefined`).
  - Nuevas variables (R1, R2, R11 — default por clave individual):
    - `lost = noAnswerBreakdown.ivr_hangup ?? 0`
    - `noAnswer = (noAnswerBreakdown.no_answer ?? 0) + (noAnswerBreakdown.queue_no_agent ?? 0)`
    - `lostPct = total > 0 ? Math.round((lost / total) * 1000) / 10 : 0` (R6, R10)
    - `noAnswerPct = total > 0 ? Math.round((noAnswer / total) * 1000) / 10 : 0` (R6, R10)
  - `answered`, `busy`, `failed`, `answeredPct`, `busyPct`, `failedPct`: sin
    cambios.
  - Grid de KPIs principales (~línea 187): `grid-cols-1 sm:grid-cols-3` →
    `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4` (R7).
  - La `StatCard` única "No Contestadas" (`value={noAnswer}`,
    `pct={lostPct}`, agregada de #23) se reemplaza por dos `StatCard`:
    - `<StatCard label="Perdidas" value={lost} icon={PhoneMissed} color="red" sub="colgó en IVR, del total" pct={lostPct} />` (R1, R4)
    - `<StatCard label="No Contestadas" value={noAnswer} icon={PhoneMissed} color="amber" sub="sin respuesta, del total" pct={noAnswerPct} />` (R2, R5)
  - Orden final del grid: Total, Contestadas, Perdidas, No Contestadas (R7).
  - Sin nuevos imports de `lucide-react` (`Phone`, `PhoneCall`,
    `PhoneMissed` ya estaban importados).
  - `DispositionChart`/`HourlyChart` reciben `disp`/`hourly` sin cambios (R9).

- `frontend/src/components/Dashboard.test.jsx`:
  - `SAMPLE_DATA.stats.dispositions['NO ANSWER']` ahora incluye
    `breakdown: { no_answer: 8, ivr_hangup: 5, queue_no_agent: 7 }`
    (count total = 20 = 8+5+7, R3).
  - Nuevo helper `withBreakdown(breakdown)` para construir payloads con
    `breakdown` personalizado (incluyendo `undefined`) para los casos
    degradados R10/R11.
  - `beforeEach`: se añade un default `api.pbxExtensions.mockResolvedValue(...)`
    (estado neutro `{ total: 0, active: 0, extensions: [], available: false }`)
    para que los nuevos tests no necesiten mockearlo individualmente; los
    tests R14-R17 siguen sobrescribiéndolo por test, sin cambio de
    comportamiento para ellos.
  - Nuevo `describe('Dashboard - split "Perdidas" / "No Contestadas" (R1-R11, #24)')`
    con 7 tests (ver trazabilidad).

## Trazabilidad R<n> → test → archivo:línea

| Req | Test | Archivo |
|---|---|---|
| R1/R4 | `R1/R4 - Dashboard renderiza una StatCard "Perdidas" con value = breakdown.ivr_hangup y el mismo formato que "Contestadas"` | `frontend/src/components/Dashboard.test.jsx` |
| R2/R5 | `R2/R5 - Dashboard renderiza una StatCard "No Contestadas" con value = breakdown.no_answer + breakdown.queue_no_agent y el mismo formato que "Contestadas"` | `frontend/src/components/Dashboard.test.jsx` |
| R3 | `R3 - la suma de los valores de "Perdidas" y "No Contestadas" es igual a dispositions["NO ANSWER"].count para un payload de ejemplo` | `frontend/src/components/Dashboard.test.jsx` |
| R6 | `R6 - el pct de "Perdidas" y "No Contestadas" se calcula sobre stats.total, no sobre dispositions["NO ANSWER"].count ni entre sí` | `frontend/src/components/Dashboard.test.jsx` |
| R8 | `R8 - Total === Contestadas + Perdidas + No Contestadas + Ocupado + Fallidas para un payload de ejemplo` | `frontend/src/components/Dashboard.test.jsx` |
| R10 | `R10 - cuando dispositions["NO ANSWER"].breakdown es undefined, "Perdidas" y "No Contestadas" renderizan value=0 y pct=0 sin error` | `frontend/src/components/Dashboard.test.jsx` |
| R11 | `R11 - cuando breakdown está presente pero falta una de sus claves (no_answer/ivr_hangup/queue_no_agent), esa clave se trata como 0` | `frontend/src/components/Dashboard.test.jsx` |
| R7 | Grid `grid-cols-1 sm:grid-cols-2 lg:grid-cols-4`, orden Total/Contestadas/Perdidas/No Contestadas | `frontend/src/components/Dashboard.jsx` (verificación manual T7) |
| R9 | `DispositionChart`/`HourlyChart` sin cambios, reciben `disp`/`hourly` completos | `frontend/src/components/Dashboard.jsx` (sin diff en estos componentes) |
| R12 | `queryStats` (backend/server.js ~150-203) sin cambios; `breakdown` propagado a `/api/calls/today`, `/api/calls/range`, SSE | T1 — verificación por inspección, sin test nuevo (sin cambio de backend) |
| R13/R14/R15 | Sin escritura CDR, sin npm deps nuevas, sin librerías de gráficos nuevas | Confirmado por inspección — sin diffs en `package.json` |

## Resultado de verificación

```
cd backend && npm test
Test Suites: 14 passed, 14 total
Tests:       342 passed, 342 total
```

```
cd frontend && npx vitest run src/components/Dashboard.test.jsx
Test Files  1 failed (1)
Tests       2 failed | 9 passed (11)
```

De los 9 tests que pasan, 7 son los nuevos de esta feature (R1, R2, R3, R6,
R8, R10, R11) + R14/R16 (preexistentes). Los 2 que fallan (**R15**, **R17**,
del describe `Dashboard - indicadores de extensiones AMI (R14-R17)`, feature
#23) **ya fallaban antes de esta implementación** — se verificó haciendo
`git stash` de los cambios de #24 y reejecutando la suite original, que
arroja el mismo resultado (2 failed | 2 passed de 4). Causa: tras el
refactor de #23 (`ExtensionsStatusCard`), el componente ya no renderiza un
label "Activas" independiente (muestra `active / total` en una sola tarjeta
"Extensiones"), por lo que `screen.getByText('Activas')` no encuentra nada.
Esto es una regresión de test preexistente de #23, **fuera del scope de
#24** — no se modifica (regla: no tocar archivos/specs de otras features sin
indicación).

```
cd frontend && npm run build
✓ 2320 modules transformed, built in ~18-30s, sin errores
```

```
./init.sh
✅ Todo verde: 25/25 checks pasaron
```

## No-regresión

- `backend/server.js`: sin diff (T1 confirmó que `queryStats` ya calcula
  `breakdown` desde #22 sin cambios desde #23).
- `backend/tests/*`: 342/342 pasan, sin cambios.
- `frontend/src/components/StatCard.jsx`, `DispositionChart.jsx`,
  `HourlyChart.jsx`, `ChannelTable.jsx`, `QueueCard`,
  `ExtensionsStatusCard`: sin cambios.
- `GET /api/calls/today`, `GET /api/calls/range`, SSE `init`/`update`: sin
  cambio de payload (R12) — no se requiere verificación adicional, esta
  feature no toca backend.
- Sin nuevas dependencias npm (R14 spec): `frontend/package.json` y
  `backend/package.json` sin diff.

## Verificación manual pendiente (T7)

El build de frontend y `./init.sh` están verdes. La verificación visual con
datos reales (Issabel/AMI/SSE en producción) que incluya:
- un registro con `dst` en `config.lostDestinations` → debe aparecer en
  "Perdidas" (R1);
- un registro `disposition='NO ANSWER'` con `dst` fuera de
  `lostDestinations` → debe aparecer en "No Contestadas" (R2);
- un registro `disposition='ANSWERED'` reclasificado por #21 (sin agente
  real) → debe aparecer en "No Contestadas" (R2);

queda pendiente de verificación en un entorno con acceso real a la BD
Issabel/AMI/SSE (mismo criterio documentado para #21/#22/#23). Verificar
adicionalmente que "Perdidas" + "No Contestadas" = `dispositions['NO
ANSWER'].count` (R3) y que `DispositionChart`/`HourlyChart` siguen mostrando
la categoría combinada "no contestadas" sin split (R9).
