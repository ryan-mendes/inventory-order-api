import { Router } from 'express';
import { z } from 'zod';
import { paginationSchema } from '../../shared/pagination.js';
import { createProductSchema, updateProductSchema } from './product.schema.js';
import type { ProductService } from './product.service.js';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const listQuery = paginationSchema.extend({ search: z.string().trim().optional() });

export function productRoutes(products: ProductService): Router {
  const router = Router();

  router.post('/', (req, res) => {
    res.status(201).json(products.create(createProductSchema.parse(req.body)));
  });

  router.get('/', (req, res) => {
    const { search, ...pagination } = listQuery.parse(req.query);
    res.json(products.list(pagination, search));
  });

  router.get('/:id', (req, res) => {
    res.json(products.findById(idParam.parse(req.params).id));
  });

  router.patch('/:id', (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(products.update(id, updateProductSchema.parse(req.body)));
  });

  return router;
}
