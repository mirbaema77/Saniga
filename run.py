#!/usr/bin/env python3
"""
Local dev in one shot: start Postgres (Docker), create .env if needed, migrate, run API + UI.

Usage (from this folder):
    python run.py
    py run.py          # Windows Python Launcher, if python is not on PATH

Requires: Python 3, Node.js + npm, Docker Desktop (running).
"""
from __future__ import annotations

import os
import shutil
import socket
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SERVER = ROOT / "server"
ENV_FILE = SERVER / ".env"
COMPOSE_FILE = ROOT / "docker-compose.yml"


def run(cmd: list[str], *, cwd: Path | None = None, env: dict | None = None) -> None:
    print(f"\n→ {' '.join(cmd)}\n")
    r = subprocess.run(cmd, cwd=cwd or ROOT, env=env)
    if r.returncode != 0:
        sys.exit(r.returncode)


def which_npm() -> str:
    npm = shutil.which("npm") or shutil.which("npm.cmd", path=os.environ.get("PATH", ""))
    if not npm:
        print("npm not found. Install Node.js LTS from https://nodejs.org/ and restart the terminal.")
        sys.exit(1)
    return npm


def which_npx() -> str:
    npx = shutil.which("npx") or shutil.which("npx.cmd", path=os.environ.get("PATH", ""))
    if not npx:
        print("npx not found (comes with Node.js).")
        sys.exit(1)
    return npx


def docker_compose_prefix() -> list[str]:
    if shutil.which("docker"):
        try:
            subprocess.run(
                ["docker", "compose", "version"],
                capture_output=True,
                check=True,
            )
            return ["docker", "compose"]
        except (subprocess.CalledProcessError, FileNotFoundError):
            pass
    if shutil.which("docker-compose"):
        return ["docker-compose"]
    print(
        "Docker Compose not found.\n"
        "  • Install Docker Desktop: https://www.docker.com/products/docker-desktop/\n"
        "  • Start Docker, then run this script again.\n"
        "Or set DATABASE_URL in server/.env to your own Postgres and run:\n"
        "  cd server && npm install && npx prisma migrate deploy && npm run dev"
    )
    sys.exit(1)


def wait_pg(host: str = "127.0.0.1", port: int = 5432, timeout_s: float = 60) -> None:
    deadline = time.time() + timeout_s
    print(f"Waiting for Postgres on {host}:{port} …")
    while time.time() < deadline:
        try:
            with socket.create_connection((host, port), timeout=2):
                print("Postgres is ready.\n")
                return
        except OSError:
            time.sleep(1)
    print("Timeout: Postgres did not become reachable. Is Docker running?")
    sys.exit(1)


def ensure_env() -> None:
    SERVER.mkdir(parents=True, exist_ok=True)
    if ENV_FILE.exists():
        print(f"Using existing {ENV_FILE}\n")
        return
    secret = os.urandom(24).hex()
    body = f"""DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/saniga?schema=public"
JWT_SECRET="{secret}"
ADMIN_EMAIL="admin@local.test"
ADMIN_PASSWORD="admin123"
EMPLOYEE_INVITE_CODE="DEMO"
"""
    ENV_FILE.write_text(body, encoding="utf-8")
    print(f"Created {ENV_FILE} (admin: admin@local.test / admin123, invite code: DEMO)\n")


def main() -> None:
    os.chdir(ROOT)
    if not COMPOSE_FILE.exists():
        print("docker-compose.yml not found next to run.py")
        sys.exit(1)
    if not SERVER.is_dir():
        print("server/ folder not found")
        sys.exit(1)

    compose = docker_compose_prefix()
    run(compose + ["-f", str(COMPOSE_FILE), "up", "-d"])
    wait_pg()

    ensure_env()
    npm = which_npm()
    npx = which_npx()

    env = os.environ.copy()
    # Load .env into subprocess env for Prisma / Node
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if "=" in line:
            k, _, v = line.partition("=")
            k, v = k.strip(), v.strip().strip('"').strip("'")
            env[k] = v

    run([npm, "install"], cwd=SERVER, env=env)
    run([npx, "prisma", "migrate", "deploy"], cwd=SERVER, env=env)

    print("\n" + "=" * 56)
    print("  Open:     http://localhost:3000")
    print("  Join:     http://localhost:3000/join.html  (code: DEMO)")
    print("  Login:    admin@local.test / admin123")
    print("  Stop DB:  docker compose down  (in this folder)")
    print("=" * 56 + "\n")

    run([npm, "run", "dev"], cwd=SERVER, env=env)


if __name__ == "__main__":
    main()
