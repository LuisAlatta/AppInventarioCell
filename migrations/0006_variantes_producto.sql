-- Variantes independientes para filtrar sin confundir capacidades similares.
ALTER TABLE products ADD COLUMN ram TEXT;
ALTER TABLE products ADD COLUMN storage TEXT;
ALTER TABLE products ADD COLUMN color TEXT;

-- Recuperar las variantes que la versión anterior compuso dentro del nombre.
UPDATE products
SET ram = CASE
  WHEN lower(name) LIKE '% 16 gb%' OR lower(name) LIKE '% 16gb%' THEN '16 GB'
  WHEN lower(name) LIKE '% 12 gb%' OR lower(name) LIKE '% 12gb%' THEN '12 GB'
  WHEN lower(name) LIKE '% 8 gb%' OR lower(name) LIKE '% 8gb%' THEN '8 GB'
  WHEN lower(name) LIKE '% 6 gb%' OR lower(name) LIKE '% 6gb%' THEN '6 GB'
  WHEN lower(name) LIKE '% 4 gb%' OR lower(name) LIKE '% 4gb%' THEN '4 GB'
  ELSE NULL
END
WHERE ram IS NULL;

UPDATE products
SET storage = CASE
  WHEN lower(name) LIKE '% 1 tb%' OR lower(name) LIKE '% 1tb%' THEN '1 TB'
  WHEN lower(name) LIKE '% 512 gb%' OR lower(name) LIKE '% 512gb%' THEN '512 GB'
  WHEN lower(name) LIKE '% 256 gb%' OR lower(name) LIKE '% 256gb%' THEN '256 GB'
  WHEN lower(name) LIKE '% 128 gb%' OR lower(name) LIKE '% 128gb%' THEN '128 GB'
  WHEN lower(name) LIKE '% 64 gb%' OR lower(name) LIKE '% 64gb%' THEN '64 GB'
  ELSE NULL
END
WHERE storage IS NULL;

UPDATE products
SET color = CASE
  WHEN lower(name) LIKE '% negro' THEN 'Negro'
  WHEN lower(name) LIKE '% blanco' THEN 'Blanco'
  WHEN lower(name) LIKE '% azul' THEN 'Azul'
  WHEN lower(name) LIKE '% plata' THEN 'Plata'
  WHEN lower(name) LIKE '% dorado' THEN 'Dorado'
  WHEN lower(name) LIKE '% gris' THEN 'Gris'
  WHEN lower(name) LIKE '% verde' THEN 'Verde'
  WHEN lower(name) LIKE '% titanio' THEN 'Titanio'
  ELSE NULL
END
WHERE color IS NULL;

CREATE INDEX idx_products_ram_activo ON products(is_active, ram);
CREATE INDEX idx_products_storage_activo ON products(is_active, storage);
CREATE INDEX idx_products_color_activo ON products(is_active, color COLLATE NOCASE);
