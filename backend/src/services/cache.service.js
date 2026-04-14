const { createClient } = require("redis");

const env = require("../config/env");

const memoryCache = new Map();
let redisClient = null;
let redisReady = false;
let redisInitPromise = null;

function nowMs() {
  return Date.now();
}

function cleanupExpiredMemoryEntries() {
  const current = nowMs();
  for (const [key, value] of memoryCache.entries()) {
    if (value.expiresAt <= current) {
      memoryCache.delete(key);
    }
  }
}

async function ensureRedisClient() {
  if (!env.redisUrl) {
    return null;
  }

  if (redisReady && redisClient) {
    return redisClient;
  }

  if (!redisInitPromise) {
    redisInitPromise = (async () => {
      const client = createClient({
        url: env.redisUrl
      });

      client.on("error", (error) => {
        console.warn(`[cache] Redis unavailable, falling back to in-memory cache: ${error.message}`);
      });

      await client.connect();
      redisClient = client;
      redisReady = true;
      return client;
    })().catch((error) => {
      redisReady = false;
      redisClient = null;
      redisInitPromise = null;
      console.warn(`[cache] Failed to connect Redis, using in-memory cache: ${error.message}`);
      return null;
    });
  }

  return redisInitPromise;
}

async function getJson(key) {
  const redis = await ensureRedisClient();
  if (redis) {
    try {
      const raw = await redis.get(key);
      if (!raw) {
        return null;
      }
      return JSON.parse(raw);
    } catch (_error) {
      // Fall through to in-memory cache.
    }
  }

  cleanupExpiredMemoryEntries();
  const cached = memoryCache.get(key);
  if (!cached) {
    return null;
  }

  return cached.value;
}

async function setJson(key, value, ttlSeconds) {
  const safeTtl = Number(ttlSeconds || env.detectionCacheTtlSeconds || 900);
  const redis = await ensureRedisClient();

  if (redis) {
    try {
      await redis.setEx(key, safeTtl, JSON.stringify(value));
      return;
    } catch (_error) {
      // Fall through to in-memory cache.
    }
  }

  cleanupExpiredMemoryEntries();
  memoryCache.set(key, {
    value,
    expiresAt: nowMs() + safeTtl * 1000
  });
}

module.exports = {
  getJson,
  setJson
};
