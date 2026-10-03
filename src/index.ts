import express from 'express';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

// Initialize Redis connection
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('connect', () => {
  console.log('Connected to Redis');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

// Initialize inventory if not set (for demo purposes)
const INVENTORY_KEY = 'inventory:simple';
redis.setnx(INVENTORY_KEY, '100'); // Default to 100

app.post('/api/buy', async (req, res) => {
  try {
    // Basic counter logic for Ticket 01
    // We decrement first
    const currentStock = await redis.decr(INVENTORY_KEY);

    if (currentStock < 0) {
      // Put it back if we oversold in this simple check
      await redis.incr(INVENTORY_KEY);
      return res.status(400).json({ error: 'Sold Out', message: 'Inventory is depleted.' });
    }

    return res.status(202).json({
      message: 'Reservation accepted',
      remainingStock: currentStock
    });

  } catch (error) {
    console.error('Error processing purchase:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// For testing purposes
app.post('/api/reset', async (req, res) => {
  await redis.set(INVENTORY_KEY, '100');
  res.json({ message: 'Inventory reset to 100' });
});

const PORT = process.env.PORT || 3000;

export const server = app.listen(PORT, () => {
  console.log(`API Gateway listening on port ${PORT}`);
});

export { app, redis };
