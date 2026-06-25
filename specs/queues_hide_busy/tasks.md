# Tasks — `queues_hide_busy` (Feature #49)

Ejecutar en orden. Cada tarea es independiente del entorno de ejecución salvo
que se indique dependencia explícita.

---

## T1 — Backend: excluir filas BUSY del loop de `queryQueues`

**Archivo:** `backend/server.js`
**Función:** `queryQueues` (~línea 347)

Añadir un guard `continue` para filas con `disposition = 'BUSY'` inmediatamente
después de los dos filtros existentes (`passesFilter` y `validDsts.has`), antes
de calcular `key` y antes de cualquier acumulación.

```js
// Antes de la línea: const key = queues.includes(r.dst) ? r.dst : '__lost__';
if (r.disposition.toUpperCase() === 'BUSY') continue;  // #49
```

Verificar que el guard queda en esta posición exacta dentro del loop:

```js
for (const r of rows) {
  if (!passesFilter(r.channel, inboundChannels, outboundChannels, 'in')) continue;
  if (!validDsts.has(r.dst)) continue;
  if (r.disposition.toUpperCase() === 'BUSY') continue;  // <-- añadido
  const key = queues.includes(r.dst) ? r.dst : '__lost__';
  const targetKey = resolveDisposition(r, lostDests);
  if (targetKey) {
    result[key][targetKey] += Number(r.count);
  }
  result[key].total += Number(r.count);
}
```

- [x] Añadir la línea `if (r.disposition.toUpperCase() === 'BUSY') continue;` con comentario `// #49`

---

## T2 — Backend: eliminar campo `BUSY` de los inicializadores de `queryQueues`

**Archivo:** `backend/server.js`
**Función:** `queryQueues` (~líneas 343-345)

Eliminar `BUSY: 0` de los dos objetos inicializadores de `result`:

```js
// Antes:
result[q] = { queue: q, label: `Cola ${q}`, total: 0, ANSWERED: 0, 'NO ANSWER': 0, BUSY: 0, FAILED: 0 };
result['__lost__'] = { queue: '__lost__', label: 'Perdidas', total: 0, ANSWERED: 0, 'NO ANSWER': 0, BUSY: 0, FAILED: 0 };

// Después:
result[q] = { queue: q, label: `Cola ${q}`, total: 0, ANSWERED: 0, 'NO ANSWER': 0, FAILED: 0 };
result['__lost__'] = { queue: '__lost__', label: 'Perdidas', total: 0, ANSWERED: 0, 'NO ANSWER': 0, FAILED: 0 };
```

- [x] Eliminar `BUSY: 0` del inicializador del loop `for (const q of queues)`
- [x] Eliminar `BUSY: 0` del inicializador de `result['__lost__']`

---

## T3 — Frontend: eliminar etiqueta "Ocupado" de `QueueCard` en `Dashboard.jsx`

**Archivo:** `frontend/src/components/Dashboard.jsx`
**Componente:** `QueueCard` (~línea 67-70)

Eliminar el `<span>` que muestra `queue.BUSY` dentro del bloque de desglose de
una cola no-perdida. El bloque resultante debe quedar con solo una entrada:

```jsx
// Antes:
<div className="flex justify-between text-xs text-slate-600">
  <span>No contest.: <span className="text-amber-400">{queue['NO ANSWER'] ?? 0}</span></span>
  <span>Ocupado: <span className="text-red-400">{queue.BUSY ?? 0}</span></span>
</div>

// Después:
<div className="flex justify-between text-xs text-slate-600">
  <span>No contest.: <span className="text-amber-400">{queue['NO ANSWER'] ?? 0}</span></span>
</div>
```

- [x] Eliminar `<span>Ocupado: <span className="text-red-400">{queue.BUSY ?? 0}</span></span>` de `Dashboard.jsx`

---

## T4 — Frontend: eliminar etiqueta "Ocupado" de `QueueCard` en `InboundView.jsx`

**Archivo:** `frontend/src/components/InboundView.jsx`
**Componente:** `QueueCard` (~línea 50-53)

Mismo cambio que T3 pero en la copia local de `QueueCard` de `InboundView.jsx`:

```jsx
// Antes:
<div className="flex justify-between text-xs text-slate-600">
  <span>No contest.: <span className="text-amber-400">{queue['NO ANSWER'] ?? 0}</span></span>
  <span>Ocupado: <span className="text-red-400">{queue.BUSY ?? 0}</span></span>
</div>

// Después:
<div className="flex justify-between text-xs text-slate-600">
  <span>No contest.: <span className="text-amber-400">{queue['NO ANSWER'] ?? 0}</span></span>
</div>
```

- [x] Eliminar `<span>Ocupado: <span className="text-red-400">{queue.BUSY ?? 0}</span></span>` de `InboundView.jsx`

---

## T5 — Verificación manual

Con los cambios de T1-T4 aplicados:

- [x] Arrancar backend en modo desarrollo: `npm run dev:backend`
- [x] Arrancar frontend en modo desarrollo: `npm run dev:frontend`
- [x] Abrir Dashboard (`/`) y verificar que los statcards de colas no muestran "Ocupado"
- [x] Abrir InboundView y verificar lo mismo
- [x] Confirmar que el campo `queues[n].BUSY` no aparece en el payload del endpoint
  `GET /api/calls/today` (abrir DevTools → Network → buscar la llamada)
- [x] Verificar que `total` de cada cola es igual a `ANSWERED + 'NO ANSWER' + FAILED`

---

## T6 — Build de producción

- [x] Ejecutar `npm run build` desde la raíz del proyecto
- [x] Confirmar que el build termina sin errores ni warnings de ESLint relevantes

---

## Notas para el implementer

- T1 y T2 son cambios en el mismo archivo (`server.js`), en la misma función
  (`queryQueues`). Pueden hacerse en un solo paso de edición.
- T3 y T4 son cambios simétricos en dos archivos distintos. El JSX a eliminar
  es idéntico en ambos.
- **No tocar** `resolveDisposition`, `queryStats`, `queryChannels`, `queryHourly`
  ni ningún otro componente.
- El guard de T1 utiliza `r.disposition.toUpperCase()` para ser robusto frente
  a valores en minúsculas en la BD (`busy`, `Busy`, etc.).
