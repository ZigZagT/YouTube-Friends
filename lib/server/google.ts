import { google, Auth, youtube_v3, oauth2_v2 } from 'googleapis';
import getConfig from 'next/config';
import getRedis from 'lib/server/redis';
import crypto from 'crypto';
import { NextApiRequest, NextApiResponse } from 'next';
import cookie from 'cookie';
import makeApi, { APIType } from 'lib/server/api';
import _ from 'lodash';
import getDebug from 'debug';
import nodemailer from 'nodemailer';
import { buildEmail } from './YoutubeEmail';

const debug = getDebug('YTF:lib/server/google.ts');

export class GoogleApiError extends Error {}

class GoogleAuthenticationError extends GoogleApiError {}

class UserProfileHasIssueError extends GoogleApiError {}

class PlaylistNotFoundError extends GoogleApiError {}

const redis = getRedis();
const SESSION_EX = 3600 * 24 * 7; // 7 days
const USER_PROFILE_EX = 60 * 15; // 15 min
const USER_DATA_EX = 3600 * 24 * 30; // 30 days

const {
    serverRuntimeConfig: {
        GOOGLE_OAUTH_CLIENT_ID,
        GOOGLE_OAUTH_REDIRECT_URL,
        GOOGLE_OAUTH_SCOPES,
        GOOGLE_OAUTH_CLIENT_SECRET,
    },
} = getConfig();

function generateNewSessionToken() {
    return crypto.randomBytes(24).toString('hex');
}

async function getUserIdOfSessionToken(sessionToken: string): Promise<string> {
    const key = `userIdOfSessionToken:${sessionToken}`;
    const resp = await redis.get(key);
    if (resp) {
        await redis.expire(key, SESSION_EX);
        return JSON.parse(resp);
    }
    return null;
}

async function setUserIdOfSessionToken(sessionToken: string, userId: string) {
    const key = `userIdOfSessionToken:${sessionToken}`;
    return await redis.set(key, JSON.stringify(userId), 'EX', SESSION_EX);
}

async function getOAuthCredentialsOfUserId(userId: string): Promise<Auth.Credentials> {
    const key = `oauthCredentialsOfUserId:${userId}`;
    const resp = await redis.get(key);
    if (resp) {
        await redis.expire(key, USER_DATA_EX);
        return JSON.parse(resp);
    }
    return null;
}

async function setOAuthCredentialsOfUserId(
    userId: string,
    newOAuthCredentials: Auth.Credentials,
) {
    const key = `oauthCredentialsOfUserId:${userId}`;
    return await redis.set(key, JSON.stringify(newOAuthCredentials), 'EX', USER_DATA_EX);
}

export type UserProfile = {
    userId: string;
    email: string;
    name: string;
    picture?: string;
};

async function getCachedProfileOfUserId(userId: string): Promise<UserProfile> {
    const key = `cachedProfileOfUserId:${userId}`;
    const resp = await redis.get(key);
    if (resp) {
        await redis.expire(key, USER_PROFILE_EX);
        return JSON.parse(resp);
    }
    return null;
}

async function setCachedProfileOfUserId(userId: string, profile: UserProfile) {
    const key = `cachedProfileOfUserId:${userId}`;
    return await redis.set(key, JSON.stringify(profile), 'EX', USER_PROFILE_EX);
}

export type YouTubeMailSettings = {
    to_name: string;
    to_email: string;
    playlist_id: string;
    etag?: string;
    lastProcessedPublishDate?: Date;
};

export async function getYouTubeMailSettingsOfUserId(
    userId: string,
): Promise<YouTubeMailSettings> {
    const key = `youTubeMailSettingsOfUserId:${userId}`;
    const resp = await redis.get(key);
    if (resp) {
        await redis.expire(key, USER_DATA_EX);
        const data = JSON.parse(resp);
        return {
            ...data,
            // fuck javascript: new Date(undefined) returns a invalid value, while new Date(null) returns epoch
            lastProcessedPublishDate: new Date(data.lastProcessedPublishDate || null),
        };
    }
    return null;
}

export async function setYouTubeMailSettingsOfUserId(
    userId: string,
    youTubeMailSettings: YouTubeMailSettings,
) {
    const key = `youTubeMailSettingsOfUserId:${userId}`;
    let oldValue = await getYouTubeMailSettingsOfUserId(userId);
    if (oldValue && oldValue.playlist_id !== youTubeMailSettings.playlist_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        oldValue = {} as any;
    }
    const newValue = {
        ...oldValue,
        ...youTubeMailSettings,
    };
    if (newValue.lastProcessedPublishDate instanceof Date) {
        // @ts-expect-error force date to be persisted as number
        newValue.lastProcessedPublishDate = newValue.lastProcessedPublishDate.getTime();
    }
    return await redis.set(key, JSON.stringify(newValue), 'EX', USER_DATA_EX);
}

