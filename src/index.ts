import express from 'express';
import Redis from 'ioredis';
import dotenv from 'dotenv';
import amqplib from 'amqplib';
import client from 'prom-client';

dotenv.config();

const app = express();
app.use(express.json());

// Setup Prometheus metrics
const register = new client.Registry();
client.collectDefaultMetrics({ register });

const requestsCounter = new client.Counter({
  name: 'flash_api_requests_total',
  help: 'Total number of purchase requests',
  registers: [register]
});

const inventoryGauge = new client.Gauge({
  name: 'flash_inventory_remaining',
  help: 'Current inventory remaining by warehouse',
  labelNames: ['warehouse'],
  registers: [register]
});

const queueGauge = new client.Gauge({
  name: 'flash_queue_size',
  help: 'Current number of orders in the RabbitMQ queue',
  registers: [register]
});

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('connect', () => console.log('Connected to Redis'));
redis.on('error', (err) => console.error('Redis connection error:', err));

let mqConnection: any;
let mqChannel: any;
const QUEUE_NAME = 'orders_queue';

async function setupRabbitMQ() {
  try {
    mqConnection = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    mqChannel = await mqConnection.createChannel();
    await mqChannel.assertQueue(QUEUE_NAME, { durable: true });
    console.log('Connected to RabbitMQ');
  } catch (err) {
    console.error('RabbitMQ connection error:', err);
  }
}
setupRabbitMQ();

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
  requestsCounter.inc();
  
  try {
    const { userId } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

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

    const warehouseId = String(result).split(':')[1];

    if (mqChannel) {
      const message = JSON.stringify({
        userId,
        warehouseId,
        status: 'RESERVED',
        timestamp: new Date().toISOString()
      });
      mqChannel.sendToQueue(QUEUE_NAME, Buffer.from(message), { persistent: true });
    }

    return res.status(202).json({
      message: 'Reservation accepted',
      warehouse: warehouseId
    });

  } catch (error) {
    console.error('Error processing purchase:', error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    // Update inventory gauges
    for (const wh of WAREHOUSES) {
      const stock = await redis.get(wh);
      const whName = wh.split(':')[1];
      inventoryGauge.labels(whName).set(parseInt(stock || '0', 10));
    }
    
    // Update RabbitMQ queue gauge
    if (mqChannel) {
      const q = await mqChannel.checkQueue(QUEUE_NAME);
      queueGauge.set(q.messageCount);
    }

    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (ex) {
    res.status(500).end(ex);
  }
});

const PORT = process.env.PORT || 3000;

export const server = app.listen(PORT, () => {
  console.log(`API Gateway listening on port ${PORT}`);
});

export { app, redis };
