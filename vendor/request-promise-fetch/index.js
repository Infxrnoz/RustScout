// Replaces request/request-promise (abandoned, unfixable security advisory) for @liamcottle/push-receiver.
// Covers only what it uses: { url, method, headers, form, body, encoding: null }. Resolves the response body
// (string, or Buffer when encoding is null) and rejects on non-2xx, like request-promise does.
module.exports = async function request({ url, method = 'GET', headers = {}, form, body, encoding }) {
    if (form) body = new URLSearchParams(form).toString();
    // redirect: 'error' — these calls go to fixed Google endpoints; never follow a redirect elsewhere.
    const res = await fetch(url, { method, headers, body, redirect: 'error', signal: AbortSignal.timeout(30000) });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok) {
        const e = new Error(`${res.status} - ${buf.toString('utf8').slice(0, 200)}`);
        e.statusCode = res.status;
        throw e;
    }
    return encoding === null ? buf : buf.toString('utf8');
};
