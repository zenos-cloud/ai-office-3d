// Bộ điều phối: nhận việc từ sếp, cho 7 phòng ban làm lần lượt,
// ghi nhật ký mọi bước. Chỉ đưa lên GitHub khi sếp bấm nút (publish).
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { AGENTS, byId, buildPrompt } from './agents.js';
import { runClaude, BILLING } from './claude.js';
import { demoRun } from './demo.js';
import { watchProject } from './watch.js';
import { PROJECTS_DIR, LOG_DIR, PREVIEW_PORT, newProjectFolder, saveProject, listProjects, resolveInside } from './projects.js';

const MAX_FILE_EVENTS = 150;

// Ảnh tham khảo sếp gửi kèm khi giao việc
const IMG_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const IMG_DIR = 'tham-khao';

// Kiểm tra đúng là ảnh thật (xem mấy byte đầu file), không tin vào tên hay loại do trình duyệt gửi
function looksLikeImage(buf, ext) {
  const hex = buf.subarray(0, 12).toString('hex');
  if (ext === 'png') return hex.startsWith('89504e47');
  if (ext === 'jpg') return hex.startsWith('ffd8ff');
  if (ext === 'gif') return hex.startsWith('47494638');
  if (ext === 'webp') return hex.startsWith('52494646') && buf.subarray(8, 12).toString() === 'WEBP';
  return false;
}

function prepareImages(list, prefix = '') {
  if (!Array.isArray(list) || !list.length) return [];
  if (list.length > MAX_IMAGES) throw new Error(`Tối đa ${MAX_IMAGES} ảnh mỗi lần giao việc.`);
  return list.map((im, i) => {
    const name = String(im?.name || `anh-${i + 1}`).replace(/[\r\n]+/g, ' ').slice(0, 80);
    const ext = IMG_TYPES[im?.type];
    if (!ext) throw new Error(`"${name}" không phải ảnh PNG, JPG, WEBP hoặc GIF.`);
    const buf = Buffer.from(String(im.data || ''), 'base64');
    if (!buf.length) throw new Error(`Ảnh "${name}" bị trống.`);
    if (buf.length > MAX_IMAGE_BYTES) throw new Error(`Ảnh "${name}" lớn hơn 5 MB.`);
    if (!looksLikeImage(buf, ext)) throw new Error(`"${name}" không đọc được như một ảnh.`);
    return { file: `${IMG_DIR}/${prefix}anh-${i + 1}.${ext}`, name, size: buf.length, buf };
  });
}

// Phần yêu cầu gửi cho nhân viên khi có ảnh kèm theo
function imageBrief(images) {
  if (!images.length) return '';
  return `

ẢNH THAM KHẢO SẾP GỬI KÈM (nằm trong thư mục dự án):
${images.map((im) => `- ${im.file} (tên gốc: ${im.name})`).join('\n')}
Ảnh là một phần của yêu cầu. Trước khi làm, dùng công cụ Read để MỞ VÀ XEM từng ảnh.
- Làm theo những gì thấy trong ảnh: bố cục, màu sắc, nội dung, các mục, chữ.
- Nếu trong ảnh có chữ tiếng nước ngoài (Anh, Nhật, Trung...) thì hiểu và dịch sang tiếng Việt. Trang web viết bằng tiếng Việt, trừ khi sếp dặn khác.
- Nếu ảnh và lời dặn mâu thuẫn thì làm theo lời dặn.
- Không xoá, sửa hay đổi tên các file ảnh này.`;
}

