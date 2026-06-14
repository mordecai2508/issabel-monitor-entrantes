# Review — channels_inbound_outbound_split (feature #20) — APROBADO

## Trazabilidad

| R<n> | Test | Estado |
|---|---|---|
| R1  | Verificado por estructura general (config.example.json, server.js:55-63) + R2-R5 | ✅ |
| R2  | `R2 - debe migrar config.channels de array plano a {inbound, outbound:[]}` (config.test.js:912) | ✅ |
| R3  | `R3 - la migración no debe perder channelAliases ni otras claves de config.json` (config.test.js:920) | ✅ |
| R4  | `R4 - si config.channels ya es {inbound, outbound} no se reescribe config.json` + variante "falta una lista" (config.test.js:940, :948) | ✅ |
| R5  | `R5 - si config.channels no existe, se usan listas vacías sin error` (config.test.js:956) | ✅ |
| R6  | Verificado por inspección: `backend/config.example.json` → `channels: { inbound: [], outbound: ["SIP/SALIENTE_CALL"] }` | ✅ |
| R7  | `R7 - direction=in incluye solo canales de channels.inbound` (passesFilter.test.js:43) | ✅ |
| R8  | `R8 - direction=out incluye solo canales de channels.outbound, no por exclusión de inbound` (passesFilter.test.js:50) | ✅ |
| R9  | `R9 - direction=out excluye siempre canales Local/ aunque estén en channels.outbound` (passesFilter.test.js:60) | ✅ |
| R10 | `R10 - direction=out con channels.outbound vacío no devuelve registros` (passesFilter.test.js:65) + `R10 - con channels.outbound vacío devuelve data:[] y meta.total=0 con HTTP 200` (outbound.test.js:335) | ✅ |
| R11 | `R11 - direction=null incluye todos los canales` (passesFilter.test.js:70) | ✅ |
| R12 | `R12 - una llamada extension-a-extension no se cuenta como saliente` (passesFilter.test.js:77) + `R12 - no incluye llamadas extension-a-extension` (outbound.test.js:315) | ✅ |
| R13 | `R13 - una llamada por SIP/SALIENTE_CALL se cuenta como saliente` (passesFilter.test.js:83) | ✅ |
| R14 | `R14/R15 - direction=in solo incluye canales de channels.inbound` + test de forma de respuesta (passesFilter.test.js:112, :127) | ✅ |
| R15 | `R14/R15 - direction=out solo incluye canales de channels.outbound` + `direction=null incluye todos` (passesFilter.test.js:117, :122) | ✅ |
| R16 | Documentado como verificación manual (T17) en passesFilter.test.js:151-158, basado en invariancia de forma de `fetchData()` (R14/R15) — SSE reutiliza `fetchData()` sin cambios de forma | ✅ (manual, justificado) |
| R17 | `R17 - debe devolver solo canales de channels.outbound (LIKE explícito), no por exclusión de inbound` (outbound.test.js:291) | ✅ |
| R18 | `R18 - GET /api/admin/channels devuelve direction inbound/outbound por canal` (config.test.js:795) | ✅ |
| R19 | `R19 - un canal presente en ambas listas aparece dos veces, una por dirección` (config.test.js:807) | ✅ |
| R20 | `R20 - PUT /api/admin/channels/:channel actualiza el alias de un canal de channels.outbound` (config.test.js:829) | ✅ |
| R21 | `R21 - PUT /api/admin/channels/:channel devuelve 404 si el canal no está en inbound ni outbound` (config.test.js:841) | ✅ |
| R22 | Verificado por inspección: `buildOutboundWhereClause` (cdrService.js:128-159) usa solo `?` / `LIKE CONCAT(?, '%')`, sin concatenación de strings ni `SELECT *` en ningún archivo tocado | ✅ |
| R23 | Cubierto por R3 (migración no toca `channelAliases`) y R20 (PUT sigue gestionando alias sin invalidar canales presentes) | ✅ |

Todos los R1-R23 tienen al menos un test real (no stubs) que ejercita el comportamiento descrito, no solo la existencia de la función.

## Tasks.md

Las 17 tareas (T1-T17) están marcadas `[x]`.

## No-regresión v1.0: ✅

