# progress/current.md — Sesión activa

> Al cerrar la sesión, mover el contenido a progress/history.md y dejar solo esta plantilla.

---

## Estado

Sin feature en progreso.

## Feature en progreso

_Ninguna._ Última feature completada: #19 `dashboard_extensions_chan_sip_fix`
(done, commit `feat(dashboard_extensions_chan_sip_fix): ...`).

## Última acción / Próximo paso

Todas las features de `feature_list.json` (#1-#19) están en `status: "done"`.
No hay features `pending`/`spec_ready`/`in_progress`. A la espera de que el
usuario añada nuevas features al backlog.

Pendiente fuera de código (acción manual del usuario en producción): añadir
la clase `reporting` a `read` en `manager.conf` del Issabel
(`read = system,call,agent,user,reporting`) + `asterisk -rx "manager reload"`,
para que `SIPpeers` funcione con el usuario AMI `monitor-readonly`.

## Bloqueos

_Ninguno._
