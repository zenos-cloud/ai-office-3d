# 🏢 AI Office 3D

Văn phòng 3D có 8 phòng ban AI. Cậu giao việc, các phòng họp chia việc, viết code, kiểm tra chéo, chạy thử, ghi nhật ký. Code được lưu trên máy; chỉ khi cậu bấm nút 🐙 thì mới đưa lên GitHub.

## Cần cài trước

1. [Node.js](https://nodejs.org) (bản 18 trở lên)
2. [Claude Code](https://claude.com/claude-code), đã đăng nhập bằng tài khoản Claude của bạn (gói Pro/Max). Mỗi người dùng lượt trong gói của chính mình.
3. [Git](https://git-scm.com)

Dự án do đội AI làm ra được lưu ở thư mục `AI-Office-Projects` trong thư mục người dùng. Muốn đổi chỗ thì thêm `"projectsDir": "D:\\Duong\\Dan"` vào `config.json`.

## Chạy

Nhấp đúp **`start-ai-office.bat`** trong thư mục này (lần đầu sẽ tự cài thư viện). Server tự chạy và trình duyệt tự mở **http://localhost:3210**. Đóng cửa sổ đen là tắt văn phòng.

Hoặc chạy bằng tay:

```bash
cd ai-office
npm install
npm start
```

## Các phòng ban

| Phòng | Chức danh | Model | Được phép |
|---|---|---|---|
| 👔 Phòng Quản lý | Trưởng phòng: chia việc | sonnet | chỉ đọc |
| 📐 Phòng Kiến trúc | Kiến trúc sư: viết DESIGN.md | opus | đọc, ghi |
| 🎨 Phòng Thiết kế UI | Nhà thiết kế UI: viết UI.md + styles/tokens.css (chỉ khi dự án có giao diện) | sonnet | đọc, ghi |
| 💻 Phòng Lập trình | Lập trình viên: viết code | sonnet | đọc, ghi, sửa, `node`/`npm` |
| 🔍 Phòng Kiểm thử | Người kiểm tra: review, viết test | opus | đọc, ghi test, `node`/`npm test` |
| ▶️ Phòng Vận hành | Người chạy code | haiku | đọc, `node`/`npm` (không sửa file) |
| 🐙 Phòng GitHub | Quản lý GitHub | haiku | đọc, ghi, `git` |
| 📝 Phòng Hành chính | Thư ký: viết WORKLOG.md | haiku | đọc, ghi |

Mỗi phòng là một phiên **Claude Code** riêng (chạy `claude -p`), dùng tài khoản Claude Code trên máy. Muốn đổi model, tính cách hay quyền hạn thì sửa [src/agents.js](src/agents.js).

Trong văn phòng 3D:
- Bấm vào một nhân viên để camera bay lại gần và xem màn hình của người đó.
- Bấm **🔭 Toàn cảnh** để nhìn lại cả văn phòng.

## Quy trình

1. **Họp**: mọi người đi ra phòng họp chung, Trưởng phòng chia việc, Kanban hiện lên bảng trên tường.
2. **Kiến trúc**: Kiến trúc sư viết `DESIGN.md`.
3. **Thiết kế giao diện** (chỉ khi có giao diện): Nhà thiết kế UI viết `UI.md` (màu, font, bố cục, trạng thái, điện thoại) và `styles/tokens.css`. Phòng Lập trình làm theo, Phòng Kiểm thử soát lại.
4. **Code → Kiểm tra → Chạy thử**: nếu Phòng Kiểm thử hoặc Phòng Vận hành báo lỗi, việc được trả lại cho Phòng Lập trình (tối đa 3 vòng).
5. **Thư ký** viết `WORKLOG.md` vào dự án.
6. **Kết quả**: ô bên phải hiện thư mục lưu dự án, kèm nút 📂 Mở thư mục. Đội dừng ở đây, không tự commit hay push.

## Kho dự án (thư mục cố định)

Mọi dự án được lưu chung trong **`D:\LONG\AI-Office-Projects`**. Muốn đổi chỗ thì sửa `projectsDir` trong [config.json](config.json).

```
D:\LONG\AI-Office-Projects\
├── 2026-11-06_ten-du-an\      ← code của từng dự án (mỗi dự án là 1 repo git)
├── _nhat-ky\                  ← nhật ký từng bước của mỗi dự án
├── DANH-SACH-DU-AN.md         ← danh sách mọi dự án (mở để đọc)
└── projects.json              ← danh sách cho app
```

Tab **Dự án** trong app liệt kê tất cả dự án, có nút mở thư mục và xem nhật ký.

## Chế độ

- **Demo** (bật sẵn): chạy theo kịch bản, không gọi AI, không tốn lượt. Đội **không làm theo yêu cầu của cậu**: lần nào cũng ra cùng một trang mẫu (chỉ đổi tiêu đề). Dùng để xem thử quy trình.
- **AI thật**: bỏ tick "Chế độ demo". Một việc nhỏ mất khoảng 3–15 phút.

App nhớ lựa chọn demo của cậu cho lần sau.

## Tính tiền

Mặc định AI Office dùng **gói Claude Pro** đang đăng nhập trên máy (`"billing": "subscription"` trong `config.json`): bỏ qua biến `ANTHROPIC_API_KEY`, nên **không bị trừ thêm tiền**, chỉ tính vào giới hạn lượt dùng của gói. Số "≈ $…" trên màn hình lúc này chỉ là ước tính.

- Nếu vì lý do nào đó Claude Code vẫn dùng API key, nhân viên sẽ dừng ngay trước khi gọi AI và báo lỗi.
- Muốn trả theo lượt bằng API key thì đổi thành `"billing": "api"` rồi mở lại AI Office.

## Gửi kèm ảnh

Khi giao việc, cậu có thể đính kèm tối đa 6 ảnh (PNG, JPG, WEBP, GIF, mỗi ảnh dưới 5 MB): bấm **📎 Đính kèm ảnh**, hoặc dán (Ctrl+V), hoặc kéo thả vào ô giao việc. Ví dụ: ảnh chụp trang web mẫu, bản vẽ tay, ảnh thực đơn tiếng Nhật.

- Ảnh được lưu vào thư mục `tham-khao/` của dự án.
- Mọi phòng đều được dặn mở ảnh ra xem và làm theo. Chữ tiếng nước ngoài trong ảnh được dịch sang tiếng Việt.
- Kiến trúc sư ghi mô tả ảnh và bản dịch vào mục "Ảnh tham khảo" trong `DESIGN.md`.
- Chỉ có tác dụng ở chế độ AI thật. Chế độ demo bỏ qua ảnh.

## Xem trực tiếp

Khi bấm **Giao việc**, app tự mở tab `http://localhost:3210/live.html` (tắt được bằng ô tick bên dưới). Trang này cho thấy:

- Trang web đang được tạo, tự tải lại mỗi khi có file thay đổi. Có nút xem ở cỡ điện thoại.
- Code vừa viết, dòng mới được tô xanh. Bấm một file hoặc một dòng "tạo/sửa" trong Diễn biến để xem lại bản lúc đó.
- Từng bước của quy trình, phòng nào đang làm, vòng sửa thứ mấy.
- Nút Dừng và nút 🐙 Đưa lên GitHub ngay trên trang.

Trang web của dự án được mở ở cổng riêng `3211` (chỉ trên máy này, chỉ đọc). Tab **Dự án** có nút 👁 Xem trang cho các dự án cũ.

## Đưa lên GitHub

1. Tạo một repo **trống** trên github.com (không tick README).
2. Bấm **🐙 Đưa lên GitHub** ở ô kết quả, trang Xem trực tiếp, hoặc tab **Dự án** (dự án cũ cũng được).
3. Dán link (ví dụ `https://github.com/ten-cua-cau/todo.git`) rồi bấm OK. Lần đầu push, Windows có thể hiện cửa sổ đăng nhập GitHub.

Bỏ trống link thì chỉ commit trên máy. Bấm Huỷ thì không làm gì cả.

## An toàn

- Mỗi phòng chỉ được chạy một số lệnh nhất định; lệnh khác bị chặn.
- Lệnh xoá (`rm`, `del`, `Remove-Item`, `git clean`, `git rm`...) bị cấm hẳn với mọi phòng.
- Trang web do AI viết chạy ở cổng khác, nên code của nó không gửi lệnh được cho AI Office.
- Chỉ chính trang AI Office được kết nối vào server, nên trang web lạ không thể giao việc thay cậu.
- Không có gì được commit hay push khi cậu chưa bấm nút 🐙, và không bao giờ dùng `--force`.
- Nút **Dừng** tắt ngay cả AI lẫn các lệnh nó đang chạy.
