# AGENTS.md — Mapa de navegación para agentes de IA

> Punto de entrada para cualquier agente. Es un **mapa**, no una biblia.
> Lee solo lo que necesites cuando lo necesites.

---

## 1. Antes de empezar (obligatorio)

1. Ejecuta `./init.sh` y verifica que termina sin errores críticos.
2. Lee `progress/current.md` para saber el estado de la última sesión.
3. Lee `feature_list.json`. Las features `"status": "done"` ya existen en el código.
   No las reimplementes. Empieza por la primera `"pending"` con `"sdd": true`.
4. Lee `docs/specs.md` antes de tocar cualquier spec.

---

## 2. Mapa del repositorio

| Archivo / carpeta | Qué contiene | Cuándo leerlo |
|---|---|---|
| `feature_list.json` | Estado de todas las features (`done` / `pending` / `spec_ready` / `in_progress` / `blocked`) | Siempre al empezar |
| `progress/current.md` | Estado de la sesión activa | Siempre al empezar |
| `progress/history.md` | Bitácora append-only | Si necesitas contexto histórico |
| `specs/<feature>/` | `requirements.md` + `design.md` + `tasks.md` | Antes de implementar |
| `docs/architecture.md` | Stack, estructura de carpetas, patrones del código existente, modelo de datos | Antes de implementar |
| `docs/conventions.md` | Estilo JS, nombres, patrones de error, SQL | Antes de escribir código |
| `docs/existing_code.md` | Inventario de lo que ya existe en v1.0 y cómo funciona | Antes de añadir cualquier feature |
| `docs/specs.md` | Proceso SDD: EARS, 3 archivos, puerta de aprobación humana | Antes de redactar specs |
| `docs/verification.md` | Cómo verificar que el trabajo funciona | Antes de declarar `done` |
| `CHECKPOINTS.md` | Criterios objetivos de estado final correcto | Para auto-evaluarte |
| `.claude/agents/` | Definiciones de subagentes | Si orquestas trabajo |
| `backend/` | API REST + SSE (Express + Node.js + MySQL) — **código existente** | Para implementar backend |
| `frontend/` | SPA (React + Vite + Tailwind) — **código existente** | Para implementar frontend |
| `tests/` | Tests (actualmente vacío — a poblar) | Para verificar |

---

## 3. Reglas duras (no negociables)

- **Una sola feature a la vez.** No mezcles cambios de varias en la misma sesión.
- **No reimplementes lo que ya está en `done`.** Lee `docs/existing_code.md` primero.
- **No declares `done` sin pruebas verdes** (`./init.sh` + tests).
- **No saltes la fase de spec ni la aprobación humana.**
- **Haz commit tras cada aprobación del reviewer, antes de iniciar la siguiente feature.**
- **Si no sabes algo, busca en `docs/`** antes de inventarlo.
- **No uses TypeScript ni cambies el bundler.** El proyecto es JavaScript puro.

---

## 4. Flujo de trabajo (SDD)

```
pending → [spec_author] → spec_ready → ⏸ HUMANO → in_progress → [implementer → reviewer] → git commit → done
```

1. El leader detecta la primera feature `pending` con `"sdd": true`.
2. El leader lanza `spec_author` → crea `specs/<name>/{requirements,design,tasks}.md` → `spec_ready`.
3. **Pausa.** El humano aprueba (o pide cambios).
4. Leader cambia a `in_progress` → lanza `implementer`.
5. El implementer ejecuta `tasks.md` una a una, marcando `[x]`.
6. El reviewer verifica trazabilidad `R<n>` ↔ test; aprueba o rechaza.
7. Leader ejecuta `git add -A && git commit -m "feat(<nombre>): <título>"`.
8. Marca `done`. Mueve resumen a `progress/history.md`.

---

## 5. Cierre de sesión

1. Ejecuta `./init.sh` — todo verde.
2. Si la feature está acabada: `done` en `feature_list.json`.
3. Mueve `progress/current.md` a `progress/history.md`.
4. Vacía `progress/current.md` con la plantilla.
5. No dejes `console.log` de debug ni TODOs sin contexto.

---

## 6. Si te bloqueas

- Relee `docs/existing_code.md` para entender el código base.
- Si hay incompatibilidad entre la spec y el código existente → documenta en
  `progress/current.md` y pide aclaración al humano, no asumas.
