import { Router } from 'express';
import { z } from 'zod';
import { stockMovementSchema, type StockService } from './stock.service.js';

const productParam = z.object({ id: z.coerce.number().int().positive() });

export function stockRoutes(stock: StockService): Router {
  const router = Router({ mergeParams: true });

  router.post('/', (req, res) => {
    const { id } = productParam.parse(req.params);
    res.status(201).json(stock.record(id, stockMovementSchema.parse(req.body)));
  });

  router.get('/', (req, res) => {
    const { id } = productParam.parse(req.params);
    res.json({ data: stock.history(id) });
  });

  return router;
}
