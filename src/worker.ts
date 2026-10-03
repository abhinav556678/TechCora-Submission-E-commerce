import amqplib from 'amqplib';
import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const QUEUE_NAME = 'orders_queue';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.POSTGRES_USER || 'flash_user',
  password: process.env.POSTGRES_PASSWORD || 'flash_password',
  database: process.env.POSTGRES_DB || 'flash_sale',
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      warehouse_id VARCHAR(50) NOT NULL,
      status VARCHAR(50) NOT NULL,
      transaction_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id) -- Idempotency constraint for Phase 1
    );
  `);
  console.log('Database initialized');
}

async function startWorker() {
  try {
    await initDB();

    const connection = await amqplib.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
    const channel = await connection.createChannel();

    await channel.assertQueue(QUEUE_NAME, { durable: true });
    
    // Prefetch 1 to process one message at a time
    channel.prefetch(1);
    
    console.log(`Worker waiting for messages in ${QUEUE_NAME}...`);

    channel.consume(QUEUE_NAME, async (msg) => {
      if (msg !== null) {
        try {
          const orderData = JSON.parse(msg.content.toString());
          console.log('Processing order:', orderData);

          // Idempotent insert
          await pool.query(
            `INSERT INTO orders (user_id, warehouse_id, status) 
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id) DO NOTHING`,
            [orderData.userId, orderData.warehouseId, orderData.status]
          );

          // Manual ACK after successful DB commit
          channel.ack(msg);
          console.log(`Order ${orderData.userId} persisted and message ACKed.`);
        } catch (err) {
          console.error('Error processing message, returning to queue:', err);
          // NACK the message to requeue it
          channel.nack(msg);
        }
      }
    });

  } catch (err) {
    console.error('Worker failed to start:', err);
  }
}

startWorker();
