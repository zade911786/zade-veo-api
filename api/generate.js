# api/index.py

from http.server import BaseHTTPRequestHandler
import requests
import re
import base64
import uuid
import json

PAGE_URL = "https://veoaifree.com/veo-video-generator/"
AJAX_URL = "https://veoaifree.com/wp-admin/admin-ajax.php"
UPLOAD_URL = "https://tmpfiles.org/api/v1/upload"

session = requests.Session()


def get_nonce():
    try:
        r = session.get(PAGE_URL, timeout=20)

        patterns = [
            r'"nonce"\s*:\s*"([^"]+)"',
            r'"ajax_nonce"\s*:\s*"([^"]+)"',
            r'"security"\s*:\s*"([^"]+)"',
            r'nonce["\']\s*[:=]\s*["\']([^"\']+)["\']',
            r'name="nonce"\s*value="([^"]+)"',
            r'name="security"\s*value="([^"]+)"'
        ]

        for pattern in patterns:
            match = re.search(pattern, r.text, re.IGNORECASE)
            if match:
                return match.group(1)

        return None

    except:
        return None


def generate_image(prompt, nonce):
    payload = {
        "action": "veo_video_generator",
        "security": nonce,
        "promptText": prompt,
        "totalImages": "1",
        "ratio": "IMAGE_ASPECT_RATIO_PORTRAIT",
        "actionType": "whisk_final_image"
    }

    headers = {
        "User-Agent": "Mozilla/5.0",
        "X-Requested-With": "XMLHttpRequest",
        "Origin": "https://veoaifree.com",
        "Referer": PAGE_URL
    }

    try:
        r = session.post(
            AJAX_URL,
            data=payload,
            headers=headers,
            timeout=60
        )

        try:
            return r.json()
        except:
            return {}

    except:
        return {}


def extract_base64(result):
    data_uri = result.get("data_uri", "")

    if "base64," in data_uri:
        return data_uri.split("base64,")[1]

    if data_uri:
        return data_uri

    return None


def upload_base64(base64_data):
    try:
        file_data = base64.b64decode(base64_data)
        filename = f"{uuid.uuid4().hex}.png"

        files = {
            "file": (filename, file_data, "image/png")
        }

        res = session.post(UPLOAD_URL, files=files, timeout=60)
        js = res.json()

        if js.get("status") == "success":
            url = js["data"]["url"]
            return url.replace(
                "tmpfiles.org/",
                "tmpfiles.org/dl/"
            )

        return None

    except:
        return None


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            path = self.path

            if "?prompt=" not in path:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()

                self.wfile.write(json.dumps({
                    "success": False,
                    "error": "Missing prompt parameter",
                    "example": "/generate?prompt=horse"
                }).encode())
                return

            prompt = path.split("?prompt=")[1].strip()

            if not prompt:
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.end_headers()

                self.wfile.write(json.dumps({
                    "success": False,
                    "error": "Empty prompt"
                }).encode())
                return

            nonce = get_nonce()

            if not nonce:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()

                self.wfile.write(json.dumps({
                    "success": False,
                    "error": "Security nonce not found",
                    "owner": "@zade4everbot"
                }).encode())
                return

            result = generate_image(prompt, nonce)
            base64_img = extract_base64(result)

            if not base64_img:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()

                self.wfile.write(json.dumps({
                    "success": False,
                    "error": "Image generation failed",
                    "raw": result
                }).encode())
                return

            final_url = upload_base64(base64_img)

            if not final_url:
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()

                self.wfile.write(json.dumps({
                    "success": False,
                    "error": "Upload failed"
                }).encode())
                return

            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()

            self.wfile.write(json.dumps({
                "success": True,
                "prompt": prompt,
                "image_url": final_url,
                "owner": "@zade4everbot"
            }).encode())

        except Exception as e:
            self.send_response(500)
            self.send_header("Content-Type", "application/json")
            self.end_headers()

            self.wfile.write(json.dumps({
                "success": False,
                "error": str(e)
            }).encode())