// Phần yêu cầu gửi cho nhân viên khi làm tiếp một dự án cũ
function continueBrief(info, change) {
  const old = [info.task, ...(info.updates || []).map((u) => u.task)];
  return `ĐÂY LÀ DỰ ÁN CŨ, LÀM TIẾP TRÊN CODE ĐANG CÓ (không làm lại từ đầu).
Các yêu cầu sếp đã giao trước đây:
${old.map((t, i) => `${i + 1}. ${t}`).join('\n')}

YÊU CẦU MỚI (việc cần làm lần này):
${change}

Cách làm:
- Đọc các file đang có trước (DESIGN.md, UI.md, README.md, WORKLOG.md nếu có) để hiểu dự án.
- Chỉ thêm hoặc sửa những gì yêu cầu mới cần. Giữ nguyên phần đang chạy tốt, giữ phong cách và cấu trúc thư mục cũ.
- Nếu yêu cầu mới mâu thuẫn với yêu cầu cũ thì làm theo yêu cầu mới.`;
}

const MAX_ROUNDS = 3;

const INSTR = {
  pm: `Đọc yêu cầu của sếp và chia thành 3–7 việc nhỏ. Mỗi việc giao cho đúng một người: architect, designer, coder, qa hoặc runner.
Chỉ giao việc cho designer (Phòng Thiết kế UI) khi dự án có giao diện người dùng (trang web, app có màn hình). Thư viện hay công cụ dòng lệnh thì không cần.
Không viết code. Trả lời CHỈ bằng một khối:
\`\`\`json
{"summary":"tóm tắt 1 câu","hasUI":true,"tasks":[{"title":"tên việc ngắn","owner":"coder"}]}
\`\`\``,
  designerContinue: `Đọc DESIGN.md, UI.md và styles/tokens.css đang có. Nếu yêu cầu mới cần thêm hoặc đổi giao diện thì cập nhật UI.md (và tokens.css nếu cần), giữ phong cách cũ trừ khi sếp yêu cầu đổi. Nếu không cần đổi gì thì không sửa file.
Không viết HTML hay JavaScript. Báo cáo cuối dưới 80 từ.`,
  designer: `Đọc DESIGN.md rồi viết file UI.md: bản thiết kế giao diện để Phòng Lập trình làm theo. Gồm:
- Phong cách tổng thể (1–2 câu, có cá tính, không chung chung).
- Bảng màu: mã hex cho nền, chữ, màu nhấn, viền, màu báo thành công/lỗi. Bảo đảm độ tương phản đủ đọc.
- Font chữ (ưu tiên font hệ thống hoặc Google Fonts), cỡ chữ cho tiêu đề, nội dung, chú thích.
- Khoảng cách, bo góc, đổ bóng.
- Bố cục từng màn hình: mô tả bằng chữ kèm sơ đồ ASCII.
- Các thành phần (nút, ô nhập, thẻ, danh sách...) và trạng thái: hover, focus, bị vô hiệu, lỗi, trống, đang tải.
- Giao diện trên điện thoại (dưới 600px).
- Khả năng truy cập: nhãn cho ô nhập, dùng được bằng bàn phím.
Viết thêm file styles/tokens.css chứa các biến CSS (:root) cho màu, font, khoảng cách để Phòng Lập trình dùng lại.
Không viết HTML hay JavaScript. Báo cáo cuối dưới 80 từ.`,
  architectContinue: `Đọc DESIGN.md và code đang có. Cập nhật DESIGN.md cho yêu cầu mới: thêm mục "Thay đổi" (ghi ngày) nói rõ cần thêm/sửa gì, ở file nào. Giữ nguyên các phần cũ còn đúng.
Không viết code chính. Báo cáo cuối dưới 80 từ.`,
  architect: `Viết file DESIGN.md gồm: mục tiêu, cấu trúc thư mục, công nghệ (ưu tiên HTML/CSS/JS thuần hoặc Node.js), các chức năng chính, cách chạy và cách test (test đặt trong thư mục tests/, package.json có script "test": "node --test").
Không viết code chính. Báo cáo cuối dưới 80 từ.`,
  coder: (round, feedback, cont = false) => `${round > 1 ? `Đây là vòng sửa thứ ${round}. Phản hồi từ các phòng:\n${feedback}\n\nHãy sửa đúng các lỗi trên.` : cont ? 'Đây là dự án cũ. Đọc DESIGN.md (nhất là mục "Thay đổi" mới nhất) và code đang có, rồi thêm/sửa code cho đúng yêu cầu mới. Sửa file có sẵn thay vì viết lại từ đầu. Nếu có UI.md thì làm giao diện đúng theo UI.md.' : 'Đọc DESIGN.md và viết code hoàn chỉnh theo thiết kế. Nếu có UI.md thì làm giao diện đúng theo UI.md và dùng biến CSS trong styles/tokens.css.'}
Nếu dùng package.json thì phải có script "test": "node --test". Bạn có thể chạy node/npm để thử. Không viết test (đó là việc của Phòng Kiểm thử).
Báo cáo cuối dưới 80 từ: đã tạo/sửa những file nào.`,
  qa: `Review code so với DESIGN.md và yêu cầu của sếp. Nếu có UI.md thì kiểm tra thêm giao diện có làm đúng UI.md không (màu, bố cục, trạng thái, điện thoại, nhãn cho ô nhập). Viết hoặc cập nhật test trong thư mục tests/ (dùng node:test và node:assert).
KHÔNG sửa file nào ngoài thư mục tests/. Chạy test nếu được.
Báo cáo ngắn gọn, liệt kê lỗi cụ thể nếu có. Dòng cuối cùng phải là đúng "VERDICT: PASS" hoặc "VERDICT: FAIL".`,
  runner: `Chạy thử dự án: nếu có package.json thì chạy "npm install" (khi có dependencies) và "npm test"; kiểm tra cú pháp các file .js bằng "node --check <file>".
Không chạy server chạy mãi không dừng. KHÔNG sửa file nào. Báo kết quả thật, dán đoạn lỗi nếu có.
Dòng cuối cùng phải là đúng "VERDICT: PASS" hoặc "VERDICT: FAIL".`,
  scribe: (journal, cont = false) => `${cont ? 'Đây là lần làm tiếp một dự án cũ. WORKLOG.md đã có thì GIỮ NGUYÊN phần cũ và viết thêm một mục mới ở cuối cho lần này.\n' : ''}Dưới đây là nhật ký làm việc của các phòng ban:
---
${journal}
---
Viết file WORKLOG.md bằng tiếng Việt: yêu cầu của sếp, phòng nào đã làm gì theo thứ tự thời gian, số vòng sửa lỗi, kết quả kiểm tra, cách chạy dự án.
Nếu chưa có README.md thì viết thêm README.md ngắn (giới thiệu + cách chạy). Báo cáo cuối dưới 50 từ.`,
  git: (repoUrl) => `Repo git đã được khởi tạo sẵn ở thư mục hiện tại (nhánh main). Hãy:
1. Tạo .gitignore nếu chưa có (node_modules/, .env).
2. git add -A
3. git commit với message kiểu conventional commits bằng tiếng Anh, ngắn gọn, đúng nội dung.
${repoUrl
    ? `4. Thêm remote: git remote add origin ${repoUrl} (nếu đã có thì dùng git remote set-url origin ${repoUrl}).
5. git push -u origin main. Tuyệt đối không dùng --force. Nếu push lỗi, báo lại nguyên văn lỗi.`
    : '4. Không có link GitHub: chỉ commit trên máy, không push.'}
Báo cáo cuối: hash commit, message, kết quả push.`,
};

