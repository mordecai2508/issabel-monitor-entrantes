# Implementación #48 — subcompany_name_display_fix

**Estado:** Completa  
**Fecha:** 2026-06-25

## Cambios realizados

### T1 — `backend/server.js`
- Movido el bloque `sseClients` + función `broadcast` **antes** del montaje de routers para que `broadcast` esté disponible cuando se llama a `configRouter`.
- Añadido `broadcast` como 7º argumento en `app.use('/api', configRouter(..., broadcast))`.

### T2a — `backend/routes/config.js`
- Firma de `configRouter` actualizada para recibir `broadcast` como 7º parámetro.

### T2b — `backend/routes/config.js`
- En `router.patch('/admin/config', ...)`, reemplazado `res.json({ ok: true, data: buildConfigResponse() })` por:
  - Captura de `buildConfigResponse()` en `responseData`.
  - Llamada a `broadcast('config_updated', { appName, subcompanyName })` si `broadcast` es función.

### T3a — `frontend/src/hooks/useSSE.js`
- Añadido `onConfigUpdated` al destructuring de opciones del hook.

### T3b — `frontend/src/hooks/useSSE.js`
- Añadido listener `es.addEventListener('config_updated', ...)` tras el listener `alert`.

### T4 — `frontend/src/components/Layout.jsx`
- Añadido handler `onConfigUpdated` en la llamada a `useSSE` que actualiza `appName` y `subcompanyName` desde el evento SSE.

## Verificación T5
Build exitoso: `vite build` completó en ~10s con 0 errores.
