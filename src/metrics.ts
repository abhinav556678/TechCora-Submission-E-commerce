import client from 'prom-client';
import { redis, WAREHOUSES } from './redis';
import { mqChannel, QUEUE_NAME } from './rabbitmq';

export const register = new client.Registry();
client.collectDefaultMetrics({ register });

export const requestsCounter = new client.Counter({
  name: 'flash_api_requests_total',
  help: 'Total number of purchase requests',
  registers: [register]
});

export const inventoryGauge = new client.Gauge({
  name: 'flash_inventory_remaining',
  help: 'Current inventory remaining by warehouse',
  labelNames: ['warehouse'],
  registers: [register]
});

export const queueGauge = new client.Gauge({
  name: 'flash_queue_size',
  help: 'Current number of orders in the RabbitMQ queue',
  registers: [register]
});

// Added API latency metric as requested by spec
export const apiLatencyHistogram = new client.Histogram({
  name: 'flash_api_latency_seconds',
  help: 'Latency of API requests in seconds',
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  registers: [register]
});

export async function updateDynamicMetrics() {
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
}
