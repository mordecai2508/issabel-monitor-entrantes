# Review — alerts_monitoring (#15) — APROBADO

> Reviewer | Revisión: 2026-06-10

---

## 1. Trazabilidad R1-R37

| R<n> | Test / Evidencia | Archivo | Estado |
|---|---|---|---|
| R1 | `R1/R2/R3 - crea una regla lost_spike válida con enabled=true por defecto y la incluye en el listado` (+ pbx_disconnect/trunk_down/ext_unreachable) | `backend/tests/alerts.test.js:143,162,173,184` | ✅ |
| R2 | (mismos tests, verifican `GET /admin/alerts/rules`) | `backend/tests/alerts.test.js:143-197` | ✅ |
| R3 | (mismos tests, `enabled=true` por defecto, HTTP 201) | `backend/tests/alerts.test.js:143-197`, `backend/routes/alerts.js` (`POST /admin/alerts/rules`) | ✅ |
| R4 | `R4 - type inválido retorna 400 y no persiste cambios` | `backend/tests/alerts.test.js:199` | ✅ |
| R5 | `R5 - lost_spike sin threshold numérico retorna 400`, `R5 - trunk_down con threshold no numérico retorna 400`, `R5 - lost_spike con threshold negativo retorna 400` | `backend/tests/alerts.test.js:217,228,239` | ✅ |
| R6 | `R6 - notify_email con formato inválido retorna 400 y no persiste`, `R6 - notify_email válido se persiste correctamente` | `backend/tests/alerts.test.js:254,268` | ✅ |
| R7 | `R7 - PATCH actualiza solo threshold...`, `...solo enabled`, `...solo notify_email` | `backend/tests/alerts.test.js:283,299,315` | ✅ |
| R8 | `R8 - PATCH sobre id inexistente retorna 404...`, `R8 - DELETE sobre id inexistente retorna 404` | `backend/tests/alerts.test.js:335,346` | ✅ |
| R9 | `R9 - eliminar una regla retorna 200 y conserva alertas previamente generadas (rule_id intacto)` | `backend/tests/alerts.test.js:359` | ✅ |
| R10 | `R10 - sin sesión, GET/POST /admin/alerts/rules retorna 401` | `backend/tests/alerts.test.js:388,395` | ✅ |
| R11 | `R11 - rol no admin (monitor), GET/POST /admin/alerts/rules retorna 403` | `backend/tests/alerts.test.js:402,409` | ✅ |
| R12 | `R12/R13 - una regla pbx_disconnect con enabled=false no genera alertas aunque connected=false` | `backend/tests/alerts.test.js:420` | ✅ |
| R13 | (idem) — `evaluateOnce()` filtra `WHERE enabled = 1` | `backend/tests/alerts.test.js:420`; `backend/services/alertService.js:397-399` | ✅ |
| R14 | `R14/R15 - condición cumplida genera una alerta; un segundo ciclo con la misma condición no duplica` | `backend/tests/alerts.test.js:440` | ✅ |
| R15 | (idem) — `hasUnresolvedAlert(ruleId)` | `backend/tests/alerts.test.js:440`; `backend/services/alertService.js:254-259,271` | ✅ |
| R16 | `R16 - genera una alerta cuando el conteo >= threshold`, `R16 - no genera alerta cuando el conteo está por debajo del threshold` | `backend/tests/alerts.test.js:458,473` | ✅ |
| R17 | `R17 - se omite la evaluación sin generar alerta ni error si pbxHealthService reporta connected=false` | `backend/tests/alerts.test.js:485` | ✅ |
| R18 | `R18 - genera una alerta cuando pbxHealthService.getStatus().connected === false` | `backend/tests/alerts.test.js:507` | ✅ |
| R19 | `R19 - una alerta pbx_disconnect no resuelta se auto-resuelve cuando connected vuelve a true` | `backend/tests/alerts.test.js:522` | ✅ |
| R20 | CRUD `trunk_down` cubierto por `R1/R2/R3 - crea una regla trunk_down válida con threshold (minutos)` y rutas genéricas R7-R9 | `backend/tests/alerts.test.js:173,283-385` | ✅ |
| R21 | `R20/R21 - genera alerta...(last_activity antiguo)`, `...(last_activity NULL)`, `R21 - no genera alerta...(actividad reciente)` | `backend/tests/alerts.test.js:555,574,591` | ✅ |
| R22 | `R22 - si config.channels está vacío, la regla trunk_down no genera alertas` + nota `TYPE_NOTES.trunk_down` en frontend | `backend/tests/alerts.test.js:608`; `frontend/src/components/AlertRulesManager.jsx:20` | ✅ |
| R23 | `R23/R24 - una regla ext_unreachable se persiste pero evaluateOnce() no genera alertas para ella` | `backend/tests/alerts.test.js:628` | ✅ |
| R24 | (idem) — rama `ext_unreachable` no-op con comentario referenciando design.md §6.6 + `TYPE_NOTES.ext_unreachable` | `backend/tests/alerts.test.js:628`; `backend/services/alertService.js:412-417`; `frontend/src/components/AlertRulesManager.jsx:21` | ✅ |
| R25 | `R25 - una alerta nueva dispara broadcast("alert", { id, type, description, resolved, created_at })` | `backend/tests/alerts.test.js:648` | ✅ |
| R26 | `R26 - notify_email configurado dispara mailService.sendAlertEmail` | `backend/tests/alerts.test.js:670` | ✅ |
| R27 | `R27 - si mailService.sendAlertEmail rechaza, la alerta y el broadcast ocurren igual sin excepción no controlada` | `backend/tests/alerts.test.js:683` | ✅ |
| R28 | `R28 - notify_email vacío/null no dispara mailService.sendAlertEmail` | `backend/tests/alerts.test.js:701` | ✅ |
| R29 | `R29 - devuelve las alertas no resueltas ordenadas por más reciente primero` | `backend/tests/alerts.test.js:717` | ✅ |
| R30 | `R30 - sin sesión retorna 401` | `backend/tests/alerts.test.js:742` | ✅ |
| R31 | `R31 - marca la alerta como resuelta y persiste resolved_at` | `backend/tests/alerts.test.js:753` | ✅ |
| R32 | `R32 - id inexistente retorna 404 y no hace cambios` | `backend/tests/alerts.test.js:768` | ✅ |
| R33 | `R33 - alerta ya resuelta retorna 409 y no hace cambios` | `backend/tests/alerts.test.js:777` | ✅ |
| R34 | `frontend/src/components/AlertsPanel.jsx` — panel "Alertas Activas", carga vía `api.activeAlerts()`, lista `type`/`description`/`created_at`/botón "Resolver". Sin test automatizado de frontend (proyecto sin Vitest configurado, consistente con el resto del repo). | `frontend/src/components/AlertsPanel.jsx:38-133` | ✅ (evidencia visual) |
| R35 | `handleResolve(id)` → `api.resolveAlert(id)` → `setAlerts(prev => prev.filter(a => a.id !== id))` sin recarga | `frontend/src/components/AlertsPanel.jsx:61-72` | ✅ |
| R36 | `useSSE('/api/events', { onAlert })` antepone alertas no resueltas evitando duplicados por `id` | `frontend/src/components/AlertsPanel.jsx:54-59`; `frontend/src/hooks/useSSE.js:33-36` | ✅ |
| R37 | `frontend/src/components/AlertRulesManager.jsx`, ruta `/admin/alerts` (`AdminRoute`), `NavItem` "Reglas de alerta" en `Layout.jsx`. CRUD completo (crear/editar threshold/enabled/notify_email/eliminar) | `frontend/src/components/AlertRulesManager.jsx`; `frontend/src/App.jsx:58`; `frontend/src/components/Layout.jsx:152` | ✅ |

