# Informe de implementación — dashboard_cards_restructure (feature #23)

## Resumen

Tres ajustes independientes sobre `Dashboard.jsx` y `queryQueues`
(`backend/server.js`):

1. La `StatCard` "Perdidas" se renombra a "No Contestadas" (mismo `value`,
   `icon`, `color`, `sub`, `pct` — sin cambio de fuente de datos).
2. Se elimina por completo `UnansweredBreakdownCard` (#22), sus constantes
   `UNANSWERED_REASONS`/`REASON_COLOR_CLASS`, la variable
   `noAnswerBreakdown` y su fila de grid. El backend conserva
   `dispositions['NO ANSWER'].breakdown` en el payload sin cambios.
3. `queryQueues` ahora aplica `resolveDisposition(r, lostDests)` (#17/#21) a
   cada registro antes de agregar por cola, igual que `queryStats`/
   `queryChannels`/`queryHourly` — `queue['NO ANSWER']` refleja la
   reclasificación. `dstchannel` se añade al `SELECT`/`GROUP BY`. Firma sin
   cambios.
4. Las dos `StatCard` "Extensiones"/"Activas" (#18/#19) se combinan en un
   nuevo componente local `ExtensionsStatusCard` (estilo `QueueCard`),
   mostrando `active / total` y preservando la degradación visual
   (opacidad + `title`) cuando `extensionsData.available === false`.

## Archivos modificados

- `backend/server.js`:
  - `queryQueues` (~líneas 274-302):
    - `SELECT`/`GROUP BY` añade `dstchannel`
      (`SELECT channel, dst, dstchannel, disposition, COUNT(*) AS count ...
      GROUP BY channel, dst, dstchannel, disposition`), parámetros
      preparados `[from, to]` sin cambios.
    - Cuerpo del bucle: `const d = r.disposition.toUpperCase(); ... if
      ([...].includes(d)) result[key][d] += ...` reemplazado por
      `const targetKey = resolveDisposition(r, lostDests); if (targetKey)
      result[key][targetKey] += Number(r.count);`. El cálculo de `key`
      (`queues.includes(r.dst) ? r.dst : '__lost__'`) y el filtro
      `validDsts.has(r.dst)` no cambian.
    - Firma idéntica: `queryQueues(pool, from, to, inboundChannels,
      outboundChannels, queues, lostDests)`.
  - `queryStats`, `queryChannels`, `queryHourly`, `resolveDisposition`,
    `classifyUnansweredReason`, `fetchData()` (invocación de `queryQueues`
    en la línea ~493, ya pasaba `lostDests`): sin cambios (T3/T4 verificados
    por inspección).

- `frontend/src/components/Dashboard.jsx`:
  - Import de `lucide-react`: se elimina `UserCheck` (sin uso tras T9); se
    conserva `Users` (usado por `QueueCard` y el nuevo
    `ExtensionsStatusCard`).
  - Se eliminan las constantes `UNANSWERED_REASONS`, `REASON_COLOR_CLASS` y
    el componente `UnansweredBreakdownCard`.
  - Nuevo componente local `ExtensionsStatusCard({ data })` (no exportado,
    junto a `QueueCard`), que muestra `active / total` con `active`
    resaltado (`text-emerald-400`) y aplica `opacity-50` + `title="Estado de
    extensiones no disponible"` cuando `available === false`.
  - Se elimina la variable `noAnswerBreakdown = disp?.['NO ANSWER']?.breakdown`.
  - StatCard "Perdidas" → `label="No Contestadas"` (mismo `value={noAnswer}`,
    `icon={PhoneMissed}`, `color="red"`, `sub`, `pct={lostPct}`).
  - Se elimina la fila de grid de `UnansweredBreakdownCard` y su comentario
    `{/* Desglose de 'Perdidas' por motivo (#22) */}`.
  - El bloque `<div className="grid grid-cols-2 gap-4 ..."><StatCard
    label="Extensiones" .../><StatCard label="Activas" .../></div>` se
    reemplaza por `<div className="grid grid-cols-1 sm:grid-cols-2
    gap-4"><ExtensionsStatusCard data={extensionsData} /></div>`.
  - `EXTENSIONS_POLL_MS`, `EMPTY_EXTENSIONS_STATUS`, el `useEffect` de
    polling y `api.pbxExtensions()`: sin cambios (R18).

## Archivos creados

- `backend/tests/dashboard_cards_restructure.test.js` — copia local (mirror)
  de `extractChannel`, `passesFilter`, `AGENT_DSTCHANNEL_RE`,
  `resolveDisposition` y `queryQueues` post-#23, con 11 tests cubriendo
  R8-R11, R19-R22.

## Trazabilidad R<n> → test → archivo:línea

| Req | Test | Archivo |
|---|---|---|
| R8 | `R8 - dst en config.queues (8000), disposition=ANSWERED, dstchannel vacío reclasifica a queue["8000"]["NO ANSWER"] en lugar de ANSWERED` | `backend/tests/dashboard_cards_restructure.test.js` |
| R8 | `R8 - dst en config.queues (8000), disposition=ANSWERED, dstchannel="Agent/03" sigue contando en queue["8000"].ANSWERED (sin reclasificar)` | `backend/tests/dashboard_cards_restructure.test.js` |
| R9 | `R9 - dst en config.queues, disposition=BUSY se mantiene en queue["8000"].BUSY sin cambios` | `backend/tests/dashboard_cards_restructure.test.js` |
| R9 | `R9 - dst en config.queues, disposition=FAILED se mantiene en queue["8000"].FAILED sin cambios` | `backend/tests/dashboard_cards_restructure.test.js` |
| R10 | `R10 - para cada cola != __lost__, queue.total === ANSWERED + NO_ANSWER + BUSY + FAILED tras la reclasificación, con un dataset mixto` | `backend/tests/dashboard_cards_restructure.test.js` |
| R11 | `R11 - dst en config.lostDestinations con disposition=ANSWERED se cuenta en __lost__["NO ANSWER"] (reclasificado) en lugar de __lost__.ANSWERED` | `backend/tests/dashboard_cards_restructure.test.js` |
| R22 | `R22 - config.queues vacío o no configurado retorna [] sin cambios` | `backend/tests/dashboard_cards_restructure.test.js` |
| R19 | `R19 - GET /api/calls/today mantiene la forma de respuesta; queues[*] refleja la reclasificación de queryQueues` | `backend/tests/dashboard_cards_restructure.test.js` |
| R20 | `R20 - GET /api/calls/range mantiene la forma de respuesta; queues[*] refleja la reclasificación` | `backend/tests/dashboard_cards_restructure.test.js` |
| R21 | `R21 - SSE init/update mantienen la forma de respuesta; queues[*] refleja la reclasificación (verificación manual anotada en T11/T12)` | `backend/tests/dashboard_cards_restructure.test.js` |
| R19/R5 | `R19 - stats.dispositions["NO ANSWER"].breakdown sigue presente en el payload sin cambios (#22 no se rompe)` | `backend/tests/dashboard_cards_restructure.test.js` |
| R1-R3 | `label="No Contestadas"`, mismo `value`/`icon`/`color`/`sub`/`pct` que antes | `frontend/src/components/Dashboard.jsx` (sin test unitario frontend — Vitest no configurado, ver CLAUDE.md) |
| R4-R6 | Eliminación de `UnansweredBreakdownCard`, `UNANSWERED_REASONS`, `REASON_COLOR_CLASS`, `noAnswerBreakdown` y su fila de grid | `frontend/src/components/Dashboard.jsx` (verificación manual T12) |
| R12/R13 | `QueueCard` sin cambios de código — recibe `queue['NO ANSWER']` ya reclasificado vía props | `frontend/src/components/Dashboard.jsx` |
| R14-R18 | `ExtensionsStatusCard({ data })`: `active / total`, `opacity-50` + `title` cuando `available === false` | `frontend/src/components/Dashboard.jsx` (verificación manual T12) |

## Resultado de verificación

```
cd backend && npm test
Test Suites: 14 passed, 14 total
Tests:       342 passed, 342 total
```

```
cd frontend && npm run build
✓ 2320 modules transformed, built in ~15s, sin errores
```

```
./init.sh
✅ Todo verde: 25/25 checks pasaron
```

## No-regresión

- `disposition_agent_answered_fix.test.js`, `dashboard_lost_destinations.test.js`,
  `dashboard_unanswered_breakdown.test.js`: pasan sin modificación (#23 solo
  toca `queryQueues`; las copias locales de `queryStats`/`queryChannels`/
  `queryHourly` de esos archivos no se tocaron).
- Nota sobre `disposition_agent_answered_fix.test.js` (R17, líneas ~483-501):
  ese test documenta como "limitación conocida" que `queryQueues` (pre-#23)
  NO aplicaba `resolveDisposition`. El test en sí no invoca la función real
  `queryQueues` (usa un cálculo inline `row.disposition.toUpperCase()` como
  ejemplo ilustrativo), por lo que sigue pasando — pero su comentario/
  documentación quedó desactualizado tras #23 (la "limitación conocida" ya
  no existe). No se modificó por estar fuera del scope de `tasks.md` (T3
  prohíbe tocar archivos de #21); se deja anotado aquí para que el
  `reviewer`/`leader` decida si amerita una nota de seguimiento.
- `GET /api/calls/today`, `GET /api/calls/range`, SSE `init`/`update`: misma
  forma de respuesta (R19-R21) — verificado vía contrato de claves
  (`Object.keys`) sobre la copia local de `queryQueues` post-#23; sin entorno
  Issabel/SSE real disponible para prueba end-to-end (mismo criterio
  documentado en #21/#22).
- `GET /api/calls/inbound`, `/api/calls/outbound` (+ export),
  `GET/PUT /api/admin/channels*`, `GET /api/pbx/extensions`: sin cambios de
  payload (no usan `queryQueues`; `/api/pbx/extensions` solo cambia su
  consumo en `Dashboard.jsx`).
- Sin nuevas dependencias npm (R24): `backend/package.json` y
  `frontend/package.json` sin diff.

## Verificación manual pendiente (T12, parte visual)

El build de frontend y `./init.sh` están verdes. La comprobación visual en el
Dashboard con datos reales que incluyan al menos:
- un registro `dst` en `config.queues`, `disposition='ANSWERED'`, `dstchannel`
  vacío (debe aparecer en "No contest." de esa cola, no en "Contestadas"),
- un registro `dst` en `config.lostDestinations`, `disposition='ANSWERED'`
  (debe aparecer en `__lost__['NO ANSWER']` si se inspecciona el payload),

y verificar que la tarjeta "No Contestadas" tiene el mismo formato que
"Contestadas", que no aparece "Detalle de Perdidas", que las `QueueCard`
muestran "No contest.: N" reclasificado, y que `ExtensionsStatusCard` muestra
"activas / total" con la degradación visual cuando `available = false` —
queda pendiente de verificación manual en un entorno con acceso a la BD
Issabel/AMI/SSE real (mismo criterio documentado para R21 en #21/#22).
