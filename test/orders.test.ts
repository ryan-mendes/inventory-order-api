import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { createDatabase } from '../src/shared/database.js';

let api: ReturnType<typeof request>;

async function createProduct(sku: string, priceCents: number, stock: number) {
  const { body } = await api.post('/products').send({ sku, name: `Product ${sku}`, priceCents }).expect(201);
  if (stock > 0) {
    await api.post(`/products/${body.id}/stock`).send({ quantity: stock, reason: 'RECEIPT' }).expect(201);
  }
  return body.id as number;
}

const stockOf = async (id: number) => (await api.get(`/products/${id}`)).body.stock as number;

beforeEach(() => {
  api = request(createApp(createDatabase()));
});

describe('orders', () => {
  it('reserves stock and captures prices when an order is created', async () => {
    const keyboard = await createProduct('KB-001', 15000, 10);
    const mouse = await createProduct('MS-001', 5000, 5);

    const { body: order } = await api
      .post('/orders')
      .send({ customer: 'Acme Ltd', items: [{ productId: keyboard, quantity: 2 }, { productId: mouse, quantity: 1 }] })
      .expect(201);

    expect(order.status).toBe('PENDING');
    expect(order.totalCents).toBe(2 * 15000 + 5000);
    expect(await stockOf(keyboard)).toBe(8);
    expect(await stockOf(mouse)).toBe(4);

    await api.patch(`/products/${keyboard}`).send({ priceCents: 99999 }).expect(200);
    const { body: reloaded } = await api.get(`/orders/${order.id}`).expect(200);
    expect(reloaded.totalCents).toBe(35000);
  });

  it('rejects the whole order when any item lacks stock', async () => {
    const available = await createProduct('AV-001', 1000, 10);
    const scarce = await createProduct('SC-001', 1000, 1);

    const { body } = await api
      .post('/orders')
      .send({ customer: 'Acme Ltd', items: [{ productId: available, quantity: 3 }, { productId: scarce, quantity: 2 }] })
      .expect(422);

    expect(body.error.code).toBe('BUSINESS_RULE_VIOLATION');
    expect(await stockOf(available)).toBe(10);
    expect(await stockOf(scarce)).toBe(1);
    expect((await api.get('/orders')).body.total).toBe(0);
  });

  it('returns reserved stock when an order is cancelled', async () => {
    const product = await createProduct('CN-001', 2000, 5);
    const { body: order } = await api
      .post('/orders')
      .send({ customer: 'Acme Ltd', items: [{ productId: product, quantity: 4 }] })
      .expect(201);

    await api.patch(`/orders/${order.id}/status`).send({ status: 'CANCELLED' }).expect(200);

    expect(await stockOf(product)).toBe(5);
    const { body: ledger } = await api.get(`/products/${product}/stock`).expect(200);
    expect(ledger.data.map((m: { reason: string }) => m.reason)).toEqual([
      'ORDER_CANCELLED',
      'ORDER_RESERVED',
      'RECEIPT',
    ]);
  });

  it('enforces the status workflow', async () => {
    const product = await createProduct('WF-001', 1000, 5);
    const { body: order } = await api
      .post('/orders')
      .send({ customer: 'Acme Ltd', items: [{ productId: product, quantity: 1 }] })
      .expect(201);

    await api.patch(`/orders/${order.id}/status`).send({ status: 'SHIPPED' }).expect(422);
    await api.patch(`/orders/${order.id}/status`).send({ status: 'CONFIRMED' }).expect(200);
    await api.patch(`/orders/${order.id}/status`).send({ status: 'SHIPPED' }).expect(200);
    await api.patch(`/orders/${order.id}/status`).send({ status: 'CANCELLED' }).expect(422);
  });

  it('filters orders by status', async () => {
    const product = await createProduct('FL-001', 1000, 10);
    const place = () =>
      api.post('/orders').send({ customer: 'Acme Ltd', items: [{ productId: product, quantity: 1 }] }).expect(201);

    const { body: first } = await place();
    await place();
    await api.patch(`/orders/${first.id}/status`).send({ status: 'CONFIRMED' }).expect(200);

    const { body } = await api.get('/orders?status=CONFIRMED').expect(200);
    expect(body.total).toBe(1);
    expect(body.data[0].id).toBe(first.id);
  });

  it('rejects duplicate products and empty orders', async () => {
    const product = await createProduct('DP-001', 1000, 10);
    await api.post('/orders').send({ customer: 'Acme Ltd', items: [] }).expect(400);
    await api
      .post('/orders')
      .send({ customer: 'Acme Ltd', items: [{ productId: product, quantity: 1 }, { productId: product, quantity: 2 }] })
      .expect(400);
  });
});
