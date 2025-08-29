import puppeteer from 'puppeteer';
import { nanoid } from 'nanoid';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import sha256File from 'sha256-file';
import { getWsSession, putWsSession, removeWsSession } from './viewer.ws.js';

const storageDir = path.join(process.cwd(), 'storage');
const sessions = new Map();

function nowUTC() { return new Date().toISOString(); }

export async function startSession(targetUrl) {
  const id = nanoid(12);
  const sessionDir = path.join(storageDir, id);
  await fsp.mkdir(sessionDir, { recursive: true });

  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox', '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-infobars',
      '--disable-features=IsolateOrigins,site-per-process,TranslateUI,NetworkServiceInProcess',
      '--disable-accelerated-2d-canvas',
      '--disable-gpu',
      '--disable-application-cache',
      '--disk-cache-size=1',
      '--media-cache-size=1',
      '--js-flags=--noexpose_wasm,--jitless' // минимизация "внутренностей"
    ],
    defaultViewport: { width: 1366, height: 768, deviceScaleFactor: 1 }
  });

  const context = await browser.createIncognitoBrowserContext();
  const page = await context.newPage();

  // Отключаем кэш и prefetch
  const client = await page.target().createCDPSession();
  await client.send('Network.enable');
  await client.send('Network.setCacheDisabled', { cacheDisabled: true });

  // Запрет открывать devtools/новые окна из страницы
  await client.send('Browser.setDockTile', { badgeLabel: '' }).catch(()=>{});
  await page.evaluateOnNewDocument(() => {
    // Блок горячих клавиш devtools
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.shiftKey && ['I','J'].includes(e.key.toUpperCase()))) e.preventDefault();
      if (e.key === 'F12') e.preventDefault();
    }, true);
  });

  await page.setUserAgent('EvidenceBot/1.0 (+https://fotoexpertiza.ru)');
  await page.setExtraHTTPHeaders({ 'Pragma': 'no-cache', 'Cache-Control': 'no-store' });
  await page.goto(targetUrl, { waitUntil: ['domcontentloaded','networkidle2'], timeout: 60_000 });

  const meta = {
    id,
    targetUrl,
    startedAt: nowUTC(),
    headless: true,
    withCache: false,
    userAgent: await page.evaluate(() => navigator.userAgent)
  };

  sessions.set(id, { id, browser, context, page, client, sessionDir, meta, recording: null });
  setTimeout(() => destroySession(id), 1000 * 60 * Number(process.env.MAX_SESSION_MINUTES || 30));
  return { id };
}

export async function destroySession(id) {
  const s = sessions.get(id);
  if (!s) return;
  try {
    if (s.recording?.stop) await s.recording.stop();
    await s.context.close();
    await s.browser.close();
  } catch {}
  sessions.delete(id);
  removeWsSession(id);
}

export async function screenshot(id) {
  const s = sessions.get(id);
  if (!s) throw new Error('Session not found');
  const fileName = `${id}-${Date.now()}.png`;
  const filePath = path.join(s.sessionDir, fileName);
  await s.page.screenshot({ path: filePath, type: 'png', fullPage: true });
  await writeManifest(s, { type: 'screenshot', fileName, sha256: sha256File(filePath), at: nowUTC() });
  return `/files/${fileName}`;
}

import { getStream } from 'puppeteer-stream';

export async function startRecording(id) {
  const s = sessions.get(id);
  if (!s) throw new Error('Session not found');
  if (s.recording) return;

  const fps = Number(process.env.RECORDING_FPS || 25);
  const stream = await getStream(s.page, { audio: false, video: true, fps });

  const fileName = `${id}-${Date.now()}.mp4`;
  const filePath = path.join(s.sessionDir, fileName);

  const ffmpeg = new (await import('child_process')).spawn('ffmpeg', [
    '-y',
    '-f', 'mp4',
    '-i', 'pipe:0',
    '-vcodec', 'copy',
    filePath
  ], { stdio: ['pipe', 'ignore', 'ignore'] });

  stream.pipe(ffmpeg.stdin);
  s.recording = {
    filePath, fileName, stream,
    stop: async () => {
      stream.unpipe(ffmpeg.stdin);
      try { ffmpeg.stdin.end(); } catch {}
    }
  };
  await writeManifest(s, { type: 'record-start', at: nowUTC(), fps });
}

export async function stopRecording(id) {
  const s = sessions.get(id);
  if (!s?.recording) throw new Error('Not recording');
  await s.recording.stop();
  const { filePath, fileName } = s.recording;
  s.recording = null;
  await writeManifest(s, { type: 'record-stop', at: nowUTC(), fileName, sha256: sha256File(filePath) });
  return `/files/${fileName}`;
}

async function writeManifest(s, event) {
  const manifestPath = path.join(s.sessionDir, 'manifest.jsonl');
  await fsp.appendFile(manifestPath, JSON.stringify({ session: s.meta, event }) + '\n');
}

export async function zipEvidence(id) {
  const s = sessions.get(id);
  if (!s) throw new Error('Session not found');
  const zipName = `${id}-evidence.zip`;
  const zipPath = path.join(s.sessionDir, zipName);

  // простой zip без внешних зависимостей
  const archiver = (await import('node:child_process')).spawn('bash', ['-lc', `cd ${s.sessionDir} && zip -qr ${zipName} .`]);
  await new Promise((res) => archiver.on('close', res));

  const sha = sha256File(zipPath);
  await writeManifest(s, { type: 'package', at: nowUTC(), fileName: zipName, sha256: sha });
  return `/files/${zipName}`;
}
