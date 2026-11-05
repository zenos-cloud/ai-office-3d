// Trang "Xem trực tiếp": chiếu trang web đang được tạo, code vừa viết,
// và từng bước của các phòng ban. Nhận sự kiện qua cùng WebSocket với văn phòng 3D.
const $ = (s) => document.querySelector(s);
const el = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
};
const timeVN = (iso) => new Date(iso).toLocaleTimeString('vi-VN', { hour12: false });

const PHASE = { idle: 'Đang rảnh', meeting: 'Đang họp chia việc', work: 'Đang làm việc', approval: 'Chờ cậu duyệt', git: 'Đang đưa lên GitHub', done: 'Hoàn thành ✓', error: 'Đã dừng' };
const RESULT = { done: '✅ Hoàn thành', kept: '💾 Đã lưu trên máy', stopped: '⏹️ Đã dừng giữa chừng', error: '❌ Gặp lỗi' };
const STEPS = [
  ['pm', 'Họp chia việc'],
  ['architect', 'Kiến trúc · DESIGN.md'],
  ['designer', 'Thiết kế UI · UI.md'],
  ['coder', 'Lập trình · viết code'],
  ['qa', 'Kiểm thử · review, test'],
  ['runner', 'Vận hành · chạy thử'],
  ['scribe', 'Hành chính · WORKLOG.md'],
  ['git', 'GitHub · khi cậu bấm nút'],
];
const ENTRY = ['index.html', 'public/index.html', 'src/index.html', 'dist/index.html'];

let S = null;            // trạng thái từ server
let meta = [];
let files = {};          // path -> { size, by, time }
let history = {};        // path -> [event] (có nội dung)
let lastContent = {};    // path -> nội dung mới nhất
let seen = new Set();    // nhân viên đã từng làm việc
let workCount = {};      // số lần mỗi nhân viên được gọi
let lastVerdict = {};    // qa/runner: 'pass' | 'fail'
let skipped = new Set();
let pinned = null;       // file/sự kiện cậu đang xem lại (null = tự theo dõi)
let entry = null;
let reloadTimer = null;

const who = (id) => {
  if (id === 'boss') return { role: 'Cậu', emoji: '🙋', color: '#f5b544' };
  return meta.find((m) => m.id === id) || { role: id || 'Hệ thống', emoji: '•', color: '#9a94b3' };
};

/* ───────── So sánh để biết dòng nào mới ───────── */
function addedLines(oldText, newText) {
  const left = new Map();
  for (const l of (oldText ?? '').split('\n')) left.set(l, (left.get(l) || 0) + 1);
  const added = new Set();
  newText.split('\n').forEach((l, i) => {
    const n = left.get(l) || 0;
    if (n > 0) left.set(l, n - 1);
    else added.add(i);
  });
  return added;
}

/* ───────── Khung code ───────── */
function showCode(ev, auto = false) {
  const view = $('#codeView');
  $('#codeName').textContent = ev.path;
  view.innerHTML = '';
  const by = ev.by ? who(ev.by) : null;
  const info = $('#codeInfo');
  info.innerHTML = '';
  if (ev.removed) {
    info.textContent = 'đã bị xoá';
    view.append(el('span', 'note', 'File này đã bị xoá.'));
  } else if (ev.content == null && /\.(png|jpe?g|gif|webp|svg)$/i.test(ev.path) && previewUrl(ev.path)) {
    // Ảnh (kể cả ảnh tham khảo sếp gửi): hiện luôn ảnh
    const im = S?.images?.find((x) => x.file === ev.path);
    info.textContent = fmtSize(ev.size) + (im ? ` · ảnh tham khảo: ${im.name}` : '');
    const img = el('img', 'pic');
    img.src = previewUrl(ev.path) + '?t=' + ev.id;
    img.alt = im ? im.name : ev.path;
    view.append(img);
  } else if (ev.content == null) {
    info.textContent = `${fmtSize(ev.size)}`;
    view.append(el('span', 'note', 'File này không phải chữ (ảnh, font...) hoặc quá lớn để hiện.'));
  } else {
    const added = ev.added || new Set();
    const lines = ev.content.split('\n');
    if (lines.length && lines[lines.length - 1] === '') lines.pop();
    let first = null;
    lines.forEach((l, i) => {
      const s = el('span', 'ln' + (added.has(i) ? ' add' : ''), l || ' ');
      if (added.has(i) && first == null) first = s;
      view.append(s);
    });
    const plus = el('span', 'plus', ev.isNew ? `file mới, ${lines.length} dòng` : `+${added.size} dòng`);
    info.append(plus, document.createTextNode(` · ${timeVN(ev.time)}` + (by ? ` · ${by.emoji} ${by.role}` : '')));
    if (first) first.scrollIntoView({ block: 'center' }); else view.scrollTop = 0;
  }
  $('#followBtn').hidden = auto;
  document.querySelectorAll('.files li').forEach((li) => li.classList.toggle('sel', li.dataset.path === ev.path));
  document.querySelectorAll('.feed li.file').forEach((li) => li.classList.toggle('sel', Number(li.dataset.id) === ev.id && !auto));
}
$('#followBtn').onclick = () => {
  pinned = null;
  const last = latestEvent();
  if (last) showCode(last, true);
  $('#followBtn').hidden = true;
};
const latestEvent = () => {
  let best = null;
  for (const list of Object.values(history)) for (const e of list) if (!best || e.id > best.id) best = e;
  return best;
};
const fmtSize = (n) => (n == null ? '' : n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);

