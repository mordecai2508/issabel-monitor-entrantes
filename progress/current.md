# progress/current.md — Sesión activa

> Al cerrar la sesión, mover el contenido a progress/history.md y dejar solo esta plantilla.

---

## Estado

Sin feature en progreso. #22 aprobada, pendiente commit.

## Feature en progreso

Ninguna en `in_progress`. Última feature completada: #22
`dashboard_unanswered_breakdown` (done, pendiente commit en esta sesión).

## Última acción / Próximo paso

#22 implementada y aprobada por el reviewer (331/331 tests, build ✅,
no-regresión sobre #17/#20/#21 OK). `feature_list.json` #22 ya marcada `done`.

Próximo paso: commit `feat(dashboard_unanswered_breakdown): ...`. No quedan
features `pending`/`spec_ready`/`in_progress` en `feature_list.json` (#1-#22
todas `done`). A la espera de que el usuario añada nuevas features al backlog.

Pendiente fuera de código (acción manual del usuario en producción): añadir
la clase `reporting` a `read` en `manager.conf` del Issabel
(`read = system,call,agent,user,reporting`) + `asterisk -rx "manager reload"`,
para que `SIPpeers` funcione con el usuario AMI `monitor-readonly`.

## Bloqueos

_Ninguno._
