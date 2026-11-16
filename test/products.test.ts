import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/shared/database.js';

let api: ReturnType<typeof request>;

beforeEach(() => {
  api = request(createApp(createDatabase()));
});

describe('products', () => {
  it('creates a product with zero stock', async () => {
    const { body } = await api.post('/products').send({ sku: 'KB-001', name: 'Keyboard', priceCents: 15000 }).expect(201);
    expect(body).toMatchObject({ sku: 'KB-001', name: 'Keyboard', priceCents: 15000, stock: 0 });
  });

  it('rejects a duplicate SKU', async () => {
    await api.post('/products').send({ sku: 'KB-001', name: 'Keyboard', priceCents: 15000 }).expect(201);
    const { body } = await api.post('/products').send({ sku: 'KB-001', name: 'Other', priceCents: 1 }).expect(409);
    expect(body.error.code).toBe('CONFLICT');
  });

  it('validates input', async () => {
    const { body } = await api.post('/products').send({ sku: 'bad sku', name: 'X', priceCents: -1 }).expect(400);
    expect(Object.keys(body.error.details)).toEqual(expect.arrayContaining(['sku', 'name', 'priceCents']));
  });

  it('paginates and searches', async () => {
    for (let i = 1; i <= 25; i++) {
      await api.post('/products').send({ sku: `SKU-${i}`, name: i % 5 === 0 ? `Cable ${i}` : `Item ${i}`, priceCents: 100 });
    }
    const { body: page2 } = await api.get('/products?page=2&pageSize=10').expect(200);
    expect(page2).toMatchObject({ page: 2, pageSize: 10, total: 25 });
    expect(page2.data).toHaveLength(10);

    const { body: cables } = await api.get('/products?search=Cable').expect(200);
    expect(cables.total).toBe(5);
  });

  it('returns 404 for unknown products', async () => {
    await api.get('/products/999').expect(404);
  });
});

describe('stock movements', () => {
  it('records receipts and adjustments in the ledger', async () => {
    const { body: product } = await api.post('/products').send({ sku: 'ST-001', name: 'Monitor', priceCents: 90000 });

    await api.post(`/products/${product.id}/stock`).send({ quantity: 10, reason: 'RECEIPT', reference: 'PO-123' }).expect(201);
    await api.post(`/products/${product.id}/stock`).send({ quantity: -3, reason: 'ADJUSTMENT' }).expect(201);

    expect((await api.get(`/products/${product.id}`)).body.stock).toBe(7);
    const { body } = await api.get(`/products/${product.id}/stock`).expect(200);
    expect(body.data).toHaveLength(2);
    expect(body.data[1]).toMatchObject({ quantity: 10, reason: 'RECEIPT', reference: 'PO-123' });
  });

  it('never lets stock go negative', async () => {
    const { body: product } = await api.post('/products').send({ sku: 'ST-002', name: 'Cable', priceCents: 500 });
    await api.post(`/products/${product.id}/stock`).send({ quantity: -1, reason: 'ADJUSTMENT' }).expect(422);
  });

  it('rejects a receipt with negative quantity', async () => {
    const { body: product } = await api.post('/products').send({ sku: 'ST-003', name: 'Hub', priceCents: 500 });
    await api.post(`/products/${product.id}/stock`).send({ quantity: -5, reason: 'RECEIPT' }).expect(400);
  });
});
