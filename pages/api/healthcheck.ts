import { NextApiRequest, NextApiResponse } from 'next';
import instanceId from 'lib/server/instanceId';
import getRedis from 'lib/server/redis';
import { fetchApi } from 'lib/client/api';

export default async (req: NextApiRequest, res: NextApiResponse) => {
    const redisHeartbeat = Date.now();
    const redis = getRedis();

    await redis.set('heartbeat', redisHeartbeat);

    const taskScheduleRes = await fetchApi('/api/task/schedule', req, res);
    const { schedulerStatus } = await taskScheduleRes.json();

    res.json({
        status: 'ok',
        instanceId,
        redisHeartbeat,
        schedulerStatus,
    });
};
