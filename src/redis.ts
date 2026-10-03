import Redis from 'ioredis';
import dotenv from 'dotenv';
dotenv.config();

export const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

redis.on('connect', () => console.log('Connected to Redis'));
redis.on('error', (err) => console.error('Redis connection error:', err));

export const IDEMPOTENCY_KEY = 'users:purchased';
export const WAREHOUSES = ['inventory:WH_A', 'inventory:WH_B'];

const PURCHASE_LUA_SCRIPT = `
local idempotency_key = KEYS[1]
local user_id = ARGV[1]
local ttl = tonumber(ARGV[2])

if redis.call('SISMEMBER', idempotency_key, user_id) == 1 then
    return "DUPLICATE"
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

return "SOLD_OUT"
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
    ): Promise<string>;
  }
}
