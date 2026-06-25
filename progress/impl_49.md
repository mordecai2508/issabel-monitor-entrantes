# Implementación #49 — queues_hide_busy

**Fecha:** 2026-06-25
**Estado:** Completa

## Cambios realizados

### T1 — backend/server.js
Añadido guard `if (r.disposition.toUpperCase() === 'BUSY') continue; // #49` dentro del loop de `queryQueues`, después de los filtros `passesFilter` y `validDsts.has`.

### T2 — backend/server.js
Eliminado `BUSY: 0` de los dos inicializadores de `result` en `queryQueues` (objeto por cola y objeto `__lost__`).

### T3 — frontend/src/components/Dashboard.jsx
Eliminado el `<span>Ocupado: ...</span>` del componente `QueueCard`.

### T4 — frontend/src/components/InboundView.jsx
Eliminado el `<span>Ocupado: ...</span>` del componente `QueueCard` local.

### T5/T6 — Build
`npm run build` terminó sin errores. Build en 10.04s.