export async function maintainSavedStates(
    action: 'refresh_ex' | 'delete',
    {
        sessionToken,
        userId,
        keepSessionAlive = false,
    }: { sessionToken?: string; userId?: string; keepSessionAlive?: boolean },
) {
    const keys: { [key: string]: number } = {};
    if (sessionToken) {
        if (!keepSessionAlive) {
            keys[`userIdOfSessionToken:${sessionToken}`] = SESSION_EX;
        }
    }
    if (userId) {
        if (!keepSessionAlive) {
            keys[`oauthCredentialsOfUserId:${userId}`] = USER_DATA_EX;
        }
        keys[`youTubeMailSettingsOfUserId:${userId}`] = USER_DATA_EX;
        keys[`cachedProfileOfUserId:${userId}`] = USER_PROFILE_EX;
    }
    if (action === 'delete') {
        return await redis.del(...Object.keys(keys));
    }
    if (action === 'refresh_ex') {
        const pipeline = redis.pipeline();
        Object.entries(keys).map(([key, ex]) => pipeline.expire(key, ex));
        return await pipeline.exec();
    }
}

function getProfileFromUserInfo(userInfo: oauth2_v2.Schema$Userinfo): UserProfile {
    if (!userInfo.id) {
        throw new UserProfileHasIssueError('cannot find a valid user id in profile');
    }
    if (!userInfo.verified_email || !userInfo.email) {
        throw new UserProfileHasIssueError('cannot find verified email in profile');
    }
    if (!userInfo.name) {
        throw new UserProfileHasIssueError('cannot find name in profile');
    }

    return {
        userId: userInfo.id,
        email: userInfo.email,
        name: userInfo.name,
        picture: userInfo.picture,
    };
}

type AuthContext = {
    auth: Auth.OAuth2Client;
    getAuthUrl: (state: string) => string;
    getUserId: () => Promise<string>;
    getProfile: (forceRefresh?: boolean) => Promise<UserProfile>;
    waitForNextTokenRefresh: () => Promise<unknown>;
};

async function getUserAuthContext(userId?: string): Promise<AuthContext> {
    const oauth2Client = new google.auth.OAuth2(
        GOOGLE_OAUTH_CLIENT_ID,
        GOOGLE_OAUTH_CLIENT_SECRET,
        GOOGLE_OAUTH_REDIRECT_URL,
    );

    let tokens = userId && (await getOAuthCredentialsOfUserId(userId));

    if (tokens) {
        oauth2Client.setCredentials(tokens);
    }

    const oauth2 = google.oauth2({
        version: 'v2',
        auth: oauth2Client,
    });

    async function getProfile(forceRefresh = false) {
        let profile: UserProfile;
        if (userId != null && !forceRefresh) {
            profile = await getCachedProfileOfUserId(userId);
        }
        if (!profile) {
            // FIXME why not oauth2.userinfo.v2.me.get({});
            try {
                const userInfoRes = await oauth2.userinfo.get({});
                profile = getProfileFromUserInfo(userInfoRes.data);
            } catch (err) {
                debug('getProfile oauth2.userinfo.get error: %O', err);
                throw err;
            }
            userId = profile.userId;
            await setCachedProfileOfUserId(userId, profile);
        }
        return profile;
    }

    async function getUserId() {
        if (userId == null) {
            await getProfile();
        }
        return userId;
    }

    const waitQueue: (() => void)[] = [];

    const waitForNextTokenRefresh = () => {
        debug('waitForNextTokenRefresh');
        return Promise.race([
            new Promise((resolve, reject) => {
                setTimeout(
                    () => reject(new Error('waitForNextTokenRefresh timeout')),
                    2000,
                );
            }),
            new Promise<void>((resolve) => {
                waitQueue.push(resolve);
            }),
        ]);
    };

    oauth2Client.on('tokens', async (newTokens) => {
        debug('oauth2Client received new tokens %O', newTokens);
        tokens = {
            ...tokens,
            ..._.pickBy(newTokens),
        };
        // FUCK GOOGLE: getToken() doesn't call setCredentials()
        // FUCK GOOGLE: setCredentials() doesn't emit "token" event
        oauth2Client.setCredentials(tokens);
        if (userId == null) {
            userId = (await getProfile()).userId;
        }
        await setOAuthCredentialsOfUserId(userId, tokens);
        while (waitQueue.length) {
            waitQueue.pop()();
        }
        debug('done receive new tokens');
    });

    return {
        auth: oauth2Client,
        getAuthUrl: (state: string) =>
            oauth2Client.generateAuthUrl({
                access_type: 'offline',
                scope: GOOGLE_OAUTH_SCOPES.join(' '),
                state,
            }),
        getProfile,
        getUserId,
        waitForNextTokenRefresh,
    };
}

