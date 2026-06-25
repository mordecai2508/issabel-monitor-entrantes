# Review Feature #49 — queues_hide_busy

**Fecha:** 2026-06-25
**Revisor:** reviewer (agente)
**Resultado:** APROBADO

---

## Verificaciones

### R1 — `if (r.disposition.toUpperCase() === 'BUSY') continue;` en posición correcta
**PASS**

Línea 350 de `backend/server.js`:
```js
  for (const r of rows) {
    if (!passesFilter(r.channel, inboundChannels, outboundChannels, 'in')) continue;  // L348
    if (!validDsts.has(r.dst)) continue;                                               // L349
    if (r.disposition.toUpperCase() === 'BUSY') continue;  // #49                     // L350  ✓
    const key = queues.includes(r.dst) ? r.dst : '__lost__';                           // L351
```
Ubicado correctamente: después de `passesFilter` y `validDsts.has`, antes de `const key = ...`.

---

### R2 — Inicializadores de `result[q]` y `result['__lost__']` NO contienen `BUSY: 0`
**PASS**

Líneas 343–345:
```js
result[q] = { queue: q, label: `Cola ${q}`, total: 0, ANSWERED: 0, 'NO ANSWER': 0, FAILED: 0 };
result['__lost__'] = { queue: '__lost__', label: 'Perdidas', total: 0, ANSWERED: 0, 'NO ANSWER': 0, FAILED: 0 };
```
Ningún inicializador contiene `BUSY: 0`.

---

### R3 — `Dashboard.jsx` no contiene `<span>Ocupado:` ni `queue.BUSY`
**PASS**

Búsqueda retorna 0 coincidencias para `BUSY` u `Ocupado` en `frontend/src/components/Dashboard.jsx`.

---

### R4 — `InboundView.jsx` no contiene `<span>Ocupado:` ni `queue.BUSY`
**PASS**

Búsqueda retorna 0 coincidencias para `BUSY` u `Ocupado` en `frontend/src/components/InboundView.jsx`.

---

### R5 — Build sin errores
**PASS**

```
✓ 2321 modules transformed.
✓ built in 10.07s
```
Solo advertencia de tamaño de chunk (> 500 kB), que es pre-existente y no constituye un error de compilación.

---

## Conclusión

Todos los requisitos R1–R5 verificados correctamente. La feature #49 `queues_hide_busy` está correctamente implementada y lista para commit.
