import makeApi from 'lib/server/api';
import cookie from 'cookie';
import {
    maintainSavedStates,
    processOAuthCode,
    refreshSessionTokenCookie,
    GoogleAuthenticationError,
} from 'lib/server/google';
import getDebug from 'debug';
const debug = getDebug('YTF:pages/api/google_oauth/on_redirect.ts');

export default makeApi(async (req, res) => {
    const cookies = cookie.parse(req.headers['cookie'] || '');
    const clientSessionToken = cookies.session_token;
    const authedSessionToken = String(req.query.state);

    if (
        !clientSessionToken ||
        !authedSessionToken ||
        clientSessionToken !== authedSessionToken
    ) {
        res.statusCode = 403;
        res.json({ status: 'error', message: 'session token does not match (CSRF)' });
        return;
    }

    const authCode = String(req.query.code);

    let authContext;
    try {
        authContext = await processOAuthCode(authedSessionToken, authCode);
    } catch (e) {
        if (e instanceof GoogleAuthenticationError) {
            res.statusCode = 400;
            res.json({
                status: 'error',
                message: `authentication failed ${e.message}`,
            });
            return;
        }
    }

    const tokenInfo = await authContext.auth.getTokenInfo(
        authContext.auth.credentials.access_token,
    );
    debug('new credentials token info %O', tokenInfo);
    if (
        !tokenInfo.scopes.includes('openid') ||
        !tokenInfo.scopes.some((scope) => scope.endsWith('gmail.send')) ||
        !tokenInfo.scopes.some((scope) => scope.endsWith('youtube.readonly')) ||
        !tokenInfo.scopes.some((scope) => scope.endsWith('email')) ||
        !tokenInfo.scopes.some((scope) => scope.endsWith('profile'))
    ) {
        res.statusCode = 400;
        res.json({
            status: 'error',
            message: 'broken oauth scope',
            scopes: tokenInfo.scopes,
        });
        return;
    }

    refreshSessionTokenCookie(authedSessionToken, res);
    await maintainSavedStates('refresh_ex', {
        sessionToken: authedSessionToken,
        userId: await authContext.getUserId(),
    });
    res.redirect('/');
});
