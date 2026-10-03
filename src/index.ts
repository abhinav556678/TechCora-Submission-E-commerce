import express from 'express';
import Redis from 'ioredis';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('connect', () => {
  console.log('Connected to Redis');
});

redis.on('error', (err) => {
  console.error('Redis connection error:', err);
});

// The atomic Lua script
const PURCHASE_LUA_SCRIPT = `
local idempotency_key = KEYS[1]
local user_id = ARGV[1]

-- 1. Check if user already reserved (Idempotency)
if redis.call('SISMEMBER', idempotency_key, user_id) == 1 then
    return -2 -- Duplicate request
end

-- 2. Iterate through warehouses to find stock
for i = 2, #KEYS do
    local wh_key = KEYS[i]
    local stock = tonumber(redis.call('GET', wh_key) or '0')
    
    if stock > 0 then
        -- Deduct stock
        redis.call('DECR', wh_key)
        
        -- Mark user as having purchased (with a 5-minute TTL for eventual consistency)
        -- We'll add full TTL and reaper logic in Ticket 06, but we set the baseline here
        redis.call('SADD', idempotency_key, user_id)
        
        return wh_key -- Return the warehouse ID that fulfilled the order
    end
end

return -1 -- Sold out across all warehouses
`;

// Define Redis script command
redis.defineCommand('attemptPurchase', {
  numberOfKeys: 3, // 1 idempotency key + 2 warehouse keys
  lua: PURCHASE_LUA_SCRIPT,
});

// Types for our custom command
declare module 'ioredis' {
  interface RedisCommander<Context> {
    attemptPurchase(
      idempotencyKey: string,
      warehouseA: string,
      warehouseB: string,
      userId: string
    ): Promise<string | number>;
  }
}

const IDEMPOTENCY_KEY = 'users:purchased';
const WAREHOUSES = ['inventory:WH_A', 'inventory:WH_B'];

// Initialize inventory for demo
app.post('/api/reset', async (req, res) => {
  await redis.set('inventory:WH_A', '60');
  await redis.set('inventory:WH_B', '40');
  await redis.del(IDEMPOTENCY_KEY);
  res.json({ message: 'Inventory reset (WH_A: 60, WH_B: 40)' });
});

app.post('/api/buy', async (req, res) => {
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Execute the Lua script atomically
    // We pass: idempotencyKey, warehouseA, warehouseB, then the ARGV (userId)
    const result = await redis.attemptPurchase(
      IDEMPOTENCY_KEY,
      WAREHOUSES[0],
      WAREHOUSES[1],
      String(userId)
    );

    if (result === -2) {
      return res.status(409).json({ error: 'Duplicate', message: 'You have already secured an item.' });
    }

    if (result === -1) {
      return res.status(400).json({ error: 'Sold Out', message: 'All warehouses are depleted.' });
    }

    // result contains the warehouse key (e.g., "inventory:WH_A")
    const warehouseId = String(result).split(':')[1];

    return res.status(202).json({
      message: 'Reservation accepted',
      warehouse: warehouseId
    });

  } catch (error) {
    console.error('Error processing purchase:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

const PORT = process.env.PORT || 3000;

export const server = app.listen(PORT, () => {
  console.log(`API Gateway listening on port ${PORT}`);
});

export { app, redis };
