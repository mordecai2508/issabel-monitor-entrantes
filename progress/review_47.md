# Review Feature #47 — charts_perdidas_horario

**Fecha:** 2026-06-25
**Resultado:** APROBADO

## Verificación de requisitos

### Backend — backend/server.js

- **R8** ✅ `queryHourly` acepta `businessHours = null` como parámetro final (línea 283).
- **R8b** ✅ El SELECT incluye `DAYOFWEEK(calldate) AS call_dow` (línea 290).
- **R8c** ✅ El GROUP BY incluye `DAYOFWEEK(calldate)` (línea 295).
- **R8d** ✅ La inicialización de `breakdown` en `hours` incluye `ivr_hangup_business: 0` e `ivr_hangup_offhours: 0` (línea 303).
- **R8e** ✅ El loop de filas incluye el bloque condicional con `isWithinBusinessHours` para poblar `ivr_hangup_business` / `ivr_hangup_offhours` cuando `reason === 'ivr_hangup'` (líneas 316–320).
- **R10** ✅ Las dos llamadas a `queryHourly` dentro de `fetchData` pasan `businessHours` como argumento final (líneas 555 y 558).

### Frontend — DispositionChart.jsx

- **R1** ✅ No existe ninguna entrada de "Ocupado" ni "Fallidas" en el array `data` ni en `COLORS`.
- **R3** ✅ Cuando `businessHours` es truthy, `lostEntries` incluye "Perdidas en horario" y "Perdidas fuera de horario" (líneas 32–35).
- **R4** ✅ Cuando `businessHours` es null/falsy, `lostEntries` incluye solo "Perdidas" como fallback (línea 36).

### Frontend — HourlyChart.jsx

- **R2** ✅ No hay `<Bar>` para "Ocupado" ni "Fallidas".
- **R6** ✅ Cuando `businessHours` es truthy, hay `<Bar>` para "Perdidas en horario" y "Perdidas fuera de horario" (líneas 54–55).
- **R7** ✅ Cuando `businessHours` es falsy, hay `<Bar>` para "Perdidas" (línea 58).

### Frontend — Dashboard.jsx y HistoricalView.jsx

- **R12** ✅ `Dashboard.jsx` pasa `businessHours={businessHours}` a `<DispositionChart>` (línea 276) y a `<HourlyChart>` (línea 280).
- **R12** ✅ `HistoricalView.jsx` pasa `businessHours={businessHours}` a `<DispositionChart>` (línea 203) y a `<HourlyChart>` (línea 207).

**Nota adicional:** Los charts también están presentes en `InboundView.jsx` con `businessHours` correctamente propagado.

### Build

✅ 0 errores de compilación. Build completado en 18.10s con `vite build`.
