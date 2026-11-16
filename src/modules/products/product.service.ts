import type { Database } from '../../shared/database.js';
import { conflict, notFound } from '../../shared/errors.js';
import type { Page, Pagination } from '../../shared/pagination.js';
import type { CreateProductInput, Product, UpdateProductInput } from './product.schema.js';

interface ProductRow {
  id: number;
  sku: string;
  name: string;
  price_cents: number;
  stock: number;
  created_at: string;
}

const toProduct = (row: ProductRow): Product => ({
  id: row.id,
  sku: row.sku,
  name: row.name,
  priceCents: row.price_cents,
  stock: row.stock,
  createdAt: row.created_at,
});

export class ProductService {
  constructor(private readonly db: Database) {}

  create(input: CreateProductInput): Product {
    const existing = this.db.prepare('SELECT id FROM products WHERE sku = ?').get(input.sku);
    if (existing) throw conflict(`SKU ${input.sku} already exists`);

    const { lastInsertRowid } = this.db
      .prepare('INSERT INTO products (sku, name, price_cents) VALUES (?, ?, ?)')
      .run(input.sku, input.name, input.priceCents);

    return this.findById(Number(lastInsertRowid));
  }

  findById(id: number): Product {
    const row = this.db.prepare('SELECT * FROM products WHERE id = ?').get(id) as ProductRow | undefined;
    if (!row) throw notFound('Product', id);
    return toProduct(row);
  }

  list({ page, pageSize }: Pagination, search?: string): Page<Product> {
    const filter = search ? `%${search}%` : '%';
    const rows = this.db
      .prepare('SELECT * FROM products WHERE name LIKE ? OR sku LIKE ? ORDER BY id LIMIT ? OFFSET ?')
      .all(filter, filter, pageSize, (page - 1) * pageSize) as unknown as ProductRow[];
    const { total } = this.db
      .prepare('SELECT COUNT(*) AS total FROM products WHERE name LIKE ? OR sku LIKE ?')
      .get(filter, filter) as { total: number };

    return { data: rows.map(toProduct), page, pageSize, total };
  }

  update(id: number, input: UpdateProductInput): Product {
    const current = this.findById(id);
    this.db
      .prepare('UPDATE products SET name = ?, price_cents = ? WHERE id = ?')
      .run(input.name ?? current.name, input.priceCents ?? current.priceCents, id);
    return this.findById(id);
  }
}