const short = (s, n = 120) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};
const verdict = (text) => {
  const m = [...String(text).matchAll(/VERDICT:\s*(PASS|FAIL)/gi)].pop();
  return m ? m[1].toUpperCase() === 'PASS' : false;
};
const parseJson = (text) => {
  const m = String(text).match(/```(?:json)?\s*([\s\S]*?)```/) || String(text).match(/(\{[\s\S]*\})/);
  try { return JSON.parse(m ? m[1] : text); } catch { return null; }
};
const timeVN = (iso) => new Date(iso).toLocaleTimeString('vi-VN', { hour12: false });
const git = (dir, ...args) => {
  try { return execFileSync('git', args, { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return null; }
};

function listFiles(dir, base = dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === '.git' || e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base));
    else out.push(path.relative(base, p).replaceAll('\\', '/'));
  }
  return out;
}

export class Office extends EventEmitter {
  constructor() {
    super();
    this.reset();
  }

  reset() {
    this.stopWatch?.();
    this.stopWatch = null;
    this.prevInfo = null;
    this.fileContent = new Map();
    this.fileSeq = 0;
    this.state = {
      running: false, task: null, folder: null, dir: null, phase: 'idle', demo: false, repoUrl: '',
      cost: 0, round: 0, kanban: [], logs: [], approval: null, result: null, projectsDir: PROJECTS_DIR,
      previewPort: PREVIEW_PORT, startedAt: null, files: {}, fileEvents: [], images: [], taskPrompt: '', continued: false, change: '',
      agents: Object.fromEntries(AGENTS.map((a) => [a.id, { status: 'idle', screen: [] }])),
    };
  }

