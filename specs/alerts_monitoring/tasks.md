# tasks.md — alerts_monitoring

> Feature ID: 15 | Revisión: 2026-06-10
> Seguir en orden. Cada test del backend nombra el `R<n>` que cubre
> (`docs/specs.md` — trazabilidad obligatoria).

---

- [x] T1. `cd backend && npm install nodemailer` (dependencia única, §design.md
      4).

- [x] T2. Actualizar `backend/db/setup.js`:
  - Añadir `CREATE TABLE IF NOT EXISTS alert_rules (...)` (design.md §2.1).
  - Añadir `CREATE TABLE IF NOT EXISTS alerts (...)` (design.md §2.2).
  - Añadir `CREATE INDEX IF NOT EXISTS idx_alerts_resolved (...)` y
    `idx_alerts_rule_unresolved (...)` (design.md §2.3).
  - No modificar `users`, `audit_log`, `system_config`, `extensions_config`,
    `trunks_config` ni la lógica de migración existente.

- [x] T3. Añadir bloque `smtp` (opcional) a `backend/config.example.json`
      (design.md §6.7), con placeholders (`host`, `port`, `secure`, `user`,
      `password`, `from`). No modificar otras claves del archivo.

- [x] T4. Crear `backend/services/mailService.js`:
  - Factory `createMailService(smtpConfig)`.
  - Si `smtpConfig?.host` está definido → crea transporter real de
    `nodemailer`.
  - Si no → transporter "no-op" que resuelve sin enviar nada.
  - Expone `sendAlertEmail({ to, subject, text })` → `Promise`.
  - No loguear credenciales SMTP (`console.error` solo con mensajes de
    error, sin password).

- [x] T5. Crear `backend/services/alertService.js` (factory
      `(pool, config, db, broadcast, pbxHealthService, mailService, options?)`):
  - CRUD de reglas sobre `alert_rules`: `listRules()`, `createRule(fields)`,
    `updateRule(id, fields)`, `deleteRule(id)` — con validaciones de R3-R9
    (type válido, threshold requerido para `lost_spike`/`trunk_down`,
    formato de `notify_email`, 404 si no existe).
  - `getActiveAlerts()` — `SELECT` sobre `alerts WHERE resolved = 0 ORDER BY
    created_at DESC` (R29).
  - `resolveAlert(id)` — valida existencia (R32) y no-resuelta-previamente
    (R33), persiste `resolved = 1` + `resolved_at` (R31).
  - `evaluateOnce()`:
    - Itera reglas `enabled = 1`.
    - `pbx_disconnect` → lee `pbxHealthService.getStatus()` (sin disparar
      `check()`/`ensureChecked()`), crea/resuelve alertas según R18/R19
      (design.md §6.3).
    - `lost_spike` → query CDR de §3.1 sobre ventana de 60 min (constante
      `LOST_SPIKE_WINDOW_MINUTES`), compara contra `threshold` (R16); omite
      la regla si `pbxHealthService.getStatus().connected === false` (R17).
    - `trunk_down` → query CDR de §3.2 por canal en `config.channels`,
      compara `last_activity` contra `threshold` minutos (R20-R21); si
      `config.channels` está vacío, no genera alertas.
    - `ext_unreachable` → omitido explícitamente, con comentario
      referenciando design.md §6.6 (R23-R24).
    - Para cada alerta nueva (R14): `INSERT` en `alerts`, `broadcast('alert',
      {...})` (R25), y si `rule.notify_email` no es vacío, llama
      `mailService.sendAlertEmail(...)` envuelto en `try/catch` (R26/R27).
    - Evita duplicados: no crear si ya existe alerta no resuelta para el
      mismo `rule_id` (R15).
  - `start(intervalMs?)` — `setInterval` propio (default
    `config.server.pollIntervalMs || 30_000`, design.md §6.2), devuelve
    `stop()`. Cada tick llama `evaluateOnce()` con `try/catch` +
    `console.error('[alerts] evaluateOnce:', err.message)`.
  - Incluir copia local de `toMySQLDate`/cálculo de ventana si
    `cdrService.js` no exporta una equivalente (design.md §6.5).

- [x] T6. Crear `backend/routes/alerts.js` (factory
      `(pool, config, db, requireAuth, requireAdmin, alertService)`):
  - `GET /admin/alerts/rules` (`requireAdmin`) (R2, R10, R11).
  - `POST /admin/alerts/rules` (`requireAdmin`) (R3-R6, R10, R11).
  - `PATCH /admin/alerts/rules/:id` (`requireAdmin`) (R7, R8, R10, R11).
  - `DELETE /admin/alerts/rules/:id` (`requireAdmin`) (R9, R8, R10, R11).
  - `GET /alerts/active` (`requireAuth`) (R29, R30).
  - `PATCH /alerts/:id/resolve` (`requireAuth`) (R31-R33).
  - Todas las respuestas siguen `{ ok: true, data }` / `{ ok: false, error }`
    con `try/catch` y `console.error('[alerts] ...')`.

