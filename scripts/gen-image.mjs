// On-brand image generator for ecodomehomes.com using Gemini Nano Banana Pro.
// Reads GEMINI_API_KEY from the environment (or an --env-file pointing at a
// dotenv-style file). Strips metadata (C2PA).
// Usage: node scripts/gen-image.mjs --out=images/x.jpg --aspect=16:9 --prompt-file=/tmp/p.txt
//        [--env-file=/path/to/.env.local] [--dest-root=/path/to/repo]
import fs from 'node:fs';
import path from 'node:path';
const args = process.argv.slice(2);
const arg = (n, d = null) => { const a = args.find((x) => x.startsWith(`--${n}=`)); return a ? a.slice(n.length + 3) : d; };
let KEY = process.env.GEMINI_API_KEY || '';
const envFile = arg('env-file');
if (!KEY && envFile) {
  const envTxt = fs.readFileSync(envFile, 'utf8');
  KEY = ((envTxt.match(/^GEMINI_API_KEY=(.*)$/m) || [])[1] || '').trim().replace(/^["']|["']$/g, '');
}
if (!KEY) { console.error('GEMINI_API_KEY missing (set the env var or pass --env-file=/path/to/.env.local)'); process.exit(1); }
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const MODEL = 'gemini-3-pro-image';
const aspect = arg('aspect', '16:9');
const out = arg('out'); if (!out) { console.error('--out required'); process.exit(1); }
const prompt = arg('prompt-file') ? fs.readFileSync(arg('prompt-file'), 'utf8') : arg('prompt');
if (!prompt) { console.error('--prompt or --prompt-file required'); process.exit(1); }
function stripJpegMetadata(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return buf;
  const o = [buf.subarray(0, 2)]; let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) break;
    const m = buf[i + 1];
    if (m === 0xda) { o.push(buf.subarray(i)); break; }
    const len = buf.readUInt16BE(i + 2);
    const meta = (m >= 0xe0 && m <= 0xef) || m === 0xfe;
    if (!meta) o.push(buf.subarray(i, i + 2 + len));
    i += 2 + len;
  }
  return Buffer.concat(o);
}
const body = { contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['TEXT', 'IMAGE'], imageConfig: { aspectRatio: aspect } } };
const r = await fetch(`${BASE}/${MODEL}:generateContent?key=${KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const j = await r.json();
if (!r.ok) { console.error('API error', r.status, JSON.stringify(j).slice(0, 300)); process.exit(1); }
const part = (j.candidates?.[0]?.content?.parts || []).find((p) => p.inlineData?.data);
if (!part) { console.error('no image', JSON.stringify(j).slice(0, 300)); process.exit(1); }
let buf = stripJpegMetadata(Buffer.from(part.inlineData.data, 'base64'));
const dest = path.resolve(arg('dest-root', process.cwd()), out);
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, buf);
console.log(`saved ${dest} (${(buf.length / 1024).toFixed(0)} KB, ${aspect})`);
