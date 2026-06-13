'use strict';
import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
let redisUnavailable = false;

/**
 * ioredis client instance.
 * In dev, gives up after 3 retries if Redis isn't available.
 */
const redisClient = new Redis(redisUrl, {
  retryStrategy(times) {
    if (times > 3) {
      if (!redisUnavailable) {
        redisUnavailable = true;
        console.warn('[Redis] ⚠️  Not available — reminder queue disabled. App continues without caching.');
      }
      return null; // stop retrying
    }
    return Math.min(times * 300, 3000);
  },
  lazyConnect: true,
  enableOfflineQueue: false,
});

redisClient.on('ready', () => {
  redisUnavailable = false;
  console.log('[Redis] ✅ Connected');
});

redisClient.on('error', () => {
  // silenced after first warning from retryStrategy
});

redisClient.connect().catch(() => {}); // connect lazily, ignore initial error

export default redisClient;
