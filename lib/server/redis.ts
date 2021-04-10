import Redis from 'ioredis';
import getConfig from 'next/config';

let globalRedis: Redis.Redis;

export function getRedis(reuseGlobalRedis = true) {
    if (reuseGlobalRedis && globalRedis) {
        return globalRedis;
    }
    const {
        serverRuntimeConfig: { REDIS_URL, REDIS_PREFIX },
    } = getConfig();

    const redis = new Redis(REDIS_URL + '?allowUsernameInURI=true', {
        keyPrefix: REDIS_PREFIX,
    });
    if (reuseGlobalRedis) {
        globalRedis = redis;
    }
    return redis;
}

export default getRedis;
