// Gọi từ start-ai-office.bat trước khi bật server.
// Hỏi thẳng server qua web (không dựa vào netstat, vì server do app khác bật có thể không hiện là LISTENING).
//   Thoát mã 0 = cần bật server mới (chưa có server, hoặc đã tắt bản cũ).
//   Thoát mã 1 = đã có bản mới đang chạy (hoặc đang bận), chỉ cần mở trình duyệt.
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

let port = 3210;
try { port = JSON.parse(fs.readFileSync(new URL('./config.json', import.meta.url), 'utf8')).port || port; } catch {}
if (process.env.PORT) port = Number(process.env.PORT);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Hỏi server. null = không có server nào trả lời
async function ask() {
  try {
    const r = await fetch(`http://localhost:${port}/api/version`, { signal: AbortSignal.timeout(3000) });
    if (r.ok) return await r.json();
    return { stale: true, running: false, pid: null, old: true }; // không có /api/version = bản rất cũ
  } catch {
    return null;
  }
}

// Tìm PID đang giữ cổng: lấy mọi dòng netstat có địa chỉ máy mình là :port, bất kể trạng thái
function pidOnPort() {
  try {
    const out = execFileSync('netstat', ['-ano', '-p', 'TCP'], { encoding: 'utf8' })
      + execFileSync('netstat', ['-ano', '-p', 'TCPv6'], { encoding: 'utf8' });
    for (const line of out.split(/\r?\n/)) {
      const cols = line.trim().split(/\s+/);
      if (cols.length < 5 || !/^TCP/i.test(cols[0])) continue;
      const pid = Number(cols[cols.length - 1]);
      if (pid > 0 && cols[1].endsWith(`:${port}`)) return pid;
    }
  } catch {}
  return null;
}
function isNode(pid) {
  try { return /node\.exe/i.test(execFileSync('tasklist', ['/FI', `PID eq ${pid}`, '/NH'], { encoding: 'utf8' })); } catch { return false; }
}

const info = await ask();
if (!info) process.exit(0); // chưa có server: bật mới

if (!info.stale) process.exit(1); // bản mới đang chạy: chỉ mở trình duyệt
if (info.running) {
  console.log('  AI Office đang chạy bản cũ nhưng đang làm dở việc, nên chưa khởi động lại.');
  console.log('  Khi đội làm xong, nhấp đúp lại AI-Office-3D.bat.');
  process.exit(1);
}

const pid = info.pid || pidOnPort();
if (process.argv.includes('--dry-run')) {
  console.log(`  [thử] Server ở cổng ${port} là bản cũ, PID ${pid}, node.exe: ${pid ? isNode(pid) : '-'}`);
  process.exit(1);
}
if (!pid || !isNode(pid)) {
  console.log(`  Không tìm thấy chương trình đang giữ cổng ${port} để tắt.`);
  console.log('  Hãy đóng cửa sổ đen của AI Office cũ (hoặc khởi động lại máy) rồi mở lại.');
  process.exit(1);
}

console.log('  Đang tắt bản AI Office cũ để mở bản mới...');
try { execFileSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
// Chờ cổng được giải phóng
for (let i = 0; i < 20 && (await ask()); i++) await sleep(250);
if (await ask()) {
  console.log('  Không tắt được bản cũ (có thể cần quyền). Hãy đóng nó bằng tay rồi mở lại.');
  process.exit(1);
}
process.exit(0);