  snapshot() {
    return { type: 'state', ...this.state, billing: BILLING, meta: AGENTS.map(({ allowed, ...m }) => m) };
  }

  send(e) { this.emit('event', e); }

  setStatus(id, status) {
    this.state.agents[id].status = status;
    this.send({ type: 'agent', id, status });
  }

  screen(id, line) {
    const s = this.state.agents[id].screen;
    s.push(line);
    if (s.length > 40) s.shift();
    this.send({ type: 'screen', id, line });
  }

  setPhase(phase) {
    this.state.phase = phase;
    this.send({ type: 'phase', phase });
  }

  log(agent, action, detail = '') {
    const entry = { time: new Date().toISOString(), agent, action, detail: String(detail) };
    this.state.logs.push(entry);
    this.send({ type: 'log', entry });
    const a = byId(agent);
    const who = a ? `${a.emoji} ${a.role}` : '🙋 Sếp';
    const line = `- \`${timeVN(entry.time)}\` **${who}**: ${action}${detail ? ` · ${short(detail, 400)}` : ''}\n`;
    if (this.logFile) fs.appendFileSync(this.logFile, line);
  }

  journal() {
    return this.state.logs.map((e) => {
      const a = byId(e.agent);
      return `[${timeVN(e.time)}] ${a ? a.role : 'Sếp'}: ${e.action}${e.detail ? ' · ' + short(e.detail, 300) : ''}`;
    }).join('\n');
  }

  // Có file vừa được tạo / sửa / xoá trong thư mục dự án
  onFile(f) {
    const known = this.fileContent.get(f.path);
    if (f.removed) {
      if (!(f.path in this.state.files)) return;
      delete this.state.files[f.path];
      this.fileContent.delete(f.path);
    } else {
      if (f.content !== null && known === f.content) return;
      if (f.content !== null) this.fileContent.set(f.path, f.content);
    }
    const by = AGENTS.find((a) => this.state.agents[a.id].status === 'working')?.id || null;
    const event = { id: this.fileSeq++, time: new Date().toISOString(), by, ...f };
    if (!f.removed) this.state.files[f.path] = { size: f.size, by, time: event.time };
    this.state.fileEvents.push(event);
    if (this.state.fileEvents.length > MAX_FILE_EVENTS) this.state.fileEvents.shift();
    this.send({ type: 'file', event });
  }

  // Dự án cũ: nạp sẵn các file đang có để trang Xem trực tiếp hiện ngay trang web hiện tại
  loadExistingFiles(dir) {
    for (const rel of listFiles(dir)) {
      try {
        const st = fs.statSync(path.join(dir, rel));
        this.state.files[rel] = { size: st.size, by: null, time: st.mtime.toISOString() };
        if (st.size <= 200_000 && /\.(html?|css|js|mjs|cjs|jsx|ts|tsx|json|md|txt|svg|xml|ya?ml)$/i.test(rel)) {
          this.fileContent.set(rel, fs.readFileSync(path.join(dir, rel), 'utf8'));
        }
      } catch {}
    }
  }

