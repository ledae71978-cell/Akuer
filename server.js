const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50kb' }));
app.use(rateLimit({ windowMs: 60000, max: 20 }));

const ALLOWED = ['tiktok.com', 'youtube.com', 'youtu.be', 'instagram.com', 'facebook.com', 'fb.watch'];
const validUrl = (v) => {
  try {
    const u = new URL(v);
    return ['http:', 'https:'].includes(u.protocol) &&
      ALLOWED.some((d) => u.hostname === d || u.hostname.endsWith('.' + d));
  } catch { return false; }
};

app.get('/', (req, res) => res.send('AKUzz API ដំណើរការ'));

app.get('/api/download', (req, res) => {
  const { url, type } = req.query;
  if (!validUrl(url)) return res.status(400).json({ error: 'Link មិនត្រឹមត្រូវ' });
  const mp3 = type === 'mp3';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'akuzz-'));
  const id = crypto.randomBytes(6).toString('hex');
  const out = path.join(dir, id + '.%(ext)s');
  const args = mp3
    ? ['-x', '--audio-format', 'mp3', '--no-playlist', '-o', out, '--', url]
    : ['-f', 'best[ext=mp4]/best', '--no-playlist', '--max-filesize', '200M', '-o', out, '--', url];
  const p = spawn('yt-dlp', args);
  const timer = setTimeout(() => p.kill('SIGKILL'), 120000);
  const cleanup = () => fs.rm(dir, { recursive: true, force: true }, () => {});
  p.on('close', (code) => {
    clearTimeout(timer);
    const file = fs.readdirSync(dir)[0];
    if (code !== 0 || !file) { cleanup(); return res.status(500).json({ error: 'ទាញយកមិនបាន' }); }
    res.download(path.join(dir, file), 'akuzz-' + file, cleanup);
  });
  p.on('error', () => { cleanup(); res.status(500).json({ error: 'មិនទាន់ដំឡើង yt-dlp' }); });
});

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body || {};
  if (!Array.isArray(messages) || !messages.length || messages.length > 30)
    return res.status(400).json({ error: 'messages មិនត្រឹមត្រូវ' });
  const clean = messages.map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 4000),
  }));
  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-5-5',
        max_tokens: 1000,
        system: 'អ្នកគឺជា AKUzz Bot ជំនួយការឆ្លាតវៃ។ ឆ្លើយជាភាសាខ្មែរ លើកលែងតែអ្នកប្រើប្រាស់ប្រើភាសាផ្សេង។',
        messages: clean,
      }),
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: (data.error && data.error.message) || 'AI error' });
    res.json({ reply: data.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n') });
  } catch {
    res.status(500).json({ error: 'ភ្ជាប់ AI មិនបាន' });
  }
});

app.listen(process.env.PORT || 3000, () => console.log('AKUzz API ដំណើរការ'));
{
  "name": "akuzz-server",
  "main": "server.js",
  "scripts": { "start": "node server.js" },
  "dependencies": { "express": "^4.19.2", "cors": "^2.8.5", "express-rate-limit": "^7.4.0" }
}
