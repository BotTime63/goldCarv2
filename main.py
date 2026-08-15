import http.server
import json
import os

PORT = 8000
HEARTS_FILE = "saved_hearts.json"
SEEN_FILE = "seen_media.json"


class LocalMediaHandler(http.server.SimpleHTTPRequestHandler):

    def do_POST(self):
        target_file = None
        if self.path == "/save-hearts":
            target_file = HEARTS_FILE
        elif self.path == "/save-seen":
            target_file = SEEN_FILE

        if target_file:
            try:
                content_length = int(self.headers["Content-Length"])
                post_data = self.rfile.read(content_length)
                data = json.loads(post_data.decode("utf-8"))
                with open(target_file, "w", encoding="utf-8") as f:
                    json.dump(data, f, indent=2)

                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(b'{"status": "success"}')
                print(f"📥 Saved {len(data)} items to {target_file}")
            except Exception as e:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()


if __name__ == "__main__":
    for filename in [HEARTS_FILE, SEEN_FILE]:
        if not os.path.exists(filename):
            with open(filename, "w", encoding="utf-8") as f:
                json.dump([], f)

    print("=" * 60)
    print("🚀 LOCAL SERVER RUNNING (Hearts + Seen Tracking)")
    print(f"👉 Open your browser to: http://localhost:{PORT}/index.html")
    print("=" * 60)

    server_address = ("", PORT)
    httpd = http.server.HTTPServer(server_address, LocalMediaHandler)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")