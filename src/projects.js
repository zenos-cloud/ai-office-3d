// Kho dự án: mọi dự án đều nằm chung một thư mục cố định (xem config.json).
//   <kho>/2026-11-06_ten-du-an/      ← code của từng dự án (mỗi cái là 1 repo git)
//   <kho>/_nhat-ky/<ten>.md          ← nhật ký từng bước
//   <kho>/projects.json              ← danh sách dự án (app đọc)
//   <kho>/DANH-SACH-DU-AN.md         ← danh sách dự án (cậu đọc)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'config.json'), 'utf8')); } catch { return {}; }
}
export const CONFIG = readConfig();
export const PROJECTS_DIR = path.resolve(process.env.AIO_PROJECTS_DIR || CONFIG.projectsDir || path.join(os.homedir(), 'AI-Office-Projects'));
// Trang web do AI làm ra chạy ở cổng riêng, để code của nó không đụng được vào AI Office
export const PREVIEW_PORT = Number(process.env.PREVIEW_PORT) || CONFIG.previewPort || (Number(process.env.PORT) || CONFIG.port || 3210) + 1;
export const LOG_DIR = path.join(PROJECTS_DIR, '_nhat-ky');
const INDEX = path.join(PROJECTS_DIR, 'projects.json');

fs.mkdirSync(LOG_DIR, { recursive: true });

export function slugify(text) {
  return String(text)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '') || 'du-an';
}

export function newProjectFolder(task) {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const base = `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${slugify(task)}`;
  let name = base;
  for (let i = 2; fs.existsSync(path.join(PROJECTS_DIR, name)); i++) name = `${base}-${i}`;
  return name;
}

export function listProjects() {
  try { return JSON.parse(fs.readFileSync(INDEX, 'utf8')); } catch { return []; }
}

const STATUS = { running: '⏳ Đang làm', done: '✅ Hoàn thành', kept: '💾 Lưu trên máy', stopped: '⏹️ Đã dừng', error: '❌ Lỗi' };

export function saveProject(info) {
  const list = listProjects().filter((p) => p.folder !== info.folder);
  list.unshift(info);
  fs.writeFileSync(INDEX, JSON.stringify(list, null, 2));
  const rows = list.map((p) => `| ${new Date(p.createdAt).toLocaleString('vi-VN', { hour12: false })} | ${p.task.replace(/\|/g, '/').replace(/\s+/g, ' ').slice(0, 80)} | ${STATUS[p.status] || p.status} | ${p.pushed ? '🐙 đã push' : p.committed ? 'commit trên máy' : '-'} | \`${p.folder}\` |`);
  fs.writeFileSync(path.join(PROJECTS_DIR, 'DANH-SACH-DU-AN.md'),
    `# Danh sách dự án AI Office\n\nThư mục: \`${PROJECTS_DIR}\`\n\n| Ngày | Yêu cầu | Trạng thái | Git | Thư mục |\n|---|---|---|---|---|\n${rows.join('\n')}\n`);
}

// Dự án đang làm dở lúc server tắt thì đánh dấu "Đã dừng"
export function markInterrupted() {
  for (const p of listProjects().filter((x) => x.status === 'running')) {
    saveProject({ ...p, status: 'stopped', finishedAt: p.finishedAt || p.createdAt });
  }
}

// Chỉ cho phép mở thư mục nằm trong kho dự án
export function resolveInside(folder = '') {
  const p = path.resolve(PROJECTS_DIR, path.basename(String(folder)));
  if (folder && !fs.existsSync(p)) return null;
  return folder ? p : PROJECTS_DIR;
}