/* ───────── Khung trang web ───────── */
function pickEntry() {
  const paths = Object.keys(files);
  const fixed = ENTRY.find((p) => paths.includes(p));
  if (fixed) return fixed;
  return paths.filter((p) => p.endsWith('.html')).sort((a, b) => a.split('/').length - b.split('/').length || a.length - b.length)[0] || null;
}
function previewUrl(path) {
  if (!S?.folder || !S.previewPort) return null;
  const host = location.hostname === 'localhost' || location.hostname === '[::1]' ? '127.0.0.1' : location.hostname;
  return `http://${host}:${S.previewPort}/${encodeURIComponent(S.folder)}/${path.split('/').map(encodeURIComponent).join('/')}`;
}
function updateFrame(force = false) {
  const next = pickEntry();
  const frame = $('#frame');
  if (!next) {
    frame.hidden = true;
    frame.removeAttribute('src');
    $('#frameEmpty').hidden = false;
    $('#openBtn').hidden = true;
    $('#url').textContent = 'Chưa có trang để xem';
    const any = Object.keys(files).length;
    $('#frameEmptyText').innerHTML = !S?.folder
      ? 'Giao việc ở <a href="/">văn phòng 3D</a>. Trang này sẽ tự cập nhật khi đội bắt đầu viết file.'
      : any && !S.running
        ? 'Dự án này không có file HTML (có thể là thư viện hay công cụ). Xem code ở khung bên dưới.'
        : 'Đang chờ đội viết file HTML đầu tiên…';
    entry = null;
    return;
  }
  const url = previewUrl(next);
  if (!url) {
    frame.hidden = true;
    $('#frameEmpty').hidden = false;
    $('#frameEmptyText').textContent = 'Server đang chạy bản cũ nên không xem trước được. Đóng cửa sổ đen của AI Office rồi mở lại AI-Office-3D.bat.';
    return;
  }
  $('#frameEmpty').hidden = true;
  frame.hidden = false;
  $('#url').textContent = url;
  $('#openBtn').href = url;
  $('#openBtn').hidden = false;
  if (next !== entry || force || !frame.getAttribute('src')) {
    entry = next;
    frame.src = url + '?t=' + Date.now();
    flash();
  }
}
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => updateFrame(true), 400);
}
function flash() {
  const w = $('#frameWrap');
  const r = $('#reloaded');
  w.classList.add('flash');
  r.textContent = 'Vừa cập nhật ' + timeVN(new Date().toISOString());
  r.classList.add('show');
  setTimeout(() => { w.classList.remove('flash'); r.classList.remove('show'); }, 1200);
}
$('#reloadBtn').onclick = () => updateFrame(true);
document.querySelectorAll('.seg button').forEach((b) => (b.onclick = () => {
  document.querySelectorAll('.seg button').forEach((x) => x.classList.toggle('on', x === b));
  $('#frameWrap').classList.toggle('phone', b.dataset.size === 'phone');
}));

