import Redis from 'ioredis';
import { redis, IDEMPOTENCY_KEY } from './redis';
import { pool } from './db';
import dotenv from 'dotenv';
dotenv.config();

export function setupReaper() {
  const reaperClient = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  
  // Enable keyspace notifications on main client
  redis.config('SET', 'notify-keyspace-events', 'Ex');

  reaperClient.subscribe('__keyevent@0__:expired', (err) => {
    if (err) console.error('Failed to subscribe to expirations', err);
    else console.log('Reaper listening for expired reservations...');
  });

  reaperClient.on('message', async (channel, message) => {
    if (message.startsWith('reservation:')) {
      const parts = message.split(':');
      if (parts.length >= 4) {
        const wh_key = parts[1] + ':' + parts[2];
        const user_id = parts.slice(3).join(':');
        
        console.log(`Reaper: Reservation expired for ${user_id}. Checking DB...`);
        
        try {
          // Check DB to ensure worker didn't actually process it successfully
          const result = await pool.query('SELECT status FROM orders WHERE user_id = $1', [user_id]);
          
          if (result.rowCount === 0) {
            // Not in DB! Worker must have crashed or queue delayed massively. 
            // We can safely restock it.
            console.log(`Reaper: User ${user_id} not in DB. Restocking ${wh_key}`);
            await redis.incr(wh_key);
            await redis.srem(IDEMPOTENCY_KEY, user_id);
          } else {
            console.log(`Reaper: User ${user_id} found in DB with status ${result.rows[0].status}. Skipping restock.`);
          }
        } catch (err) {
          console.error('Reaper DB check failed:', err);
        }
      }
    }
  });
}
