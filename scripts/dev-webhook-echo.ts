import { createServer } from 'node:http';

const port = Number(process.env.DEV_WEBHOOK_PORT ?? 4010);

const server = createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  const payload = Buffer.concat(chunks).toString('utf8');
  console.log('DEV Webhook received', req.method, req.url, payload);
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ status: 'ok', payload }));
});

server.listen(port, () => {
  console.log(`Dev webhook echo listening on http://localhost:${port}`);
});
