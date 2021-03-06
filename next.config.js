/* eslint-disable @typescript-eslint/no-var-requires */
const { withSentryConfig } = require('@sentry/nextjs');

module.exports = withSentryConfig(
    {
        future: {
            webpack5: true,
        },
        serverRuntimeConfig: {
            SENDGRID_TOKEN: process.env.SENDGRID_TOKEN,
            GOOGLE_OAUTH_CLIENT_SECRET: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
            REDIS_URL: process.env.REDISCLOUD_URL || process.env.REDIS_URL,
            REDIS_PREFIX: process.env.REDIS_PREFIX || '',
            GOOGLE_OAUTH_CLIENT_ID: process.env.GOOGLE_OAUTH_CLIENT_ID,
            GOOGLE_OAUTH_REDIRECT_URL: `${process.env.GOOGLE_OAUTH_REDIRECT_URL_PREFIX}/api/google_oauth/on_redirect`,
            GOOGLE_OAUTH_SCOPES: [
                'openid',
                'email',
                'profile',
                'https://www.googleapis.com/auth/gmail.send',
                'https://www.googleapis.com/auth/youtube.readonly',
            ],
        },
    },
    {},
);
