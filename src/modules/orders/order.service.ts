import { transaction, type Database } from '../../shared/database.js';
import { notFound, unprocessable } from '../../shared/errors.js';
import type { Page, Pagination } from '../../shared/pagination.js';
import type { ProductService } from '../products/product.service.js';
import type { StockService } from '../stock/stock.service.js';
import { TRANSITIONS, type CreateOrderInput, type Order, type OrderItem, type OrderStatus } from './order.schema.js';

interface OrderRow {
  id: number;
  customer: string;
  status: OrderStatus;
  total_cents: number;
  created_at: string;
  updated_at: string;
}

export class OrderService {
  constructor(
    private readonly db: Database,
    private readonly products: ProductService,
    private readonly stock: StockService,
  ) {}

  /**
   * Creates an order and reserves stock for every item in a single transaction.
   * Prices are captured at order time so later price changes do not affect it.
   */
  create(input: CreateOrderInput): Order {
    const orderId = transaction(this.db, () => {
      const items = input.items.map((item) => ({
        ...item,
        unitPriceCents: this.products.findById(item.productId).priceCents,
      }));
      const total = items.reduce((sum, i) => sum + i.unitPriceCents * i.quantity, 0);

      const { lastInsertRowid } = this.db
        .prepare("INSERT INTO orders (customer, status, total_cents) VALUES (?, 'PENDING', ?)")
        .run(input.customer, total);
      const id = Number(lastInsertRowid);

      const insertItem = this.db.prepare(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price_cents) VALUES (?, ?, ?, ?)',
      );
      for (const item of items) {
        this.stock.applyMovement(item.productId, -item.quantity, 'ORDER_RESERVED', `order:${id}`);
        insertItem.run(id, item.productId, item.quantity, item.unitPriceCents);
      }
      return id;
    });

    return this.findById(orderId);
  }

  findById(id: number): Order {
    const row = this.db.prepare('SELECT * FROM orders WHERE id = ?').get(id) as OrderRow | undefined;
    if (!row) throw notFound('Order', id);

    const items = this.db
      .prepare(
        `SELECT product_id AS productId, quantity, unit_price_cents AS unitPriceCents
           FROM order_items WHERE order_id = ? ORDER BY product_id`,
      )
      .all(id) as unknown as OrderItem[];

    return {
      id: row.id,
      customer: row.customer,
      status: row.status,
      totalCents: row.total_cents,
      items,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  list({ page, pageSize }: Pagination, status?: OrderStatus): Page<Order> {
    const where = status ? 'WHERE status = ?' : '';
    const params = status ? [status] : [];

    const ids = this.db
      .prepare(`SELECT id FROM orders ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, pageSize, (page - 1) * pageSize) as { id: number }[];
    const { total } = this.db.prepare(`SELECT COUNT(*) AS total FROM orders ${where}`).get(...params) as {
      total: number;
    };

    return { data: ids.map(({ id }) => this.findById(id)), page, pageSize, total };
  }

  /** Moves an order through its workflow. Cancelling returns reserved stock. */
  changeStatus(id: number, next: OrderStatus): Order {
    const order = this.findById(id);

    if (!TRANSITIONS[order.status].includes(next)) {
      throw unprocessable(`Cannot change order ${id} from ${order.status} to ${next}`);
    }

    transaction(this.db, () => {
      if (next === 'CANCELLED') {
        for (const item of order.items) {
          this.stock.applyMovement(item.productId, item.quantity, 'ORDER_CANCELLED', `order:${id}`);
        }
      }
      this.db
        .prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?")
        .run(next, id);
    });

    return this.findById(id);
  }
}
