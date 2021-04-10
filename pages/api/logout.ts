import makeApi from 'lib/server/api';
import cookie from 'cookie';
import { deleteSessionTokenCookie, maintainSavedStates } from 'lib/server/google';

export default makeApi(async (req, res) => {
    const cookies = cookie.parse(req.headers['cookie']);
    const sessionToken = cookies.session_token;
    if (sessionToken) {
        await maintainSavedStates('delete', { sessionToken });
    }
    deleteSessionTokenCookie(res);
    res.json({ status: 'ok', message: 'logout' });
});
