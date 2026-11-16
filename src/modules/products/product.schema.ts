import { z } from 'zod';

export const createProductSchema = z.object({
  sku: z
    .string()
    .trim()
    .min(3)
    .max(32)
    .regex(/^[A-Z0-9-]+$/, 'SKU must contain only uppercase letters, digits and dashes'),
  name: z.string().trim().min(2).max(120),
  priceCents: z.number().int().nonnegative(),
});

export const updateProductSchema = createProductSchema.omit({ sku: true }).partial();

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export interface Product {
  id: number;
  sku: string;
  name: string;
  priceCents: number;
  stock: number;
  createdAt: string;
}
