# progress/current.md — Sesión activa

> Al cerrar la sesión, mover el contenido a progress/history.md y dejar solo esta plantilla.

---

## Estado

Sin feature en progreso. #24 aprobada, pendiente commit.

## Feature en progreso

Ninguna en `in_progress`. Última feature completada: #24
`dashboard_perdidas_no_contestadas_split` (done, pendiente commit en esta
sesión).

## Última acción / Próximo paso

#24 implementada y aprobada por el reviewer (backend 342/342 sin tocar,
build frontend ✅, invariantes Perdidas+NoContestadas=NO ANSWER.count y
Total=Contestadas+Perdidas+NoContestadas+Ocupado+Fallidas verificados).
`feature_list.json` #24 ya marcada `done`.

Próximo paso: commit `feat(dashboard_perdidas_no_contestadas_split): ...`. No
quedan features `pending`/`spec_ready`/`in_progress` en `feature_list.json`
(#1-#24 todas `done`). A la espera de que el usuario añada nuevas features al
backlog.

Deuda técnica documentada (no bloqueante, sin feature abierta todavía):
`frontend/src/components/Dashboard.test.jsx` tiene 2 tests preexistentes de
#23 que fallan (`getByText('Activas')` en el bloque "indicadores de
extensiones AMI R14-R17") porque `ExtensionsStatusCard` ya no renderiza un
label "Activas" independiente. Confirmado por el reviewer de #24 que es
preexistente de #23 (commit `311bbd9`), no introducido ni empeorado por #24.

Pendiente fuera de código (acción manual del usuario en producción): añadir
la clase `reporting` a `read` en `manager.conf` del Issabel
(`read = system,call,agent,user,reporting`) + `asterisk -rx "manager reload"`,
para que `SIPpeers` funcione con el usuario AMI `monitor-readonly`.

## Bloqueos

_Ninguno._
