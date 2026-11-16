import { z } from 'zod';
import { transaction, type Database } from '../../shared/database.js';
import { notFound, unprocessable } from '../../shared/errors.js';

export type MovementReason = 'RECEIPT' | 'ADJUSTMENT' | 'ORDER_RESERVED' | 'ORDER_CANCELLED';

export const stockMovementSchema = z
  .object({
    quantity: z.number().int().refine((q) => q !== 0, 'Quantity cannot be zero'),
    reason: z.enum(['RECEIPT', 'ADJUSTMENT']),
    reference: z.string().trim().max(64).optional(),
  })
  .refine((m) => m.reason !== 'RECEIPT' || m.quantity > 0, {
    message: 'A receipt must have a positive quantity',
    path: ['quantity'],
  });

export type StockMovementInput = z.infer<typeof stockMovementSchema>;

export interface StockMovement {
  id: number;
  productId: number;
  quantity: number;
  reason: MovementReason;
  reference: string | null;
  createdAt: string;
}

/**
 * Every stock change goes through this service so the ledger in
 * `stock_movements` always reconciles with `products.stock`.
 */
export class StockService {
  constructor(private readonly db: Database) {}

  /** Applies a movement without opening a transaction. Callers must own the transaction. */
  applyMovement(productId: number, quantity: number, reason: MovementReason, reference?: string): void {
    const product = this.db.prepare('SELECT stock FROM products WHERE id = ?').get(productId) as
      | { stock: number }
      | undefined;
    if (!product) throw notFound('Product', productId);

    if (product.stock + quantity < 0) {
      throw unprocessable(
        `Insufficient stock for product ${productId}: available ${product.stock}, requested ${-quantity}`,
      );
    }

    this.db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(quantity, productId);
    this.db
      .prepare('INSERT INTO stock_movements (product_id, quantity, reason, reference) VALUES (?, ?, ?, ?)')
      .run(productId, quantity, reason, reference ?? null);
  }

  record(productId: number, input: StockMovementInput): StockMovement {
    transaction(this.db, () => this.applyMovement(productId, input.quantity, input.reason, input.reference));
    return this.history(productId)[0]!;
  }

  history(productId: number): StockMovement[] {
    const exists = this.db.prepare('SELECT 1 FROM products WHERE id = ?').get(productId);
    if (!exists) throw notFound('Product', productId);

    const rows = this.db
      .prepare(
        `SELECT id, product_id AS productId, quantity, reason, reference, created_at AS createdAt
           FROM stock_movements WHERE product_id = ? ORDER BY id DESC`,
      )
      .all(productId);
    return rows as unknown as StockMovement[];
  }
}
