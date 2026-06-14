# Review — dashboard_cards_restructure (feature #23) — APROBADO

## Trazabilidad

| R<n> | Test | Estado |
|---|---|---|
| R1-R3 | Renombrado `label="Perdidas"` → `label="No Contestadas"` en `Dashboard.jsx` (mismo `value`, `icon`, `color`, `sub`, `pct`); sin test unitario frontend (Vitest no configurado, ver CLAUDE.md) — verificado por inspección del diff | ✅ |
| R4-R6 | Eliminación completa de `UnansweredBreakdownCard`, `UNANSWERED_REASONS`, `REASON_COLOR_CLASS`, `noAnswerBreakdown` y su fila de grid — verificado por inspección del diff (no quedan referencias) | ✅ |
| R7-R9 | `R8 - dst en config.queues (8000), disposition=ANSWERED, dstchannel vacío reclasifica a queue["8000"]["NO ANSWER"] en lugar de ANSWERED` / `R8 - ... dstchannel="Agent/03" sigue contando en queue["8000"].ANSWERED` / `R9 - ... disposition=BUSY se mantiene ...` / `R9 - ... disposition=FAILED se mantiene ...` | ✅ |
| R10 | `R10 - para cada cola != __lost__, queue.total === ANSWERED + NO_ANSWER + BUSY + FAILED tras la reclasificación, con un dataset mixto` | ✅ |
| R11 | `R11 - dst en config.lostDestinations con disposition=ANSWERED se cuenta en __lost__["NO ANSWER"] (reclasificado) en lugar de __lost__.ANSWERED` | ✅ |
| R12/R13 | `QueueCard` sin cambios de código — recibe `queue['NO ANSWER']`/`queue.ANSWERED` ya reclasificados vía props; formato visual sin cambios (verificado por inspección del diff de `Dashboard.jsx`) | ✅ |
| R14-R17 | `ExtensionsStatusCard({ data })` nuevo, muestra `active / total`, aplica `opacity-50` + `title` cuando `available === false`; sin test unitario frontend — verificado por inspección del diff | ✅ |
| R18 | `EXTENSIONS_POLL_MS`, `EMPTY_EXTENSIONS_STATUS`, `useEffect` de polling, `api.pbxExtensions()` sin diff (confirmado en `git diff`) | ✅ |
| R19 | `R19 - GET /api/calls/today mantiene la forma de respuesta; queues[*] refleja la reclasificación de queryQueues` + `R19 - stats.dispositions["NO ANSWER"].breakdown sigue presente en el payload sin cambios (#22 no se rompe)` | ✅ |
| R20 | `R20 - GET /api/calls/range mantiene la forma de respuesta; queues[*] refleja la reclasificación` | ✅ |
| R21 | `R21 - SSE init/update mantienen la forma de respuesta; queues[*] refleja la reclasificación` — test documental (sin entorno SSE real), criterio ya aceptado en #21/#22 | ✅ |
| R22 | `R22 - config.queues vacío o no configurado retorna [] sin cambios` (incluye `[]`, `null`, `undefined`, y verifica que `pool.query` no se llama) | ✅ |
| R23 | `queryQueues` sigue usando `SELECT ... WHERE calldate >= ? AND calldate < ?` con parámetros preparados `[from, to]`; sin `SELECT *`; sin concatenación | ✅ |
| R24 | `git diff backend/package.json frontend/package.json` sin cambios | ✅ |
| R25 | Cubierto por la combinación de R1-R22 anteriores (tests backend nuevos + inspección frontend) | ✅ |

## Verificación de código real (`git diff HEAD`)

