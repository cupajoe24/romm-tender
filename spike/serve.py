#!/usr/bin/env python3
"""Loopback file server for the #1897 spike. Stdlib only.

Serves two roots under one origin:
  spike/dist/   the bundle          -> http://127.0.0.1:27737/index.js
  <repo>/assets the logo candidates -> http://127.0.0.1:27737/logo.svg  (etc.)

The bundle resolves its icon relative to its own URL, so both have to answer on
the same origin. Nothing else is served.
"""

from __future__ import annotations

import argparse
import http.server
import os
import socketserver
import sys

SPIKE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(SPIKE_DIR)
DIST_DIR = os.path.join(SPIKE_DIR, "dist")
ASSETS_DIR = os.path.join(REPO_ROOT, "assets")

CONTENT_TYPES = {
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".map": "application/json; charset=utf-8",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
    ".png": "image/png",
}

ASSET_NAMES = {
    "logo-animated.gif",
    "logo.svg",
    "logo.png",
    "lockup.svg",
    "lockup-dark.svg",
    "lockup-animated.gif",
}


def resolve(path: str) -> str | None:
    """Map a request path onto one of the two roots, or None."""
    name = os.path.basename(path.split("?", 1)[0].lstrip("/"))
    if not name or name != path.split("?", 1)[0].lstrip("/"):
        return None  # no subdirectories, no traversal
    candidate = os.path.join(ASSETS_DIR if name in ASSET_NAMES else DIST_DIR, name)
    return candidate if os.path.isfile(candidate) else None


class Handler(http.server.BaseHTTPRequestHandler):
    server_version = "TenderSpike/1897"

    def _serve(self, body: bool) -> None:
        target = resolve(self.path)
        if target is None:
            self.send_error(404, "not served by the spike")
            return
        ext = os.path.splitext(target)[1].lower()
        with open(target, "rb") as fh:
            data = fh.read()
        self.send_response(200)
        self.send_header("Content-Type", CONTENT_TYPES.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        if body:
            self.wfile.write(data)

    def do_GET(self) -> None:
        self._serve(body=True)

    def do_HEAD(self) -> None:
        self._serve(body=False)

    def log_message(self, fmt: str, *args) -> None:
        sys.stderr.write("[serve] " + (fmt % args) + "\n")
        sys.stderr.flush()


def main() -> int:
    ap = argparse.ArgumentParser(description="Loopback file server for the #1897 spike")
    ap.add_argument("--port", type=int, default=27737)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()

    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer((args.host, args.port), Handler) as httpd:
        sys.stderr.write(f"[serve] listening on {args.host}:{args.port}\n")
        sys.stderr.write(f"[serve]   dist   {DIST_DIR}\n")
        sys.stderr.write(f"[serve]   assets {ASSETS_DIR}\n")
        sys.stderr.flush()
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            sys.stderr.write("\n[serve] stopped\n")
    return 0


if __name__ == "__main__":
    sys.exit(main())
