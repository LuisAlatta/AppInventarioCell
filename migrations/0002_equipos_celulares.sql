-- Equipos de telefonia: un producto representa el modelo y cada fila de
-- devices representa una unidad fisica que puede llevar hasta dos IMEI.

ALTER TABLE locations ADD COLUMN color TEXT NOT NULL DEFAULT '#315DB8';

CREATE TABLE brands (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO brands (id, name)
SELECT 'brand_' || lower(hex(randomblob(8))), trim(brand)
FROM products
WHERE brand IS NOT NULL AND trim(brand) <> '';

CREATE TABLE devices (
  id               TEXT PRIMARY KEY,
  product_id       TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  whitelist_status TEXT NOT NULL DEFAULT 'not_registered'
                   CHECK (whitelist_status IN ('registered', 'not_registered')),
  condition        TEXT NOT NULL DEFAULT 'new' CHECK (condition IN ('new', 'used')),
  location_id      TEXT NOT NULL REFERENCES locations(id) ON DELETE RESTRICT,
  notes            TEXT,
  is_active        INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Un IMEI vive en una sola fila y es unico sin importar si fue registrado
-- como IMEI 1 o IMEI 2. La posicion conserva la forma familiar de mostrarlo.
CREATE TABLE device_imeis (
  device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  position  INTEGER NOT NULL CHECK (position IN (1, 2)),
  imei      TEXT NOT NULL UNIQUE,
  PRIMARY KEY (device_id, position)
);

ALTER TABLE movements ADD COLUMN device_id TEXT REFERENCES devices(id) ON DELETE RESTRICT;

CREATE INDEX idx_devices_producto_activo ON devices(product_id, is_active, created_at DESC);
CREATE INDEX idx_devices_ubicacion_activo ON devices(location_id, is_active);
CREATE INDEX idx_movements_device ON movements(device_id, created_at DESC);

CREATE TABLE product_images (
  id         TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_key  TEXT NOT NULL UNIQUE,
  position   INTEGER NOT NULL CHECK (position BETWEEN 0 AND 4),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (product_id, position)
);

INSERT INTO product_images (id, product_id, image_key, position)
SELECT 'img_' || id, id, image_key, 0
FROM products
WHERE image_key IS NOT NULL;
