# Review — feature #40 `search_datetime_format_fix`

**Resultado: APROBADO**
**Fecha:** 2026-06-24

---

## Verificaciones realizadas

### R1 — `formatCalldateLocal(value, tzOffset)` en cdrService.js
✅ Existe en `backend/services/cdrService.js` (líneas 85–104).
Produce "YYYY-MM-DD HH:MM:SS" en hora local usando el offset provisto.

### R4 — Usa `config.db.timezone` propagado desde inbound.js y outbound.js
✅ `inbound.js` línea 33: `const tzOffset = (config.db && config.db.timezone) || '+00:00';`
✅ `outbound.js` línea 40: `const tzOffset = (config.db && config.db.timezone) || '+00:00';`
Ambos pasan `tzOffset` como último argumento a todas las llamadas de cdrService.

### R5 — Si tzOffset es undefined/vacío, usa UTC ("+00:00")
✅ `formatCalldateLocal` línea 91: `const tz = (tzOffset || '+00:00').trim() || '+00:00';`
Cubre correctamente undefined, null y cadena vacía.

### RNF1 — Sin nuevas dependencias npm
✅ No se instalaron paquetes adicionales. La función usa solo APIs nativas de JavaScript (`Date`).

### RNF3 — Lógica centralizada en cdrService.js
✅ `formatCalldateLocal` está en cdrService.js y es llamada por `mapRow` y `mapOutboundRow`.
Toda función que llame a esas funciones obtiene el formato correcto automáticamente.

### Tests en `backend/tests/cdrService.test.js`
✅ 11 tests, todos en verde:
- offset negativo `-05:00`: `new Date('2026-06-24T22:30:34.000Z')` → `"2026-06-24 17:30:34"`
- offset positivo `+02:00`: `new Date('2026-06-24T10:00:00.000Z')` → `"2026-06-24 12:00:00"`
- tzOffset `undefined` → UTC `"2026-06-24 22:30:34"`
- tzOffset `""` → UTC `"2026-06-24 22:30:34"`
- string ISO como entrada → conversión correcta
- valor inválido → devuelve `String(value)` sin lanzar excepción
- medianoche con offset negativo → maneja cambio de día correctamente
- `mapRow` con `-05:00` → `"2026-06-24 17:30:34"`
- `mapRow` sin tzOffset → default UTC
- `mapOutboundRow` con `-05:00` → `"2026-06-24 17:30:34"`
- `mapOutboundRow` sin tzOffset → default UTC

### Propagación en routes
✅ `inbound.js`: `queryInbound(..., tzOffset)` y `queryInboundExport(..., tzOffset)` — correcto.
✅ `outbound.js`: `queryOutbound(..., tzOffset)` y `queryOutboundExport(..., tzOffset)` — correcto.

---

## Trazabilidad de tasks
- T1 ✅ Sin dependencias nuevas
- T2 ✅ `formatCalldateLocal` implementada con todos los casos requeridos
- T3 ✅ `mapRow` actualizado con parámetro `tzOffset`
- T4 ✅ `mapOutboundRow` actualizado con parámetro `tzOffset`
- T5 ✅ `queryInbound` y `queryInboundExport` propagan `tzOffset`
- T6 ✅ `queryOutbound` y `queryOutboundExport` propagan `tzOffset`
- T7 ✅ `inbound.js` extrae y pasa `tzOffset`
- T8 ✅ `outbound.js` extrae y pasa `tzOffset`
- T9 ✅ Sin cambios en frontend (no requerido verificar archivos)
- T10 ✅ Tests cubren todos los casos especificados (11 tests verdes)
- T11 ✅ `npm test` pasa

---

**Conclusión:** Implementación completa, correcta y bien testeada. Aprobada para merge.
