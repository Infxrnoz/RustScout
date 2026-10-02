module.exports = async function request({ url, method = 'GET', headers = {}, form, body, encoding }) {
    if (form) body = new URLSearchParams(form).toString();
    const res = await fetch(url, { method, headers, body, redirect: 'error', signal: AbortSignal.timeout(30000) });
    const buf = Buffer.from(await res.arrayBuffer());
    if (!res.ok) {
        const e = new Error(`${res.status} - ${buf.toString('utf8').slice(0, 200)}`);
        e.statusCode = res.status;
        throw e;
    }
    return encoding === null ? buf : buf.toString('utf8');
};
