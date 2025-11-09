import fetch from 'node-fetch';
const host = process.env.SELFTEST_HOST ?? 'http://localhost:3001';
const endpoint = `${host}/v1/selftest`;
const run = async () => {
    const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'X-Selftest-Key': process.env.SELFTEST_API_KEY ?? '' }
    });
    const payload = (await response.json().catch(() => ({})));
    if (!response.ok) {
        console.error('Selftest failed', payload);
        process.exit(1);
    }
    console.log(payload.message ?? 'SELFTEST PASS');
    process.exit(0);
};
run().catch((error) => {
    console.error('Selftest runner error', error);
    process.exit(1);
});
