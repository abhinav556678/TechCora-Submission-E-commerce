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
local ttl = tonumber(ARGV[2])

if redis.call('SISMEMBER', idempotency_key, user_id) == 1 then
    return -2
end

for i = 2, #KEYS do
    local wh_key = KEYS[i]
    local stock = tonumber(redis.call('GET', wh_key) or '0')
    
    if stock > 0 then
        redis.call('DECR', wh_key)
        redis.call('SADD', idempotency_key, user_id)
        
        local lock_key = 'reservation:' .. wh_key .. ':' .. user_id
        redis.call('SETEX', lock_key, ttl, 'LOCKED')
        
        return wh_key
    end
end

return -1
`;

redis.defineCommand('attemptPurchase', {
  numberOfKeys: 3, 
  lua: PURCHASE_LUA_SCRIPT,
});

declare module 'ioredis' {
  interface RedisCommander<Context> {
    attemptPurchase(
      idempotencyKey: string,
      warehouseA: string,
      warehouseB: string,
      userId: string,
      ttl: string
    ): Promise<string | number>;
  }
}

const IDEMPOTENCY_KEY = 'users:purchased';
const WAREHOUSES = ['inventory:WH_A', 'inventory:WH_B'];

// Reaper: Listen for expired reservations
const sub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
redis.config('SET', 'notify-keyspace-events', 'Ex');

sub.subscribe('__keyevent@0__:expired', (err) => {
  if (err) console.error('Failed to subscribe to expirations', err);
  else console.log('Reaper listening for expired reservations...');
});

sub.on('message', async (channel, message) => {
  // message is the key name: reservation:inventory:WH_A:user123
  if (message.startsWith('reservation:')) {
    const parts = message.split(':');
    // parts = ['reservation', 'inventory', 'WH_A', 'user123']
    if (parts.length >= 4) {
      const wh_key = parts[1] + ':' + parts[2];
      const user_id = parts.slice(3).join(':');
      
      console.log(`Reaper: Reservation expired for ${user_id}. Restocking ${wh_key}`);
      await redis.incr(wh_key);
      
      // Remove from permanent idempotency so user can try again
      await redis.srem(IDEMPOTENCY_KEY, user_id);
    }
  }
});

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
      String(userId),
      '300' // 5 minutes TTL
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

// Crash simulation endpoint
app.post('/api/buy/simulate-crash', async (req, res) => {
  try {
    const userId = `crash_user_${Date.now()}`;
    
    const result = await redis.attemptPurchase(
      IDEMPOTENCY_KEY,
      WAREHOUSES[0],
      WAREHOUSES[1],
      userId,
      '5' // 5 seconds TTL for quick demo
    );

    if (result === -1 || result === -2) {
      return res.status(400).json({ error: 'Failed to reserve during crash simulation' });
    }

    // INTENTIONAL CRASH: We DO NOT publish to RabbitMQ here!
    console.log(`CRASH SIMULATED for ${userId}. Item reserved in Redis but not queued.`);

    return res.status(202).json({
      message: 'Crash simulated. Reservation locked in Redis, but queue was bypassed.',
      userId,
      ttl: 5
    });

  } catch (error) {
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
