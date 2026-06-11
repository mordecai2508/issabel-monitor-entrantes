# impl_alerts_monitoring.md — Informe de implementación (feature #15, alerts_monitoring)

> Implementer | Revisión: 2026-06-10

---

## Archivos creados

| Archivo | Descripción |
|---|---|
| `backend/services/mailService.js` | Factory `createMailService(smtpConfig)`. Si `smtpConfig?.host` está definido crea un transporter real de `nodemailer`; si no, un transporter "no-op" (`sendMail` resuelve sin enviar nada). Expone `async sendAlertEmail({ to, subject, text })`, no-op si no está configurado, con `try/catch` que loguea `console.error('[mail] sendAlertEmail:', err.message)` (sin loguear credenciales) y re-lanza. |
| `backend/services/alertService.js` | Servicio factory `(pool, config, db, broadcast, pbxHealthService, mailService, options?)`. CRUD de `alert_rules` (`listRules`, `createRule`, `updateRule`, `deleteRule`) con validaciones R4-R6; `getActiveAlerts()`/`resolveAlert(id)` sobre `alerts`; `evaluateOnce()` que evalúa reglas `enabled=1` por tipo (`pbx_disconnect`, `lost_spike`, `trunk_down`; `ext_unreachable` omitido a propósito); `createAlert()` centraliza `INSERT` + `broadcast('alert', ...)` + envío de correo; `start(intervalMs)` con timer propio (`setInterval`, default `config.server.pollIntervalMs \|\| 30000`), devuelve `stop()`. Incluye copia local de `toMySQLDate`. |
| `backend/routes/alerts.js` | Router factory `(pool, config, db, requireAuth, requireAdmin, alertService)`. 6 endpoints: `GET/POST /admin/alerts/rules`, `PATCH/DELETE /admin/alerts/rules/:id` (todos `requireAdmin`), `GET /alerts/active`, `PATCH /alerts/:id/resolve` (ambos `requireAuth`). Respuestas `{ ok: true, data }` / `{ ok: false, error }`, `try/catch` con `console.error('[alerts] ...')`. |
| `backend/tests/alerts.test.js` | 41 tests Jest + Supertest, SQLite `:memory:` (mismo esquema que `db/setup.js`, incluyendo `db.pragma('foreign_keys = OFF')`), mocks de `pool.query`, `pbxHealthService.getStatus`, `mailService.sendAlertEmail` y `broadcast`. Un `it()` por requisito (R1-R33), nombrado con el `R<n>` correspondiente. |
| `frontend/src/components/AlertsPanel.jsx` | Panel "Alertas Activas" (R34-R36): carga inicial vía `api.activeAlerts()`, botón "Resolver" vía `api.resolveAlert(id)` que quita la alerta de la lista local en éxito, y suscripción a evento SSE `alert` vía `useSSE` que antepone alertas nuevas evitando duplicados por `id`. |
| `frontend/src/components/AlertRulesManager.jsx` | Pantalla admin-only (R37): listado/CRUD de reglas vía `api.adminAlertRules()` / `createAlertRule` / `updateAlertRule` / `deleteAlertRule`, formulario con validación de `threshold`/`notify_email` espejo de backend, toggle habilitar/deshabilitar, y notas de limitación (`TYPE_NOTES`) para `trunk_down` (R22) y `ext_unreachable` (R24). |

## Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/package.json` | Añadida dependencia `nodemailer` (`^8.0.11`) (T1). |
| `backend/db/setup.js` | Añadidas tablas `alert_rules` (con `CHECK` sobre `type` y `enabled`) y `alerts` (con `rule_id INTEGER REFERENCES alert_rules(id)`, `CHECK` sobre `resolved`), e índices `idx_alerts_resolved` e `idx_alerts_rule_unresolved`. Además, añadido `db.pragma('foreign_keys = OFF')` justo después de `db.pragma('journal_mode = WAL')`, con comentario explicando que `better-sqlite3` activa FK por defecto (a diferencia de SQLite estándar) y que `alerts.rule_id` debe sobrevivir al `DELETE` de su `alert_rules` (R9). No se tocaron `users`, `audit_log`, `system_config`, `extensions_config`, `trunks_config` ni la migración existente. |
| `backend/config.example.json` | Añadido bloque opcional `smtp` (`host`, `port`, `secure`, `user`, `password`, `from`) con placeholders, después de `lostDestinations`. Sin cambios a otras claves. El `config.json` real (gitignored) no incluye `smtp`; degrada de forma transparente al transporter no-op. |
| `backend/server.js` | Añadido, inmediatamente después del bloque existente de `pbxHealthService`: instanciación de `mailService` (`createMailService(config.smtp)`), instanciación y arranque de `alertService` (`createAlertService(pool, config, db, broadcast, pbxHealthService, mailService)`, `alertService.start()`), y montaje de `app.use('/api', require('./routes/alerts')(...))`. No se modificó el `setInterval` existente de `/api/events` ni el de `pbxHealthService`. |
| `frontend/src/hooks/useSSE.js` | Añadido el callback opcional `onAlert` a la firma `useSSE(url, { onInit, onUpdate, onPbxStatus, onAlert })` y el listener `es.addEventListener('alert', ...)`. Resto de listeners sin cambios. |
| `frontend/src/api.js` | Añadidas `activeAlerts`, `resolveAlert`, `adminAlertRules`, `createAlertRule`, `updateAlertRule`, `deleteAlertRule`, todas vía el wrapper `req(...)` existente. |
| `frontend/src/App.jsx` | Añadidos imports de `AlertsPanel`/`AlertRulesManager` y rutas `alerts` (`PrivateRoute`) y `admin/alerts` (`AdminRoute`) dentro del `Layout`. |
| `frontend/src/components/Layout.jsx` | Añadidos iconos `Bell`, `BellRing` a los imports de `lucide-react`; extendido el `useSSE('/api/events', {...})` existente con `onAlert` (muestra `Toast` tipo `error` para alertas nuevas no resueltas, R25); añadido `<NavItem to="/alerts" icon={Bell} label="Alertas" />` en "Monitoreo" y `<NavItem to="/admin/alerts" icon={BellRing} label="Reglas de alerta" />` en la sección Admin. |

---

## Tabla de trazabilidad R<n> → test/implementación → archivo:línea

