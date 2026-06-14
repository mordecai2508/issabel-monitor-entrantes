# progress/history.md — Bitácora de sesiones

> Archivo append-only. Agregar al final al cerrar cada sesión.

---

## Sesión 2026-06-13 — disposition_agent_answered_fix

**Feature completada:** #21 `disposition_agent_answered_fix` — Distinguir llamadas atendidas por un agente de llamadas solo contestadas por IVR/cola sin agente

**Resumen:**
- Spec redactada (R1-R21, sin endpoints/tablas/deps nuevos) y aprobada por el humano.
- Helper compartido `resolveDisposition(row, lostDests)` con `AGENT_DSTCHANNEL_RE`
  (`/^Agent\/\d+/` o `/^SIP\/\d+-/`): disposition='ANSWERED' con dstchannel que no
  matchea ninguno de los dos patrones se reclasifica a 'Perdidas'/NO ANSWER, sin
  doble conteo con la reclasificación existente por `config.lostDestinations` (#17).
- `queryStats` (añade `dstchannel`), `queryChannels` y `queryHourly` (añaden
  `dst`+`dstchannel`+`lostDests`) ahora aplican el mismo criterio de forma
  consistente, cerrando la limitación conocida documentada en #17. `queryQueues`
  queda intencionalmente sin cambios (limitación conocida documentada en el spec).
- BUSY/FAILED no se ven afectados; Total = Contestadas + Perdidas + Ocupado +
  Fallidas sigue cuadrando.
- Tests: 318/318 passing. Build frontend: ✅. Review: APROBADO.
- Commit: `feat(disposition_agent_answered_fix): ...` (pendiente de hash, ver git log)

**Siguiente feature pendiente:** ninguna. #1-#21 todas `done` en
`feature_list.json`. A la espera de que el usuario añada nuevas features al
backlog.

---

## Sesión 2026-06-13 — channels_inbound_outbound_split

**Feature completada:** #20 `channels_inbound_outbound_split` — Separar canales/troncales entrantes y salientes para evitar contar llamadas extensión-extensión como salientes

**Origen:** el usuario reportó que las llamadas entre extensiones se contaban como
salientes, y un segundo problema (IVR contestando llamadas que no llegan a un
agente) que quedó registrado como feature #21 (pending, sin spec todavía).

**Resumen:**
- Spec redactada (R1-R23, sin endpoints/tablas/deps nuevos) y aprobada por el humano.
- `config.json`/`config.example.json`: migración automática de `channels` (array
  plano) a `{ inbound: [...], outbound: [...] }`. Troncal saliente real confirmada
  por el usuario: `SIP/SALIENTE_CALL`.
- `passesFilter`/`queryStats`/`queryChannels`/`queryHourly` en `server.js` y
  `cdrService.buildOutboundWhereClause`/`routes/outbound.js` (segunda ruta de
  filtrado NOT-LIKE) ahora usan `channels.outbound` de forma explícita para
  `direction='out'`, no por exclusión de `channels.inbound`.
- `ChannelAliasManager.jsx` muestra a qué dirección (entrante/saliente) pertenece
  cada canal.
- Tests: 297/297 passing. Build frontend: ✅. Review: APROBADO (una observación
  menor no bloqueante sobre el estado de edición en ChannelAliasManager, sin
  impacto).
- Commit: `feat(channels_inbound_outbound_split): ...` (pendiente de hash, ver git log)

**Siguiente feature pendiente:** #21 `disposition_agent_answered_fix` — distinguir
llamadas atendidas por un agente real (dstchannel=Agent/<n> o SIP/<extensión
numérica>-xxxx) de llamadas solo contestadas por IVR/cola sin agente
(disposition='ANSWERED' pero sin bridge a agente), reclasificándolas a 'Perdidas'
de forma consistente en queryStats/queryChannels/queryHourly. Aún sin spec (sdd:true,
status: pending) — siguiente paso: lanzar spec_author.

---

## Sesión 2026-06-08 — user_management

**Feature completada:** #8 `user_management` — Gestión completa de usuarios (CRUD + auditoría)

**Resumen:**
- Spec redactada (30 requisitos, 10 tareas) y aprobada por el humano.
- Implementación: `backend/db/setup.js`, `userService.js`, `auditService.js`, `routes/users.js`, `tests/users.test.js`, `frontend/src/components/UserManagement.jsx`.
- Modificaciones mínimas a `server.js`: mounting del router, login/logout migrados a SQLite + auditoría.
- Tests: 24/24 passing. Build frontend: ✅. Review: APROBADO.
- Commit: `feat(user_management): Gestión completa de usuarios (CRUD + auditoría)` (3794298)

**Siguiente feature pendiente:** #9 `inbound_filters_export` — Llamadas entrantes con filtros avanzados y exportación.

---

## Sesión 2026-06-08 — inbound_filters_export

**Feature completada:** #9 `inbound_filters_export` — Llamadas entrantes con filtros avanzados y exportación

**Resumen:**
- Spec redactada (29 requisitos, 9 tareas) y aprobada por el humano.
- Implementación: `backend/services/cdrService.js`, `exportService.js`, `routes/inbound.js`, `tests/inbound.test.js`, `frontend/src/components/InboundTable.jsx`.
- Una línea de mount en `server.js`. Coexiste con `InboundView.jsx` (v1.0 intacta).
- Tests: 39/39 passing. Build frontend: ✅. Review: APROBADO (observación: 9 RNF sin test explícito — deuda técnica menor).
- Commit: `feat(inbound_filters_export): ...` (3c67813)

**Siguiente feature pendiente:** #10 `outbound_filters_export` — Llamadas salientes con filtros avanzados y exportación.

---

## Sesión 2026-06-08 — outbound_filters_export

**Feature completada:** #10 `outbound_filters_export` — Llamadas salientes con filtros avanzados y exportación

**Resumen:**
- Spec redactada (35 requisitos, 8 tareas) y aprobada por el humano.
- Implementación: `queryOutbound`/`queryOutboundExport` añadidos a `cdrService.js`; `exportService.js` extendido con parámetros opcionales retrocompatibles; `routes/outbound.js`; `tests/outbound.test.js`; `frontend/src/components/OutboundTable.jsx`.
- Tests: 56/56 passing (incluye no-regresión de inbound). Build frontend: ✅. Review: APROBADO.
- Commit: `feat(outbound_filters_export): ...` (4aecb4a)

**Siguiente feature pendiente:** #11 `historical_analytics` — Estadísticas históricas avanzadas.

---

## Sesión 2026-06-08 — historical_analytics

**Feature completada:** #11 `historical_analytics` — Estadísticas históricas avanzadas

**Resumen:**
- Spec redactada (43 requisitos, 8 tareas) y aprobada por el humano.
- Implementación: `backend/services/statsService.js`, `routes/stats.js`, `tests/stats.test.js`, `frontend/src/components/HistoricalAnalytics.jsx`.
- Tests: 83/83 passing. Build frontend: ✅. Review: APROBADO.
- Commit: `feat(historical_analytics): ...` (437fbde)

**Siguiente feature pendiente:** #12 `reports_module` — Generación de reportes PDF y Excel.

---

## Sesión 2026-06-10 — reports_module

**Feature completada:** #12 `reports_module` — Generación de reportes PDF y Excel

**Resumen:**
- Spec redactada (R1–R39, 2 endpoints genéricos `/api/reports/:type/{pdf,xlsx}`, 0 deps npm nuevas, 12 tasks) y aprobada por el humano.
- Implementación: `backend/services/reportService.js`, `backend/services/reportConstants.js`, extensión de `exportService.js` (drawBarChart, buildReportPdf, buildReportXlsx), `routes/reports.js`, `tests/reports.test.js`, `frontend/src/components/ReportsModule.jsx`. Una línea de mount en `server.js`. `routes/outbound.js` solo importa constantes compartidas (sin cambio de comportamiento).
- Sin tablas SQLite nuevas; branding/logo lee `system_config` de forma defensiva (feature #13 aún pendiente) con fallback a `appName`.
- Tests: 130/130 passing (47/47 en reports.test.js, sin regresión). Build frontend: ✅. `./init.sh`: 25/25. Review: APROBADO.
- Commit: `feat(reports_module): Generación de reportes PDF y Excel`

**Siguiente feature pendiente:** #13 `system_config` — Configuración del sistema (empresa, logo, tema).

---

## Sesión 2026-06-10 — system_config

**Feature completada:** #13 `system_config` — Configuración del sistema (empresa, logo, tema)

**Resumen:**
- Spec redactada (R1–R42, 8 endpoints `/api/admin/config*`, `/api/admin/extensions*`, `/api/admin/trunks*`, 3 tablas SQLite nuevas, 1 dep npm nueva: `multer`, 11 tasks) y aprobada por el humano.
- Implementación: `backend/services/configService.js`, `backend/routes/config.js`, `backend/tests/config.test.js`, `frontend/src/components/SystemConfig.jsx`. `backend/db/setup.js` extendido con `system_config`/`extensions_config`/`trunks_config` (`CREATE TABLE IF NOT EXISTS`, sin tocar `users`/`audit_log`). Una línea de mount en `server.js`. `frontend/src/api.js`/`App.jsx`/`Layout.jsx` con nuevas funciones, ruta `/admin/config` (admin-only) y NavItem "Configuración".
- Capa additiva: `config.json` (`app.name`, `channelAliases`, `channels`, feature #6) sin cambios; `GET /api/admin/config` hace fallback de solo lectura a `getAppName()`. `system_config.companyName`/`logoPath` ya son consumidos por `reportService.getBranding` (#12, sin modificar) — al configurar empresa/logo aquí, los reportes los reflejan automáticamente.
- Tests: 180/180 passing (50/50 en config.test.js, sin regresión). Build frontend: ✅. `./init.sh`: 25/25. Review: APROBADO.
- Commit: `feat(system_config): Configuración del sistema (empresa, logo, tema)`

**Siguiente feature pendiente:** #16 `dashboard_kpi_breakdown` (priorizada por el usuario antes de #14/#15) — Corrección de KPI 'Perdidas' y desglose entrante/saliente en el dashboard.

---

## Sesión 2026-06-10 — dashboard_kpi_breakdown

**Feature completada:** #16 `dashboard_kpi_breakdown` — Corrección de KPI 'Perdidas' y desglose entrante/saliente en el dashboard

**Origen:** Solicitud del usuario (no estaba en `feature_list.json` original):
"la tarjeta 'Perdidas' no reconcilia con 'Total'/'Contestadas'" + "mostrar en
el dashboard el desglose de llamadas entrantes/salientes". Priorizada por el
usuario para ejecutarse antes de #14 `pbx_health` y #15 `alerts_monitoring`
(reordenada en el array `features` de `feature_list.json`, ids sin cambios).

**Resumen:**
- Spec redactada (R1–R16, 0 endpoints/tablas/queries nuevas, 0 deps npm nuevas, 8 tasks) y aprobada por el humano. Feature 100% frontend.
- Diagnóstico: "Perdidas" se calculaba desde `queryQueues().__lost__` (depende de `config.queues`, da 0 si está vacío) en lugar de `dispositions['NO ANSWER']` (ya incluido en `total`).
- Implementación: único archivo modificado `frontend/src/components/Dashboard.jsx`. Se eliminó `lostTotal`/`__lost__` como fuente de "Perdidas"; "Perdidas" ahora = `disp['NO ANSWER'].count` (con `pct`); nueva tarjeta "Ocupado" = `disp.BUSY.count` (con `pct`); nuevo grid "Llamadas entrantes"/"Llamadas salientes" usando `inbound.stats.total`/`outbound.stats.total` con `pct` sobre el total. Bloque `QueueCard`/`__lost__` (colas) intacto. Iconos nuevos `PhoneIncoming`/`PhoneOutgoing` de `lucide-react` (ya instalado).
- Sin tests automatizados frontend (no hay Vitest/ESLint configurado): verificación por lectura de código línea por línea + simulación aritmética con payloads mock (casos normal, vacío, `data===null`, sin inbound/outbound).
- Tests backend: 180/180 passing (sin regresión, no se tocó backend). Build frontend: ✅. `./init.sh`: 25/25. Review: APROBADO.
- Commit: `feat(dashboard_kpi_breakdown): Corrección de KPI 'Perdidas' y desglose entrante/saliente en el dashboard`

**Siguiente feature pendiente:** #17 `dashboard_lost_destinations` (priorizada por el usuario justo después de #16, antes de #14/#15) — Ampliar 'Perdidas' para incluir llamadas con destino en lostDestinations.

---

## Sesión 2026-06-10 — dashboard_lost_destinations

**Feature completada:** #17 `dashboard_lost_destinations` — Ampliar 'Perdidas' para incluir llamadas con destino en lostDestinations (reclasificación)

**Origen:** Solicitud del usuario (no estaba en `feature_list.json` original):
"Para las llamadas perdidas también debe tener en cuenta las que tienen como
canal de destino 's','hang','hangup'" — refinamiento directo de #16, hecho
inmediatamente después de su commit. Priorizada justo después de #16, antes de
#14/#15 (reordenada en el array `features`, ids sin cambios: ...13, 16, 17,
14, 15).

**Decisión de diseño confirmada por el usuario** (vía AskUserQuestion):
reclasificación — una llamada con `disposition` ∈ {ANSWERED, BUSY, FAILED} y
`dst` ∈ `config.lostDestinations` se resta de su categoría original y se suma
a "Perdidas" (`dispositions['NO ANSWER']`), preservando exactamente
`Total = Contestadas + Perdidas + Ocupado + Fallidas` (R2 de #16).

**Resumen:**
- Spec redactada (R1–R23, 0 endpoints/tablas/deps nuevas, 7 tasks) y aprobada por el humano.
- Implementación: único cambio funcional en `backend/server.js` — `queryStats` ahora agrupa también por `dst` (`GROUP BY channel, dst, disposition`), recibe `lostDests` (default `['s','hang','hangup']`, mismo default que `queryQueues`) y reclasifica por fila: si `disposition` ∈ {ANSWERED,BUSY,FAILED} y `dst` ∈ `lostDests` → cuenta en `'NO ANSWER'` en vez de su bucket original; si ya era `NO ANSWER`, sin doble conteo. `total` no cambia (R10). `fetchData` pasa `lostDests` a las 3 invocaciones de `queryStats` (general/in/out), por lo que `/api/calls/today`, `/api/calls/range` y SSE init/update quedan cubiertos.
- Sin cambios de payload (mismas claves `dispositions`/`total`) → `Dashboard.jsx` (#16) no requirió cambios de lógica. Cambio cosmético opcional aplicado: tarjeta "Perdidas" `sub="sin atender, del total"` → `sub="no efectivas, del total"`.
- `queryQueues`/`__lost__` (bloque de colas, #16 R7/R8) sin cambios — coexiste sin conflicto. `queryChannels`/`queryHourly` (ChannelTable/HourlyChart) quedan sin cambios, documentado como limitación conocida (pueden diferir levemente de la tarjeta "Perdidas"; `DispositionChart` sí queda consistente).
- Tests: 195/195 passing (15 nuevos en `dashboard_lost_destinations.test.js`, sin regresión sobre 180/180 previos). Build frontend: ✅. `./init.sh`: 25/25. Review: APROBADO (incluyó verificación de equivalencia copia-local-test vs. implementación real).
- Commit: `feat(dashboard_lost_destinations): Ampliar 'Perdidas' para incluir llamadas con destino en lostDestinations`

**Siguiente feature pendiente:** #14 `pbx_health` — Monitoreo de salud del PBX.

---

## Sesión 2026-06-10 — pbx_health

**Feature completada:** #14 `pbx_health` — Monitoreo de salud de la conexión PBX

**Resumen:**
- Spec redactada (R1–R23, 2 endpoints, 0 tablas SQLite nuevas, 0 deps npm, 9 tasks) y aprobada por el humano.
- Implementación: `backend/services/pbxHealthService.js` (estado en memoria, `pool.query('SELECT 1')` con timeout vía `Promise.race`, timer propio de 15s, `broadcast('pbx_status', ...)` solo en transiciones), `backend/routes/pbx.js` (`GET /api/pbx/health`, `POST /api/pbx/sync`, ambos `requireAuth`, siempre HTTP 200), `backend/tests/pbx.test.js`.
- `server.js`: reordenamiento sin cambios funcionales del bloque `sseClients`/`broadcast` (para que esté disponible al instanciar el servicio), montaje del router, y `data.pbxStatus = pbxHealthService.getStatus()` añadido al payload `init` de `/api/events` (R23). `setInterval` de poll existente intacto.
- Frontend: `PbxStatus.jsx` (indicador verde/rojo/neutro + botón de sync manual) montado en `Layout.jsx`, `Toast.jsx` genérico para notificaciones de conexión perdida/restablecida, `useSSE.js` extendido de forma aditiva con `onPbxStatus`, `api.js` con `pbxHealth()`/`pbxSync()`.
- Tests: 209/209 passing (195 previos + 14 nuevos en `pbx.test.js`, sin regresión). Build frontend: ✅. `./init.sh`: 25/25. Review: APROBADO.
- Commit: `feat(pbx_health): Monitoreo de salud de la conexión PBX`

**Siguiente feature pendiente:** #15 `alerts_monitoring` — Sistema de alertas y monitoreo.

---

## Sesión 2026-06-10 — alerts_monitoring

**Feature completada:** #15 `alerts_monitoring` — Sistema de alertas y monitoreo

**Resumen:**
- Spec redactada (R1–R37, 6 endpoints, 2 tablas SQLite + 2 índices, 1 dep npm: `nodemailer`, 14 tasks) y aprobada por el humano. Antes de comprometerse a los 4 tipos de alerta se verificaron las fuentes de datos disponibles: `lost_spike` y `pbx_disconnect` totalmente evaluables; `trunk_down` solo "best-effort" (proxy de ausencia de actividad CDR, sin acceso AMI real); `ext_unreachable` documentado como CRUD-only/no evaluado (sin fuente de datos de registro de extensiones).
- Implementación: `backend/services/alertService.js` (CRUD `alert_rules`, `getActiveAlerts`/`resolveAlert`, `evaluateOnce()` por tipo, timer propio independiente de `pollIntervalMs` y del timer de `pbxHealthService`), `backend/services/mailService.js` (nodemailer real o no-op si no hay `smtp.host`), `backend/routes/alerts.js` (6 endpoints `/api/admin/alerts/rules*` admin-only y `/api/alerts/active`+`/api/alerts/:id/resolve` auth), `backend/tests/alerts.test.js` (41 tests), `frontend/src/components/AlertsPanel.jsx` (`/alerts`, todos los roles) y `AlertRulesManager.jsx` (`/admin/alerts`, admin-only, con notas de limitación `trunk_down`/`ext_unreachable`).
- `backend/db/setup.js`: nuevas tablas `alert_rules`/`alerts` + 2 índices; se detectó que `better-sqlite3` activa FK por defecto (a diferencia de SQLite estándar), lo que bloqueaba `DELETE` de reglas con alertas históricas (R9) — corregido con `db.pragma('foreign_keys = OFF')`. `server.js`: instanciación de `mailService`+`alertService` y montaje del router tras el bloque de `pbxHealthService` (sin tocar sus timers). `useSSE.js` extendido de forma aditiva con `onAlert`; `Layout.jsx` muestra `Toast` en alertas nuevas y añade nav "Alertas"/"Reglas de alerta"; `api.js`/`App.jsx` con las nuevas funciones/rutas. `config.example.json` con bloque opcional `smtp`.
- Tests: 250/250 passing (209 previos + 41 nuevos en `alerts.test.js`, sin regresión). Build frontend: ✅. `./init.sh`: 25/25. Review: APROBADO.
- Commit: `feat(alerts_monitoring): Sistema de alertas y monitoreo`

**Siguiente feature pendiente:** ninguna — todas las features de `feature_list.json` están en `done` (#1-#17). El leader queda a la espera de nuevas features que el usuario añada al backlog.

---

## Sesión 2026-06-12 — dashboard_extensions_status

**Feature completada:** #18 `dashboard_extensions_status` — Estado de extensiones del PBX (total y activas) en el dashboard

**Resumen:**
- Feature nueva añadida al backlog a petición del usuario, con decisiones previas aclaradas: "activa" = extensión registrada en Asterisk vía AMI (PJSIPShowEndpoints), "total" = endpoints reportados por AMI; credenciales en nuevo bloque `config.ami`.
- Spec redactada (R1-R20, design, T1-T10) y aprobada por el humano.
- Implementación: `backend/services/amiExtensionsService.js` (cliente `asterisk-manager`, polling propio 30s, caché, tolerante a fallos), endpoint `GET /api/pbx/extensions` añadido a `routes/pbx.js`, bloque `ami` en `config.example.json`/`config.json`, dos `StatCard` ("Extensiones"/"Activas") en `Dashboard.jsx` con polling REST propio (no SSE) y degradación visual si `available:false`.
- Primera revisión: RECHAZADA solo por trazabilidad (R12, R14-R17, R19, R20 sin test nombrado). El humano decidió configurar Vitest (antes inexistente en frontend) para cubrir R14-R17.
- Correcciones: 7 tests nuevos en `ami.test.js` (R12/R19/R20) + nuevo `Dashboard.test.jsx`/`vitest.config.js`/`src/test/setup.js` (R14-R17).
- Tests: backend 271/271, frontend (vitest, nuevo) 4/4. Build frontend: ✅. `./init.sh`: 25/25. Review (2ª ronda): APROBADO.
- Commit: `feat(dashboard_extensions_status): Estado de extensiones del PBX (total y activas) en el dashboard` (354308b)

**Siguiente feature pendiente:** ninguna — todas las features de `feature_list.json` están en `done` (#1-#18). El leader queda a la espera de nuevas features que el usuario añada al backlog.

---

## Sesión 2026-06-12 — dashboard_extensions_chan_sip_fix

**Feature completada:** #19 `dashboard_extensions_chan_sip_fix` — Corrección: detección de extensiones activas vía SIPpeers (chan_sip) en lugar de PJSIPShowEndpoints

**Resumen:**
- Al configurar AMI en producción (#18), se detectó que el Issabel real usa chan_sip, no PJSIP: `PJSIPShowEndpoints` no existe ("Invalid/unknown command"). Diagnosticado con el usuario vía `sip show peers`/`manager show commands`.
- Spec de corrección redactada como delta (R21-R26 sobre R1-R20 de #18) y aprobada por el humano. Decisiones: acción AMI `SIPpeers` (eventos `PeerEntry`/`PeerlistComplete`); "extensión" = `ObjectName` puramente numérico (`^\d+$`, excluye troncales tipo ENT_LIWA/NET2_ENT_.../VIRTUAL_TRUNK_SALIENTE); "activa" = `Status` empieza con `OK`/`LAGGED`, resto = inactiva.
- Implementación acotada a `backend/services/amiExtensionsService.js` (acción AMI, parsing de eventos, filtro regex, mapeo de status) + `backend/tests/ami.test.js` (mocks `PeerEntry`/`PeerlistComplete`, casos OK/UNKNOWN/LAGGED/Unmonitored/troncal-excluida) + `_comment` en `config.example.json` documentando que `manager.conf` necesita la clase `reporting` en `read` para `SIPpeers`. No se tocó `routes/pbx.js`, `server.js` ni frontend (contrato del endpoint sin cambios).
- 1ª revisión: RECHAZADA por trazabilidad (R26 sin test, R11 de #18 perdió su nombre al renombrarse a R25). Corregido con `it('R26 - ...')` nuevo y test renombrado a `R11/R25`.
- Tests: backend 274/274 (273 + 1 nuevo), frontend sin cambios (build + vitest 4/4 verdes). `./init.sh`: 25/25. Review (2ª ronda): APROBADO.
- Commit: `feat(dashboard_extensions_chan_sip_fix): Corrección - detección de extensiones activas vía SIPpeers (chan_sip) en lugar de PJSIPShowEndpoints` (aec49e1)

**Pendiente fuera de código (acción manual del usuario en producción):** añadir la clase `reporting` a `read` en `manager.conf` del Issabel (`read = system,call,agent,user,reporting`) + `asterisk -rx "manager reload"`, para que `SIPpeers` funcione con el usuario AMI `monitor-readonly`.

**Siguiente feature pendiente:** ninguna — todas las features de `feature_list.json` están en `done` (#1-#19). El leader queda a la espera de nuevas features que el usuario añada al backlog.
