# Tasks — perdidas_split_statcards

Feature #38: Separar 'Perdidas' en dos StatCards independientes

Solo frontend. No hay cambios en backend, BD ni dependencias npm.

---

- [x] T1. **Dashboard.jsx — eliminar `perdidasSubItems`**
  - Eliminar las líneas que calculan `perdidasSubItems` (actualmente líneas 139-142).
  - Verificar que no queda ninguna referencia a `perdidasSubItems` en el archivo.

- [x] T2. **Dashboard.jsx — añadir variables para split**
  - Añadir después del bloque de `lostPct` / `noAnswerPct`:
    ```js
    const lostBusiness    = noAnswerBreakdown.ivr_hangup_business ?? 0;
    const lostOffhours    = noAnswerBreakdown.ivr_hangup_offhours ?? 0;
    const lostBusinessPct = total > 0 ? Math.round((lostBusiness / total) * 1000) / 10 : 0;
    const lostOffhoursPct = total > 0 ? Math.round((lostOffhours / total) * 1000) / 10 : 0;
    ```

- [x] T3. **Dashboard.jsx — reemplazar StatCard 'Perdidas' con bloque condicional**
  - Sustituir el `<StatCard label="Perdidas" ... subItems={perdidasSubItems} />` actual
    por el bloque condicional que renderiza 2 tarjetas cuando `businessHours` no es null,
    o 1 tarjeta de fallback cuando es null (ver design.md §4.1).
  - Usar `color="slate"` para 'Perdidas fuera de horario' y `color="red"` para
    'Perdidas en horario'.
  - Incluir prop `hint` descriptiva en ambas tarjetas (ver design.md §4.1).
  - NO pasar `subItems` a ninguna de las dos tarjetas del split.
  - Cubierta por: R1, R2, R7, R8, R10, R12.

- [x] T4. **HistoricalView.jsx — eliminar `perdidasSubItems`**
  - Eliminar las líneas que calculan `perdidasSubItems` (actualmente líneas 68-71).
  - Verificar que no queda ninguna referencia a `perdidasSubItems` en el archivo.

- [x] T5. **HistoricalView.jsx — añadir variables para split**
  - Añadir las mismas cuatro variables `lostBusiness`, `lostOffhours`,
    `lostBusinessPct`, `lostOffhoursPct` con los mismos defaults `?? 0`.

- [x] T6. **HistoricalView.jsx — reemplazar StatCard 'Perdidas' con bloque condicional**
  - Sustituir el `<StatCard label="Perdidas" ... subItems={perdidasSubItems} />` actual
    por el mismo bloque condicional.
  - Cubierta por: R3, R4, R7, R8, R10, R12.

- [x] T7. **InboundView.jsx — eliminar `perdidasSubItems`**
  - Eliminar las líneas que calculan `perdidasSubItems` (actualmente líneas 83-86).
  - Verificar que no queda ninguna referencia a `perdidasSubItems` en el archivo.

- [x] T8. **InboundView.jsx — añadir variables para split**
  - Añadir las mismas cuatro variables `lostBusiness`, `lostOffhours`,
    `lostBusinessPct`, `lostOffhoursPct` con los mismos defaults `?? 0`.

- [x] T9. **InboundView.jsx — reemplazar StatCard 'Perdidas' con bloque condicional**
  - Sustituir el `<StatCard label="Perdidas" ... subItems={perdidasSubItems} />` actual
    por el mismo bloque condicional.
  - Cubierta por: R5, R6, R7, R8, R10, R12.

- [ ] T10. **Verificación manual — businessHours configurado**
  - Arrancar la app (`npm run dev:backend` + `npm run dev:frontend`).
  - Con `businessHours` presente en `config.json`, comprobar que Dashboard,
    HistoricalView e InboundView muestran DOS StatCards separadas ('Perdidas en
    horario' y 'Perdidas fuera de horario') sin subítems.
  - Confirmar que los porcentajes de ambas tarjetas suman aproximadamente el pct
    total anterior de 'Perdidas'.
  - Cubierta por: R1, R3, R5, R7, R11.

- [ ] T11. **Verificación manual — businessHours no configurado (fallback)**
  - Comentar o eliminar temporalmente `businessHours` de `config.json`.
  - Comprobar que las tres vistas muestran UNA sola StatCard 'Perdidas' con el
    total `ivr_hangup`, sin subítems, idéntica al comportamiento pre-feature.
  - Cubierta por: R2, R4, R6.

- [ ] T12. **Verificación manual — datos legacy sin breakdown**
  - Simular un payload donde `noAnswerBreakdown` no contiene `ivr_hangup_business`
    ni `ivr_hangup_offhours` (o pasar un objeto vacío).
  - Confirmar que con `businessHours` configurado ambas tarjetas muestran `0`
    sin error de consola.
  - Cubierta por: R8.

- [ ] T13. **Build de producción sin errores**
  - Ejecutar `npm run build` y verificar que termina sin errores de compilación
    ni advertencias de lint relevantes.
  - Cubierta por: R9, R12.