export async function processOAuthCode(sessionToken: string, code: string) {
    const authContext = await getUserAuthContext();
    await authContext.auth.getToken(code);
    await authContext.waitForNextTokenRefresh();
    await setUserIdOfSessionToken(sessionToken, (await authContext.getProfile()).userId);
    return authContext;
}

export function refreshSessionTokenCookie(sessionToken: string, res: NextApiResponse) {
    res.setHeader(
        'set-cookie',
        cookie.serialize('session_token', sessionToken, {
            httpOnly: true,
            maxAge: SESSION_EX,
            sameSite: 'lax',
            path: '/',
            secure: process.env.NODE_ENV === 'production',
        }),
    );
}

export function deleteSessionTokenCookie(res: NextApiResponse) {
    res.setHeader(
        'set-cookie',
        cookie.serialize('session_token', '', {
            httpOnly: true,
            expires: new Date(0),
            sameSite: 'lax',
            path: '/',
            secure: process.env.NODE_ENV === 'production',
        }),
    );
}

type GoogleAuthedAPIType = (
    authContext: AuthContext,
    req: NextApiRequest,
    res: NextApiResponse,
) => Promise<void>;

export function makeGoogleAuthedApi(api: GoogleAuthedAPIType): APIType {
    return makeApi(async function GoogleAuthedApiWrapper(req, res) {
        const cookies = cookie.parse(req.headers['cookie'] || '');
        const sessionToken = cookies.session_token || generateNewSessionToken();
        const userId = await getUserIdOfSessionToken(sessionToken);
        const authContext = await getUserAuthContext(userId);
        const write401 = () => {
            const newToken = generateNewSessionToken();
            refreshSessionTokenCookie(newToken, res);
            res.statusCode = 401;
            res.json({
                authUrl: authContext.getAuthUrl(newToken),
            });
        };

        if (userId == null) {
            write401();
            return;
        }

        try {
            debug('makeGoogleAuthedApi for %s: %O', api.name || '[anonymous]', {
                sessionToken,
                profile: await authContext.getProfile(),
            });
            refreshSessionTokenCookie(sessionToken, res);
            await maintainSavedStates('refresh_ex', {
                sessionToken,
                userId,
            });
            return await api(authContext, req, res);
        } catch (e) {
            if (e instanceof GoogleAuthenticationError) {
                await maintainSavedStates('delete', { sessionToken });
                deleteSessionTokenCookie(res);
                write401();
                return;
            } else {
                throw e;
            }
        }
    });
}

export async function getPlaylists(auth: Auth.OAuth2Client, etag?: string) {
    const youtube = google.youtube({
        version: 'v3',
        auth,
    });
    // Create custom HTTP headers for the request to enable use of eTags
    const headers = {};
    if (etag) {
        headers['If-None-Match'] = etag;
    }

    const playlists: youtube_v3.Schema$Playlist[] = [];
    let pageToken: string;
    let newEtag: string;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            const res = await youtube.playlists.list(
                {
                    part: ['id', 'snippet', 'localizations', 'contentDetails'],
                    mine: true,
                    maxResults: 15,
                    pageToken,
                },
                {
                    headers,
                },
            );
            if (res.status === 200) {
                pageToken = res.data.nextPageToken;
                if (newEtag == null) {
                    newEtag = res.data.etag;
                }
                playlists.push(...res.data.items);
                if (pageToken) {
                    continue;
                }
            }
        } catch (e) {
            if (e.code === 401) {
                throw new GoogleAuthenticationError(e.errors);
            } else {
                console.error('unknown error from google api:', e);
                throw e;
            }
        }
        break;
    }

    return {
        etag: newEtag,
        playlists,
    };
}