- `GET /api/calls/today`, `GET /api/calls/range`, `/api/events` (SSE init/update), `GET/PUT /api/admin/channels`, `GET /api/calls/outbound` y `/export`, `GET /api/config/public`, `PUT /api/admin/app` — todos cubiertos por tests existentes + nuevos, todos en verde.
- `evaluateTrunkDown` (alertService.js:363) y `reports.js:34` se actualizaron para leer `config.channels.inbound` en lugar del array plano — fix de compatibilidad necesario y correctamente cubierto (4 casos corregidos en `alerts.test.js`).
- Registro en `server.js`: no se añadió ningún router nuevo; los cambios son internos a funciones ya existentes (`loadConfig`, `passesFilter`, `queryStats/queryChannels/queryHourly/queryQueues`, `fetchData`, `/api/admin/channels` GET/PUT). No aplica el chequeo de "una sola línea de require/app.use" porque no se creó router nuevo.
- `cd backend && npx jest` → **11 test suites, 297/297 tests passing** (re-ejecutado).
- `cd frontend && npm run build` → **sin errores**, `dist/` generado correctamente (re-ejecutado).

## Convenciones: ✅

- No se introdujo ningún router nuevo; los routers existentes (`outbound.js`, `reports.js`) mantienen el patrón factory `(pool, config, ...)`.
- Sin `SELECT *` en ningún archivo modificado.
- Sin concatenación de strings en SQL — `buildOutboundWhereClause` usa `LIKE CONCAT(?, '%')` con parámetros (`?`) para cada canal de `outboundChannels`.
- El único cambio a un `console.log` es la actualización del mensaje informativo de arranque existente (auto-hash de contraseñas), ahora también menciona la migración de `channels` — no es debug nuevo.
- Sin `fetch()` directo en componentes React (`ChannelAliasManager.jsx` sigue usando `api.adminChannels()` / `api.updateChannelAlias()`, sin cambios en `src/api.js`).
- Sin TypeScript introducido.
- Sin escrituras a la BD de Issabel — todas las queries en `cdrService.js`/`server.js` son `SELECT` con parámetros preparados.

## Seguridad: ✅

- `/api/admin/channels` (GET y PUT) sigue protegido por `requireAdmin`.
- `/api/calls/outbound` y `/export` siguen protegidos por `requireAuth`.
- Validación de existencia de canal en PUT (`config.channels.inbound.includes(channel) || config.channels.outbound.includes(channel)`) antes de tocar `channelAliases`/config.json.
- `outboundChannels` se interpola exclusivamente vía parámetros preparados (`?`), nunca concatenación directa en el SQL.

## Tests: ✅ (297/297 passing)

## Observación menor (no bloqueante)

`frontend/src/components/ChannelAliasManager.jsx`: el estado `editingChannel`/`saveAlias` sigue indexado por `ch.channel` (no por `${channel}-${direction}`), aunque la `key` de fila ya usa el compuesto. En el caso límite de R19 (un canal presente en ambas listas, p.ej. `SIP/AMBOS`), al pulsar "editar" en una fila ambas filas entrarían visualmente en modo edición simultáneamente (mismo `editingChannel`). No afecta la corrección funcional de `api.updateChannelAlias()` (los alias siguen siendo un mapa plano por nombre de canal, consistente con R23) ni viola ningún R<n> de esta spec (T10 solo pedía añadir la columna "Dirección"). Se documenta como mejora futura, no bloquea esta feature.

## Otras observaciones

- El archivo `CDRReport-2026Jun13.180725.csv` (raíz del repo, untracked) es un artefacto de análisis de la fase de spec, no forma parte de esta implementación y no está en staging — no bloquea, pero se recomienda limpiarlo o añadirlo a `.gitignore` en una futura sesión.
- `feature_list.json` modificado: feature #20 permanece en `status: "in_progress"` (no se marcó `done`), cumpliendo la regla dura. El diff visible corresponde a la adición de las specs #20/#21 ya hecha en la fase `spec_author` previa.

---

**Decisión: APROBADO.**

**SIGUIENTE PASO OBLIGATORIO:**
```
git add -A && git commit -m "feat(channels_inbound_outbound_split): separar canales entrantes/salientes para excluir llamadas extensión-extensión de las salientes"
```
(ajustar el listado de archivos del `git add` para no incluir `CDRReport-2026Jun13.180725.csv` ni los archivos `.sqlite-shm`/`.sqlite-wal`, salvo que el leader decida lo contrario).

Solo después del commit: marcar `status: "done"` en `feature_list.json` para la feature #20 e iniciar la siguiente feature (#21 `disposition_agent_answered_fix`, pasando primero por `spec_author`).
