import { NextApiRequest, NextApiResponse } from 'next';
import {
    makeGoogleAuthedApi,
    getPlaylists,
    setYouTubeMailSettingsOfUserId,
    getYouTubeMailSettingsOfUserId,
    sendPlaylistEmailUpdate,
    YouTubeMailSettings,
} from 'lib/server/google';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import getDebug from 'debug';
const debug = getDebug('YTF:pages/api/playlists_setup.ts');

const ajv = new Ajv();
addFormats(ajv);
const schema = ajv.compile({
    type: 'object',
    additionalProperties: false,
    required: ['to_name', 'to_email', 'playlist_id'],
    properties: {
        send_test_email: {
            type: 'boolean',
        },
        to_name: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
        },
        to_email: {
            type: 'string',
            minLength: 1,
            maxLength: 200,
            format: 'email',
        },
        playlist_id: {
            type: 'string',
            minLength: 4,
            maxLength: 200,
        },
    },
});

export default makeGoogleAuthedApi(async function playlistsSetupApi(
    { getUserId, getProfile, auth },
    req: NextApiRequest,
    res: NextApiResponse,
) {
    const profile = await getProfile();
    if (req.method === 'GET') {
        res.json({
            ...(await getPlaylists(auth)),
            profile,
            config: await getYouTubeMailSettingsOfUserId(await getUserId()),
        });
    } else if (req.method === 'POST') {
        const settings: YouTubeMailSettings = req.body;
        if (typeof settings !== 'object') {
            res.statusCode = 400;
            res.json({
                status: 'error',
                message: 'need json',
            });
            return;
        }
        if (!schema(settings)) {
            res.statusCode = 400;
            res.json({
                status: 'error',
                message: schema.errors,
            });
            return;
        }
        // @ts-expect-error fuck ajv
        const sendEmail = Boolean(settings.send_test_email);
        delete settings['send_test_email'];

        if (sendEmail && process.env.NODE_ENV === 'production') {
            res.statusCode = 403;
            res.json({
                status: 'error',
                message: 'send test email is not allowed',
            });
            return;
        }
        await setYouTubeMailSettingsOfUserId(await getUserId(), settings);
        const email = await sendPlaylistEmailUpdate(await getUserId(), {
            updateCursor: false,
            sendEmail,
        });
        res.json({
            status: 'ok',
            email,
        });
    }
});