  setKanban(cards) {
    this.state.kanban = cards;
    this.send({ type: 'kanban', cards });
  }

  moveCards(filter, col) {
    let changed = false;
    for (const c of this.state.kanban) if (filter(c) && c.col !== col) { c.col = col; changed = true; }
    if (changed) this.send({ type: 'kanban', cards: this.state.kanban });
  }

  async runAgent(id, instruction) {
    const a = byId(id);
    const { dir } = this.state;
    this.setStatus(id, 'working');
    this.screen(id, `# ${a.model} đang suy nghĩ...`);
    const onEvent = (ev) => {
      if (ev.kind === 'text') {
        this.send({ type: 'say', id, text: short(ev.text, 220) });
        this.screen(id, '» ' + short(ev.text, 60));
      } else if (ev.kind === 'tool') {
        const inp = ev.input || {};
        const file = inp.file_path ? path.relative(dir, path.resolve(dir, inp.file_path)).replaceAll('\\', '/') : '';
        const detail = inp.command || file || inp.pattern || '';
        this.screen(id, `$ ${ev.name} ${short(detail, 50)}`);
        if (ev.name === 'Write') this.log(id, 'Ghi file', file);
        else if (ev.name === 'Edit') this.log(id, 'Sửa file', file);
        else if (ev.name === 'Bash' || ev.name === 'PowerShell') this.log(id, 'Chạy lệnh', inp.command);
      } else if (ev.kind === 'result') {
        this.screen(id, (ev.error ? '  ✗ ' : '  ✓ ') + short(ev.text || 'ok', 50));
      }
    };
    try {
      const r = this.state.demo
        ? await demoRun(id, { dir, task: this.state.task, round: this.state.round, repoUrl: this.state.repoUrl, journal: this.journal() }, onEvent, this.abort.signal)
        : await runClaude({
          prompt: buildPrompt(a, this.state.taskPrompt || this.state.task, instruction),
          cwd: dir, model: a.model, tools: a.tools, allowed: a.allowed,
          onEvent, signal: this.abort.signal,
        });
      this.state.cost += r.cost || 0;
      this.send({ type: 'cost', cost: this.state.cost });
      this.setStatus(id, 'idle');
      this.screen(id, '# xong ✔');
      return r.text || '';
    } catch (e) {
      this.setStatus(id, 'error');
      this.screen(id, '# lỗi: ' + short(e.message, 50));
      throw e;
    }
  }

