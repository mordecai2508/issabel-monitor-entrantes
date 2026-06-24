# Review #41 — search_table_columns_redesign

Fecha: 2026-06-24
Revisor: reviewer agent

## Resultado: APROBADO

---

## Verificación de requisitos

### R1/R2 — Columnas en ambas tablas (orden: Fecha/Hora | Origen | Troncal | Destino | Canal Destino | Duración | Estado)
- **InboundTable.jsx** COLUMNS: `calldate, src, channel, dst, dstchannel, billsec, disposition` — labels correctas. ✅
- **OutboundTable.jsx** COLUMNS: `calldate, src, dstchannel, dst, channel, billsec, disposition` — labels correctas. ✅

### R8 — `extractAgentName`
- `"Agent/03"` → `"Agent/03"` ✅
- `"SIP/202-00a1b2"` → `"202"` ✅
- `""` → `""` ✅
- Implementado en `backend/services/callFormatters.js` y `frontend/src/utils/callFormatters.js`. ✅

### R10 — `formatBillsec`
- `formatBillsec(225)` → `"3:45"` ✅
- `formatBillsec(0)` → `"0:00"` ✅

### R11 — `dispositionLabel`
- `"ANSWERED"` → `"Contestada"` ✅
- `"NO ANSWER"` → `"No contestada"` ✅

### R13/R14 — Campos en rutas de exportación
- **inbound.js**: enriquece con `agentName`, `duration_fmt`, `disposition_label`; aplica alias a `channel`. ✅
- **outbound.js**: ídem; aplica alias a `dstchannel`, `agentName` usa `extractAgentName(r.channel)`. ✅
- **cdrService.js** `mapOutboundRow`: incluye `channel: row.channel || ''`. ✅
- Queries SQL de outbound (`queryOutbound`, `queryOutboundExport`) seleccionan `channel`. ✅

### R15/R16 — Headers de exportación
- `reportConstants.js`: ambas tablas con headers `['Fecha/Hora', 'Origen', 'Troncal', 'Destino', 'Canal Destino', 'Duración', 'Estado']`. ✅
- `INBOUND_ROW_KEYS`: `['calldate', 'src', 'channel', 'dst', 'agentName', 'duration_fmt', 'disposition_label']`. ✅
- `OUTBOUND_ROW_KEYS`: `['calldate', 'src', 'dstchannel', 'dst', 'agentName', 'duration_fmt', 'disposition_label']`. ✅

### R21 — Sin eliminación de campos existentes
- `mapRow` (inbound) conserva todos los campos previos (`duration`, `billsec`, `dstchannel`, etc.). ✅
- `mapOutboundRow` conserva todos los campos previos más `channel` añadido. ✅

## Tests

- 33 tests ejecutados, 33 en verde. ✅
- Suites: `callFormatters.test.js`, `cdrService.outbound.test.js`, `inbound.export.test.js`, `outbound.export.test.js`.

## Build

- `npm run build` completado sin errores en ~10.9 s. ✅
- Warning de chunk >500 kB es pre-existente, no introducido por esta feature.

## Pendiente (no bloqueante)
- T17 (smoke test manual) marcado como `[ ]` en tasks.md — requiere intervención humana, no bloquea la aprobación técnica.
