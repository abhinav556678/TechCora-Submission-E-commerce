import request from 'supertest';
import { app, server, redis } from './index';

describe('POST /api/buy', () => {
  beforeEach(async () => {
    // Reset inventory to 2 for quick testing
    await redis.set('inventory:simple', '2');
  });

  afterAll(async () => {
    await redis.quit();
    server.close();
  });

  it('should return 202 Accepted when stock is available', async () => {
    const response = await request(app).post('/api/buy').send({ userId: 1 });
    expect(response.status).toBe(202);
    expect(response.body).toHaveProperty('message', 'Reservation accepted');
    expect(response.body).toHaveProperty('remainingStock', 1);
  });

  it('should return 400 Sold Out when stock is depleted', async () => {
    // Buy 1
    await request(app).post('/api/buy').send({ userId: 1 });
    // Buy 2
    await request(app).post('/api/buy').send({ userId: 2 });
    // Buy 3 - should fail
    const response = await request(app).post('/api/buy').send({ userId: 3 });
    
    expect(response.status).toBe(400);
    expect(response.body).toHaveProperty('error', 'Sold Out');
    
    // Verify stock is precisely 0
    const stock = await redis.get('inventory:simple');
    expect(stock).toBe('0');
  });
});
