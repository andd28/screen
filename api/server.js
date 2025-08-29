import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyCors from '@fastify/cors';
import fastifyWs from 'fastify-websocket';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSession, screenshot, startRecording, stopRecording, zipEvidence } from './evidence.js';
import { attachViewerWs } from './viewer.ws.js';
import { controlScroll, controlClick, frameJpeg } from './viewer_http.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = Fastify({ logger: true });
await app.register(fastifyCors, {
  origin: (origin, cb) => {
    const allowed = [
      process.env.PUBLIC_VIEWER_ORIGIN,
      'https://fotoexpertiza.ru'
    ].filter(Boolean);
    if (!origin || allowed.includes(origin)) cb(null, true);
    else cb(new Error('Not allowed'), false);
  },
  credentials: false
});

await app.register(fastifyStatic, {
  root: path.join(__dirname, 'public'),
  prefix: '/',
  index: ['index.html']
});

await app.register(fastifyWs);
attachViewerWs(app);

app.get('/health', async () => ({ ok: true }));

app.post('/api/start', async (req, reply) => {
  const { url } = req.body ?? {};
  if (!url || !/^https?:\/\//i.test(url)) return reply.code(400).send({ error: 'Invalid URL' });

  const session = await startSession(url);
  const viewerUrl = `${process.env.PUBLIC_VIEWER_ORIGIN}/viewer.html?sid=${session.id}`;
  return { sessionId: session.id, viewerUrl };
});

app.post('/api/:sid/screenshot', async (req, reply) => {
  const { sid } = req.params;
  const file = await screenshot(sid);
  return { file };
});

app.post('/api/:sid/record/start', async (req, reply) => {
  const { sid } = req.params;
  await startRecording(sid);
  return { status: 'recording' };
});

app.post('/api/:sid/record/stop', async (req, reply) => {
  const { sid } = req.params;
  const file = await stopRecording(sid);
  return { file };
});

app.post('/api/:sid/package', async (req, reply) => {
  const { sid } = req.params;
  const file = await zipEvidence(sid);
  return { file };
});

app.post('/api/:sid/scroll', async (req, reply) => {
  const { sid } = req.params;
  const { deltaY = 0 } = req.body ?? {};
  await controlScroll(sid, Number(deltaY));
  return { ok: true };
});

app.post('/api/:sid/click', async (req, reply) => {
  const { sid } = req.params;
  const { x, y } = req.body ?? {};
  await controlClick(sid, Number(x), Number(y));
  return { ok: true };
});

app.get('/api/:sid/frame.jpg', async (req, reply) => {
  const { sid } = req.params;
  const buf = await frameJpeg(sid);
  reply.header('Content-Type', 'image/jpeg');
  reply.header('Cache-Control', 'no-store');
  reply.send(buf);
});

app.get('/files/:name', async (req, reply) => {
  const file = path.join(__dirname, 'storage', req.params.name);
  return reply.header('Cache-Control', 'no-store').sendFile(`/../storage/${req.params.name}`);
});

const port = Number(process.env.PORT || 3000);
app.listen({ port, host: '0.0.0.0' });
