-- Esquema inicial del inventario.
-- Regla central: el stock nunca se edita a mano, se deriva de los movimientos.
-- La tabla `stock` es una materializacion que se actualiza en la misma
-- transaccion que el movimiento que la causa.

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- Usuarios
-- ---------------------------------------------------------------------------

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  pin_hash      TEXT NOT NULL,
  pin_salt      TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'owner' CHECK (role IN ('owner', 'staff')),
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT,
  -- Un PIN de 6 digitos son un millon de combinaciones: la defensa real no es
  -- la fuerza del hash sino frenar los intentos.
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TEXT
);

-- ---------------------------------------------------------------------------
-- Ubicaciones: un almacen central y las sucursales
-- ---------------------------------------------------------------------------

CREATE TABLE locations (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('warehouse', 'store')),
  icon       TEXT,
  image_key  TEXT,
  address    TEXT,
  phone      TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active  INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_locations_activas ON locations (is_active, sort_order);

-- ---------------------------------------------------------------------------
-- Categorias
-- ---------------------------------------------------------------------------

CREATE TABLE categories (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  icon       TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------------------------------------------------------------------------
-- Productos
-- ---------------------------------------------------------------------------

CREATE TABLE products (
  id          TEXT PRIMARY KEY,
  barcode     TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  brand       TEXT,
  model       TEXT,
  category_id TEXT REFERENCES categories (id) ON DELETE SET NULL,
  unit        TEXT NOT NULL DEFAULT 'pza',
  cost_price  REAL NOT NULL DEFAULT 0 CHECK (cost_price >= 0),
  sale_price  REAL NOT NULL DEFAULT 0 CHECK (sale_price >= 0),
  image_key   TEXT,
  min_stock   INTEGER NOT NULL DEFAULT 0 CHECK (min_stock >= 0),
  notes       TEXT,
  is_active   INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_products_activos ON products (is_active, name);
CREATE INDEX idx_products_categoria ON products (category_id);

-- ---------------------------------------------------------------------------
-- Stock por producto y ubicacion
-- ---------------------------------------------------------------------------

CREATE TABLE stock (
  product_id  TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  location_id TEXT NOT NULL REFERENCES locations (id) ON DELETE CASCADE,
  qty         INTEGER NOT NULL DEFAULT 0 CHECK (qty >= 0),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (product_id, location_id)
);

CREATE INDEX idx_stock_por_ubicacion ON stock (location_id, qty);

-- ---------------------------------------------------------------------------
-- Conteos fisicos
-- ---------------------------------------------------------------------------

CREATE TABLE count_sessions (
  id          TEXT PRIMARY KEY,
  location_id TEXT NOT NULL REFERENCES locations (id) ON DELETE CASCADE,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'cancelled')),
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  closed_at   TEXT,
  note        TEXT,
  created_by  TEXT REFERENCES users (id) ON DELETE SET NULL
);

CREATE INDEX idx_conteos_por_ubicacion ON count_sessions (location_id, started_at DESC);

-- Solo un conteo abierto por ubicacion: evita dos conteos simultaneos que
-- se pisarian entre si.
CREATE UNIQUE INDEX idx_un_conteo_abierto_por_ubicacion
  ON count_sessions (location_id)
  WHERE status = 'open';

CREATE TABLE count_items (
  count_session_id TEXT NOT NULL REFERENCES count_sessions (id) ON DELETE CASCADE,
  product_id       TEXT NOT NULL REFERENCES products (id) ON DELETE CASCADE,
  counted_qty      INTEGER NOT NULL DEFAULT 0 CHECK (counted_qty >= 0),
  -- Se congela al momento del escaneo y no se recalcula: de otro modo el
  -- reporte de mermas cambiaria con el tiempo y perderia valor como evidencia.
  expected_qty     INTEGER NOT NULL DEFAULT 0,
  diff             INTEGER NOT NULL DEFAULT 0,
  unit_cost        REAL NOT NULL DEFAULT 0,
  scanned_at       TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (count_session_id, product_id)
);

-- ---------------------------------------------------------------------------
-- Movimientos: bitacora inmutable de todo lo que entra, sale y se mueve
-- ---------------------------------------------------------------------------

CREATE TABLE movements (
  id               TEXT PRIMARY KEY,
  type             TEXT NOT NULL CHECK (
                     type IN ('purchase_in', 'transfer', 'sale', 'return',
                              'loss', 'adjustment', 'count')
                   ),
  product_id       TEXT NOT NULL REFERENCES products (id) ON DELETE RESTRICT,
  qty              INTEGER NOT NULL CHECK (qty > 0),
  from_location_id TEXT REFERENCES locations (id) ON DELETE RESTRICT,
  to_location_id   TEXT REFERENCES locations (id) ON DELETE RESTRICT,
  unit_cost        REAL NOT NULL DEFAULT 0 CHECK (unit_cost >= 0),
  note             TEXT,
  count_session_id TEXT REFERENCES count_sessions (id) ON DELETE SET NULL,
  -- Agrupa los renglones de un mismo traspaso o conteo para poder deshacerlos juntos.
  batch_id         TEXT,
  -- Un movimiento no se borra: se marca revertido y se crea el opuesto.
  reverted_at      TEXT,
  reverted_by_id   TEXT REFERENCES movements (id) ON DELETE SET NULL,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  created_by       TEXT REFERENCES users (id) ON DELETE SET NULL,

  -- Cada tipo exige su propia forma de origen y destino. Dejarlo en la base
  -- de datos evita que un error de codigo genere stock de la nada.
  CHECK (
    (type = 'purchase_in' AND from_location_id IS NULL AND to_location_id IS NOT NULL) OR
    (type = 'return'      AND from_location_id IS NULL AND to_location_id IS NOT NULL) OR
    (type = 'sale'        AND from_location_id IS NOT NULL AND to_location_id IS NULL) OR
    (type = 'loss'        AND from_location_id IS NOT NULL AND to_location_id IS NULL) OR
    (type = 'transfer'    AND from_location_id IS NOT NULL AND to_location_id IS NOT NULL
                          AND from_location_id <> to_location_id) OR
    (type IN ('adjustment', 'count')
                          AND ((from_location_id IS NOT NULL AND to_location_id IS NULL) OR
                               (from_location_id IS NULL AND to_location_id IS NOT NULL)))
  )
);

