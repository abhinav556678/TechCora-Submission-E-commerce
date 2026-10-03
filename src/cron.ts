import { pool } from './db';
import { redis, IDEMPOTENCY_KEY } from './redis';
import dotenv from 'dotenv';

dotenv.config();

// The Abandoned Cart (No Payment): If payment is not received within the TTL, 
// a cron job cancels the pending DB record and publishes a restock event to increment Redis.
export async function runAbandonedCartCron() {
  console.log('Running Abandoned Cart Cron Job...');
  try {
    // Find orders that are RESERVED and older than 5 minutes
    const result = await pool.query(`
      SELECT user_id, warehouse_id 
      FROM orders 
      WHERE status = 'RESERVED' 
      AND created_at < NOW() - INTERVAL '5 minutes'
    `);

    for (const row of result.rows) {
      console.log(`Cancelling abandoned cart for user ${row.user_id}`);
      
      // Cancel the order
      await pool.query(`
        UPDATE orders 
        SET status = 'CANCELLED' 
        WHERE user_id = $1 AND status = 'RESERVED'
      `, [row.user_id]);

      // Restock the inventory
      const wh_key = `inventory:${row.warehouse_id}`;
      await redis.incr(wh_key);
      
      // Remove from idempotency set so they can buy again
      await redis.srem(IDEMPOTENCY_KEY, row.user_id);
      
      console.log(`Restocked ${wh_key} for abandoned cart.`);
    }
  } catch (err) {
    console.error('Failed to run abandoned cart cron:', err);
  }
}

// In a real system we'd use node-cron, but for the demo we'll just run it every 1 minute
setInterval(runAbandonedCartCron, 60 * 1000);
console.log('Abandoned Cart Cron Job scheduled.');
