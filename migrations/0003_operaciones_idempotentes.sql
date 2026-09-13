-- Una clave por alta móvil permite repetir con seguridad una petición cuya
-- respuesta se perdió después de que D1 confirmó la escritura.
CREATE TABLE idempotency_operations (
  id         TEXT PRIMARY KEY,
  kind       TEXT NOT NULL CHECK (kind IN ('product', 'devices')),
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  request_hash TEXT NOT NULL,
  result     TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
