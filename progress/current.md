# progress/current.md — Sesión activa

> Al cerrar la sesión, mover el contenido a progress/history.md y dejar solo esta plantilla.

---

## Estado

Sin feature en progreso. #23 aprobada, pendiente commit.

## Feature en progreso

Ninguna en `in_progress`. Última feature completada: #23
`dashboard_cards_restructure` (done, pendiente commit en esta sesión).

## Última acción / Próximo paso

#23 implementada y aprobada por el reviewer (342/342 tests, build ✅,
invariante total=ANSWERED+NO ANSWER+BUSY+FAILED por cola verificado,
nota sobre comentario desactualizado en disposition_agent_answered_fix.test.js
marcada no bloqueante). `feature_list.json` #23 ya marcada `done`.

Próximo paso: commit `feat(dashboard_cards_restructure): ...`. No quedan
features `pending`/`spec_ready`/`in_progress` en `feature_list.json` (#1-#23
todas `done`). A la espera de que el usuario añada nuevas features al backlog.

Pendiente fuera de código (acción manual del usuario en producción): añadir
la clase `reporting` a `read` en `manager.conf` del Issabel
(`read = system,call,agent,user,reporting`) + `asterisk -rx "manager reload"`,
para que `SIPpeers` funcione con el usuario AMI `monitor-readonly`.

## Bloqueos

_Ninguno._
