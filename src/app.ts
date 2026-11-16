import express, { type Express } from 'express';
import { orderRoutes } from './modules/orders/order.routes.js';
import { OrderService } from './modules/orders/order.service.js';
import { productRoutes } from './modules/products/product.routes.js';
import { ProductService } from './modules/products/product.service.js';
import { stockRoutes } from './modules/stock/stock.routes.js';
import { StockService } from './modules/stock/stock.service.js';
import type { Database } from './shared/database.js';
import { errorHandler } from './shared/errors.js';

export function createApp(db: Database): Express {
  const products = new ProductService(db);
  const stock = new StockService(db);
  const orders = new OrderService(db, products, stock);

  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });
  app.use('/products', productRoutes(products));
  app.use('/products/:id/stock', stockRoutes(stock));
  app.use('/orders', orderRoutes(orders));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });
  app.use(errorHandler);

  return app;
}
