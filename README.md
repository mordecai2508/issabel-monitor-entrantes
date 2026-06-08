# Arnés — Issabel Monitor Analytics

Arnés de desarrollo basado en **Harness Engineering** para la segunda fase del
sistema `issabel-monitor-entrantes`. Aplica Spec Driven Development sobre un
proyecto existente.

> El código de la aplicación (v1.0) vive en `backend/` y `frontend/`, clonado desde
> `https://github.com/mordecai2508/issabel-monitor-entrantes`. El arnés **no
> reescribe** lo existente; solo añade features pendientes de forma controlada.

---

## Setup en 3 pasos

```bash
# 1. Clonar el repositorio existente en la raíz del arnés
git clone https://github.com/mordecai2508/issabel-monitor-entrantes.git .

# 2. Copiar los archivos del arnés (AGENTS.md, CLAUDE.md, feature_list.json, etc.)
#    encima del repo clonado — no sobreescribe backend/ ni frontend/

# 3. Verificar el entorno
./init.sh
```

Si todo está verde, abre `AGENTS.md` y sigue desde ahí.

---

## Estado del proyecto

### ✅ Implementado (v1.0)

| Feature | Descripción |
|---|---|
| `auth_session` | Login/logout/sesión httpOnly, roles admin/monitor |
| `dashboard_today` | KPIs del día, gráfico horario, distribución por canal, SSE |
| `inbound_view_basic` | Tabla de entrantes por canal con rango de fechas |
| `outbound_view_basic` | Tabla de salientes con rango de fechas |
| `historical_view_basic` | Consulta por rango personalizado |
| `channel_alias` | Admin renombra canales/troncales |
| `infra_docker` | Dockerfile + docker-compose |

### 🔲 Pendiente (nuevas features)

| # | Feature | Descripción | RF |
|---|---|---|---|
| 8 | `user_management` | CRUD de usuarios en SQLite + auditoría | RF-06 |
| 9 | `inbound_filters_export` | Filtros avanzados + exportar Excel/PDF | RF-02 |
| 10 | `outbound_filters_export` | Filtros avanzados + exportar Excel/PDF | RF-03 |
| 11 | `historical_analytics` | Comparativas, rankings, tendencias | RF-04 |
| 12 | `reports_module` | Reportes PDF/Excel con logo | RF-07 |
| 13 | `system_config` | Config empresa, logo, tema, extensiones | RF-05 |
| 14 | `pbx_health` | Estado conexión PBX + sync manual | RF-08 |
| 15 | `alerts_monitoring` | Alertas + notificaciones email | RF-09 |

---

## Cómo está organizado el arnés

| Pilar | Manifestación |
|---|---|
| **El repositorio ES el sistema** | `AGENTS.md`, `init.sh`, `feature_list.json`, `specs/`, `progress/`, `docs/` |
| **Orquestación multi-agente** | `.claude/agents/leader.md`, `spec_author.md`, `implementer.md`, `reviewer.md` |
| **Spec Driven Development** | `docs/specs.md`, EARS notation, puerta de aprobación humana |
| **No romper v1.0** | `docs/existing_code.md`, C3 en `CHECKPOINTS.md`, regla de no-regresión en `reviewer.md` |
| **Commit obligatorio** | Tras cada aprobación del reviewer, antes de iniciar la siguiente feature |

---

## Estructura completa

```
.
├── AGENTS.md                    # Mapa para agentes
├── CHECKPOINTS.md               # 8 criterios de estado final correcto
├── CLAUDE.md                    # Instrucciones para Claude Code (rol leader)
├── feature_list.json            # 7 done (v1.0) + 8 pending (nuevas features)
├── init.sh                      # Verificación de entorno
├── specs/<feature>/             # Spec por feature (EARS + design + tasks)
├── progress/
│   ├── current.md               # Sesión activa
│   └── history.md               # Bitácora append-only
├── docs/
│   ├── architecture.md          # Stack, capas, patrón de routers, SQLite schema
│   ├── conventions.md           # Estilo JS, SQL, nombres, tests
│   ├── existing_code.md         # Inventario de v1.0 (lo que NO hay que reimplementar)
│   ├── specs.md                 # Proceso SDD: EARS, 3 archivos, puerta humana
│   └── verification.md          # Cómo probar, no-regresión, checklist seguridad
├── .claude/
│   ├── agents/                  # leader, spec_author, implementer, reviewer
│   └── settings.json            # Permisos + hooks
├── backend/                     # (clonado de v1.0)
└── frontend/                    # (clonado de v1.0)
```

---

## Flujo de trabajo

```
pending → [spec_author] → spec_ready → ⏸ HUMANO → in_progress → [implementer → reviewer] → git commit → done
```

**La puerta humana** (`spec_ready`) es obligatoria porque este es un proyecto
existente: el humano valida que la spec no rompa nada de v1.0 antes de que
el implementer toque código.
