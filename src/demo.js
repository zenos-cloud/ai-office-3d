// Chế độ demo: các nhân viên "giả vờ" làm việc theo kịch bản, không gọi AI thật.
// Dùng để xem văn phòng 3D hoạt động mà không tốn lượt dùng Claude.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const sleep = (ms, signal) => new Promise((res, rej) => {
  if (signal?.aborted) return rej(new Error('Đã dừng'));
  const t = setTimeout(res, ms);
  signal?.addEventListener('abort', () => { clearTimeout(t); rej(new Error('Đã dừng')); }, { once: true });
});

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const say = (text) => ({ ev: { kind: 'text', text } });
const tool = (name, input, write) => ({ ev: { kind: 'tool', name, input }, write });
const ok = (text = 'ok') => ({ ev: { kind: 'result', text }, wait: 400 });

const FILES = {
  'DESIGN.md': '# Thiết kế\n\nTrang Todo-list bằng HTML/CSS/JS thuần.\n\n- index.html: giao diện\n- app.js: thêm, xoá, đánh dấu việc (lưu localStorage)\n- tests/app.test.js: test bằng node:test\n',
  'UI.md': '# Thiết kế giao diện\n\n**Phong cách:** sổ tay giấy ấm, chữ đậm, gọn gàng.\n\n| Vai trò | Màu |\n|---|---|\n| Nền | #faf6ef |\n| Chữ | #2a2420 |\n| Nhấn | #c2410c |\n| Viền | #e7dccb |\n\n```\n+--------------------------+\n| Việc cần làm             |\n| [ Thêm việc...   ][Thêm] |\n| ☐ Học HTML               |\n| ☑ Mua sữa (gạch ngang)   |\n+--------------------------+\n```\n\nTrạng thái trống: "Chưa có việc nào". Dưới 600px: ô nhập và nút xếp dọc.\n',
  'styles/tokens.css': ':root {\n  --bg: #faf6ef;\n  --text: #2a2420;\n  --accent: #c2410c;\n  --line: #e7dccb;\n  --radius: 10px;\n  --font: "Be Vietnam Pro", system-ui, sans-serif;\n}\n',
  // Trang demo lấy đúng yêu cầu của cậu làm tiêu đề và ghi rõ đây chỉ là bản demo
  'index.html': ({ task }) => `<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(task).slice(0, 60)}</title>
  <link rel="stylesheet" href="styles/tokens.css">
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div class="demo">Bản demo: đội chỉ diễn thử, chưa làm đúng yêu cầu. Bỏ tick "Chế độ demo" để AI làm thật.</div>
  <main>
    <p class="eyebrow">Yêu cầu của sếp</p>
    <h1>${esc(task)}</h1>
    <form id="f"><input id="t" aria-label="Việc mới" placeholder="Thêm việc cần làm..."><button>Thêm</button></form>
    <ul id="list"></ul>
  </main>
  <script src="app.js"></script>
</body>
</html>
`,
  'style.css': `body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font)}
.demo{background:#fde68a;color:#78350f;padding:10px 16px;text-align:center;font-size:14px}
main{max-width:560px;margin:48px auto;padding:0 16px}
.eyebrow{color:var(--accent);font-weight:600;margin:0 0 4px}
h1{font-size:clamp(24px,5vw,36px);line-height:1.2;margin:0 0 24px}
form{display:flex;gap:8px}
input{flex:1;padding:10px 12px;border:1px solid var(--line);border-radius:var(--radius);font:inherit}
button{padding:10px 16px;border:0;border-radius:var(--radius);background:var(--accent);color:#fff;font:inherit;cursor:pointer}
li{padding:8px 0;border-bottom:1px solid var(--line)}
@media (max-width:600px){form{flex-direction:column}}
`,
  'app.js': "function addTodo(list, text) {\n  const t = String(text || '').trim();\n  if (!t) return list;\n  return [...list, { text: t, done: false }];\n}\nif (typeof module !== 'undefined') module.exports = { addTodo };\nif (typeof document !== 'undefined') {\n  let todos = [];\n  const list = document.getElementById('list');\n  document.getElementById('f').addEventListener('submit', (e) => {\n    e.preventDefault();\n    const input = document.getElementById('t');\n    todos = addTodo(todos, input.value);\n    input.value = '';\n    list.innerHTML = '';\n    for (const t of todos) { const li = document.createElement('li'); li.textContent = t.text; list.append(li); }\n  });\n}\n",
  'tests/app.test.js': "const test = require('node:test');\nconst assert = require('node:assert');\nconst { addTodo } = require('../app.js');\n\ntest('thêm việc', () => assert.equal(addTodo([], 'Học').length, 1));\ntest('bỏ qua việc rỗng', () => assert.equal(addTodo([], '   ').length, 0));\n",
  'package.json': '{\n  "name": "todo",\n  "version": "1.0.0",\n  "scripts": { "test": "node --test" }\n}\n',
};