- [x] T7. Registrar en `backend/server.js` (líneas mínimas, después del
      bloque de `pbxHealthService`):
  - `const createMailService = require('./services/mailService');`
  - `const mailService = createMailService(config.smtp);`
  - `const createAlertService = require('./services/alertService');`
  - `const alertService = createAlertService(pool, config, db, broadcast,
    pbxHealthService, mailService);`
  - `alertService.start();`
  - `app.use('/api', require('./routes/alerts')(pool, config, db,
    requireAuth, requireAdmin, alertService));`
  - No modificar el `setInterval` existente de `/api/events` ni el de
    `pbxHealthService`.

- [x] T8. Crear `backend/tests/alerts.test.js` (Jest + Supertest, SQLite
      `:memory:`, mocks de `pool.query`, `pbxHealthService.getStatus`,
      `mailService.sendAlertEmail`, y de tiempo donde aplique). Un `it()` por
      requisito, mínimo:
  - R1-R3: crear regla válida de cada `type`, defaults (`enabled=true`).
  - R4: `type` inválido → 400.
  - R5: `lost_spike`/`trunk_down` sin `threshold` numérico → 400.
  - R6: `notify_email` con formato inválido → 400.
  - R7: `PATCH` actualiza solo campos provistos.
  - R8: `PATCH`/`DELETE` sobre `id` inexistente → 404.
  - R9: `DELETE` no borra alertas históricas asociadas.
  - R10/R11: sin sesión → 401; rol no admin → 403 en `/api/admin/alerts/*`.
  - R12/R13: regla `enabled=false` no se evalúa (no genera alerta).
  - R14/R15: condición cumplida genera una alerta; segundo ciclo con la
    misma condición no duplica.
  - R16/R17: `lost_spike` genera alerta con `pool.query` mockeado
    devolviendo conteo ≥ threshold; se omite si `pbxHealthService` reporta
    `connected: false`.
  - R18/R19: `pbx_disconnect` genera alerta cuando
    `pbxHealthService.getStatus()` devuelve `connected: false`; se
    auto-resuelve cuando vuelve a `connected: true`.
  - R20-R22: `trunk_down` evaluado vía ausencia de actividad CDR
    (mock de `pool.query` con `last_activity` antiguo/nulo).
  - R23/R24: regla `ext_unreachable` se persiste pero `evaluateOnce()` no
    genera alertas para ella.
  - R25: alerta nueva dispara `broadcast('alert', {...})` (mock de
    `broadcast`, verificar payload).
  - R26: `notify_email` configurado → `mailService.sendAlertEmail` llamado.
  - R27: `mailService.sendAlertEmail` rechaza → alerta y broadcast ocurren
    igual, sin excepción no controlada.
  - R28: `notify_email` vacío/null → `mailService.sendAlertEmail` no
    llamado.
  - R29/R30: `GET /api/alerts/active` devuelve no resueltas; sin sesión →
    401.
  - R31: `PATCH /api/alerts/:id/resolve` marca `resolved=1` +
    `resolved_at`.
  - R32: `id` inexistente → 404.
  - R33: alerta ya resuelta → 409.

- [x] T9. Crear `frontend/src/components/AlertsPanel.jsx` (design.md §5.1):
  panel "Alertas Activas", carga inicial vía `api.activeAlerts()`, botón
  "Resolver" vía `api.resolveAlert(id)` (R34, R35), suscripción a evento SSE
  `alert` vía `useSSE` (R36).

- [x] T10. Crear `frontend/src/components/AlertRulesManager.jsx` (design.md
      §5.2): listado/CRUD de reglas vía `api.adminAlertRules()` /
      `createAlertRule` / `updateAlertRule` / `deleteAlertRule`, con notas de
      limitación para `trunk_down`/`ext_unreachable` (R22, R24, R37).

- [x] T11. Extender `frontend/src/hooks/useSSE.js` con el callback opcional
      `onAlert` (listener del evento `alert`), sin alterar `onInit`/
      `onUpdate`/`onPbxStatus` (design.md §5.3).

- [x] T12. Añadir a `frontend/src/api.js`: `activeAlerts`, `resolveAlert`,
      `adminAlertRules`, `createAlertRule`, `updateAlertRule`,
      `deleteAlertRule` (design.md §5.4).

- [x] T13. Añadir rutas en `frontend/src/App.jsx`
      (`/alerts` → `AlertsPanel`, `/admin/alerts` → `AlertRulesManager`) y
      entradas de navegación en `frontend/src/components/Layout.jsx`
      (`NavItem` "Alertas" en Monitoreo, "Reglas de alerta" en Admin)
      (design.md §5.5).

- [x] T14. Verificación final:
  - `cd backend && npm test` — verde, incluyendo `alerts.test.js` y toda la
    suite existente (no-regresión).
  - `cd frontend && npm run build` — sin errores.
  - `./init.sh` (raíz) — todo verde.
