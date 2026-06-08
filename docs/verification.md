# docs/verification.md — Cómo verificar que el trabajo funciona

> Ejecutar en este orden antes de declarar cualquier feature como `done`.

---

## Orden de verificación

### 1. Tests (backend)
```bash
cd backend && npm test
```
- 0 tests fallidos.
- Cada `R<n>` tiene al menos un test.

### 2. Tests (frontend, si aplica)
```bash
cd frontend && npm test
```

### 3. Lint
```bash
cd backend  && npm run lint  # eslint si está configurado
cd frontend && npm run lint
```

### 4. Build frontend
```bash
cd frontend && npm run build
```
Sin errores. El directorio `frontend/dist/` se genera correctamente.

### 5. Arranque completo
```bash
./init.sh
```
Exit code 0. El servidor arranca, se conecta a SQLite, inicia el polling.

### 6. Verificación de spec
- Abre `specs/<feature>/tasks.md` → todos los ítems `[x]`.
- Abre `specs/<feature>/requirements.md` → cada `R<n>` tiene un test que lo nombra.

---

## Verificación de no-regresión

Antes de hacer el commit, confirmar que los endpoints **existentes** siguen funcionando:

```bash
# Con el servidor arrancado localmente:
curl -s -X POST http://localhost:4000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin123"}' | grep '"ok":true'

curl -s http://localhost:4000/api/calls/today \
  -H 'Cookie: connect.sid=<sesion>' | grep '"ok":true'
```

Si alguno falla, **no hacer commit**.

---

## Checklist de seguridad rápida

Antes de cerrar cualquier feature con endpoints:
- [ ] Endpoints privados usan `requireAuth` o `requireAdmin`.
- [ ] Inputs validados (tipo, longitud, rango) antes de llegar a la BD.
- [ ] Queries con parámetros preparados (`?`), nunca concatenación.
- [ ] Archivos subidos: MIME validado, tamaño limitado.
- [ ] No hay datos sensibles en logs ni en respuestas JSON.

---

## Informe de implementación (plantilla)

Crear `progress/impl_<feature>.md` al terminar:

```markdown
# Implementación — <feature>

## Archivos modificados/creados
- backend/routes/nuevo.js
- backend/tests/nuevo.test.js
- frontend/src/components/Nuevo.jsx
- (una línea en server.js y App.jsx)

## Trazabilidad R<n> → test
| Requisito | Test | Archivo:línea |
|---|---|---|
| R1 | R1 - describe... | tests/nuevo.test.js:42 |

## Resultado
- Tests: ✅ X/X passing
- Build frontend: ✅
- No-regresión: ✅
```
