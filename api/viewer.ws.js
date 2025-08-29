import { nanoid } from 'nanoid';

const wsSessions = new Map(); // sid -> { socketSet }

export function putWsSession(sid, ws) {
  let bag = wsSessions.get(sid);
  if (!bag) { bag = new Set(); wsSessions.set(sid, bag); }
  bag.add(ws);
}

export function removeWsSession(sid, ws) {
  const bag = wsSessions.get(sid);
  if (!bag) return;
  if (ws) bag.delete(ws);
  if (!ws || bag.size === 0) wsSessions.delete(sid);
}

export function getWsSession(sid) {
  return wsSessions.get(sid);
}

export function attachViewerWs(app) {
  app.get('/ws/viewer', { websocket: true }, (conn, req) => {
    const { socket } = conn;
    const { sid } = req.query;
    if (!sid) return socket.close();

    // Подцепим к сессии Puppeteer
    const registry = app; // упрощенно
    socket.sid = sid;
    putWsSession(sid, socket);

    socket.on('message', async (buf) => {
      try {
        const msg = JSON.parse(buf.toString());
        const sessions = (await import('./evidence.js')).then(m => m);
        const { default: _ } = await sessions;
      } catch {}
    });

    socket.on('close', () => removeWsSession(sid, socket));
  });
}
