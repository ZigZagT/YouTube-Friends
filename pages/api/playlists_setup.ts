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
    type: 'array',
    minItems: 1,
    maxItems: 3,
    items: {
        type: 'object',
        additionalProperties: false,
        required: ['to_name', 'to_email', 'playlist_id'],
        properties: {
            serial: {
                type: 'integer',
            },
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
    },
});

export default makeGoogleAuthedApi(async function playlistsSetupApi(
    { getUserId, getProfile, auth },
    req: NextApiRequest,
    res: NextApiResponse,
) {
    const profile = await getProfile();
    const currentSettings =
        (await getYouTubeMailSettingsOfUserId(await getUserId())) || [];

    if (req.method === 'GET') {
        const emailPreviews = await sendPlaylistEmailUpdate(await getUserId(), {
            updateCursor: false,
            sendEmail: false,
        });
        res.json({
            ...(await getPlaylists(auth)),
            profile,
            settings: currentSettings,
            emailPreviews,
        });
    } else if (req.method === 'POST') {
        const receivedSettings: YouTubeMailSettings[] = req.body;
        if (!schema(receivedSettings)) {
            res.statusCode = 400;
            res.json({
                status: 'error',
                message: schema.errors,
            });
            return;
        }

        const existingSerials = currentSettings.map((settings) => settings.serial);
        let sendEmail = false;
        const fingerPrints = new Set();
        for (const settings of receivedSettings) {
            if (settings.serial != null && !existingSerials.includes(settings.serial)) {
                res.statusCode = 400;
                res.json({
                    status: 'error',
                    message: 'bad serial',
                });
                return;
            }
            // @ts-expect-error fuck ajv
            sendEmail = sendEmail || Boolean(settings.send_test_email);
            if (sendEmail && process.env.NODE_ENV === 'production') {
                res.statusCode = 403;
                res.json({
                    status: 'error',
                    message: 'send test email is not allowed',
                });
                return;
            }

            const fingerPrint = `${settings.to_email}*/*${settings.playlist_id}`;
            if (fingerPrints.has(fingerPrint)) {
                res.statusCode = 400;
                res.json({
                    status: 'error',
                    message: 'duplicated settings found',
                });
                return;
            }
            fingerPrints.add(fingerPrint);
        }

        await setYouTubeMailSettingsOfUserId(await getUserId(), receivedSettings);

        const emailPreviews = await sendPlaylistEmailUpdate(await getUserId(), {
            updateCursor: false,
            sendEmail,
        });

        res.json({
            status: 'ok',
            updatedSettings: await getYouTubeMailSettingsOfUserId(await getUserId()),
            emailPreviews,
        });
    }
});