| Requisito | Test / Implementación | Archivo:línea (aprox.) |
|---|---|---|
| R1 | `R1/R2/R3 - crea una regla lost_spike válida con enabled=true por defecto y la incluye en el listado`, `R1/R2/R3 - crea una regla pbx_disconnect válida sin threshold (opcional)`, `R1/R2/R3 - crea una regla trunk_down válida con threshold (minutos)`, `R1/R2/R3 - crea una regla ext_unreachable válida (persistida para CRUD aunque no se evalúe)` | `backend/tests/alerts.test.js:143`, `:162`, `:173`, `:184` |
| R2 | (idem, mismos tests verifican el listado vía `GET /admin/alerts/rules` tras la creación) | `backend/tests/alerts.test.js:143-197` — implementación: `alertService.listRules()`, `backend/services/alertService.js` |
| R3 | (idem) — implementación: `alertService.createRule()` (`enabled` por defecto `1`, `201` en `routes/alerts.js`) | `backend/tests/alerts.test.js:143-197`; `backend/routes/alerts.js` (handler `POST /admin/alerts/rules`) |
| R4 | `R4 - type inválido retorna 400 y no persiste cambios` | `backend/tests/alerts.test.js:199` |
| R5 | `R5 - lost_spike sin threshold numérico retorna 400`, `R5 - trunk_down con threshold no numérico retorna 400`, `R5 - lost_spike con threshold negativo retorna 400` | `backend/tests/alerts.test.js:217`, `:228`, `:239` |
| R6 | `R6 - notify_email con formato inválido retorna 400 y no persiste`, `R6 - notify_email válido se persiste correctamente` | `backend/tests/alerts.test.js:254`, `:268` |
| R7 | `R7 - PATCH actualiza solo threshold dejando enabled/notify_email intactos`, `R7 - PATCH actualiza solo enabled`, `R7 - PATCH actualiza solo notify_email` | `backend/tests/alerts.test.js:283`, `:299`, `:315` |
| R8 | `R8 - PATCH sobre id inexistente retorna 404 y no hace cambios`, `R8 - DELETE sobre id inexistente retorna 404` | `backend/tests/alerts.test.js:335`, `:346` |
| R9 | `R9 - eliminar una regla retorna 200 y conserva alertas previamente generadas (rule_id intacto)` | `backend/tests/alerts.test.js:359` — implementación: `alertService.deleteRule()` (`backend/services/alertService.js`) y `db.pragma('foreign_keys = OFF')` (`backend/db/setup.js`) |
| R10 | `R10 - sin sesión, GET /admin/alerts/rules retorna 401`, `R10 - sin sesión, POST /admin/alerts/rules retorna 401` | `backend/tests/alerts.test.js:388`, `:395` |
| R11 | `R11 - rol no admin (monitor), GET /admin/alerts/rules retorna 403`, `R11 - rol no admin (monitor), POST /admin/alerts/rules retorna 403` | `backend/tests/alerts.test.js:402`, `:409` |
| R12 | `R12/R13 - una regla pbx_disconnect con enabled=false no genera alertas aunque connected=false` | `backend/tests/alerts.test.js:420` — implementación: `evaluateOnce()` filtra `WHERE enabled = 1` (`backend/services/alertService.js`) |
| R13 | (idem) | `backend/tests/alerts.test.js:420` |
| R14 | `R14/R15 - condición cumplida genera una alerta; un segundo ciclo con la misma condición no duplica` | `backend/tests/alerts.test.js:440` |
| R15 | (idem) — implementación: `hasUnresolvedAlert(ruleId)` (`backend/services/alertService.js`) | `backend/tests/alerts.test.js:440` |
| R16 | `R16 - genera una alerta cuando el conteo de llamadas perdidas >= threshold`, `R16 - no genera alerta cuando el conteo está por debajo del threshold` | `backend/tests/alerts.test.js:458`, `:473` |
| R17 | `R17 - se omite la evaluación sin generar alerta ni error si pbxHealthService reporta connected=false` | `backend/tests/alerts.test.js:485` |
| R18 | `R18 - genera una alerta cuando pbxHealthService.getStatus().connected === false` | `backend/tests/alerts.test.js:507` |
| R19 | `R19 - una alerta pbx_disconnect no resuelta se auto-resuelve cuando connected vuelve a true` | `backend/tests/alerts.test.js:522` |
| R20 | CRUD de `trunk_down` cubierto por `R1/R2/R3 - crea una regla trunk_down válida con threshold (minutos)` (creación/lectura) y `R7`/`R8`/`R9` (update/delete genéricos, mismas rutas, sin distinción de `type`) | `backend/tests/alerts.test.js:173`, `:283-385` |
| R21 | `R20/R21 - genera alerta cuando no hay actividad CDR reciente para el canal configurado (last_activity antiguo)`, `R20/R21 - genera alerta cuando last_activity es NULL (sin actividad registrada)`, `R21 - no genera alerta cuando hay actividad CDR reciente (dentro del threshold)` | `backend/tests/alerts.test.js:555`, `:574`, `:591` |
| R22 | `R22 - si config.channels está vacío, la regla trunk_down no genera alertas` (evaluación) + nota de limitación en frontend: `TYPE_NOTES.trunk_down` | `backend/tests/alerts.test.js:608`; `frontend/src/components/AlertRulesManager.jsx:20` |
| R23 | `R23/R24 - una regla ext_unreachable se persiste pero evaluateOnce() no genera alertas para ella` (persistencia, vía `R1/R2/R3 - crea una regla ext_unreachable válida...`) | `backend/tests/alerts.test.js:184`, `:628` |
| R24 | `R23/R24 - una regla ext_unreachable se persiste pero evaluateOnce() no genera alertas para ella` + nota `TYPE_NOTES.ext_unreachable` en frontend | `backend/tests/alerts.test.js:628`; `backend/services/alertService.js` (rama `ext_unreachable` no-op con comentario referenciando design.md §6.6); `frontend/src/components/AlertRulesManager.jsx:21` |
| R25 | `R25 - una alerta nueva dispara broadcast("alert", { id, type, description, resolved, created_at })` | `backend/tests/alerts.test.js:648` |
| R26 | `R26 - notify_email configurado dispara mailService.sendAlertEmail` | `backend/tests/alerts.test.js:670` |
| R27 | `R27 - si mailService.sendAlertEmail rechaza, la alerta y el broadcast ocurren igual sin excepción no controlada` | `backend/tests/alerts.test.js:683` |
| R28 | `R28 - notify_email vacío/null no dispara mailService.sendAlertEmail` | `backend/tests/alerts.test.js:701` |
| R29 | `R29 - devuelve las alertas no resueltas ordenadas por más reciente primero` | `backend/tests/alerts.test.js:717` |
| R30 | `R30 - sin sesión retorna 401` | `backend/tests/alerts.test.js:742` |
| R31 | `R31 - marca la alerta como resuelta y persiste resolved_at` | `backend/tests/alerts.test.js:753` |
| R32 | `R32 - id inexistente retorna 404 y no hace cambios` | `backend/tests/alerts.test.js:768` |
| R33 | `R33 - alerta ya resuelta retorna 409 y no hace cambios` | `backend/tests/alerts.test.js:777` |
| R34 | Componente `frontend/src/components/AlertsPanel.jsx`: lista cada alerta activa con `type` (icono + `TYPE_LABELS`), `description`, `created_at` (`formatDate`) y botón "Resolver". Carga inicial vía `api.activeAlerts()`. Sin test automatizado de frontend (proyecto sin Vitest configurado). | `frontend/src/components/AlertsPanel.jsx:38-72`, `:101-129` |
| R35 | `AlertsPanel.jsx` — `handleResolve(id)` llama `api.resolveAlert(id)` y, en éxito, hace `setAlerts(prev => prev.filter(a => a.id !== id))` sin recargar la página. | `frontend/src/components/AlertsPanel.jsx:61-72` |
| R36 | `AlertsPanel.jsx` — `useSSE('/api/events', { onAlert: ... })` antepone alertas nuevas no resueltas a la lista local evitando duplicados por `id`. | `frontend/src/components/AlertsPanel.jsx:54-59`; `frontend/src/hooks/useSSE.js` (listener `alert`) |
| R37 | Componente `frontend/src/components/AlertRulesManager.jsx`, montado en ruta `/admin/alerts` (`AdminRoute`) con entrada de navegación "Reglas de alerta" en `Layout.jsx`. CRUD completo (crear/editar `threshold`/`enabled`/`notify_email`/eliminar) vía `api.adminAlertRules()`/`createAlertRule`/`updateAlertRule`/`deleteAlertRule`. Sin test automatizado de frontend. | `frontend/src/components/AlertRulesManager.jsx`; `frontend/src/App.jsx:58`; `frontend/src/components/Layout.jsx:152` |