  projectInfo(status) {
    const { dir, folder, task, demo, repoUrl, cost, passed } = this.state;
    const head = git(dir, 'rev-parse', '--short', 'HEAD');
    const prev = this.prevInfo;
    return {
      ...(prev || {}),
      folder, dir, task: prev?.task || task, status, passed: !!passed,
      mode: demo ? 'demo' : 'AI thật',
      createdAt: prev?.createdAt || this.startedAt, finishedAt: new Date().toISOString(),
      updates: prev ? [...(prev.updates || []), { task: this.state.change, startedAt: this.startedAt, status }] : [],
      committed: !!head, commit: head || null,
      pushed: !!git(dir, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'),
      repoUrl: repoUrl || prev?.repoUrl || null,
      cost: Math.round(((prev?.cost || 0) + cost) * 10000) / 10000,
      files: fs.existsSync(dir) ? listFiles(dir) : [],
      log: path.join(LOG_DIR, `${folder}.md`),
    };
  }

  async start(task, { demo = false, repoUrl = '', images = [], folder: contFolder = '' } = {}) {
    if (this.state.running) throw new Error('Đội đang bận một việc khác.');
    // Làm tiếp dự án cũ: dự án phải có thật trong kho
    let prev = null;
    if (contFolder) {
      prev = listProjects().find((p) => p.folder === contFolder);
      const d = prev && resolveInside(contFolder);
      if (!prev || !d || d === PROJECTS_DIR || !fs.statSync(d).isDirectory()) throw new Error('Không tìm thấy dự án cũ này trong kho.');
    }
    const lan = prev ? (prev.updates?.length || 0) + 2 : 1;
    const imgs = prepareImages(images, prev ? `lan-${lan}-` : ''); // ảnh lỗi thì báo ngay, chưa tạo thư mục
    this.reset();
    this.prevInfo = prev;
    const folder = prev ? prev.folder : newProjectFolder(task);
    const dir = path.join(PROJECTS_DIR, folder);
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(path.join(dir, '.git'))) execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
    Object.assign(this.state, {
      running: true, task: prev ? prev.task : task, change: prev ? task : '', continued: !!prev,
      folder, dir, demo, repoUrl: repoUrl.trim() || prev?.repoUrl || '', passed: false,
    });
    this.startedAt = new Date().toISOString();
    this.state.startedAt = this.startedAt;
    if (prev) this.loadExistingFiles(dir);
    this.stopWatch = watchProject(dir, (f) => this.onFile(f));
    this.abort = new AbortController();
    this.logFile = path.join(LOG_DIR, `${folder}.md`);
    if (prev) {
      fs.appendFileSync(this.logFile, `\n## Làm tiếp lần ${lan} (${new Date().toLocaleString('vi-VN', { hour12: false })})\n\n**Yêu cầu mới:** ${task}\n\n**Chế độ:** ${demo ? 'demo' : 'AI thật'}\n\n`);
    } else {
      fs.writeFileSync(this.logFile, `# Nhật ký: ${folder}\n\n**Yêu cầu:** ${task}\n\n**Thư mục dự án:** \`${dir}\`\n\n**Chế độ:** ${demo ? 'demo' : 'AI thật'}\n\n## Các bước\n\n`);
    }
    this.state.taskPrompt = prev ? continueBrief(prev, task) : task;
    saveProject(this.projectInfo('running'));
    this.send(this.snapshot());
    this.log('boss', prev ? `Làm tiếp dự án ${folder}` : 'Giao việc', task);
    if (imgs.length) {
      fs.mkdirSync(path.join(dir, IMG_DIR), { recursive: true });
      for (const im of imgs) fs.writeFileSync(path.join(dir, im.file), im.buf);
      this.state.images = imgs.map(({ file, name, size }) => ({ file, name, size }));
      this.state.taskPrompt += imageBrief(this.state.images);
      this.send({ type: 'images', images: this.state.images });
      this.log('boss', `Gửi kèm ${imgs.length} ảnh tham khảo`, this.state.images.map((im) => `${im.file} (${im.name})`).join(', '));
    }

    let status = 'done';
    try {
      status = await this.pipeline();
      this.setPhase('done');
      this.send({ type: 'say', id: 'pm', text: 'Xong việc rồi sếp ơi! 🎉' });
    } catch (e) {
      status = this.abort.signal.aborted ? 'stopped' : 'error';
      this.log('pm', 'Dừng công việc', e.message);
      this.setPhase('error');
      this.send({ type: 'say', id: 'pm', text: 'Có sự cố: ' + short(e.message, 120) });
    } finally {
      this.state.running = false;
      this.state.approval = null;
      // Chờ chút cho kịp bắt những file cuối cùng rồi mới ngừng theo dõi
      const stop = this.stopWatch;
      setTimeout(() => { stop?.(); if (this.stopWatch === stop) this.stopWatch = null; }, 500);
      for (const a of AGENTS) if (this.state.agents[a.id].status !== 'error') this.setStatus(a.id, 'idle');
      fs.appendFileSync(this.logFile, `\n**Kết quả:** ${status} · **Chi phí ước tính:** $${this.state.cost.toFixed(4)}\n`);
      const info = this.projectInfo(status);
      saveProject(info);
      this.state.result = info;
      this.send({ type: 'result', result: info });
      this.send({ type: 'run', running: false, phase: this.state.phase, cost: this.state.cost });
    }
  }

