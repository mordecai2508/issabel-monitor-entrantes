# progress/current.md — Sesión activa

> Al cerrar la sesión, mover el contenido a progress/history.md y dejar solo esta plantilla.

---

## Estado

Sin feature en progreso.

## Feature en progreso

_Ninguna._ Última feature completada: #20 `channels_inbound_outbound_split`
(done, pendiente commit de git en esta sesión).

## Última acción / Próximo paso

#20 aprobada por el reviewer (297/297 tests, build ✅). Pendiente: commit
`feat(channels_inbound_outbound_split): ...`, luego marcar `done` (ya hecho
en feature_list.json) e iniciar #21.

Siguiente feature pendiente: **#21 `disposition_agent_answered_fix`**
(sdd:true, status: pending, sin spec todavía) — distinguir llamadas atendidas
por un agente real (dstchannel=Agent/<n> o SIP/<extensión numérica>-xxxx) de
llamadas solo contestadas por IVR/cola sin agente (disposition='ANSWERED' pero
sin bridge a agente), reclasificándolas a 'Perdidas' de forma consistente en
queryStats/queryChannels/queryHourly. Próximo paso: lanzar `spec_author` para
specs/disposition_agent_answered_fix/.

Pendiente fuera de código (acción manual del usuario en producción): añadir
la clase `reporting` a `read` en `manager.conf` del Issabel
(`read = system,call,agent,user,reporting`) + `asterisk -rx "manager reload"`,
para que `SIPpeers` funcione con el usuario AMI `monitor-readonly`.

## Bloqueos

_Ninguno._
