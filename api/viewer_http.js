import { Buffer } from 'node:buffer';
const { sessions } = await (async () => {
  // "хак" — получить доступ к мапе из evidence.js
  // упростим: экспортируем сессии напрямую
})();

import * as evidenceMod from './evidence.js';

function getSession(sid) {
  const map = evidenceMod.__proto__?.sessions || evidenceMod.sessions || null;
  // Для простоты — добавим в evidence.js:
  // export const sessions = new Map();
  return map?.get?.(sid) || null;
}

export async function controlScroll(sid, dy) {
  const s = getSession(sid);
  if (!s) throw new Error('Session not found');
  await s.page.evaluate((delta) => window.scrollBy({ top: delta, behavior: 'auto' }), dy);
}

export async function controlClick(sid, x, y) {
  const s = getSession(sid);
  if (!s) throw new Error('Session not found');
  await s.page.mouse.click(x, y, { delay: 20 });
}

export async function frameJpeg(sid) {
  const s = getSession(sid);
  if (!s) throw new Error('Session not found');
  return await s.page.screenshot({ type: 'jpeg', quality: 60, fullPage: false, clip: await s.page.evaluate(() => {
    return { x: 0, y: window.pageYOffset, width: window.innerWidth, height: window.innerHeight };
  })});
}