Todos los tests citados son reales (ejecutan flujos completos con assertions sobre estado/HTTP/payloads), no stubs vacíos. R34-R37 (frontend) carecen de test automatizado, pero esto es coherente con el estado actual del proyecto (Vitest no configurado en `frontend/`, documentado en `CLAUDE.md`/`AGENTS.md`); el código fue inspeccionado directamente y cumple el comportamiento descrito.

---

## 2. No-regresión v1.0: ✅

- `cd backend && npm test` → **9 test suites, 250 tests, todos pasando** (incluye los 41 nuevos de `alerts.test.js` + 209 preexistentes).
- `cd frontend && npm run build` → **sin errores** (`✓ 2320 modules transformed`, `built in ~12s`; warning preexistente de chunk > 500 kB no relacionado con esta feature).
- `./init.sh` (raíz) → **25/25 checks en verde**, incluyendo `npm test backend` y `npm run build frontend`.
- El registro en `server.js` para la nueva feature consiste en un bloque mínimo (instanciación de `mailService`/`alertService`, `alertService.start()`, y una línea `app.use('/api', require('./routes/alerts')(...))`) inmediatamente después del bloque existente de `pbxHealthService`, sin tocar el `setInterval` de `/api/events` ni el de `pbxHealthService`.
- Endpoints v1.0 (`/api/calls/today`, `/api/calls/range`, `/api/events`, `/api/auth/*`, `/api/admin/users*`, `/api/admin/config*`, `/api/pbx/*`, etc.) no fueron modificados — verificado en `git diff backend/server.js`, único hunk añadido.

