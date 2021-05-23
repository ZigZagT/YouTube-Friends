import short from 'short-uuid';
import fetchPonyfill from 'fetch-ponyfill';
import getConfig from 'next/config';
import getDebug from 'debug';
const debug = getDebug(module.id);
getDebug.enable(`${getDebug.disable()},${module.id}`);

const { fetch } = fetchPonyfill();

export async function sendToPub(config, res) {
    debug('sendToPub with config %o', config);
    const {
        serverRuntimeConfig: { SENDGRID_TOKEN },
    } = getConfig();
    try {
        const {
            authToken,
            sender,
            senderName,
            receiver,
            receiverName,

            title,
            url,
            description,
            likedAt,
        } = config;

        const videoId = url.match(/(?:\/|v=)([^/]{9,13})\/?$/);
        const videoPreviewImg = videoId
            ? `<a href="${url}"><img style="max-width: 100%" src="https://img.youtube.com/vi/${videoId[1]}/maxresdefault.jpg" /></a>`
            : '';

        if (authToken !== '57cc15f7-e41d-40bb-adde-9feed192eb6e') {
            res.status(401).send('401 Unauthorized');
            return;
        }

        const sgResp = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${SENDGRID_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                personalizations: [
                    {
                        to: [{ email: receiver, name: receiverName }],
                    },
                ],
                from: { email: 'pub+ifttt@busy.dev', name: senderName },
                reply_to: { email: sender, name: senderName },
                subject: `Liked video: ${title}`,
                content: [
                    {
                        type: 'text/html',
                        value: `
              <h1>${title}</h1>
              <p>Link: ${url}</p>
              ${videoPreviewImg}
              <h2>Description:</h2>
              <pre style="white-space: pre-wrap; word-break: keep-all;">${description}</pre>
              <footer>
                <p>Liked at ${likedAt}</p>
                <p>Reply to this email to open a discussion</p>
              </footer>
            `,
                    },
                ],
            }),
        });
        debug('send grid respond %o', sgResp);
        if (Math.floor(sgResp.status / 100) !== 2) {
            res.status = sgResp.status;
            res.send({
                status: 'error',
            });
        }

        res.send({
            status: 'ok',
        });
        return;
    } catch (e) {
        const trace = short.generate();
        console.error(`TraceID: ${trace}`, e);
        res.status(400).send({
            status: '400 Bad Request',
            traceId: trace,
        });
        return;
    }
}

export function textParser(text) {
    const keyTokenPattern = /(?:\s|^)::([a-zA-Z][a-zA-Z0-9]*)::([\s\S]*?(?=::[a-zA-Z][a-zA-Z0-9]*::|::end::|$))(?:::end::)?/gms;
    const ret = {};
    for (const [, key, value] of text.matchAll(keyTokenPattern)) {
        ret[key] = value.trim();
    }
    return ret;
}
