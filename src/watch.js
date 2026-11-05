// Theo dõi thư mục dự án: mỗi khi có file được tạo, sửa hay xoá thì báo lại,
// để trang "Xem trực tiếp" thấy trang web thành hình từng bước.
import fs from 'node:fs';
import path from 'node:path';

const SKIP = /(^|\/)(\.git|node_modules)(\/|$)/;
const TEXT = /\.(html?|css|js|mjs|cjs|jsx|ts|tsx|json|md|txt|svg|xml|ya?ml)$/i;
const MAX_TEXT = 200_000;

export function watchProject(dir, onFile) {
  const timers = new Map();
  let watcher;

  const read = (rel) => {
    const p = path.join(dir, rel);
    let st;
    try { st = fs.statSync(p); } catch { return onFile({ path: rel, removed: true }); }
    if (!st.isFile()) return;
    let content = null;
    if (TEXT.test(rel) && st.size <= MAX_TEXT) {
      try { content = fs.readFileSync(p, 'utf8'); } catch {}
    }
    onFile({ path: rel, size: st.size, content });
  };

  try {
    watcher = fs.watch(dir, { recursive: true }, (_ev, name) => {
      if (!name) return;
      const rel = String(name).replaceAll('\\', '/');
      if (SKIP.test(rel)) return;
      // Một lần lưu file thường bắn nhiều sự kiện, gom lại thành một
      clearTimeout(timers.get(rel));
      timers.set(rel, setTimeout(() => { timers.delete(rel); read(rel); }, 150));
    });
    watcher.on('error', () => {});
  } catch {
    return () => {};
  }

  return () => {
    watcher.close();
    for (const t of timers.values()) clearTimeout(t);
  };
}
