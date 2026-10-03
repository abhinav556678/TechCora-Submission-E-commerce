import express from 'express';
import dotenv from 'dotenv';
import { setupRabbitMQ, publishMessage } from './rabbitmq';
import { redis, IDEMPOTENCY_KEY, WAREHOUSES } from './redis';
import { 
  register, 
  requestsCounter, 
  apiLatencyHistogram, 
  updateDynamicMetrics 
} from './metrics';
import { setupReaper } from './reaper';

dotenv.config();

const app = express();
app.use(express.json());
app.use(express.static('public'));

setupRabbitMQ();
setupReaper();

// Initialize inventory for demo
app.post('/api/reset', async (req, res) => {
  await redis.set('inventory:WH_A', '60');
  await redis.set('inventory:WH_B', '40');
  await redis.del(IDEMPOTENCY_KEY);
  res.json({ message: 'Inventory reset (WH_A: 60, WH_B: 40)' });
});

// Live inventory endpoint for the frontend
app.get('/api/inventory', async (req, res) => {
  try {
    const whA = await redis.get('inventory:WH_A') || '0';
    const whB = await redis.get('inventory:WH_B') || '0';
    
    const total = parseInt(whA, 10) + parseInt(whB, 10);
    
    res.json({
      total,
      warehouses: { WH_A: parseInt(whA, 10), WH_B: parseInt(whB, 10) }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch inventory' });
  }
});

app.post('/api/buy', async (req, res) => {
  const end = apiLatencyHistogram.startTimer();
  requestsCounter.inc();
  
  try {
    const { userId } = req.body;
    if (!userId) {
      end();
      return res.status(400).json({ error: 'userId is required' });
    }

    const result = await redis.attemptPurchase(
      IDEMPOTENCY_KEY, WAREHOUSES[0], WAREHOUSES[1], String(userId), '300'
    );

    if (result === 'DUPLICATE') {
      end();
      return res.status(409).json({ error: 'Duplicate', message: 'You have already secured an item.' });
    }

    if (result === 'SOLD_OUT') {
      end();
      return res.status(400).json({ error: 'Sold Out', message: 'All warehouses are depleted.' });
    }

    const warehouseId = String(result).split(':')[1];

    publishMessage({
      action: 'RESERVE',
      userId,
      warehouseId,
      status: 'RESERVED'
    });

    end();
    return res.status(202).json({
      message: 'Reservation accepted',
      warehouse: warehouseId
    });

  } catch (error) {
    console.error('Error processing purchase:', error);
    end();
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Crash simulation endpoint
app.post('/api/buy/simulate-crash', async (req, res) => {
  try {
    const userId = `crash_user_${Date.now()}`;
    const result = await redis.attemptPurchase(
      IDEMPOTENCY_KEY, WAREHOUSES[0], WAREHOUSES[1], userId, '5' // 5s TTL
    );

    if (result === 'SOLD_OUT' || result === 'DUPLICATE') {
      return res.status(400).json({ error: 'Failed to reserve during crash simulation' });
    }

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

// Payment Webhook
app.post('/webhook/payment', async (req, res) => {
  try {
    const { userId, transactionId } = req.body;
    if (!userId || !transactionId) {
      return res.status(400).json({ error: 'userId and transactionId are required' });
    }

    publishMessage({
      action: 'CONFIRM_PAYMENT',
      userId,
      transactionId
    });

    return res.status(200).json({ received: true });
  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Expose metrics endpoint
app.get('/metrics', async (req, res) => {
  try {
    await updateDynamicMetrics();
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  } catch (ex) {
    res.status(500).end(String(ex));
  }
});

const PORT = process.env.PORT || 3000;
export const server = app.listen(PORT, () => {
  console.log(`API Gateway listening on port ${PORT}`);
});
export { app };
