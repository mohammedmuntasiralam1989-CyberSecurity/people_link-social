// redis/cache.js
import redis from 'redis';

class CacheService {
  constructor() {
    this.client = redis.createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });
    this.client.connect();
  }

  // Cache user feed
  async cacheUserFeed(userId, posts, expireTime = 300) {
    const key = `user_feed:${userId}`;
    await this.client.setEx(key, expireTime, JSON.stringify(posts));
  }

  // Get cached user feed
  async getCachedUserFeed(userId) {
    const key = `user_feed:${userId}`;
    const cached = await this.client.get(key);
    return cached ? JSON.parse(cached) : null;
  }

  // Cache user data
  async cacheUser(userId, userData, expireTime = 1800) {
    const key = `user:${userId}`;
    await this.client.setEx(key, expireTime, JSON.stringify(userData));
  }

  // Invalidate cache on data change
  async invalidateUserCache(userId) {
    const keys = [
      `user:${userId}`,
      `user_feed:${userId}`
    ];
    await this.client.del(keys);
  }
}

export default new CacheService();