### `backend/server.js` — `queryQueues`
- `SELECT`/`GROUP BY` ahora incluye `dstchannel` (`SELECT channel, dst, dstchannel, disposition, COUNT(*) AS count ... GROUP BY channel, dst, dstchannel, disposition`), parámetros preparados `[from, to]` sin cambios. Sin `SELECT *`, sin concatenación de strings.
- Cuerpo del bucle reemplazado exactamente como especifica `design.md` §3.3: `const targetKey = resolveDisposition(r, lostDests); if (targetKey) result[key][targetKey] += Number(r.count); result[key].total += Number(r.count);`. El cálculo de `key` (`queues.includes(r.dst) ? r.dst : '__lost__'`) y el filtro `validDsts.has(r.dst)` no cambian.
- Firma de `queryQueues` idéntica: `(pool, from, to, inboundChannels, outboundChannels, queues, lostDests)`.
- `resolveDisposition` (líneas 108-125) verificado contra el mirror del test: **idéntico**, no se tocó.
- `queryStats`, `queryChannels`, `queryHourly`, `classifyUnansweredReason`, `fetchData()`: sin diff (confirmado por `git diff` — el único cambio en `server.js` es el bloque de `queryQueues`).

### `frontend/src/components/Dashboard.jsx`
- Import `UserCheck` eliminado de `lucide-react`; `Users` se conserva (usado por `QueueCard` y `ExtensionsStatusCard`). `grep -n "UserCheck"` sin resultados.
- `UNANSWERED_REASONS`, `REASON_COLOR_CLASS`, `UnansweredBreakdownCard`, `noAnswerBreakdown` eliminados completos — sin referencias residuales.
- `ExtensionsStatusCard({ data })` nuevo componente local (no exportado), patrón consistente con `QueueCard`: `active / total` con `active` resaltado en `text-emerald-400`, degradación `opacity-50` + `title="Estado de extensiones no disponible"` cuando `available === false`.
- StatCard "Perdidas" → `label="No Contestadas"`, `value={noAnswer}`, `icon={PhoneMissed}`, `color="red"`, `sub`, `pct={lostPct}` — sin cambios salvo el label.
- Fila de grid de `UnansweredBreakdownCard` y su comentario eliminados; bloque de las dos StatCard de extensiones reemplazado por `<ExtensionsStatusCard data={extensionsData} />` dentro de `grid-cols-1 sm:grid-cols-2`.
- `grep -n "console.log"` sin resultados.

## Invariante R10 (total = ANSWERED + NO ANSWER + BUSY + FAILED)

Verificado en el test `R10 - ... dataset mixto`: para `q8000` (3+3+1+1=8) y `q8300` (4+2+0+0=6), y mediante un `for` genérico sobre `queues.filter(q => q.queue !== '__lost__')` que comprueba la igualdad para todas las colas del dataset. El test `R11` también comprueba el invariante para `__lost__`. Construcción del código: `result[key].total` se incrementa para **todo** registro que pasa `validDsts.has(r.dst)`, y `result[key][targetKey]` se incrementa exactamente cuando `targetKey` no es `null` (es decir, cuando `disposition` era una de las 4 reconocidas) — la suma de los 4 buckets iguala `total` para registros con disposición reconocida, igual que antes de #23.

## Nota del implementer sobre `disposition_agent_answered_fix.test.js` (R17)

El implementer señaló que el test `R17 - queryQueues no aplica el criterio de dstchannel; documentado como limitación conocida (design.md Decisión C)` (líneas 483-501 de `backend/tests/disposition_agent_answered_fix.test.js`) tiene un **comentario/narrativa desactualizada**: dice que "queryQueues (server.js, sin cambios por #21) sigue agrupando por `channel, dst, disposition` sin `dstchannel` y sin usar `resolveDisposition`" y que esto "no se modifica aquí" — afirmación que era cierta antes de #23 pero que #23 corrige precisamente (esa es la "feature incremental futura" anticipada en la Decisión C de #21).

**Revisión de la afirmación**: el test **no invoca la función real `queryQueues`**. Sus dos `expect`:
- `expect(queueDisposition).toBe('ANSWERED')` — sobre `row.disposition.toUpperCase()` calculado inline, no sobre `queryQueues`.
- `expect(resolveDisposition(row, LOST_DESTS)).toBe('NO ANSWER')` — sobre la función real `resolveDisposition`, que no cambió.

Ambas aserciones siguen siendo verdaderas independientemente de #23, por lo que el test **sigue pasando** (confirmado: 342/342). El problema es puramente de **documentación/comentarios** dentro de un test de una feature anterior (#21), no de código de producción ni de corrección de aserciones.