  async pipeline() {
    const cont = this.state.continued;
    // 1. Họp: Trưởng phòng chia việc
    this.setPhase('meeting');
    this.log('pm', 'Triệu tập họp các phòng');
    const planText = await this.runAgent('pm', INSTR.pm);
    const plan = parseJson(planText);
    const owners = ['architect', 'designer', 'coder', 'qa', 'runner'];
    const tasks = Array.isArray(plan?.tasks) && plan.tasks.length ? plan.tasks : [{ title: this.state.task, owner: 'coder' }];
    const hasUI = typeof plan?.hasUI === 'boolean'
      ? plan.hasUI || tasks.some((t) => t.owner === 'designer')
      : /web|trang|giao diện|html|css|\bui\b|ứng dụng|app|màn hình|game/i.test(this.state.task)
        || (cont && fs.existsSync(path.join(this.state.dir, 'UI.md')));
    this.setKanban(tasks.slice(0, 8).map((t, i) => ({
      id: i, title: short(t.title, 60), owner: owners.includes(t.owner) ? t.owner : 'coder', col: 'todo',
    })));
    this.log('pm', 'Chia việc', (plan?.summary ? plan.summary + ' · ' : '') + tasks.map((t) => `${t.title} → ${byId(t.owner)?.dept || t.owner}`).join('; '));
    await new Promise((r) => setTimeout(r, 7000)); // đủ thời gian để mọi người đi tới và ngồi họp
    this.setPhase('work');

    // 2. Thiết kế
    this.moveCards((c) => c.owner === 'architect', 'doing');
    const design = await this.runAgent('architect', (cont ? INSTR.architectContinue : INSTR.architect) + (this.state.images.length ? `
Có ảnh tham khảo: trong DESIGN.md thêm mục "Ảnh tham khảo" gồm: mô tả từng ảnh, chép lại chữ trong ảnh kèm bản dịch tiếng Việt, và danh sách yêu cầu rút ra từ ảnh để các phòng sau làm theo.` : ''));
    this.log('architect', cont ? 'Cập nhật thiết kế cho yêu cầu mới' : 'Hoàn thành thiết kế', design);
    this.moveCards((c) => c.owner === 'architect', 'done');

    // 2b. Thiết kế giao diện (chỉ khi dự án có giao diện)
    if (hasUI) {
      this.moveCards((c) => c.owner === 'designer', 'doing');
      const ui = await this.runAgent('designer', cont ? INSTR.designerContinue : INSTR.designer);
      this.log('designer', 'Hoàn thành thiết kế giao diện (UI.md)', ui);
      this.moveCards((c) => c.owner === 'designer', 'done');
    } else {
      this.log('designer', 'Dự án không có giao diện, Phòng Thiết kế UI không cần tham gia');
    }

    // 3. Vòng lặp: Code → Kiểm tra → Chạy thử
    let feedback = '';
    for (let round = 1; round <= MAX_ROUNDS; round++) {
      this.state.round = round;
      this.moveCards((c) => c.owner === 'coder', 'doing');
      const code = await this.runAgent('coder', INSTR.coder(round, feedback, cont));
      this.log('coder', round === 1 ? (cont ? 'Sửa code theo yêu cầu mới xong' : 'Viết code xong') : `Sửa lỗi xong (vòng ${round})`, code);

      this.moveCards((c) => c.owner === 'coder', 'review');
      this.moveCards((c) => c.owner === 'qa', 'doing');
      const qa = await this.runAgent('qa', INSTR.qa);
      if (!verdict(qa)) {
        this.log('qa', `❌ Không đạt, trả lại Phòng Lập trình (vòng ${round})`, qa);
        feedback = 'Phòng Kiểm thử báo:\n' + qa.slice(0, 3000);
        continue;
      }
      this.log('qa', '✅ Review đạt', qa);
      this.moveCards((c) => c.owner === 'qa', 'done');

      this.moveCards((c) => c.owner === 'runner', 'doing');
      const run = await this.runAgent('runner', INSTR.runner);
      if (!verdict(run)) {
        this.log('runner', `❌ Chạy lỗi, trả lại Phòng Lập trình (vòng ${round})`, run);
        feedback = 'Phòng Vận hành báo:\n' + run.slice(0, 3000);
        continue;
      }
      this.log('runner', '✅ Chạy thành công', run);
      this.state.passed = true;
      break;
    }
    if (this.state.passed) this.moveCards(() => true, 'done');
    else this.log('pm', `⚠️ Sau ${MAX_ROUNDS} vòng vẫn chưa đạt, chờ sếp quyết định`);

    // 4. Thư ký viết nhật ký vào dự án
    const report = await this.runAgent('scribe', INSTR.scribe(this.journal(), cont));
    this.log('scribe', 'Viết WORKLOG.md', report);

    // Xong. Việc đưa lên GitHub là bước riêng, chỉ làm khi sếp yêu cầu (xem publish()).
    this.log('pm', 'Đã xong, code được lưu trên máy. Muốn đưa lên GitHub thì sếp bấm nút 🐙.');
    return 'done';
  }

