import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { WebSocketServer } from 'ws';
import { Office } from './src/office.js';
import { BILLING } from './src/claude.js';
import { CONFIG, PROJECTS_DIR, LOG_DIR, PREVIEW_PORT, listProjects, resolveInside, markInterrupted } from './src/projects.js';

markInterrupted();

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || CONFIG.port || 3210;

const office = new Office();
const app = express();
app.use(express.json());
app.use(express.static(path.join(ROOT, 'public')));

// Phiên bản code: nếu code trên ổ đĩa mới hơn lúc server bật thì báo "đang chạy bản cũ"
const codeStamp = () => {
  const files = [path.join(ROOT, 'server.js'), ...fs.readdirSync(path.join(ROOT, 'src')).map((f) => path.join(ROOT, 'src', f))];
  return Math.max(...files.map((f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } }));
};
const BOOT_STAMP = codeStamp();
app.get('/api/version', (_req, res) => res.json({ stale: codeStamp() > BOOT_STAMP, running: office.state.running, pid: process.pid, previewPort: PREVIEW_PORT }));

app.get('/api/projects', (_req, res) => res.json({ projectsDir: PROJECTS_DIR, projects: listProjects() }));

app.get('/api/projects/:folder/log', (req, res) => {
  const file = path.join(LOG_DIR, `${path.basename(req.params.folder)}.md`);
  if (!fs.existsSync(file)) return res.status(404).send('Không tìm thấy nhật ký');
  res.type('text/plain; charset=utf-8').send(fs.readFileSync(file, 'utf8'));
});

// Mở thư mục dự án (hoặc cả kho) bằng File Explorer
app.post('/api/open', (req, res) => {
  const dir = resolveInside(req.body?.folder || '');
  if (!dir) return res.status(404).json({ error: 'Không tìm thấy thư mục' });
  const cmd = process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open';
  spawn(cmd, [dir], { detached: true, stdio: 'ignore' }).unref();
  res.json({ ok: true, dir });
});

const server = http.createServer(app);
// Chỉ cho chính trang AI Office kết nối, để trang web lạ không thể giao việc thay cậu
const wss = new WebSocketServer({
  server,
  maxPayload: 40 * 1024 * 1024, // đủ cho 6 ảnh 5 MB
  verifyClient: ({ origin }) => {
    try {
      const u = new URL(origin);
      return ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) && Number(u.port || 80) === PORT;
    } catch { return false; }
  },
});

office.on('event', (e) => {
  const msg = JSON.stringify(e);
  for (const c of wss.clients) if (c.readyState === 1) c.send(msg);
});

wss.on('connection', (ws) => {
  ws.send(JSON.stringify(office.snapshot()));
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (m.type === 'start') {
      const task = String(m.task || '').trim();
      if (!task) return;
      office.start(task, { demo: !!m.demo, repoUrl: String(m.repoUrl || ''), images: Array.isArray(m.images) ? m.images : [], folder: String(m.folder || '') })
        .catch((e) => ws.send(JSON.stringify({ type: 'error', message: e.message })));
    } else if (m.type === 'publish') {
      // Chỉ chạy khi sếp bấm nút "Đưa lên GitHub"
      office.publish(String(m.folder || ''), { repoUrl: String(m.repoUrl || '') })
        .catch((e) => ws.send(JSON.stringify({ type: 'error', message: e.message })));
    } else if (m.type === 'approve') {
      office.approve(m.ok);
    } else if (m.type === 'stop') {
      office.stop();
    }
  });
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.error(`\n  ⚠️  Cổng ${PORT} đang bị chương trình khác dùng (có thể AI Office đã mở rồi).`);
    console.error(`     Mở http://localhost:${PORT} hoặc đổi "port" trong config.json.\n`);
    process.exit(1);
  }
  throw e;
});

// Cổng xem trước: chỉ đọc file trong từng thư mục dự án, chỉ mở trên máy này.
// Tách cổng riêng để trang web do AI viết không gửi lệnh được cho AI Office.
const preview = express();
preview.disable('x-powered-by');
preview.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
preview.use('/:folder', (req, res, next) => {
  const name = req.params.folder;
  if (/^[._]/.test(name)) return res.sendStatus(404);
  const dir = resolveInside(name);
  if (!dir || dir === PROJECTS_DIR || !fs.statSync(dir).isDirectory()) return res.sendStatus(404);
  express.static(dir, { dotfiles: 'deny', index: ['index.html'] })(req, res, next);
});
preview.use((_req, res) => res.status(404).type('text/plain; charset=utf-8').send('Chưa có file này. Có thể các phòng ban chưa viết tới.'));
const previewServer = http.createServer(preview);
previewServer.on('error', (e) => console.error(`  ⚠️  Không mở được cổng xem trước ${PREVIEW_PORT}: ${e.code || e.message}`));
previewServer.listen(PREVIEW_PORT, '127.0.0.1');

server.listen(PORT, () => {
  console.log(`\n  🏢 AI Office 3D đang chạy: http://localhost:${PORT}`);
  console.log(`  📺 Xem trực tiếp: http://localhost:${PORT}/live.html`);
  console.log(BILLING === 'api' ? '  💳 Tính tiền: API key (trả theo lượt)' : '  🎟️  Tính tiền: gói Claude Pro (không trừ thêm tiền)');
  console.log(`  📁 Kho dự án: ${PROJECTS_DIR}\n`);
});
