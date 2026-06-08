# CHECKPOINTS — Evaluación del estado final

> Criterios objetivos que un juez (humano o IA) puede verificar.
> El reviewer los recorre antes de aprobar cada feature.

---

## C1 — El arnés está completo

- [ ] Existen los archivos base: `AGENTS.md`, `init.sh`, `feature_list.json`, `progress/current.md`.
- [ ] Existen los docs: `docs/architecture.md`, `docs/conventions.md`, `docs/specs.md`, `docs/verification.md`, `docs/existing_code.md`.
- [ ] `./init.sh` termina con exit code 0.

---

## C2 — El estado es coherente

- [ ] Como mucho una feature `in_progress` en `feature_list.json`.
- [ ] Toda feature `done` (excepto las 7 de v1.0) tiene tests asociados que pasan.
- [ ] `progress/current.md` describe la sesión activa o está vacío con la plantilla.

---

## C3 — No se rompió v1.0

- [ ] Los 9 endpoints originales responden correctamente (ver checklist en `docs/verification.md`).
- [ ] El SSE sigue emitiendo eventos `init` y `update`.
- [ ] El frontend existente sigue compilando con `npm run build`.
- [ ] El Docker container arranca sin errores con la configuración original.

---

## C4 — El código sigue las convenciones

- [ ] Ninguna nueva query SQL usa concatenación de strings (solo parámetros `?`).
- [ ] No hay `console.log` de debug.
- [ ] No hay `fetch()` directo en componentes React (todo pasa por `api.js`).
- [ ] Los nuevos routers usan el patrón factory `(pool, config, db) => router`.
- [ ] Las nuevas tablas SQLite están definidas en `backend/db/setup.js`.
- [ ] No se introdujo TypeScript.

---

## C5 — La verificación es real

- [ ] `cd backend && npm test` → 0 fallos.
- [ ] `cd frontend && npm run build` → sin errores.
- [ ] Cada `R<n>` del spec tiene al menos un test que lo nombra explícitamente.
- [ ] Todas las tasks de `tasks.md` están marcadas `[x]`.

---

## C6 — El commit está hecho

- [ ] Tras la aprobación del reviewer, se ejecutó `git add -A && git commit -m "feat(<feature>): <título>"`.
- [ ] El working tree está limpio (`git status` muestra nada pendiente).
- [ ] La feature está marcada `done` en `feature_list.json` **después** del commit.

---

## C7 — Spec Driven Development

- [ ] Toda feature `done` con `"sdd": true` tiene `specs/<name>/{requirements,design,tasks}.md`.
- [ ] `requirements.md` usa EARS notation con requisitos numerados `R<n>`.
- [ ] Cada `R<n>` está cubierto por al menos un test concreto.

---

## C8 — Seguridad

- [ ] Endpoints privados protegidos con `requireAuth` o `requireAdmin`.
- [ ] Si la feature maneja usuarios: contraseñas hasheadas con bcrypt.
- [ ] Si hay subida de archivos: MIME y tamaño validados.
- [ ] La BD de Issabel (CDR) solo tiene operaciones SELECT.

---

**Uso:** el `reviewer` recorre estos checkboxes, marca `[x]` o `[ ]`, y rechaza
el cierre si queda alguno vacío en C1–C8.
