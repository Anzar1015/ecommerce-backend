import request from 'supertest';
import '../test/setup';
import { createApp } from '../app';

const app = createApp();

describe('GET /api/v1/shipping/methods', () => {
  it('returns both methods with base fees when no subtotal is given', async () => {
    const res = await request(app).get('/api/v1/shipping/methods').expect(200);
    expect(res.body.data.methods).toHaveLength(2);
    const standard = res.body.data.methods.find((m: { method: string }) => m.method === 'standard');
    expect(standard.fee).toBe(50);
    expect(res.body.data.freeShippingThreshold).toBe(500);
  });

  it('computes the standard fee as free once the subtotal clears the threshold', async () => {
    const res = await request(app).get('/api/v1/shipping/methods').query({ subtotal: 1000 }).expect(200);
    const standard = res.body.data.methods.find((m: { method: string }) => m.method === 'standard');
    const express = res.body.data.methods.find((m: { method: string }) => m.method === 'express');
    expect(standard.fee).toBe(0);
    expect(express.fee).toBe(120);
  });

  it('rejects a negative subtotal with 400', async () => {
    await request(app).get('/api/v1/shipping/methods').query({ subtotal: -1 }).expect(400);
  });
});
