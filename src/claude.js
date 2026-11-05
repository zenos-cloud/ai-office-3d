// Chạy một nhân viên AI = một phiên Claude Code ở chế độ tự động (headless).
// Dùng luôn tài khoản Claude Code đang đăng nhập trên máy.
import { spawn } from 'node:child_process';
import { CONFIG } from './projects.js';

const BIN = process.env.CLAUDE_BIN || 'claude';

// Tính tiền vào đâu (config.json → "billing"):
//   "subscription" (mặc định): dùng gói Claude Pro/Max đã đăng nhập, bỏ qua API key nên không bị trừ thêm tiền.
//   "api": dùng biến ANTHROPIC_API_KEY, trả tiền theo lượt.
export const BILLING = CONFIG.billing === 'api' ? 'api' : 'subscription';
const KEY_VARS = ['ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'];

// Trên Windows, Claude Code chạy lệnh bằng PowerShell thay cho Bash,
// nên mỗi quyền "Bash(...)" được nhân đôi thành "PowerShell(...)".
const withShells = (list) => [...new Set(list.flatMap((t) => (t.startsWith('Bash') ? [t, t.replace(/^Bash/, 'PowerShell')] : [t])))];

// Lệnh xoá bị cấm hẳn với mọi nhân viên (kể cả khi lỡ được cho phép ở chỗ khác)
const DENY = withShells([
  'Bash(rm *)', 'Bash(rmdir *)', 'Bash(del *)', 'Bash(erase *)', 'Bash(rd *)', 'Bash(ri *)',
  'Bash(Remove-Item *)', 'Bash(remove-item *)', 'Bash(git clean*)', 'Bash(git rm*)',
  'Bash(git reset --hard*)', 'Bash(git push --force*)', 'Bash(git push -f*)',
]);

export function runClaude({ prompt, cwd, model, tools, allowed, onEvent, signal, timeoutMs = 15 * 60 * 1000 }) {
  tools = withShells(tools);
  allowed = withShells(allowed);
  return new Promise((resolve, reject) => {
    const args = [
      '-p',
      '--output-format', 'stream-json',
      '--verbose',
      '--model', model,
      '--permission-mode', 'acceptEdits',
      '--strict-mcp-config',
      '--tools', tools.join(','),
      '--allowedTools', allowed.join(','),
      '--disallowedTools', DENY.join(','),
    ];
    const env = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;
    if (BILLING === 'subscription') for (const k of KEY_VARS) delete env[k];

    const child = spawn(BIN, args, { cwd, env, windowsHide: true });
    let buf = '';
    let lastText = '';
    let finalText = '';
    let cost = 0;
    let isError = false;
    let gotResult = false;
    let stderr = '';
    let settled = false;

    const finish = (fn, val) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      fn(val);
    };
    // Tắt cả Claude lẫn các lệnh con nó đang chạy (npm test, node...)
    const kill = () => {
      try {
        if (process.platform === 'win32' && child.pid) spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
        else child.kill();
      } catch {}
    };
    const timer = setTimeout(() => { kill(); finish(reject, new Error('Quá thời gian (15 phút)')); }, timeoutMs);
    const onAbort = () => { kill(); finish(reject, new Error('Đã dừng')); };
    signal?.addEventListener('abort', onAbort, { once: true });

    const handle = (line) => {
      let ev;
      try { ev = JSON.parse(line); } catch { return; }
      if (ev.type === 'system' && ev.subtype === 'init') {
        // Chốt chặn: ở chế độ gói Pro mà vẫn dùng API key thì dừng ngay, trước khi tốn tiền
        if (BILLING === 'subscription' && ev.apiKeySource && ev.apiKeySource !== 'none') {
          kill();
          finish(reject, new Error(`Claude Code đang dùng API key (${ev.apiKeySource}) thay vì gói Pro nên đã dừng để không bị trừ tiền. Kiểm tra lại đăng nhập: chạy "claude" rồi gõ /login.`));
        }
      } else if (ev.type === 'assistant') {
        for (const c of ev.message?.content || []) {
          if (c.type === 'text' && c.text.trim()) {
            lastText = c.text;
            onEvent({ kind: 'text', text: c.text });
          } else if (c.type === 'tool_use') {
            onEvent({ kind: 'tool', name: c.name, input: c.input || {} });
          }
        }
      } else if (ev.type === 'user') {
        for (const c of ev.message?.content || []) {
          if (c.type !== 'tool_result') continue;
          const t = typeof c.content === 'string' ? c.content : (c.content || []).map((x) => x.text || '').join('');
          onEvent({ kind: 'result', text: t, error: !!c.is_error });
        }
      } else if (ev.type === 'result' || (ev.stop_reason !== undefined && 'result' in ev)) {
        gotResult = true;
        finalText = ev.result ?? lastText;
        cost = ev.total_cost_usd || 0;
        isError = !!ev.is_error;
      }
    };

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buf += chunk;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) handle(line);
      }
    });
    child.stderr.on('data', (d) => { stderr += d; });
    child.on('error', (e) => finish(reject, new Error('Không chạy được Claude Code: ' + e.message)));
    child.on('close', (code) => {
      if (buf.trim()) handle(buf.trim());
      if (!gotResult && code !== 0) return finish(reject, new Error(`Claude Code thoát với mã ${code}. ${stderr.slice(-400)}`));
      if (isError) return finish(reject, new Error(finalText || 'Claude Code báo lỗi'));
      finish(resolve, { text: finalText || lastText, cost });
    });
    child.stdin.on('error', () => {});
    child.stdin.end(prompt, 'utf8');
  });
}
