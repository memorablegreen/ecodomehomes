#!/usr/bin/env node
// Local runner for the static site plus the api/*.js serverless functions.
//
// WHY. The site is static HTML on Vercel with Node functions under api/. There
// was no way to open a page on localhost AND hit the real handlers behind it
// without `vercel dev`, which needs the project link and the production env.
// This serves the tree the way vercel.json does (cleanUrls: /intake ->
// intake.html) and routes /api/<name> to require('../api/<name>.js'), reading
// env from .env.local (gitignored) so the handlers see SUPABASE_URL, SMTP_* and
// friends exactly as they would in the lambda.
//
// GOHIGHLEVEL IS MOCKED HERE, ALWAYS. A localhost walk must never write a test
// contact into the real CRM, so GHL_BASE_URL is pointed at this server's own
// /mock-ghl and the calls are recorded. GET /mock-ghl/_calls shows what the
// handler would have sent, which is what the Playwright walk asserts on.
//
// Run: node scripts/dev-server.mjs            (http://localhost:8788)
//      PORT=9000 node scripts/dev-server.mjs
//
// Pair it with the local Supabase stack for the intake form:
//   supabase start        (ports 553xx, see supabase/config.toml)
//   Mailpit at http://127.0.0.1:55324 catches the sign-in codes and the
//   owner notification when SMTP_HOST=127.0.0.1 SMTP_PORT=55325 in .env.local.

import http from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const ROOT = resolve(new URL('..', import.meta.url).pathname);
const PORT = Number(process.env.PORT) || 8788;

// ---- env ----------------------------------------------------------------------
const envFile = join(ROOT, '.env.local');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}
// api/_lib/leads.js talks to GoHighLevel through global fetch at a fixed host.
// Rather than touch that file, the host is intercepted here: any request the
// handlers make to services.leadconnectorhq.com is rewritten to /mock-ghl on
// this server, so a real token in .env.local still never reaches the real CRM.
const GHL_HOST = 'https://services.leadconnectorhq.com';
const MOCK_BASE = `http://127.0.0.1:${PORT}/mock-ghl`;
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const url = typeof input === 'string' ? input : input && input.url;
  if (typeof url === 'string' && url.startsWith(GHL_HOST)) return realFetch(MOCK_BASE + url.slice(GHL_HOST.length), init);
  return realFetch(input, init);
};
if (!process.env.GHL_PIT_TOKEN) process.env.GHL_PIT_TOKEN = 'local-mock-token';
if (!process.env.GHL_LOCATION_ID) process.env.GHL_LOCATION_ID = 'local-mock-location';

// ---- mock GoHighLevel ---------------------------------------------------------
const ghlCalls = [];
async function mockGhl(req, res, pathname) {
  let raw = '';
  for await (const chunk of req) raw += chunk;
  let body = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { body = raw; }
  if (req.method === 'GET' && pathname === '/mock-ghl/_calls') return sendJson(res, 200, ghlCalls);
  if (req.method === 'DELETE' && pathname === '/mock-ghl/_calls') { ghlCalls.length = 0; return sendJson(res, 200, { ok: true }); }
  ghlCalls.push({ at: new Date().toISOString(), method: req.method, path: pathname, headers: { authorization: req.headers.authorization ? 'Bearer ***' : null, version: req.headers.version, 'user-agent': req.headers['user-agent'] }, body });
  if (req.method === 'POST' && pathname === '/mock-ghl/contacts/upsert') {
    return sendJson(res, 200, { contact: { id: `mock_${Date.now().toString(36)}` } });
  }
  if (req.method === 'POST' && /^\/mock-ghl\/contacts\/[^/]+\/notes$/.test(pathname)) {
    return sendJson(res, 200, { note: { id: `note_${Date.now().toString(36)}` } });
  }
  return sendJson(res, 404, { error: 'mock-ghl: no such route' });
}

// ---- api functions ------------------------------------------------------------
async function apiRoute(req, res, pathname) {
  const name = pathname.slice('/api/'.length).replace(/\.js$/, '');
  if (!/^[a-z0-9-]+$/.test(name)) return sendJson(res, 404, { ok: false, error: 'not found' });
  const file = join(ROOT, 'api', `${name}.js`);
  if (!existsSync(file)) return sendJson(res, 404, { ok: false, error: 'not found' });
  // Fresh require every hit so an edit to a handler shows up without a restart.
  for (const key of Object.keys(require.cache)) if (key.startsWith(join(ROOT, 'api'))) delete require.cache[key];
  const handler = require(file);
  try {
    await handler(req, res);
  } catch (e) {
    console.error(`api/${name}:`, e);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'handler crashed' });
  }
}

// ---- static -------------------------------------------------------------------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml; charset=utf-8', '.mp4': 'video/mp4', '.woff2': 'font/woff2',
};
function staticFile(pathname) {
  const safe = normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
  const base = join(ROOT, safe);
  if (!base.startsWith(ROOT)) return null;
  const candidates = [base, `${base}.html`, join(base, 'index.html')];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function sendJson(res, status, obj) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(obj));
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = url.pathname.replace(/\/+$/, '') || '/';
  try {
    if (pathname.startsWith('/mock-ghl/')) return await mockGhl(req, res, pathname);
    if (pathname.startsWith('/api/')) return await apiRoute(req, res, pathname);
    const file = staticFile(pathname);
    if (!file) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.end('Not found');
    }
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(readFileSync(file));
  } catch (e) {
    console.error(e);
    if (!res.headersSent) sendJson(res, 500, { ok: false, error: 'server error' });
  }
}).listen(PORT, () => {
  const has = (k) => (process.env[k] ? 'set' : 'MISSING');
  console.log(`ecodomehomes dev server: http://localhost:${PORT}`);
  console.log(`  SUPABASE_URL ${has('SUPABASE_URL')}, SUPABASE_SERVICE_ROLE_KEY ${has('SUPABASE_SERVICE_ROLE_KEY')}, SMTP_HOST ${has('SMTP_HOST')}`);
  console.log(`  GoHighLevel: MOCKED at /mock-ghl (calls at /mock-ghl/_calls)`);
});