**Decisión: NO bloqueante.**
- No hay ningún `R<n>` de la feature #23 que dependa de este comentario.
- Las "reglas duras" del proyecto prohíben al implementer tocar archivos de #21 fuera del scope de `tasks.md` (T3), y este reviewer tampoco edita código/tests (restricción del rol `reviewer`).
- Recomendación de seguimiento (no bloqueante, no parte de esta feature): en una futura sesión de mantenimiento, actualizar el comentario de ese `it()` para reflejar que, desde #23, `queryQueues` **sí** aplica `resolveDisposition` y la "limitación conocida" de la Decisión C de #21 quedó resuelta. Esto es housekeeping de documentación, no afecta la corrección de los 342 tests actuales.

## No-regresión v1.0 / #16-#22: ✅

- `disposition_agent_answered_fix.test.js`, `dashboard_lost_destinations.test.js`, `dashboard_unanswered_breakdown.test.js`: pasan sin modificación (incluidos en los 342/342).
- `queryStats`, `queryChannels`, `queryHourly`, `resolveDisposition`, `classifyUnansweredReason`, `fetchData()`: sin diff.
- `/api/calls/today`, `/api/calls/range`, SSE `init`/`update`: misma forma de respuesta (R19-R21); solo cambian valores numéricos de `queues[*]`.
- `/api/calls/inbound`, `/api/calls/outbound` (+ export), `/api/admin/channels*`, `/api/pbx/extensions`: sin cambios de payload (no usan `queryQueues`; `/api/pbx/extensions` solo cambia su consumo en `Dashboard.jsx`).
- `cd backend && npx jest` → **342/342 passing, 14 suites** (re-ejecutado por el reviewer).
- `cd frontend && npm run build` → **sin errores**, 2320 módulos, ~22.5s (re-ejecutado por el reviewer; warning de chunk size preexistente, no relacionado).

## Convenciones: ✅

- Sin `SELECT *` (`grep -n "SELECT \*" backend/server.js` sin resultados).
- Parámetros preparados (`?`, `[from, to]`) sin cambios en `queryQueues`.
- Sin `console.log` de debug (`grep -n "console.log" frontend/src/components/Dashboard.jsx` sin resultados).
- Sin TypeScript introducido.
- Sin nuevas dependencias npm (`backend/package.json`, `frontend/package.json` sin diff).
- Import `UserCheck` (sin uso tras T9) correctamente eliminado de `Dashboard.jsx`; `Users` se conserva (usado por `QueueCard` y `ExtensionsStatusCard`).
- `StatCard.jsx` sin cambios — `ExtensionsStatusCard` es un componente local nuevo, mismo patrón que `QueueCard` (Decisión B de `design.md`).

## Seguridad: ✅

- No se introducen endpoints nuevos ni cambios en middlewares de auth. Los cambios son internos a `queryQueues` (función de agregación en memoria, solo lectura sobre CDR) y a la presentación en `Dashboard.jsx`.
- Sin escrituras a la BD de Issabel (CDR).

## Tests: ✅ (342/342 passing, 14 suites)

## feature_list.json

- La feature #23 se añadió con `"status": "in_progress"` (no se marcó `done` por el implementer/reviewer, correcto — corresponde al leader tras el commit). No se modificaron entradas existentes.

## Archivos sin relación con esta feature en el working tree

- `CDRReport-2026Jun13.180725.csv`, `backend/db/monitor.sqlite-shm`/`-wal`: no relacionados con #23 (presentes ya antes, mismo aviso que en la review de #22) — el leader debe decidir si se incluyen/excluyen/gitignoran al hacer el commit de esta feature.

---

**Decisión: APROBADO.**

**SIGUIENTE PASO OBLIGATORIO:**
```
git add -A && git commit -m "feat(dashboard_cards_restructure): Reestructura de tarjetas del dashboard (No Contestadas, colas reclasificadas, extensiones combinadas)"
```
Solo después del commit: marcar `done` en `feature_list.json` e iniciar la siguiente feature.
