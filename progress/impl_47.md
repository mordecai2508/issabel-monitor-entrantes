# Implementación #47 — charts_perdidas_horario

**Estado:** Completada  
**Fecha:** 2026-06-25

## Cambios aplicados

### Backend (`backend/server.js`)
- `queryHourly`: añadido parámetro `businessHours = null`; SELECT amplía con `DAYOFWEEK(calldate) AS call_dow`; GROUP BY incluye `DAYOFWEEK(calldate)`; breakdown inicializa `ivr_hangup_business: 0` e `ivr_hangup_offhours: 0`; loop clasifica llamadas perdidas en horario/fuera de horario usando `isWithinBusinessHours`.
- `fetchData`: ambas llamadas a `queryHourly` reciben `businessHours` como octavo argumento.

### Frontend
- `DispositionChart.jsx`: prop `businessHours` añadida; COLORS actualizado (sin Ocupado/Fallidas, con Perdidas en/fuera horario); lógica condicional de `lostEntries`.
- `HourlyChart.jsx`: prop `businessHours` añadida; map de data condicional; total recalculado sin Ocupado/Fallidas; Bars condicionales.
- `Dashboard.jsx`: `businessHours` prop pasada a ambos charts.
- `HistoricalView.jsx`: `businessHours` prop pasada a ambos charts.
- `InboundView.jsx`: `businessHours` prop pasada a ambos charts (bonus, no en spec pero consistente).

## Verificación
- `npm run build` completado sin errores. Build exitoso en 17.40s.
