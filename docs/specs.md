# docs/specs.md — Proceso Spec Driven Development (SDD)

> Leer completo antes de redactar o revisar cualquier spec.

---

## Por qué SDD en este proyecto

El sistema ya tiene código existente (v1.0). Sin un spec aprobado, los agentes
corren el riesgo de reimplementar lo que ya existe, romper endpoints en uso o
tomar decisiones de diseño incompatibles con la arquitectura actual. El flujo SDD
garantiza que **el humano aprueba el diseño antes de tocar el código**.

---

## Los 3 archivos de cada spec

Para toda feature con `"sdd": true`, el `spec_author` crea `specs/<name>/`:

### 1. `requirements.md` — El QUÉ (EARS notation)

Plantillas:
- `WHEN <trigger> THE SYSTEM SHALL <response>`
- `IF <condition> THEN THE SYSTEM SHALL <response>`
- `THE SYSTEM SHALL <response>`
- `WHILE <state> THE SYSTEM SHALL <response>`

Numerar: `R1`, `R2`, `R3`…

**Ejemplo para `inbound_filters_export`:**
```
R1. WHEN the operator applies filters (date range, trunk, origin, disposition)
    THE SYSTEM SHALL return only CDR records matching all active filters.
R2. WHEN the operator requests Excel export
    THE SYSTEM SHALL generate and download an .xlsx file with all filtered results
    (maximum 10,000 rows).
R3. IF no records match the filters THEN THE SYSTEM SHALL return an empty result
    with HTTP 200 and meta.total = 0.
```

**Reglas:**
- Un requisito = una sola idea.
- No mencionar implementación (exceljs, pdfkit, etc.).
- Cubrir flujos de error y casos límite.
- Incluir los RNF relevantes (rendimiento, seguridad).

---

### 2. `design.md` — El CÓMO

Responde en secciones:

1. **Endpoints nuevos** — tabla: método, ruta, auth, payload entrada, payload salida, HTTP code.
2. **Cambios en BD** — tablas SQLite nuevas o modificadas; si toca CDR, las queries nuevas.
3. **Dependencias nuevas** — npm packages a instalar con justificación.
4. **Lógica no obvia** — describe pasos del servicio complejos (p.ej. generación de PDF).
5. **Componentes frontend** — pantallas nuevas, props, navegación.
6. **Decisión técnica** — opción elegida vs alternativa descartada + razón.
7. **Compatibilidad con v1.0** — confirmar que no se rompen endpoints existentes.

---

### 3. `tasks.md` — El CHECKLIST

Lista ordenada. El implementer los sigue en orden marcando `[x]`.

**Orden estándar:**
```markdown
- [ ] T1. Instalar dependencias npm nuevas (si aplica)
- [ ] T2. Crear/actualizar tablas SQLite en backend/db/setup.js
- [ ] T3. Crear servicio backend/services/<nombre>Service.js
- [ ] T4. Crear router backend/routes/<nombre>.js con los endpoints
- [ ] T5. Registrar el router en server.js (una línea de require)
- [ ] T6. Escribir tests backend/tests/<nombre>.test.js (R1, R2, R3...)
- [ ] T7. Crear componente(s) frontend
- [ ] T8. Añadir ruta en App.jsx y entrada en sidebar de Layout.jsx
- [ ] T9. Verificación: npm test verde, lint sin errores, build sin errores
```

---

## Puerta de aprobación humana

```
spec_author → spec_ready → ⏸ HUMANO APRUEBA → in_progress → implementer
```

El humano verifica:
1. `requirements.md` — ¿cubre todos los criterios de aceptación del feature_list.json?
2. `design.md` — ¿es compatible con la arquitectura existente? ¿no rompe v1.0?
3. `tasks.md` — ¿la descomposición es ejecutable y completa?

---

## Trazabilidad obligatoria

Cada `R<n>` debe aparecer nombrado en al menos un test:
```js
it('R1 - debe filtrar por troncal y retornar solo registros del canal indicado', () => { ... });
```
El reviewer rechaza si falta trazabilidad.
