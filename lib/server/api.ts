import { NextApiRequest, NextApiResponse } from 'next';
import { withSentry } from '@sentry/nextjs';

export type APIType = (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

const makeApi = (api: APIType): APIType => {
    const sentryWrappedApi = withSentry(api);
    return async (req, res) => {
        try {
            await sentryWrappedApi(req, res);
            if (!res.writableEnded) {
                res.end();
            }
        } catch (e) {
            console.error('api error: ', e);
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
