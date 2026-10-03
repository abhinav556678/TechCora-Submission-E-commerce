import amqplib, { Connection, Channel } from 'amqplib';

export const QUEUE_NAME = 'orders_queue';

let mqConnection: any;
export let mqChannel: any;

export async function setupRabbitMQ() {
  try {
    mqConnection = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    mqChannel = await mqConnection.createChannel();
    await mqChannel.assertQueue(QUEUE_NAME, { durable: true });
    console.log('Connected to RabbitMQ');
  } catch (err) {
    console.error('RabbitMQ connection error:', err);
  }
}

export function publishMessage(payload: any) {
  if (mqChannel) {
    const message = JSON.stringify({
      ...payload,
      timestamp: new Date().toISOString()
    });
    mqChannel.sendToQueue(QUEUE_NAME, Buffer.from(message), { persistent: true });
  }
}
