import { NextApiRequest, NextApiResponse } from 'next';
import {
    GoogleApiError,
    makeGoogleAuthedApi,
    sendPlaylistEmailUpdate,
} from 'lib/server/google';

export default makeGoogleAuthedApi(async function playlistsSetupApi(
    { getUserId },
    req: NextApiRequest,
    res: NextApiResponse,
) {
    try {
        const { emailContent: html } = await sendPlaylistEmailUpdate(await getUserId(), {
            sendEmail: false,
            updateCursor: false,
        });
        if (!html) {
            res.write('nothing to preview');
        } else {
            res.write(html);
        }
    } catch (e) {
        if (e instanceof GoogleApiError) {
            res.write('nothing to preview');
        } else {
            throw e;
        }
    }
});
