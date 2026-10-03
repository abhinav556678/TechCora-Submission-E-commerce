import request from 'supertest';
import { describe, it, expect, beforeEach, afterAll } from '@jest/globals';
import { app, server, redis } from './index';

describe('POST /api/buy', () => {
  beforeEach(async () => {
    // Reset inventory to a small amount for testing
    await redis.set('inventory:WH_A', '1');
    await redis.set('inventory:WH_B', '1');
    await redis.del('users:purchased');
  });

  afterAll(async () => {
    await redis.quit();
    server.close();
  });

  it('should return 202 and deduct from WH_A first', async () => {
    const response = await request(app).post('/api/buy').send({ userId: 'user1' });
    expect(response.status).toBe(202);
    expect(response.body).toHaveProperty('message', 'Reservation accepted');
    expect(response.body).toHaveProperty('warehouse', 'WH_A');
  });

  it('should return 409 for duplicate user requests', async () => {
    // First purchase
    await request(app).post('/api/buy').send({ userId: 'user_dup' });
    // Second purchase attempt
    const response = await request(app).post('/api/buy').send({ userId: 'user_dup' });
    
    expect(response.status).toBe(409);
    expect(response.body).toHaveProperty('error', 'Duplicate');
  });

  it('should fallback to WH_B if WH_A is empty', async () => {
    // user1 exhausts WH_A
    await request(app).post('/api/buy').send({ userId: 'user1' });
    
    // user2 should automatically get from WH_B
    const response = await request(app).post('/api/buy').send({ userId: 'user2' });
    
    expect(response.status).toBe(202);
    expect(response.body).toHaveProperty('warehouse', 'WH_B');
  });

  it('should return 400 Sold Out when all warehouses are empty', async () => {
    // Buy WH_A
    await request(app).post('/api/buy').send({ userId: 'u1' });
    // Buy WH_B
    await request(app).post('/api/buy').send({ userId: 'u2' });
    // Try to buy when empty
    const response = await request(app).post('/api/buy').send({ userId: 'u3' });
    
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Sold Out');
  });

  describe('POST /webhook/payment', () => {
    it('should return 200 OK and accept the payload', async () => {
      const response = await request(app)
        .post('/webhook/payment')
        .send({ userId: 'u1', transactionId: 'txn_123' });
      
      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('received', true);
    });

    it('should return 400 if fields are missing', async () => {
      const response = await request(app)
        .post('/webhook/payment')
        .send({ userId: 'u1' });
      
      expect(response.status).toBe(400);
    });
  });
});
