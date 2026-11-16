import { Router } from 'express';
import { z } from 'zod';
import { paginationSchema } from '../../shared/pagination.js';
import { createOrderSchema, listOrdersQuery, updateStatusSchema } from './order.schema.js';
import type { OrderService } from './order.service.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export function orderRoutes(orders: OrderService): Router {
  const router = Router();

  router.post('/', (req, res) => {
    res.status(201).json(orders.create(createOrderSchema.parse(req.body)));
  });

  router.get('/', (req, res) => {
    const { status } = listOrdersQuery.parse(req.query);
    res.json(orders.list(paginationSchema.parse(req.query), status));
  });

  router.get('/:id', (req, res) => {
    res.json(orders.findById(idParam.parse(req.params).id));
  });

  router.patch('/:id/status', (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(orders.changeStatus(id, updateStatusSchema.parse(req.body).status));
  });

  return router;
}