---

## 3. Convenciones: ✅

- Respuestas API consistentes `{ ok: true, data }` / `{ ok: false, error }` en `backend/routes/alerts.js`, con `try/catch` y `console.error('[alerts] ...')` (sin `console.log`).
- SQL: todas las queries nuevas usan `?` (parámetros preparados) — `evaluateLostSpike` (placeholders dinámicos para `lostDestinations`, todos vía `?`) y `evaluateTrunkDown` (`LIKE ?`). Sin `SELECT *` en ningún archivo nuevo.
- Patrón factory respetado: `routes/alerts.js` = `(pool, config, db, requireAuth, requireAdmin, alertService)`; `services/alertService.js` = `(pool, config, db, broadcast, pbxHealthService, mailService, options?)`.
- Frontend: todas las llamadas pasan por `src/api.js` (`activeAlerts`, `resolveAlert`, `adminAlertRules`, `createAlertRule`, `updateAlertRule`, `deleteAlertRule`); ningún `fetch()` directo en `AlertsPanel.jsx`/`AlertRulesManager.jsx`.
- UI: Tailwind + `lucide-react` (iconos `Bell`, `BellRing`, `RadioTower`, `PhoneMissed`, `WifiOff`, `PhoneOff`, etc.), sin nuevas librerías de gráficos/UI; mensajes de error vía banner inline (sin `alert()`).
- `useSSE.js` extendido de forma aditiva: nuevo callback opcional `onAlert` añadido a la firma sin alterar `onInit`/`onUpdate`/`onPbxStatus`.
- Sin `console.log` de debug en `alertService.js`, `mailService.js`, `routes/alerts.js` (solo `console.error` en bloques catch).
- Sin TypeScript introducido. Sin escrituras a la BD de Issabel (todas las queries CDR son `SELECT`).
- Nueva dependencia `nodemailer` (`^8.0.11`) justificada explícitamente en `design.md` §4 y `feature_list.json`.

---

## 4. Seguridad: ✅

- `/api/admin/alerts/rules` (GET/POST) y `/api/admin/alerts/rules/:id` (PATCH/DELETE) → `requireAdmin` (401 sin sesión, 403 si rol ≠ admin — verificado por R10/R11).
- `/api/alerts/active` (GET) y `/api/alerts/:id/resolve` (PATCH) → `requireAuth` (401 sin sesión — R30), accesible a cualquier rol autenticado, consistente con design.md y con el patrón de `pbx_health`.
- `requireAuth`/`requireAdmin` definidos en `server.js` (líneas 296/300) **antes** de su uso en el montaje del router de alertas (línea 337) — sin problemas de orden de inicialización.
- `mailService.js`: el `catch` de `sendAlertEmail` solo loguea `err.message`, nunca el objeto `smtpConfig`/credenciales. `config.example.json` añade el bloque `smtp` con placeholders vacíos, sin secretos reales.
- Validaciones de entrada R4-R6 correctas: `type` restringido a los 4 valores válidos (con manejo separado para creación vs actualización), `threshold` requerido y numérico ≥ 0 para `lost_spike`/`trunk_down`, `notify_email` validado con regex simple y normalizado a `NULL` si vacío.
- Sin escrituras en `cdr` (Issabel); todas las queries nuevas son `SELECT` con `?`.

---

## 5. Diseño (design.md): ✅

