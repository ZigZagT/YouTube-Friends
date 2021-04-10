import getRedis from 'lib/server/redis';
import getDebug from 'debug';
import {
    maintainSavedStates,
    GoogleApiError,
    sendPlaylistEmailUpdate,
} from 'lib/server/google';
import { NextApiRequest, NextApiResponse } from 'next';
import getConfig from 'next/config';

const debugKey = 'YTF:pages/api/task/schedule.ts';
const debug = getDebug(debugKey);
getDebug.enable(`${getDebug.disable()},${debugKey}`);
const redis = getRedis();

const TASK_INTERVAL = 60 * 5 * 1000; // 5min
let IS_STARTED = false;
let taskCount = 0;
let userCount = 0;
const taskHandles: number[] = [];

async function getAllUserIds() {
    const {
        serverRuntimeConfig: { REDIS_PREFIX },
    } = getConfig();

    const keyPrefix = `${REDIS_PREFIX}youTubeMailSettingsOfUserId:`;
    const keys = await redis.keys(`${keyPrefix}*`);
    const allUserIds = keys.map((key) => {
        return key.split(keyPrefix)[1];
    });
    return allUserIds;
}

async function start() {
    if (!IS_STARTED) {
        debug('launching scheduler');
        IS_STARTED = true;
        taskHandles.push(0);
    }
    taskHandles.pop();
    while (taskHandles.length) {
        debug('found previous running timeout tasks, cleaning them up...');
        clearTimeout(taskHandles.pop());
    }
    taskCount += 1;
    const userIds = await getAllUserIds();
    userCount = userIds.length;
    debug('scheduler starting task #%d, user count: %d', taskCount, userCount);
    for (const userId of userIds) {
        try {
            await sendPlaylistEmailUpdate(userId, {
                updateCursor: process.env.NODE_ENV === 'production',
                sendEmail: process.env.NODE_ENV === 'production',
            });
            await maintainSavedStates('refresh_ex', { userId });
        } catch (e) {
            if (e instanceof GoogleApiError) {
                await maintainSavedStates('delete', {
                    userId,
                    keepSessionAlive: true,
                });
            } else {
                console.error(e);
            }
        }
    }
    // @ts-expect-error fuck typescript: setTimeout returns a number
    taskHandles.push(setTimeout(start, TASK_INTERVAL));
}

export default async (req: NextApiRequest, res: NextApiResponse) => {
    if (!IS_STARTED) {
        start();
    }
    res.json({ status: 'ok', schedulerStatus: { IS_STARTED, taskCount, userCount } });
};