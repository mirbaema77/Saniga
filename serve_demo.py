#!/usr/bin/env python3
"""
Serves this folder over HTTP so you can use a normal link like:
  http://127.0.0.1:8765/demo.html

Usage:
  python serve_demo.py
  python serve_demo.py --lan    # same Wi‑Fi: http://<your-PC-IP>:8765/demo.html
"""
from __future__ import annotations

import argparse
import os
import sys
import webbrowser

try:
    from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
except ImportError:
    sys.exit("Need Python 3.7+ (https://www.python.org/downloads/)")

ROOT = os.path.dirname(os.path.abspath(__file__))
DEFAULT_PORT = 8765


def main() -> None:
    p = argparse.ArgumentParser(description="Open Saniga demo via http://localhost link")
    p.add_argument("--port", type=int, default=DEFAULT_PORT, help=f"port (default {DEFAULT_PORT})")
    p.add_argument(
        "--lan",
        action="store_true",
        help="listen on all interfaces so phones/other PCs on your network can open the link",
    )
    p.add_argument("--no-browser", action="store_true", help="do not open a browser tab")
    args = p.parse_args()

    os.chdir(ROOT)
    host = "0.0.0.0" if args.lan else "127.0.0.1"
    server = ThreadingHTTPServer((host, args.port), SimpleHTTPRequestHandler)
    server.allow_reuse_address = True

    if args.lan:
        # Best-effort: show a LAN IP (first non-localhost IPv4)
        import socket

        tip = "this PC's IP"
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            tip = s.getsockname()[0]
            s.close()
        except OSError:
            pass
        base = f"http://{tip}:{args.port}"
        print(f"LAN: open on another device: {base}/demo.html")
    else:
        base = f"http://127.0.0.1:{args.port}"

    url = f"{base}/demo.html"
    print(f"\n  Demo:  {url}")
    print("  Stop:  Ctrl+C\n")

    if not args.no_browser:
        webbrowser.open(url)

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
