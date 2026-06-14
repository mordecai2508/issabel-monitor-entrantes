# progress/current.md — Sesión activa

> Al cerrar la sesión, mover el contenido a progress/history.md y dejar solo esta plantilla.

---

## Estado

Sin feature en progreso. #21 aprobada, pendiente commit.

## Feature en progreso

Ninguna en `in_progress`. Última feature completada: #21
`disposition_agent_answered_fix` (done, pendiente commit en esta sesión).

## Última acción / Próximo paso

#21 implementada y aprobada por el reviewer (318/318 tests, build ✅,
no-regresión sobre #20 OK). `feature_list.json` #21 ya marcada `done`.

Próximo paso: commit `feat(disposition_agent_answered_fix): ...`. No quedan
features `pending`/`spec_ready`/`in_progress` en `feature_list.json` (#1-#21
todas `done`). A la espera de que el usuario añada nuevas features al backlog.

Pendiente fuera de código (acción manual del usuario en producción): añadir
la clase `reporting` a `read` en `manager.conf` del Issabel
(`read = system,call,agent,user,reporting`) + `asterisk -rx "manager reload"`,
para que `SIPpeers` funcione con el usuario AMI `monitor-readonly`.

## Bloqueos

_Ninguno._
