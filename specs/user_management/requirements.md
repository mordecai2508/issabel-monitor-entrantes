# requirements.md — user_management

> Notación EARS. Cada requisito describe el QUÉ, no el CÓMO.

---

## Alcance

Gestión completa del ciclo de vida de usuarios del sistema (CRUD + reset de contraseña),
migración automática desde `config.json` hacia una base de datos local persistente,
y registro de auditoría de accesos (login / logout) con IP y timestamp.

---

## Requisitos funcionales

### Migración de usuarios

R1. WHEN the system starts for the first time after this feature is deployed
    THE SYSTEM SHALL automatically migrate all users found in `config.json`
    into the local users table, preserving their id, username, hashed password,
    and role, without requiring manual intervention.

R2. IF a user from `config.json` already exists in the local users table
    (matched by username)
    THEN THE SYSTEM SHALL skip that user during migration and not overwrite
    existing data.

R3. WHEN the migration completes
    THE SYSTEM SHALL continue to boot normally and serve all existing endpoints
    without any observable change in behavior for currently authenticated users.

---

### Listado de usuarios

R4. WHEN an administrator requests the list of users
    THE SYSTEM SHALL return all users with the following fields for each:
    id, username, role, active (boolean), last_login (ISO timestamp or null).

R5. IF a user with role `operador` requests the list of users
    THEN THE SYSTEM SHALL deny access with HTTP 403 and an explanatory message.

R6. IF an unauthenticated request is made to any `/api/admin/*` endpoint
    THEN THE SYSTEM SHALL respond with HTTP 401.

---

### Creación de usuario

R7. WHEN an administrator submits a request to create a new user with a username,
    password, and role (admin or operador)
    THE SYSTEM SHALL persist the user with the password stored as a bcrypt hash
    and respond with HTTP 201 and the created user's id, username, role, and active status.

R8. IF the username provided for a new user already exists in the system
    THEN THE SYSTEM SHALL reject the request with HTTP 409 and an explanatory message.

R9. IF the role provided for a new user is not one of `admin` or `operador`
    THEN THE SYSTEM SHALL reject the request with HTTP 400 and an explanatory message.

R10. IF any required field (username, password, role) is missing or blank in a
     create request
     THEN THE SYSTEM SHALL reject the request with HTTP 400 and an explanatory message.

R11. IF the password provided for a new user is shorter than 8 characters
     THEN THE SYSTEM SHALL reject the request with HTTP 400 and an explanatory message.

---

### Edición de usuario

R12. WHEN an administrator submits a PATCH request for an existing user
     THE SYSTEM SHALL update only the fields provided in the request body
     (username, role, and/or active) and respond with HTTP 200 and the updated user data.

R13. IF the administrator attempts to change a username to one that already belongs
     to another user
     THEN THE SYSTEM SHALL reject the request with HTTP 409 and an explanatory message.

R14. IF the administrator attempts to edit a user id that does not exist
     THEN THE SYSTEM SHALL respond with HTTP 404 and an explanatory message.

R15. IF the new role value is not one of `admin` or `operador`
     THEN THE SYSTEM SHALL reject the request with HTTP 400 and an explanatory message.

R16. IF the administrator deactivates (active = false) the only remaining active admin user
     THEN THE SYSTEM SHALL reject the request with HTTP 409 to prevent lockout.

---

### Reset de contraseña

R17. WHEN an administrator requests a password reset for an existing user
     THE SYSTEM SHALL generate a cryptographically random temporary password,
     store its bcrypt hash in the users table, and respond with HTTP 200
     containing the temporary password in plain text (visible only once).

R18. IF the administrator requests a password reset for a user id that does not exist
     THEN THE SYSTEM SHALL respond with HTTP 404 and an explanatory message.

---

### Auditoría de accesos

R19. WHEN a user successfully authenticates
     THE SYSTEM SHALL record an audit log entry with: user_id, action = `login`,
     client IP address, and current timestamp.

R20. WHEN a user logs out
     THE SYSTEM SHALL record an audit log entry with: user_id, action = `logout`,
     client IP address, and current timestamp.

R21. WHEN a login attempt fails due to incorrect credentials
     THE SYSTEM SHALL record an audit log entry with: user_id = null (or the attempted
     username in a separate field), action = `login_failed`,
     client IP address, and current timestamp.

R22. WHEN an administrator requests the audit log
     THE SYSTEM SHALL return the most recent 200 entries, ordered from newest
     to oldest, each containing: id, user_id, username (resolved), action, ip, timestamp.

R23. IF a user with role `operador` requests the audit log
     THEN THE SYSTEM SHALL deny access with HTTP 403.

---

### Acceso denegado a operadores

R24. IF a user with role `operador` calls any endpoint under `/api/admin/*`
     THEN THE SYSTEM SHALL respond with HTTP 403 and an explanatory message.
     (This requirement applies universally, not only to user management endpoints.)

---

### Login con fuente de datos migrada

R25. WHEN a user attempts to log in after the migration
     THE SYSTEM SHALL authenticate against the local users table and NOT against
     `config.json`.

R26. IF the user account is marked as inactive (active = false)
     THEN THE SYSTEM SHALL reject the login attempt with HTTP 401 and indicate
     that the account is disabled.

---

## Requisitos no funcionales

R27. THE SYSTEM SHALL hash all passwords using bcrypt with a cost factor of 12
     before persisting them.

R28. THE SYSTEM SHALL never return a user's hashed password in any API response.

R29. THE SYSTEM SHALL respond to all user management and audit endpoints
     within 2 seconds under normal load.

R30. THE SYSTEM SHALL store user and audit data in the local SQLite database,
     independent of the Issabel MySQL database, and never write to the
     Issabel database.
