# Tasks — search_datetime_format_fix

Orden de ejecución obligatorio. El implementer marca `[x]` al completar cada tarea.

---

- [x] T1. **Sin dependencias nuevas** — Confirmar que no se instala ningún paquete npm.

- [x] T2. **Agregar `formatCalldateLocal` en `backend/services/cdrService.js`**
  - Agregar la función pura `formatCalldateLocal(value, tzOffset)` descrita en `design.md §4`
    antes de las funciones `mapRow` / `mapOutboundRow`.
  - La función debe manejar:
    - `value` como objeto `Date` (caso normal con mysql2 timezone configurado)
    - `value` como string ISO (caso fallback)
    - `tzOffset` ausente o vacío → usar `'+00:00'`
    - timestamp inválido → devolver `String(value)` sin lanzar excepción

- [x] T3. **Actualizar `mapRow` en `backend/services/cdrService.js`**
  - Agregar parámetro `tzOffset = '+00:00'` a `mapRow(row, extractChannelFn, lostDests, tzOffset)`.
  - Cambiar la línea `calldate: row.calldate instanceof Date ? row.calldate.toISOString() : row.calldate`
    por `calldate: formatCalldateLocal(row.calldate, tzOffset)`.

- [x] T4. **Actualizar `mapOutboundRow` en `backend/services/cdrService.js`**
  - Agregar parámetro `tzOffset = '+00:00'` a `mapOutboundRow(row, extractChannelFn, lostDests, tzOffset)`.
  - Aplicar el mismo cambio de `calldate` que en T3.

- [x] T5. **Propagar `tzOffset` en `queryInbound` y `queryInboundExport`**
  - Agregar `tzOffset = '+00:00'` como último parámetro de ambas funciones.
  - Pasar `tzOffset` a cada llamada a `mapRow(r, extractChannelFn, lostDests, tzOffset)`.

- [x] T6. **Propagar `tzOffset` en `queryOutbound` y `queryOutboundExport`**
  - Agregar `tzOffset = '+00:00'` como último parámetro de ambas funciones.
  - Pasar `tzOffset` a cada llamada a `mapOutboundRow(r, extractChannelFn, lostDests, tzOffset)`.

- [x] T7. **Actualizar `backend/routes/inbound.js`**
  - Extraer el offset: `const tzOffset = (config.db && config.db.timezone) || '+00:00';`
  - Pasar `tzOffset` como último argumento en las llamadas a:
    - `cdrService.queryInbound(pool, filters, { page, limit }, extractChannel, lostDests, tzOffset)`
    - `cdrService.queryInboundExport(pool, filters, extractChannel, lostDests, tzOffset)`

- [x] T8. **Actualizar `backend/routes/outbound.js`**
  - Extraer el offset: `const tzOffset = (config.db && config.db.timezone) || '+00:00';`
  - Pasar `tzOffset` como último argumento en las llamadas a:
    - `cdrService.queryOutbound(pool, filters, { page, limit }, outboundChannels, extractChannel, lostDests, tzOffset)`
    - `cdrService.queryOutboundExport(pool, filters, outboundChannels, extractChannel, lostDests, tzOffset)`

- [x] T9. **Sin cambios en frontend** — Verificar que `InboundTable.jsx` y `OutboundTable.jsx`
  ya muestran `{row.calldate}` directamente. No modificar estos archivos.

- [x] T10. **Tests en `backend/tests/cdrService.test.js`** (crear si no existe)
  - `R4 - formatCalldateLocal convierte Date UTC a hora local con offset "-05:00"`:
    entrada `new Date('2026-06-24T22:30:34.000Z')` + tzOffset `"-05:00"` → `"2026-06-24 17:30:34"`.
  - `R4 - formatCalldateLocal maneja offset positivo "+02:00"`:
    entrada `new Date('2026-06-24T10:00:00.000Z')` + tzOffset `"+02:00"` → `"2026-06-24 12:00:00"`.
  - `R5 - formatCalldateLocal usa UTC cuando tzOffset es undefined`:
    entrada `new Date('2026-06-24T22:30:34.000Z')` + tzOffset `undefined` → `"2026-06-24 22:30:34"`.
  - `R5 - formatCalldateLocal usa UTC cuando tzOffset es cadena vacía`:
    entrada `new Date('2026-06-24T22:30:34.000Z')` + tzOffset `""` → `"2026-06-24 22:30:34"`.
  - `R1 - mapRow devuelve calldate como string YYYY-MM-DD HH:MM:SS con tzOffset "-05:00"`.
  - `R1 - mapOutboundRow devuelve calldate como string YYYY-MM-DD HH:MM:SS con tzOffset "-05:00"`.

- [x] T11. **Verificación final**
  - `npm test` verde (o `node --test` si aplica).
  - `npm run build` sin errores.
  - Probar manualmente en el entorno de desarrollo: buscar llamadas del día y confirmar
    que la columna "Fecha/Hora" muestra `YYYY-MM-DD HH:MM:SS` en hora local del servidor.
  - Confirmar que la exportación Excel/PDF también muestra la hora local correcta.