function script(id, ctx) {
  switch (id) {
    case 'pm':
      return {
        steps: [say('Chào cả đội, sếp vừa giao việc mới. Mình chia việc nhé!'), tool('Glob', { pattern: '**/*' }), ok('(thư mục trống)')],
        final: '```json\n' + JSON.stringify({
          summary: 'Làm trang Todo-list nhỏ, có test.',
          hasUI: true,
          tasks: [
            { title: 'Thiết kế cấu trúc dự án', owner: 'architect' },
            { title: 'Thiết kế giao diện, bảng màu', owner: 'designer' },
            { title: 'Viết giao diện HTML/CSS', owner: 'coder' },
            { title: 'Viết logic thêm/xoá việc', owner: 'coder' },
            { title: 'Viết test và review code', owner: 'qa' },
            { title: 'Chạy thử toàn bộ', owner: 'qa' },
          ],
        }) + '\n```',
      };
    case 'architect':
      return {
        steps: [say('Mình chọn HTML/CSS/JS thuần cho gọn, không cần cài gì.'), tool('Write', { file_path: 'DESIGN.md' }, 'DESIGN.md'), ok()],
        final: 'Đã viết DESIGN.md: 3 file chính + 1 file test chạy bằng node --test.',
      };
    case 'designer':
      return {
        steps: [
          tool('Read', { file_path: 'DESIGN.md' }), ok(),
          say('Mình chọn tông giấy ấm, chữ đậm, màu nhấn cam đất cho cảm giác sổ tay.'),
          tool('Write', { file_path: 'UI.md' }, 'UI.md'), ok(),
          tool('Write', { file_path: 'styles/tokens.css' }, 'styles/tokens.css'), ok(),
        ],
        final: 'Đã viết UI.md (bảng màu, font, bố cục, trạng thái, điện thoại) và styles/tokens.css.',
      };
    case 'coder':
      if (ctx.round === 1) {
        return {
          steps: [
            tool('Read', { file_path: 'DESIGN.md' }), ok(),
            say('Bắt đầu code giao diện trước.'),
            tool('Write', { file_path: 'index.html' }, 'index.html'), ok(),
            tool('Write', { file_path: 'style.css' }, 'style.css'), ok(),
            tool('Write', { file_path: 'app.js' }, 'app.js'), ok(),
          ],
          final: 'Xong bản đầu: index.html, style.css, app.js.',
        };
      }
      return {
        steps: [say('Ok bên Kiểm thử, em sửa chỗ thiếu package.json đây.'), tool('Write', { file_path: 'package.json' }, 'package.json'), ok()],
        final: 'Đã thêm package.json với script test.',
      };
    case 'qa':
      if (ctx.round === 1) {
        return {
          steps: [
            tool('Read', { file_path: 'app.js' }), ok(),
            say('Hàm addTodo ổn, đã bỏ qua chuỗi rỗng. Để chị viết test.'),
            tool('Write', { file_path: 'tests/app.test.js' }, 'tests/app.test.js'), ok(),
            tool('Bash', { command: 'npm test' }), ok('npm ERR! Missing script: "test"'),
            say('Không có package.json nên không chạy được npm test!'),
          ],
          final: 'Thiếu package.json và script "test".\nVERDICT: FAIL',
        };
      }
      return {
        steps: [tool('Bash', { command: 'node --check app.js' }), ok(), tool('Bash', { command: 'npm test' }), ok('# pass 2\n# fail 0'), say('Cú pháp ổn, 2/2 test pass. Cho qua!')],
        final: 'Code đúng yêu cầu, node --check ổn, 2/2 test pass.\nVERDICT: PASS',
      };
    case 'runner':
      return {
        steps: [
          tool('Bash', { command: 'node --check app.js' }), ok(),
          tool('Bash', { command: 'npm test' }), ok('# tests 2\n# pass 2\n# fail 0'),
          say('Chạy ổn, không có lỗi.'),
        ],
        final: 'node --check: ok. npm test: 2 pass, 0 fail.\nVERDICT: PASS',
      };
    case 'scribe':
      return {
        steps: [say('Phòng Hành chính tổng hợp nhật ký cho sếp nhé.'), tool('Write', { file_path: 'WORKLOG.md' }, 'WORKLOG.md'), ok()],
        final: 'Đã viết WORKLOG.md.',
      };
    case 'git':
      return {
        steps: [
          tool('Bash', { command: 'git add -A' }), ok(),
          tool('Bash', { command: 'git commit -m "feat: todo-list app with tests"' }, '__commit__'), ok(),
          say(ctx.repoUrl ? 'Chế độ demo nên mình không push thật.' : 'Không có link GitHub nên chỉ commit trên máy.'),
        ],
        final: 'Đã commit trên nhánh main (demo: không push).',
      };
    default:
      return { steps: [], final: '' };
  }
}

export async function demoRun(id, ctx, onEvent, signal) {
  const { steps, final } = script(id, ctx);
  for (const s of steps) {
    await sleep(s.wait ?? 900 + Math.random() * 900, signal);
    if (s.write === '__commit__') {
      try {
        execFileSync('git', ['add', '-A'], { cwd: ctx.dir });
        execFileSync('git', ['commit', '-q', '-m', 'feat: todo-list app with tests (demo)'], { cwd: ctx.dir });
      } catch {}
    } else if (s.write) {
      const p = path.join(ctx.dir, s.write);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      const f = FILES[s.write];
      const content = s.write === 'WORKLOG.md' ? `# Nhật ký\n\n${ctx.journal}\n` : typeof f === 'function' ? f(ctx) : f;
      fs.writeFileSync(p, content);
    }
    onEvent(s.ev);
  }
  await sleep(600, signal);
  return { text: final, cost: 0 };
}
