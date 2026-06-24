# Review #38 — perdidas_split_statcards

**Resultado: APROBADO**

Fecha: 2026-06-24

---

## Verificaciones

### R1 (Dashboard — split cuando businessHours != null)
PASS. Líneas 192-223: bloque condicional `{businessHours ? (<> ... </>) : ...}` renderiza DOS StatCards independientes ('Perdidas en horario' con `color="red"` y 'Perdidas fuera de horario' con `color="slate"`). Sin prop `subItems`.

### R2 (Dashboard — fallback cuando businessHours === null)
PASS. Bloque else renderiza una única StatCard `label="Perdidas"` con `value={lost}` (ivr_hangup total) y `color="red"`. Comportamiento idéntico al pre-feature.

### R3 (HistoricalView — split cuando businessHours != null)
PASS. Líneas 163-194: misma estructura condicional. DOS StatCards independientes, sin `subItems`.

### R4 (HistoricalView — fallback cuando businessHours === null)
PASS. Bloque else con StatCard única 'Perdidas'.

### R5 (InboundView — split cuando businessHours != null)
PASS. Líneas 127-158: misma estructura condicional. DOS StatCards independientes, sin `subItems`.

### R6 (InboundView — fallback cuando businessHours === null)
PASS. Bloque else con StatCard única 'Perdidas'.

### R7 (Porcentaje calculado sobre total general)
PASS. Fórmula `Math.round((lostBusiness / total) * 1000) / 10` usada en los tres componentes, consistente con el resto de StatCards.

### R8 (Nullish coalescing para datos legacy)
PASS. Todas las variables usan `?? 0`:
- `noAnswerBreakdown.ivr_hangup_business ?? 0`
- `noAnswerBreakdown.ivr_hangup_offhours ?? 0`

### R9 (Sin cambios en backend)
PASS. El HEAD commit del backend (d26a0f2 y anteriores) no incluye los tres archivos revisados. Los archivos modificados son exclusivamente frontend.

### R10 (StatCards del split sin prop subItems)
PASS. Ninguna de las StatCards del split en los tres componentes pasa prop `subItems`. Verificado con grep — ninguna referencia a `perdidasSubItems` ni `subItems` en Dashboard.jsx, HistoricalView.jsx, InboundView.jsx.

### R12 (StatCard.jsx no modificado)
PASS. `git log` muestra que StatCard.jsx solo tiene el commit `d26a0f2` en su historial, anterior a esta feature. Su API (`subItems` como prop opcional) permanece intacta.

### T1/T4/T7 (eliminación de perdidasSubItems)
PASS. Grep sobre `frontend/src` no retornó ningún resultado para `perdidasSubItems`.

### T13 / Build de producción
PASS. `npm run build` termina sin errores de compilación. Única advertencia: chunk size > 500 kB (preexistente, no relacionada con esta feature).

---

## Variables definidas con defaults correctos

Confirmado en los tres componentes:
```js
const lostBusiness    = noAnswerBreakdown.ivr_hangup_business ?? 0;
const lostOffhours    = noAnswerBreakdown.ivr_hangup_offhours ?? 0;
const lostBusinessPct = total > 0 ? Math.round((lostBusiness / total) * 1000) / 10 : 0;
const lostOffhoursPct = total > 0 ? Math.round((lostOffhours / total) * 1000) / 10 : 0;
```

---

## Observaciones menores (no bloquean aprobación)

- En Dashboard.jsx, la grid con businessHours activo muestra: Contestadas + No Contestadas + Perdidas en horario + Perdidas fuera de horario = 4 tarjetas. El grid tiene `lg:grid-cols-4`, encaja correctamente.
- En HistoricalView.jsx con businessHours activo: Total + Contestadas + Perdidas en horario + Perdidas fuera de horario = 4 tarjetas, más la StatCard 'No Contestadas' que queda en posición 5. Esto resulta en un grid de 5 elementos con `lg:grid-cols-4` — la quinta tarjeta ('No Contestadas') se desplaza a una segunda fila. Es un comportamiento visual aceptable y no es un bug funcional.

---

**Veredicto final: Review aprobado #38**