/* ───────── Danh sách file ───────── */
function renderFiles(fresh) {
  const ul = $('#files');
  ul.innerHTML = '';
  const paths = Object.keys(files).sort();
  $('#fileCount').textContent = paths.length ? `(${paths.length})` : '';
  if (!paths.length) return ul.append(el('li', 'empty', 'Chưa có file nào.'));
  for (const p of paths) {
    const f = files[p];
    const li = el('li');
    li.dataset.path = p;
    if (p === fresh) li.classList.add('fresh');
    const dot = el('span', 'dot');
    dot.style.background = who(f.by).color;
    dot.title = f.by ? who(f.by).role : '';
    li.append(dot, el('span', '', p), el('span', 'sz', fmtSize(f.size)));
    li.onclick = () => {
      const list = history[p];
      if (!list?.length) return;
      pinned = list[list.length - 1].id;
      showCode(list[list.length - 1]);
    };
    ul.append(li);
  }
}

/* ───────── Diễn biến ───────── */
function feedItem(time, body, cls = '') {
  const li = el('li', cls);
  li.append(el('time', '', timeVN(time)), body);
  const feed = $('#feed');
  const atBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 40;
  feed.append(li);
  while (feed.children.length > 300) feed.firstChild.remove();
  if (atBottom) feed.scrollTop = feed.scrollHeight;
  return li;
}
function feedLog(e) {
  const a = who(e.agent);
  const d = el('div');
  const w = el('span', 'who', `${a.emoji} ${a.role}`);
  w.style.color = a.color;
  d.append(w, document.createTextNode(' · ' + e.action));
  feedItem(e.time, d);
}
function feedSay(id, text) {
  // Bỏ qua lời nói chỉ toàn dữ liệu máy (ví dụ bảng chia việc dạng JSON)
  if (/^\s*(```|\{|\[)/.test(text)) return;
  const a = who(id);
  const d = el('div');
  const w = el('span', 'who', `${a.emoji} `);
  d.append(w, el('span', 'say', `“${text}”`));
  feedItem(new Date().toISOString(), d);
}
function feedFile(ev) {
  const a = who(ev.by);
  const d = el('div');
  const verb = ev.removed ? '🗑️ xoá' : ev.isNew ? '✨ tạo' : '✏️ sửa';
  d.append(document.createTextNode(`${a.emoji} ${verb} `), el('span', 'path', ev.path));
  if (!ev.removed && ev.content != null) d.append(document.createTextNode(' '), el('span', 'plus', ev.isNew ? `${ev.content.split('\n').length} dòng` : `+${ev.added.size}`));
  const li = feedItem(ev.time, d, 'file');
  li.dataset.id = ev.id;
  li.onclick = () => { pinned = ev.id; showCode(ev); };
}

/* ───────── Quy trình ───────── */
function renderSteps() {
  const ol = $('#steps');
  ol.innerHTML = '';
  for (const [id, label] of STEPS) {
    let st = 'todo';
    let extra = '';
    if (id === 'approval') {
      if (S?.phase === 'approval') st = 'active';
      else if (S?.logs?.some((l) => l.agent === 'boss' && /duyệt/i.test(l.action))) st = 'done';
    } else if (skipped.has(id)) st = 'skip';
    else if (S?.agents?.[id]?.status === 'working') st = 'active';
    else if (S?.agents?.[id]?.status === 'error') st = 'fail';
    else if (seen.has(id)) st = lastVerdict[id] === 'fail' ? 'fail' : 'done';
    if (['coder', 'qa', 'runner'].includes(id) && (workCount[id] || 0) > 1) extra = `vòng ${workCount[id]}`;
    if (lastVerdict[id] === 'fail' && st !== 'active') extra = (extra ? extra + ' · ' : '') + 'chưa đạt';
    const ic = { todo: '○', active: '●', done: '✓', fail: '✗', skip: '–' }[st];
    const li = el('li', st);
    li.append(el('span', 'ic', ic), el('span', '', label));
    if (extra) li.append(el('span', 'extra', extra));
    ol.append(li);
  }
}

/* ───────── Thanh trên cùng ───────── */
function renderTop() {
  const t = $('#task');
  t.innerHTML = '';
  if (S?.task) {
    t.append(el('b', '', S.task));
    if (S.demo) t.append(document.createTextNode('  · chế độ demo'));
    if (S.images?.length) t.append(document.createTextNode(`  · 📎 ${S.images.length} ảnh tham khảo`));
  } else t.textContent = 'Chưa có việc nào';
  const ph = $('#phase');
  ph.textContent = PHASE[S?.phase] || S?.phase || '';
  ph.classList.toggle('live', !!S?.running && S.phase !== 'approval');
  $('#round').textContent = S?.round ? `vòng ${S.round}/3` : '';
  $('#cost').textContent = S?.cost ? `≈ $${S.cost.toFixed(3)}${S.billing === 'api' ? '' : ' · gói Pro'}` : '';
  $('#cost').title = S?.billing === 'api' ? 'Số tiền bị trừ vào API key' : 'Chỉ là ước tính. Tính vào gói Claude Pro, không trừ thêm tiền.';
  $('#stopBtn').hidden = !S?.running;
  tick();
}
function tick() {
  if (!S?.startedAt) { $('#clock').textContent = ''; return; }
  const end = S.running ? Date.now() : new Date(S.result?.finishedAt || Date.now()).getTime();
  const sec = Math.max(0, Math.round((end - new Date(S.startedAt).getTime()) / 1000));
  $('#clock').textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}
setInterval(tick, 1000);

function renderNow(id, text) {
  const now = $('#now');
  const working = id || Object.entries(S?.agents || {}).find(([, s]) => s.status === 'working')?.[0];
  if (!working || !S?.running) { now.hidden = true; return; }
  const a = who(working);
  now.hidden = false;
  now.innerHTML = '';
  const w = el('span', 'who', `${a.emoji} ${a.dept || a.role}`);
  w.style.color = a.color;
  now.append(w, el('span', 'what', text || 'đang làm việc…'));
}

function renderApproval(ap) {
  $('#approval').hidden = !ap;
  if (!ap) return;
  $('#approvalText').textContent = (ap.passed ? 'Code đã qua kiểm tra. ' : '⚠️ Code chưa qua hết kiểm tra sau 3 vòng. ')
    + (ap.repoUrl ? `Đồng ý thì commit và push lên ${ap.repoUrl}.` : 'Đồng ý thì commit trên máy (không có link GitHub).');
}
$('#approveYes').onclick = () => send({ type: 'approve', ok: true });
$('#approveNo').onclick = () => send({ type: 'approve', ok: false });
$('#stopBtn').onclick = () => { if (confirm('Dừng công việc đang làm?')) send({ type: 'stop' }); };

function renderResult(r) {
  const box = $('#result');
  box.hidden = !r;
  if (!r) return;
  box.innerHTML = '';
  box.classList.toggle('bad', r.status === 'error' || r.status === 'stopped');
  box.append(el('h2', '', RESULT[r.status] || r.status), el('p', '', '📁 Dự án được lưu tại:'), el('code', '', r.dir));
  if (r.gitOk === false) box.append(el('p', '', '⚠️ Chưa đưa lên GitHub được. Xem lý do ở Diễn biến.'));
  else if (r.pushed) box.append(el('p', '', `🐙 Đã push lên ${r.repoUrl}`));
  else if (r.committed) box.append(el('p', '', `💾 Đã commit ${r.commit} trên máy`));
  const row = el('div', 'row');
  const open = el('button', '', '📂 Mở thư mục');
  open.onclick = () => fetch('/api/open', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ folder: r.folder }) });
  // Chỉ đưa lên GitHub khi cậu bấm nút này
  const gh = el('button', '', r.pushed ? '🐙 Push lại' : '🐙 Đưa lên GitHub');
  gh.onclick = () => {
    const link = prompt('Dán link repo GitHub TRỐNG để commit và push.\nBỏ trống rồi bấm OK = chỉ commit trên máy.', r.repoUrl || '');
    if (link !== null) send({ type: 'publish', folder: r.folder, repoUrl: link.trim() });
  };
  row.append(open, gh);
  box.append(row);
}

/* ───────── Nhận sự kiện ───────── */
function trackLog(e) {
  if (e.agent && e.agent !== 'boss') seen.add(e.agent);
  if (e.agent === 'designer' && /không cần/i.test(e.action)) { skipped.add('designer'); seen.delete('designer'); }
  if (['qa', 'runner'].includes(e.agent)) {
    if (/^❌/.test(e.action)) lastVerdict[e.agent] = 'fail';
    if (/^✅/.test(e.action)) lastVerdict[e.agent] = 'pass';
  }
  if (e.agent === 'coder' && /vòng (\d+)/.test(e.action)) workCount.coder = Number(e.action.match(/vòng (\d+)/)[1]);
}
function trackFile(ev) {
  if (ev.removed) {
    delete files[ev.path];
  } else {
    const prev = lastContent[ev.path];
    ev.isNew = !(ev.path in files) && prev == null;
    // File mới thì không tô xanh cả file, chỉ tô dòng thêm khi sửa
    ev.added = ev.content != null && !ev.isNew ? addedLines(prev, ev.content) : new Set();
    if (ev.content != null) lastContent[ev.path] = ev.content;
    files[ev.path] = { size: ev.size, by: ev.by, time: ev.time };
  }
  (history[ev.path] ||= []).push(ev);
}

function handle(m) {
  switch (m.type) {
    case 'state': {
      S = m;
      meta = m.meta || meta;
      files = {}; history = {}; lastContent = {};
      seen = new Set(); workCount = {}; lastVerdict = {}; skipped = new Set(); pinned = null; entry = null;
      $('#feed').innerHTML = '';
      for (const e of m.logs) { trackLog(e); feedLog(e); }
      for (const ev of m.fileEvents || []) { trackFile(ev); feedFile(ev); }
      for (const [id, s] of Object.entries(m.agents)) if (s.status === 'working') seen.add(id);
      if (!m.logs.length) $('#feed').append(el('li', 'empty', 'Chưa có diễn biến nào.'));
      renderTop(); renderSteps(); renderFiles(); renderApproval(m.approval); renderResult(m.result); renderNow();
      updateFrame(true);
      const last = latestEvent();
      if (last) showCode(last, true);
      else { $('#codeName').textContent = 'Chưa có file'; $('#codeInfo').textContent = ''; $('#codeView').innerHTML = ''; $('#followBtn').hidden = true; }
      break;
    }
    case 'agent':
      if (!S) break;
      S.agents[m.id].status = m.status;
      if (m.status === 'working') { seen.add(m.id); workCount[m.id] = (workCount[m.id] || 0) + 1; if (m.id !== 'coder') delete lastVerdict[m.id]; }
      renderSteps(); renderNow(m.status === 'working' ? m.id : null);
      break;
    case 'say':
      feedSay(m.id, m.text);
      if (S?.agents?.[m.id]?.status === 'working' && !/^\s*(```|\{|\[)/.test(m.text)) renderNow(m.id, m.text);
      break;
    case 'log':
      if (!S) break;
      S.logs.push(m.entry);
      $('#feed .empty')?.remove();
      trackLog(m.entry); feedLog(m.entry); renderSteps();
      break;
    case 'file': {
      const ev = m.event;
      trackFile(ev); feedFile(ev); renderFiles(ev.path);
      if (pinned == null) showCode(ev, true);
      // Chỉ tải lại khi file ảnh hưởng tới trang (bỏ qua ghi chú, test)
      if (!/(^|\/)tests?\//.test(ev.path) && !/\.(md|txt)$/i.test(ev.path)) scheduleReload();
      else if (!entry) updateFrame();
      break;
    }
    case 'phase': if (S) { S.phase = m.phase; renderTop(); renderSteps(); } break;
    case 'cost': if (S) { S.cost = m.cost; renderTop(); } break;
    case 'approval': if (S) { S.approval = m.approval; renderApproval(m.approval); } break;
    case 'result': if (S) { S.result = m.result; renderResult(m.result); updateFrame(); } break;
    case 'run': if (S) { S.running = m.running; S.phase = m.phase; S.cost = m.cost; renderTop(); renderSteps(); renderNow(); } break;
    case 'images': if (S) { S.images = m.images; renderTop(); } break;
    case 'kanban': break;
    case 'error': alert(m.message); break;
  }
}

let ws;
const send = (msg) => ws?.readyState === 1 && ws.send(JSON.stringify(msg));
function connect() {
  ws = new WebSocket(`ws://${location.host}`);
  ws.onmessage = (ev) => handle(JSON.parse(ev.data));
  ws.onclose = () => { $('#phase').textContent = 'Mất kết nối, đang thử lại…'; setTimeout(connect, 1500); };
}
connect();

// Báo khi server đang chạy bản code cũ: khi đó không có cổng xem trước, khung trang sẽ trống
async function checkVersion() {
  let stale = true;
  try { const r = await fetch('/api/version'); stale = !r.ok || (await r.json()).stale; } catch { return; }
  $('#stale').hidden = !stale;
}
checkVersion();
setInterval(checkVersion, 30000);
