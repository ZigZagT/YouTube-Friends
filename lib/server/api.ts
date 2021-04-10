import * as Sentry from '@sentry/node';
import { NextApiRequest, NextApiResponse } from 'next';
import getConfig from 'next/config';

export type APIType = (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

const {
    publicRuntimeConfig: { SENTRY_DSN },
} = getConfig();

if (SENTRY_DSN) {
    Sentry.init({
        enabled: process.env.NODE_ENV === 'production',
        dsn: SENTRY_DSN,
    });
}

const makeApi = (api: APIType): APIType => {
    return async (req, res) => {
        try {
            await api(req, res);
            if (!res.writableEnded) {
                res.end();
            }
        } catch (e) {
            console.error('api error: ', e);
            Sentry.captureException(e);
            if (!res.headersSent) {
                res.status(500);
            }
            if (!res.writableEnded) {
                res.end('Oops, Something went wrong.');
            }
        }
    };
};

export default makeApi;
