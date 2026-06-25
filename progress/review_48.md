# Review #48 — subcompany_name_display_fix

**Fecha:** 2026-06-25  
**Resultado:** APROBADO

## Verificación de requisitos

| ID | Requisito | Archivo | Resultado |
|----|-----------|---------|-----------|
| R1 | `configRouter(...)` incluye `broadcast` como 7º argumento | `backend/server.js:466` | ✅ PASS |
| R2 | `function configRouter(...)` acepta `broadcast` como 7º parámetro | `backend/routes/config.js:66` | ✅ PASS |
| R3 | Tras `res.json(...)` de éxito, se llama `broadcast(...)` condicionalmente con `typeof broadcast === 'function'` | `backend/routes/config.js:157-162` | ✅ PASS |
| R4 | Payload del broadcast usa clave `appName` (no `companyName`) | `backend/routes/config.js:159` — `appName: responseData.companyName` | ✅ PASS |
| R5 | Firma del hook incluye `onConfigUpdated` en la desestructuración | `frontend/src/hooks/useSSE.js:3` | ✅ PASS |
| R6 | `es.addEventListener('config_updated', ...)` llama `onConfigUpdated?.(data)` | `frontend/src/hooks/useSSE.js:38-41` | ✅ PASS |
| R7 | Llamada a `useSSE` en Layout.jsx incluye handler `onConfigUpdated` que llama `setAppName` y `setSubcompanyName` | `frontend/src/components/Layout.jsx:72-75` | ✅ PASS |

## Notas

- El campo en `buildConfigResponse()` se llama `companyName` internamente, pero el broadcast lo expone como `appName: responseData.companyName`. Layout.jsx espera `data.appName`, por lo que la transformación es correcta.
- La build de producción finaliza con éxito (`✓ built in 9.72s`). Solo hay una advertencia no bloqueante sobre tamaño de chunk (>500 kB), que es pre-existente y no relacionada con esta feature.

## Build

```
✓ built in 9.72s
```