- **Timer propio**: `alertService.start(intervalMs)` usa su propio `setInterval` (default `config.server.pollIntervalMs || 30_000`), independiente del poll de `/api/events` y del timer de 15 s de `pbxHealthService`. Ninguno de los `setInterval` existentes fue tocado.
- **`pbx_disconnect`**: `evaluatePbxDisconnect()` llama únicamente a `pbxHealthService.getStatus()` (lectura síncrona en memoria, sin `check()`/`ensureChecked()`); `pbxHealthService.js` no fue modificado (confirmado — no aparece en `git diff` ni en archivos nuevos).
- **`lost_spike` y desconexión**: `evaluateLostSpike()` retorna anticipadamente (sin query, sin alerta, sin error) si `pbxHealthService.getStatus().connected === false` (R17), confirmado por test `R17`.
- **`trunk_down`/`ext_unreachable`**: alcance limitado respetado — `trunk_down` evalúa `config.channels` vía `LIKE` sobre `MAX(calldate)` (R20-R22, sin alertas si `config.channels` está vacío); `ext_unreachable` se persiste vía CRUD pero `evaluateOnce()` la omite explícitamente con comentario referenciando design.md §6.6 (R23-R24).
- **`mailService` no-op**: `createMailService(smtpConfig)` crea transporter no-op si `smtpConfig?.host` no está definido; `sendAlertEmail` retorna inmediatamente (`if (!isConfigured) return;`) sin error.
- **Fallos de email no bloquean**: `createAlert()` envuelve `mailService.sendAlertEmail(...)` en `try/catch`, logueando el error sin relanzar — la persistencia (`INSERT`) y el `broadcast('alert', ...)` ya ocurrieron antes de intentar el envío (R26/R27, confirmado por test `R27`).
- **`toMySQLDate`**: copia local idéntica en `alertService.js` (5 líneas), sin modificar `server.js` (que no exporta la función original) — coherente con design.md §6.5.

---

## 6. Diffs mínimos: ✅

Revisado vía `git diff` sobre todos los archivos existentes modificados:

- `backend/server.js`: un único bloque añadido (8 líneas) inmediatamente después de `pbxHealthService.start(15_000)` / `app.use('/api', require('./routes/pbx')(...))`. No se tocó ninguna otra lógica.
- `backend/db/setup.js`: añade `db.pragma('foreign_keys = OFF')` (con comentario explicativo, necesario por el comportamiento de `better-sqlite3` distinto al de SQLite estándar — corrección documentada y justificada para R9), más dos `CREATE TABLE IF NOT EXISTS` y dos `CREATE INDEX IF NOT EXISTS`. `users`, `audit_log`, `system_config`, `extensions_config`, `trunks_config` y la migración de usuarios quedan intactos.
- `backend/config.example.json`: solo añade el bloque `smtp` (placeholders) tras `lostDestinations`; ninguna otra clave alterada.
- `backend/package.json`/`package-lock.json`: solo añade `nodemailer` como dependencia.
- `frontend/src/hooks/useSSE.js`: solo añade `onAlert` a la firma y un `addEventListener('alert', ...)`; listeners existentes intactos.
- `frontend/src/api.js`: solo añade 6 funciones nuevas vía el wrapper `req(...)` existente.
- `frontend/src/App.jsx`: solo añade 2 imports y 2 `<Route>` nuevas (`alerts`, `admin/alerts`), sin tocar rutas existentes.
- `frontend/src/components/Layout.jsx`: añade imports `Bell`/`BellRing`, extiende la instancia existente de `useSSE` con `onAlert` (toast no bloqueante), y añade 2 `NavItem` nuevos. `<PbxStatus/>`, `<Toast/>`, lógica de `appName`/logout/`pbxStatus` intactas.

Todos los cambios son aditivos, mínimos y no modifican lógica de features `done` salvo lo descrito y justificado en `design.md`.

---

## Tests: ✅ (250/250 passing, 9 suites)

```
Test Suites: 9 passed, 9 total
Tests:       250 passed, 250 total
```

`cd frontend && npm run build` → sin errores. `./init.sh` → 25/25 checks verdes.

---

**Decisión: APROBADO.**

**SIGUIENTE PASO OBLIGATORIO:** `git add -A && git commit -m "feat(alerts_monitoring): Sistema de alertas y monitoreo (reglas, evaluación periódica, notificaciones SSE/email, panel y gestión admin)"`

Solo después del commit: marcar `done` en `feature_list.json` e iniciar la siguiente feature.
