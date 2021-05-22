import * as Sentry from '@sentry/nextjs';

Sentry.init({
    dsn: process.env.SENTRY_DSN,
});
Sentry.setTag('isServer', 'yes');