  // Đưa một dự án đã làm xong lên GitHub. Chỉ chạy khi sếp bấm nút.
  async publish(folder, { repoUrl = '' } = {}) {
    if (this.state.running) throw new Error('Đội đang bận một việc khác.');
    const info = listProjects().find((p) => p.folder === folder);
    const dir = info && resolveInside(folder);
    if (!info || !dir || dir === PROJECTS_DIR) throw new Error('Không tìm thấy dự án này.');
    repoUrl = String(repoUrl || info.repoUrl || '').trim();
    if (repoUrl && !/^(https:\/\/github\.com\/|git@github\.com:)[\w.-]+\/[\w.-]+?(\.git)?$/.test(repoUrl)) {
      throw new Error('Link không giống repo GitHub. Ví dụ: https://github.com/ten-cua-cau/du-an.git');
    }

    this.reset();
    if (!fs.existsSync(path.join(dir, '.git'))) execFileSync('git', ['init', '-q', '-b', 'main'], { cwd: dir });
    Object.assign(this.state, {
      running: true, task: info.task, folder, dir, demo: info.mode === 'demo', repoUrl, passed: info.passed,
    });
    this.startedAt = new Date().toISOString();
    this.state.startedAt = this.startedAt;
    this.abort = new AbortController();
    this.logFile = path.join(LOG_DIR, `${folder}.md`);
    fs.appendFileSync(this.logFile, `
## Đưa lên GitHub (${new Date().toLocaleString('vi-VN', { hour12: false })})

`);
    this.send(this.snapshot());
    this.log('boss', repoUrl ? `Yêu cầu đưa lên GitHub: ${repoUrl}` : 'Yêu cầu commit trên máy');

    let ok = false;
    try {
      this.setPhase('git');
      const g = await this.runAgent('git', INSTR.git(repoUrl));
      this.log('git', repoUrl ? 'Commit và push' : 'Commit trên máy', g);
      this.setPhase('done');
      ok = true;
    } catch (e) {
      this.log('git', 'Không đưa lên được', e.message);
      this.setPhase('error');
    } finally {
      this.state.running = false;
      for (const a of AGENTS) if (this.state.agents[a.id].status !== 'error') this.setStatus(a.id, 'idle');
      const now = this.projectInfo(info.status);
      const merged = {
        ...info,
        committed: now.committed, commit: now.commit, pushed: now.pushed,
        repoUrl: repoUrl || info.repoUrl || null, files: now.files,
        cost: Math.round(((info.cost || 0) + this.state.cost) * 10000) / 10000,
      };
      saveProject(merged);
      this.state.result = { ...merged, gitOk: ok };
      this.send({ type: 'result', result: this.state.result });
      this.send({ type: 'run', running: false, phase: this.state.phase, cost: this.state.cost });
    }
  }

  approve(ok) {
    if (this.approveResolve) this.approveResolve(!!ok);
  }

  stop() {
    if (!this.state.running) return;
    this.abort?.abort();
    this.approve(false);
  }
}
