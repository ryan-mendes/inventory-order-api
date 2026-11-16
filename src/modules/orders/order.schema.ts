import { z } from 'zod';

export const ORDER_STATUSES = ['PENDING', 'CONFIRMED', 'SHIPPED', 'CANCELLED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Allowed status transitions. Terminal states map to an empty list. */
export const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['SHIPPED', 'CANCELLED'],
  SHIPPED: [],
  CANCELLED: [],
};

export const createOrderSchema = z.object({
  customer: z.string().trim().min(2).max(120),
  items: z
    .array(
      z.object({
        productId: z.number().int().positive(),
        quantity: z.number().int().positive(),
      }),
    )
    .min(1)
    .refine((items) => new Set(items.map((i) => i.productId)).size === items.length, {
      message: 'Each product may appear only once per order',
    }),
});

export const updateStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
});

export const listOrdersQuery = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

export interface OrderItem {
  productId: number;
  quantity: number;
  unitPriceCents: number;
}

export interface Order {
  id: number;
  customer: string;
  status: OrderStatus;
  totalCents: number;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}
