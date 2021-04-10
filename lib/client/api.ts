import fetch from 'isomorphic-unfetch';
import _ from 'lodash';
import { NextPageContext } from 'next';

const getApiFullPath = (path: string, req?: NextPageContext['req'] | null): string => {
    if (path.startsWith('http')) {
        return path;
    }
    if (req) {
        const host = req.headers['x-forwarded-host']
            ? req.headers['x-forwarded-host']
            : null;
        const proto = req.headers['x-forwarded-proto']
            ? req.headers['x-forwarded-proto']
            : 'http';
        const url = new URL(
            `${Array.isArray(proto) ? proto[0] : proto}://${req.headers['host']}`,
        );
        if (host) {
            url.host = Array.isArray(host) ? host[0] : host;
        }
        url.pathname = path;
        return url.href;
    }
    if (typeof window !== 'undefined') {
        // eslint-disable-next-line no-undef
        const url = new URL(window.location.origin);
        url.pathname = path;
        return url.href;
    }
    const url = new URL(path, 'http://localhost:5000');
    return url.href;
};

export async function fetchApi(
    path: string,
    req?: NextPageContext['req'] | null,
    res?: NextPageContext['res'] | null,
    init?: RequestInit | null,
    jsonData?: unknown,
): Promise<Response> {
    const fullPath = getApiFullPath(path, req);
    const fetchResponse = await fetch(
        fullPath,
        _.pickBy({
            method: jsonData == null ? 'GET' : 'POST',
            redirect: 'follow',
            credentials: 'include',
            body: jsonData == null ? undefined : JSON.stringify(jsonData),
            ...init,
            headers: _.pickBy({
                'Content-Type': jsonData == null ? undefined : 'application/json',
                cookie: req?.headers['cookie'],
                ...init?.headers,
            }),
        }),
    );
    if (res) {
        const upstreamSetCookies = fetchResponse.headers.get('set-cookie');
        if (upstreamSetCookies) {
            res.setHeader('set-cookie', upstreamSetCookies);
        }
    }
    return fetchResponse;
}