---

## Resultado de verificación

### `cd backend && npm test`
```
Test Suites: 9 passed, 9 total
Tests:       250 passed, 250 total
```
(209 tests existentes en 8 suites + 41 nuevos en `alerts.test.js` = 250 en 9 suites, todos en verde — no-regresión confirmada)

### `cd frontend && npm run build`
```
✓ modules transformed.
✓ built in ~11s
```
Sin errores. Output incluye `dist/assets/index-g9Zx9bqW.js` (703.73 kB). Warning preexistente de chunk size > 500 kB, no relacionado con esta feature.

### `./init.sh` (raíz del repo)
```
✅ Todo verde: 25/25 checks pasaron
El entorno está listo.
```

---

## Notas de implementación

- **`better-sqlite3` y `foreign_keys`**: a diferencia de SQLite estándar (FK desactivadas por defecto), `better-sqlite3` activa `PRAGMA foreign_keys = ON` por defecto. La columna `alerts.rule_id INTEGER REFERENCES alert_rules(id)` (sin `ON DELETE`) bloqueaba el `DELETE` de `alert_rules` cuando existían alertas históricas asociadas (R9), contradiciendo la suposición original de `design.md`. Se corrigió añadiendo `db.pragma('foreign_keys = OFF')` en `backend/db/setup.js` (con comentario explicativo) y replicando el mismo pragma en el helper `createTestDb()` de `alerts.test.js`.
- **Timezone en tests de `trunk_down`**: se añadió una copia local de `toMySQLDate(d)` (idéntica a la de `alertService.js`/`server.js`) en `alerts.test.js` para construir fechas "antiguas"/"recientes" en formato local consistente con `cdr.calldate`, evitando un desfase de zona horaria que producía falsos negativos en R20/R21.
- **Independencia de timers**: `alertService.start()` usa su propio `setInterval` (default `config.server.pollIntervalMs || 30000`), separado del poll de `/api/events` y del timer de `pbxHealthService` (15 s) — ninguno de los dos `setInterval` existentes fue modificado.
- **`config.smtp` ausente en `config.json` real**: verificado que `createMailService(undefined)` degrada de forma transparente al transporter no-op, sin errores en arranque ni en `evaluateOnce()`.
- Sin `console.log` de depuración en ningún archivo nuevo (`alertService.js`, `mailService.js`, `routes/alerts.js`); solo `console.error` en bloques `catch`, sin loguear credenciales SMTP.
- Todas las tareas T1-T14 de `specs/alerts_monitoring/tasks.md` quedaron marcadas `[x]`.
