import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sku         TEXT    NOT NULL UNIQUE,
    name        TEXT    NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    stock       INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS stock_movements (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER NOT NULL REFERENCES products(id),
    quantity    INTEGER NOT NULL,
    reason      TEXT    NOT NULL CHECK (reason IN ('RECEIPT', 'ADJUSTMENT', 'ORDER_RESERVED', 'ORDER_CANCELLED')),
    reference   TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS orders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    customer    TEXT    NOT NULL,
    status      TEXT    NOT NULL CHECK (status IN ('PENDING', 'CONFIRMED', 'SHIPPED', 'CANCELLED')),
    total_cents INTEGER NOT NULL,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    order_id         INTEGER NOT NULL REFERENCES orders(id),
    product_id       INTEGER NOT NULL REFERENCES products(id),
    quantity         INTEGER NOT NULL CHECK (quantity > 0),
    unit_price_cents INTEGER NOT NULL,
    PRIMARY KEY (order_id, product_id)
  );

  CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id);
  CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
`;

export type Database = DatabaseSync;

export function createDatabase(path = ':memory:'): Database {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  return db;
}

/** Runs `fn` inside a transaction, rolling back if it throws. */
export function transaction<T>(db: Database, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