CREATE INDEX idx_movimientos_producto ON movements (product_id, created_at DESC);
CREATE INDEX idx_movimientos_fecha ON movements (created_at DESC);
CREATE INDEX idx_movimientos_tipo_fecha ON movements (type, created_at DESC);
CREATE INDEX idx_movimientos_origen ON movements (from_location_id, created_at DESC);
CREATE INDEX idx_movimientos_destino ON movements (to_location_id, created_at DESC);
CREATE INDEX idx_movimientos_lote ON movements (batch_id);

-- ---------------------------------------------------------------------------
-- Busqueda: dos indices FTS5 con copia propia del texto
--
-- Se descarto `content=` (contenido externo) a proposito: obliga a que cada
-- columna del indice exista en `products`, y `category` vive en otra tabla.
-- Con contenido externo la consulta falla al leer y el filtrado por MATCH
-- deja de discriminar. La copia del texto ocupa unos pocos MB con 10.000
-- productos, a cambio de un indice que no depende de la forma de `products`.
--
--   products_fts  unicode61 sin acentos: rapido, por prefijo, por columna
--   products_trg  trigram: sirve para tolerar errores de escritura, pero
--                 NO por si solo. El tokenizador de trigramas hace
--                 coincidencia de subcadena, no distancia de edicion:
--                 MATCH 'samsng' no encuentra "Samsung". La tolerancia se
--                 logra en el servidor partiendo la consulta en trigramas y
--                 puntuando cuantos coinciden (ver server/services/busqueda).
-- ---------------------------------------------------------------------------

CREATE VIRTUAL TABLE products_fts USING fts5 (
  product_id UNINDEXED,
  name,
  brand,
  model,
  barcode,
  category,
  tokenize = "unicode61 remove_diacritics 2"
);

CREATE VIRTUAL TABLE products_trg USING fts5 (
  product_id UNINDEXED,
  texto,
  tokenize = "trigram remove_diacritics 1"
);

-- Los indices se mantienen con disparadores. Si se actualizaran desde el
-- codigo, cualquier ruta que olvidara hacerlo dejaria productos invisibles
-- en la busqueda sin ningun error visible.

CREATE TRIGGER products_fts_insert AFTER INSERT ON products BEGIN
  INSERT INTO products_fts (product_id, name, brand, model, barcode, category)
  VALUES (
    new.id, new.name, COALESCE(new.brand, ''), COALESCE(new.model, ''), new.barcode,
    COALESCE((SELECT name FROM categories WHERE id = new.category_id), '')
  );
  INSERT INTO products_trg (product_id, texto)
  VALUES (
    new.id,
    new.name || ' ' || COALESCE(new.brand, '') || ' ' || COALESCE(new.model, '')
  );
END;

CREATE TRIGGER products_fts_delete AFTER DELETE ON products BEGIN
  DELETE FROM products_fts WHERE product_id = old.id;
  DELETE FROM products_trg WHERE product_id = old.id;
END;

CREATE TRIGGER products_fts_update AFTER UPDATE ON products BEGIN
  DELETE FROM products_fts WHERE product_id = old.id;
  DELETE FROM products_trg WHERE product_id = old.id;
  INSERT INTO products_fts (product_id, name, brand, model, barcode, category)
  VALUES (
    new.id, new.name, COALESCE(new.brand, ''), COALESCE(new.model, ''), new.barcode,
    COALESCE((SELECT name FROM categories WHERE id = new.category_id), '')
  );
  INSERT INTO products_trg (product_id, texto)
  VALUES (
    new.id,
    new.name || ' ' || COALESCE(new.brand, '') || ' ' || COALESCE(new.model, '')
  );
END;

-- Renombrar una categoria debe reindexar sus productos, o la busqueda por
-- categoria seguiria devolviendo el nombre viejo.
CREATE TRIGGER categories_rename_reindex AFTER UPDATE OF name ON categories BEGIN
  DELETE FROM products_fts WHERE product_id IN (
    SELECT id FROM products WHERE category_id = new.id
  );
  INSERT INTO products_fts (product_id, name, brand, model, barcode, category)
  SELECT id, name, COALESCE(brand, ''), COALESCE(model, ''), barcode, new.name
  FROM products WHERE category_id = new.id;
END;