async function getPlaylistItems(
    playlistId: string,
    minDate: Date,
    auth: Auth.OAuth2Client,
    etag?: string,
) {
    const youtube = google.youtube({
        version: 'v3',
        auth,
    });
    // Create custom HTTP headers for the request to enable use of eTags
    const headers = {};
    if (etag) {
        headers['If-None-Match'] = etag;
    }

    const playlistItems: youtube_v3.Schema$PlaylistItem[] = [];
    let pageToken: string;
    let newEtag: string;

    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            const res = await youtube.playlistItems.list(
                {
                    part: ['id', 'snippet', 'status', 'contentDetails'],
                    playlistId,
                    maxResults: 15,
                    pageToken,
                },
                {
                    headers,
                },
            );
            if (res.status === 200) {
                pageToken = res.data.nextPageToken;
                if (newEtag == null) {
                    newEtag = res.data.etag;
                }
                res.data.items.forEach((item) => {
                    const publishedAt = new Date(item.snippet.publishedAt);
                    if (minDate == null || publishedAt > minDate) {
                        playlistItems.push(item);
                    }
                });
                if (pageToken) {
                    continue;
                }
            }
        } catch (e) {
            if (e.code === 401) {
                throw new GoogleAuthenticationError(e.errors);
            } else if (e.code === 404) {
                throw new PlaylistNotFoundError(e.errors);
            } else {
                console.error('unknown error from google api:', e);
                throw e;
            }
        }
        break;
    }

    playlistItems.reverse();

    return {
        etag: newEtag,
        playlistItems,
    };
}

export async function sendGmail(
    config: {
        fromName?: string;
        fromEmail: string;
        toName?: string;
        toEmail: string;
        subject: string;
        htmlContent: string;
        textContent?: string;
    },
    auth: Auth.OAuth2Client,
    dryRun = false,
) {
    const transporter = nodemailer.createTransport({
        streamTransport: true,
        newline: 'unix',
        buffer: true,
    });

    const message: string = await new Promise((resolve, reject) => {
        transporter.sendMail(
            {
                from: { name: config.fromName, address: config.fromEmail },
                to: { name: config.toName, address: config.toEmail },
                subject: config.subject,
                html: config.htmlContent,
                text: config.textContent,
            },
            (err, info) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(info.message.toString());
                }
            },
        );
    });

    const encodedMessage = Buffer.from(message)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

    if (dryRun) {
        debug('sending email message: \n%s', message);
        debug('encoded as \n%s', encodedMessage);
        return;
    }

    const gmail = google.gmail({
        version: 'v1',
        auth,
    });

    const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
            raw: encodedMessage,
        },
    });

    debug(
        'gmail.users.messages.send respond %d - %s %O',
        response.status,
        response.statusText,
        response.data,
    );
    return response;
}

export async function sendPlaylistEmailUpdate(
    userId: string,
    { updateCursor = true, sendEmail = true } = {},
) {
    debug(
        'sendPlaylistEmailUpdate(%s, { updateCursor = %s, sendEmail = %s})',
        userId,
        updateCursor,
        sendEmail,
    );
    const authContext = await getUserAuthContext(userId);
    const userProfile = await authContext.getProfile();
    const emailSettings = await getYouTubeMailSettingsOfUserId(userId);

    if (!emailSettings) {
        return null;
    }

    const { etag, playlistItems } = await getPlaylistItems(
        emailSettings.playlist_id,
        emailSettings.lastProcessedPublishDate,
        authContext.auth,
        emailSettings.etag,
    );

    debug('received %d items from sendPlaylistEmailUpdate()', playlistItems.length);

    if (!playlistItems.length) {
        return null;
    }

    if (updateCursor) {
        await setYouTubeMailSettingsOfUserId(userId, {
            ...emailSettings,
            etag,
            lastProcessedPublishDate: new Date(
                Math.max(
                    // @ts-expect-error fuck typescript: Math.max supports Date type
                    ...playlistItems.map((item) => new Date(item.snippet.publishedAt)),
                ),
            ),
        });
    }

    function getSafeSubject(subject: string): string {
        let ret = subject;
        const hardLimit = 128;
        if (subject.length > hardLimit) {
            ret = subject.substr(0, hardLimit - 3) + '...';
        }
        return ret;
    }

    let previewText =
        playlistItems.length > 1
            ? `Shared ${playlistItems.length} videos to you! `
            : 'Shared a video to you! ';
    previewText += playlistItems.map((item) => item.snippet.title).join('; ');
    const subject = getSafeSubject(previewText);

    const emailContent = buildEmail(subject, previewText, playlistItems);

    if (sendEmail) {
        const resp = await sendGmail(
            {
                fromName: userProfile.name,
                fromEmail: userProfile.email,
                toEmail: emailSettings.to_email,
                toName: emailSettings.to_name,
                subject,
                htmlContent: emailContent,
            },
            authContext.auth,
        );
        debug('email sent %O', resp);
    } else {
        debug('send email skipped due to user config');
    }

    return {
        emailContent,
        subject,
        fromName: userProfile.name,
        fromEmail: userProfile.email,
        toEmail: emailSettings.to_email,
        toName: emailSettings.to_name,
    };
}
