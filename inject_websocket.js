(function () {
  console.log("hello from You Can't Hide Your Message");

  //#region ============================ Những hàm hỗ trợ ============================

  // Hàm decode data websocket về tiếng việt, loại bỏ những thằng \\
  const parse = (str) => {
    let ret = str;
    let limit = 10;
    while (--limit > 0) {
      try {
        if (ret[0] === '"') ret = JSON.parse(ret);
        else ret = JSON.parse(`"${ret}"`);
      } catch (e) {
        break;
      }
    }
    return ret;
  };

  // Hàm xuất ra console, xuất chữ và hình - https://stackoverflow.com/a/26286167
  const log = {
    text: (str, color = "white", bg = "black") => {
      console.log(`%c${str}`, `color: ${color}; background: ${bg}`);
    },
    image: (url) => {
      var img = new Image();
      img.onload = function () {
        const ratio = this.width / this.height;
        const h = this.height > 150 ? 300 : 150,
          w = ratio * h;
        var style = [
          "font-size: 1px;",
          `line-height: ${h % 2}px;`,
          `padding: ${h * 0.5}px ${w * 0.5}px;`,
          `background-size: ${w}px ${h}px;`,
          `background-image: url("${url}")`,
        ].join(" ");
        console.log(url);
        console.log("%c ", style);
      };
      img.src = url;
    },
  };
  // #endregion

  //#region ========================================= BẮT ĐẦU HACK :)) =========================================

  // Lưu tất cả tin nhắn, và những tin nhắn bị gỡ
  const all_msgs = {};
  const deleted_msgs = {};

  // Lưu lại webSocket gốc của browser
  const original_WebSocket = window.WebSocket;

  // Tạo 1 fake webSocket constructor - facebook sẽ gọi hàm này để tạo socket
  window.WebSocket = function fakeConstructor(dt, config) {
    const websocket_instant = new original_WebSocket(dt, config);

    // Chèn event on message => để bắt tất cả event được dùng bởi facebook trong webSocket
    websocket_instant.addEventListener("message", async function (achunk) {
      // chuyển binary code của websocket về string utf8
      const utf8_str = new TextDecoder("utf-8").decode(achunk.data);

      // nếu đầu string có ký tự 1, 2 hoặc 3 => đây chính là socket tin nhắn
      // socket ký tự 3 liên quan tới tin nhắn từ người khác gửi/xóa tới mình
      // socket ký tự 1 được dùng bởi event xóa tin nhắn trong nhóm chat (và nhiều event khác ngoài tin nhắn ???)
      if (utf8_str[0] === "3" || utf8_str[0] === "1") {
        const msg_id_regex = /(?=mid\.\$)(.*?)(?=\\")/;
        const msg_id = utf8_str.match(msg_id_regex);

        const request_id_regex = /(?<=\"request_id\":)(.*)(?=,\")/g;
        const request_id = utf8_str.match(request_id_regex);

        // (Hình như) những event tin nhắn đều có msg_id khác null VÀ giá trị request_id là null
        if (msg_id?.length && request_id?.length && request_id[0] == "null") {
          const msgid = msg_id[0];
          const requestid = request_id[0]
          console.log(`\n\nLúc ${new Date().toLocaleString()}: request_id=${requestid} id=${msgid}`);

          //#region =============================== SIGNAL THU HỒI TIN NHẮN ===============================
          // Nếu id của tin nhắn này đã có trong all_msg
          // => (Rất Có thể) là event Thu hồi

          if (all_msgs[msgid] != null && deleted_msgs[msgid] != null) {
            deleted_msgs[msgid] = all_msgs[msgid];
            delete all_msgs[msgid];

            log.text("Tin nhắn đã bị thu hồi: ", "red");

            if (deleted_msgs[msgid].type === "text") {
              log.text(deleted_msgs[msgid].content);
            }

            if (deleted_msgs[msgid].type === "image") {
              deleted_msgs[msgid].content
                .split(",")
                .forEach((url) => log.image(url));
            }

            return;
          }
          //#endregion

          //#region =============================== TIN NHẮN CHỮ ===============================
          // Tin nhắn chữ sẽ nằm giữa đoạn \"124\\", \\" TỚI \\",
          const text_chat_regex = /(?<=\\"124\\", \\")(.*?)(?=\\",)/;
          const text_content = utf8_str.match(text_chat_regex);

          if (text_content?.length) {
            const msg = parse(text_content[0]);
            log.text(msg);

            // Lưu lại
            all_msgs[msgid] = {
              type: "text",
              content: msg,
            };

            return;
          }
          //#endregion

          //#region =============================== TIN NHẮN HÌNH ẢNH ===============================
          // Hình ảnh là đoạn bắt đầu bằng "https VÀ kết thúc bằng "
          const img_chat_regex = /(https)(.*?)(?=\\")/g;
          const img_content = utf8_str.match(img_chat_regex);

          if (img_content?.length) {
            // decode từng thằng
            let urls = img_content.map((str) => parse(str));

            // Lọc ra những link trùng nhau - https://www.javascripttutorial.net/array/javascript-remove-duplicates-from-array/
            let unique_urls = [...new Set(urls)];

            // Lọc ra những link kích thước nhỏ (có "/s x" hoặc "/p x" trong link)
            // Chỉ lọc khi có nhiều hơn 1 hình
            if (unique_urls.length > 1) {
              const small_img_url_regex = /(s\d+x\d+)|(p\d+x\d+)/g;
              unique_urls = unique_urls.filter(
                (url) => !url.match(small_img_url_regex)?.length
              );
            }

            unique_urls.forEach((url) => log.image(url));

            // Lưu lại
            all_msgs[msgid] = {
              type: "image",
              content: unique_urls.join(","),
            };

            return;
          }
          //#endregion

          //#region =========== Lấy ra tất cả chuỗi ===========
          // Trường hợp lấy được id tin nhắn, mà ko lấy được chữ hay hình, thì show ra hết chuỗi => dùng để debug
          // Do socket có mã 1 ở đầu được dùng bởi nhiều event khác ngoài nhắn tin, mấy event đó sẽ vô đây !??
          const all_strings_regex = /(\\\")(.*?)(\\\")/g;
          let all_strings = utf8_str.match(all_strings_regex) || [];
          all_strings = all_strings.map((str) => parse(str));
          console.log("> Mọi thông tin: ", all_strings);
          //#endregion
        }
      }
    });

    return websocket_instant;
  };

  // Giữ nguyên prototype chỉ đổi constructor thành fake constructor
  window.WebSocket.prototype = original_WebSocket.prototype;
  window.WebSocket.prototype.constructor = window.WebSocket;
  // #endregion
})();

// TODO: Cần xem lại socket event, xác định được chính xác điểm khác biệt của các event thì mới tạo regex đúng được
// event có ký tự 1: Thả react vào tin nhắn / Thu hồi tin nhắn trong nhóm chat / load tin nhắn cũ
