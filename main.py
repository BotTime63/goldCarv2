import http.server
import json
import os

PORT = 8000
HEARTS_FILE = "saved_hearts.json"
SEEN_FILE = "seen_media.json"


class MediaViewerHandler(http.server.SimpleHTTPRequestHandler):

    def send_json(self, status, data):
        response = json.dumps(data).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.end_headers()
        self.wfile.write(response)

    def do_GET(self):
        if self.path == "/load-data":
            try:
                hearts = self.load_file(HEARTS_FILE)
                seen = self.load_file(SEEN_FILE)

                self.send_json(200, {
                    "hearts": hearts,
                    "seen": seen
                })
            except Exception as e:
                self.send_json(500, {"error": str(e)})
            return

        super().do_GET()

    def do_POST(self):
        files = {
            "/save-hearts": HEARTS_FILE,
            "/save-seen": SEEN_FILE
        }

        filename = files.get(self.path)

        if not filename:
            self.send_json(404, {"error": "Unknown endpoint"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length)
            data = json.loads(body.decode("utf-8"))

            if not isinstance(data, list):
                raise ValueError("Data must be a JSON array")

            self.save_file(filename, data)

            print(f"Saved {len(data)} items to {filename}")

            self.send_json(200, {
                "status": "success",
                "file": filename,
                "count": len(data)
            })

        except Exception as e:
            print(f"Save error: {e}")
            self.send_json(500, {"error": str(e)})

    @staticmethod
    def load_file(filename):
        if not os.path.exists(filename):
            return []

        with open(filename, "r", encoding="utf-8") as file:
            data = json.load(file)

        if not isinstance(data, list):
            return []

        return data

    @staticmethod
    def save_file(filename, data):
        temp_file = filename + ".tmp"

        with open(temp_file, "w", encoding="utf-8") as file:
            json.dump(data, file, indent=2)

        os.replace(temp_file, filename)


if __name__ == "__main__":
    for filename in (HEARTS_FILE, SEEN_FILE):
        if not os.path.exists(filename):
            with open(filename, "w", encoding="utf-8") as file:
                json.dump([], file)

    print("=" * 50)
    print("MEDIA VIEWER LOCAL SERVER")
    print("=" * 50)
    print(f"Open: http://localhost:{PORT}/index.html")
    print("Hearts: saved_hearts.json")
    print("Seen:   seen_media.json")
    print("=" * 50)

    server = http.server.ThreadingHTTPServer(
        ("", PORT),
        MediaViewerHandler
    )

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
        server.server_close()
