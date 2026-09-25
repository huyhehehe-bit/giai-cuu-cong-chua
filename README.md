# Giải Cứu Công Chúa

Game platformer kiểu Mario: nhập tên + MSSV, nhặt xu, đập ô **?** để trả lời câu hỏi, đến lâu đài cứu công chúa. Bảng xếp hạng dùng chung cho mọi người chơi.

## Luật chơi

| | |
|---|---|
| Di chuyển | `A` / `D` hoặc `←` / `→` |
| Nhảy | `Space` (hoặc `↑`, `W`) — **giữ phím để bay cao tới tầm mây** |
| Tạm dừng | `P` |
| Mỗi đồng xu | **10 điểm** |
| Ô `?` | **12 ô**, mỗi ô 1 câu hỏi bốc ngẫu nhiên từ ngân hàng **50 câu**; đúng → rơi ra **5 xu** |
| Mỗi câu hỏi | **20 giây**, hết giờ tính là sai |
| Chết | bị **trừ nửa số điểm** hiện có, hồi sinh không giới hạn |
| Thời gian | **10 phút**, đồng hồ vẫn chạy khi đang trả lời câu hỏi |
| Số lượt | **2 lượt mỗi MSSV** trong một vòng xếp hạng |
| Kết thúc | cứu được công chúa hoặc hết giờ |

Bảng xếp hạng giữ **điểm cao nhất của mỗi MSSV**. Cùng điểm thì ai cứu được công chúa xếp trên, rồi đến ai nhanh hơn.

## Chống gian lận

- **Đề chỉ được phát từng câu** khi người chơi đập ô `?`, kèm hạn 20 giây do server giữ. Mở tab Network cũng chỉ thấy đúng câu đang hiện, không thấy trước 12 câu.
- **Chặn copy đề**: không bôi đen được, chặn chuột phải, chặn Ctrl+C/X/A/S/P trong hộp câu hỏi. Không chặn được chụp màn hình, nhưng 20 giây thì gần như không kịp tra.
- **Câu hỏi và đáp án chỉ nằm ở server** ([questions.js](questions.js), không nằm trong thư mục `public/`). Trình duyệt chỉ nhận đề bài và 4 lựa chọn đã xáo trộn, không nhận đáp án. Mở DevTools cũng không thấy đáp án.
- Mỗi câu **chỉ được trả lời một lần**, server chấm và ghi nhớ. Không thể bấm thử lần lượt 4 đáp án để dò. Mở lại câu đang dở cũng không được gia hạn đồng hồ.
- Server kiểm tra thời điểm nhận đáp án (dư 2 giây trừ hao mạng). Quá 20 giây thì tính sai dù trình duyệt gửi lên đáp án đúng, nên chỉnh đồng hồ máy không ăn thua.
- Mỗi lượt chơi bốc **12 trong 50 câu**, nên hai người hiếm khi trùng đề.
- **2 lượt mỗi MSSV**: lượt được tính ngay khi bắt đầu, kể cả khi thoát giữa chừng. Hết lượt thì server từ chối, muốn mở lại phải xoá bảng xếp hạng. Bảng xếp hạng chỉ giữ **1 dòng cho mỗi MSSV**, nên chơi 2 lượt không chiếm chỗ của người khác.
- Khi nộp điểm, server tự đếm số câu đúng và chặn điểm vượt mức: `xu ≤ 67 + số_câu_đúng × 5` và `điểm ≤ xu × 10`. Mỗi lượt chỉ nộp điểm một lần.
- Vẫn còn lỗ hổng: người chơi chơi bằng MSSV giả để xem trước câu hỏi rồi chơi lại bằng MSSV thật vẫn có thể trúng vài câu đã gặp. Các biện pháp trên (đề ngẫu nhiên, 2 lượt, 20 giây mỗi câu, không lộ đáp án trước) chỉ làm giảm chứ không xoá hẳn. Muốn chặn hẳn thì phải phát mã dự phòng riêng cho từng sinh viên — nếu cần, bảo mình làm.

Sửa ngân hàng câu hỏi: chỉnh [questions.js](questions.js) (`a` là vị trí đáp án đúng trong mảng `o`). Đổi số lượt chơi: đặt biến môi trường `MAX_ATTEMPTS`.

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

## Trang bảng xếp hạng riêng

Mở **/bxh** (hoặc /leaderboard), ví dụ https://giai-cuu-cong-chua.onrender.com/bxh — trang toàn màn hình, tự cập nhật 5 giây một lần, có nút **CHỮ TO** cho máy chiếu và nút xoá bảng xếp hạng. Trang này chỉ xem, không chơi được.

## Bắt đầu bảng xếp hạng mới

Ở màn hình đầu bấm **🗑 Xoá bảng xếp hạng (quản trị)** → nhập `ADMIN_KEY` → toàn bộ điểm và số lượt đã dùng bị xoá, mọi người lại có đủ 2 lượt.

## Lưu ý về gói Free của Render

- Dữ liệu lưu trong file `data/leaderboard.json` trên server. Gói Free **không có ổ đĩa lâu dài**: khi server khởi động lại (deploy mới, hoặc tự ngủ sau ~15 phút không ai truy cập) thì bảng xếp hạng và số lượt đã dùng bị xoá sạch. Trong lúc cả lớp đang chơi thì không sao.
- Phiên chơi đang dở chỉ nằm trong bộ nhớ server. Nếu server khởi động lại giữa lúc ai đó đang chơi thì lượt đó không nộp được điểm.
- Lần mở đầu tiên sau khi server ngủ sẽ mất ~30–60 giây để khởi động. Nên mở link trước buổi chơi vài phút.
- Muốn giữ dữ liệu lâu dài: nâng lên gói trả phí và gắn **Persistent Disk** vào đường dẫn `/opt/render/project/src/data`.
