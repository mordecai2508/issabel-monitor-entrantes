# progress/history.md — Bitácora de sesiones

> Archivo append-only. Agregar al final al cerrar cada sesión.

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

**Siguiente feature pendiente:** #14 `pbx_health` — Monitoreo de salud del PBX.
