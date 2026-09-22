# Giải Cứu Công Chúa

Game platformer kiểu Mario: nhập tên + MSSV, nhặt xu, đập ô **?** để trả lời câu hỏi, đến lâu đài cứu công chúa. Bảng xếp hạng dùng chung cho mọi người chơi.

## Luật chơi

| | |
|---|---|
| Di chuyển | `A` / `D` hoặc `←` / `→` |
| Nhảy | `Space` (hoặc `↑`, `W`) — **giữ phím để bay cao tới tầm mây** |
| Tạm dừng | `P` |
| Mỗi đồng xu | **10 điểm** |
| Ô `?` (20 ô) | hiện 1 câu hỏi (bốc ngẫu nhiên 20/30 câu), đúng → rơi ra **5 xu** |
| Chết | bị **trừ nửa số điểm** hiện có, hồi sinh không giới hạn |
| Thời gian | **10 phút**, đồng hồ vẫn chạy khi đang trả lời câu hỏi |
| Kết thúc | cứu được công chúa hoặc hết giờ |

Bảng xếp hạng giữ **điểm cao nhất của mỗi MSSV**. Cùng điểm thì ai cứu được công chúa xếp trên, rồi đến ai nhanh hơn.

Muốn sửa câu hỏi: chỉnh [public/questions.js](public/questions.js) (`a` là vị trí đáp án đúng trong mảng `o`).

## Chạy trên máy

```bash
npm install
npm start
```

Mở http://localhost:3000. Khi chạy local, mật khẩu xoá bảng xếp hạng là `admin`.

## Deploy lên Render

1. Đưa thư mục này lên một repo GitHub.
2. Vào https://dashboard.render.com → **New** → **Blueprint** → chọn repo. Render đọc file `render.yaml` và tạo web service.
3. Render sẽ hỏi giá trị **`ADMIN_KEY`** → nhập mật khẩu quản trị (dùng để xoá bảng xếp hạng).
4. Đợi build xong, chia sẻ link `https://<tên>.onrender.com` cho mọi người.

Cách khác (không dùng Blueprint): **New → Web Service**, Build command `npm install`, Start command `npm start`, thêm biến môi trường `ADMIN_KEY` và `NODE_ENV=production`.

## Bắt đầu bảng xếp hạng mới

Ở màn hình đầu bấm **🗑 Xoá bảng xếp hạng (quản trị)** → nhập `ADMIN_KEY` → toàn bộ điểm bị xoá, bắt đầu vòng mới.

## Lưu ý về gói Free của Render

- Dữ liệu lưu trong file `data/leaderboard.json` trên server. Gói Free **không có ổ đĩa lâu dài**: khi server khởi động lại (deploy mới, hoặc tự ngủ sau ~15 phút không ai truy cập) thì bảng xếp hạng bị xoá sạch. Trong lúc cả lớp đang chơi thì không sao.
- Lần mở đầu tiên sau khi server ngủ sẽ mất ~30–60 giây để khởi động. Nên mở link trước buổi chơi vài phút.
- Muốn giữ dữ liệu lâu dài: nâng lên gói trả phí và gắn **Persistent Disk** vào đường dẫn `/opt/render/project/src/data`.
- Điểm được tính trên trình duyệt nên người rành kỹ thuật có thể gửi điểm giả; server chỉ chặn các điểm vô lý (vượt quá tối đa 1670 hoặc vượt số xu).
