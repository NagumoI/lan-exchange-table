"""
LAN内交換テーブル - FastAPI サーバー
仕様書に基づいた実装（passlib不使用版）
"""

import hashlib
import json
import os
import secrets
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
import bcrypt

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

load_dotenv()

APP_USER               = os.getenv("APP_USER", "admin")
APP_PASSWORD_HASH      = os.getenv("APP_PASSWORD_HASH", "")
SESSION_SECRET         = os.getenv("SESSION_SECRET", secrets.token_hex(32))
DISCORD_WEBHOOK_URL    = os.getenv("DISCORD_WEBHOOK_URL", "")
OTP_EXPIRE_SECONDS     = int(os.getenv("OTP_EXPIRE_SECONDS",     "300"))
SESSION_EXPIRE_SECONDS = int(os.getenv("SESSION_EXPIRE_SECONDS", "86400"))
MAX_FILE_SIZE_MB       = int(os.getenv("MAX_FILE_SIZE_MB",       "50"))

if not APP_PASSWORD_HASH:
    raise RuntimeError("APP_PASSWORD_HASH is not set. Create .env from .env.example.")



ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".gif", ".pdf",
                      ".txt", ".md", ".csv", ".zip"}
BLOCKED_EXTENSIONS = {".exe", ".bat", ".cmd", ".ps1", ".vbs", ".msi"}

DATA_DIR    = Path("data")
UPLOADS_DIR = Path("uploads")
DATA_FILE   = DATA_DIR / "items.json"
JST         = timezone(timedelta(hours=9))


DATA_DIR.mkdir(exist_ok=True)
UPLOADS_DIR.mkdir(exist_ok=True)
if not DATA_FILE.exists():
    DATA_FILE.write_text("[]", encoding="utf-8")

pending_otp: dict = {}
sessions:    dict = {}

app = FastAPI(title="LAN Exchange Table")

def _sha256(s: str) -> str:
    return hashlib.sha256(s.encode()).hexdigest()

def verify_password(plain: str, stored: str) -> bool:
    if not plain or not stored:
        return False
    try:
        return bcrypt.checkpw(
            plain.encode("utf-8"),
            stored.encode("utf-8")
        )
    except ValueError:
        return False
        
def load_items() -> list:
    return json.loads(DATA_FILE.read_text(encoding="utf-8"))

def save_items(items: list) -> None:
    DATA_FILE.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")

def get_token(request: Request) -> str | None:
    return request.cookies.get("session_token")

def is_authenticated(request: Request) -> bool:
    token = get_token(request)
    if not token or token not in sessions:
        return False
    if time.time() > sessions[token]["expires_at"]:
        sessions.pop(token, None)
        return False
    return True

def require_auth(request: Request) -> None:
    if not is_authenticated(request):
        raise HTTPException(status_code=401, detail="Unauthorized")

async def send_otp_discord(otp: str) -> None:
    if not DISCORD_WEBHOOK_URL:
        print(f"\n{'='*40}\n  [OTP] {otp}\n  Discord未設定のためコンソール表示\n{'='*40}\n")
        return
    async with httpx.AsyncClient() as client:
        await client.post(DISCORD_WEBHOOK_URL, json={
            "content": f"🔐 **LAN Exchange Table** 認証コード\n```{otp}```\n有効期限: {OTP_EXPIRE_SECONDS // 60} 分"
        })

@app.get("/")
async def root():
    return RedirectResponse("/login")

@app.get("/login")
async def login_page():
    return FileResponse("public/login.html")

@app.get("/verify")
async def verify_page():
    return FileResponse("public/verify.html")

@app.get("/board")
async def board_page(request: Request):
    if not is_authenticated(request):
        return RedirectResponse("/login")
    return FileResponse("public/board.html")

@app.post("/api/login")
async def api_login(request: Request):
    data = await request.json()
    username = data.get("username", "")
    password = data.get("password", "")
    if username != APP_USER or not verify_password(password, APP_PASSWORD_HASH):
        return JSONResponse({"ok": False, "message": "IDまたはパスワードが正しくありません。"})
    otp = f"{secrets.randbelow(1_000_000):06d}"
    pending_otp.clear()
    pending_otp.update({"code_hash": _sha256(otp), "expires_at": time.time() + OTP_EXPIRE_SECONDS, "attempts": 0})
    await send_otp_discord(otp)
    return JSONResponse({"ok": True, "next": "/verify"})

@app.post("/api/verify-otp")
async def api_verify_otp(request: Request):
    data = await request.json()
    otp = data.get("otp", "")
    if not pending_otp:
        return JSONResponse({"ok": False, "message": "認証コードの有効期限が切れています。"})
    if time.time() > pending_otp["expires_at"]:
        pending_otp.clear()
        return JSONResponse({"ok": False, "message": "認証コードの有効期限が切れています。"})
    if pending_otp["attempts"] >= 5:
        pending_otp.clear()
        return JSONResponse({"ok": False, "message": "認証コードの試行回数を超えました。最初からログインしてください。"})
    pending_otp["attempts"] += 1
    if not secrets.compare_digest(_sha256(otp), pending_otp["code_hash"]):
        return JSONResponse({"ok": False, "message": "認証コードが正しくありません。"})
    pending_otp.clear()
    token = secrets.token_hex(32)
    now = time.time()
    sessions[token] = {"expires_at": now + SESSION_EXPIRE_SECONDS, "created_at": now}
    resp = JSONResponse({"ok": True, "next": "/board"})
    resp.set_cookie("session_token", token, httponly=True, samesite="lax", max_age=SESSION_EXPIRE_SECONDS)
    return resp

@app.post("/api/logout")
async def api_logout(request: Request):
    token = get_token(request)
    sessions.pop(token, None)
    resp = JSONResponse({"ok": True})
    resp.delete_cookie("session_token")
    return resp

@app.get("/api/items")
async def get_items(request: Request):
    require_auth(request)
    return JSONResponse(load_items())

@app.post("/api/items")
async def post_item(request: Request, title: str = Form(...), body: str = Form(""), label: str = Form("通常"), file: UploadFile = File(None)):
    require_auth(request)
    items = load_items()
    now = datetime.now(JST)
    item_id = f"{now.strftime('%Y%m%d')}-{len(items) + 1:03d}"
    file_info = None
    if file and file.filename:
        ext = Path(file.filename).suffix.lower()
        if ext in BLOCKED_EXTENSIONS:
            raise HTTPException(400, "このファイル形式はアップロードできません。")
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(400, "許可されていないファイル形式です。")
        content = await file.read()
        if len(content) > MAX_FILE_SIZE_MB * 1024 * 1024:
            raise HTTPException(400, f"ファイルサイズが {MAX_FILE_SIZE_MB}MB を超えています。")
        stored_name = f"{item_id}-{file.filename}"
        stored_path = UPLOADS_DIR / stored_name
        stored_path.write_bytes(content)
        file_info = {"original_name": file.filename, "stored_name": stored_name, "path": str(stored_path), "size": len(content), "content_type": file.content_type}
    item = {"id": item_id, "title": title, "body": body, "label": label, "file": file_info, "created_at": now.isoformat()}
    items.insert(0, item)
    save_items(items)
    return JSONResponse(item, status_code=201)

@app.delete("/api/items/{item_id}")
async def delete_item(item_id: str, request: Request):
    require_auth(request)
    items = load_items()
    item = next((i for i in items if i["id"] == item_id), None)
    if not item:
        raise HTTPException(404, "アイテムが見つかりません。")
    if item.get("file"):
        fp = Path(item["file"]["path"])
        if fp.exists():
            fp.unlink()
    save_items([i for i in items if i["id"] != item_id])
    return JSONResponse({"ok": True})

@app.get("/api/files/{file_name}")
async def get_file(file_name: str, request: Request):
    require_auth(request)
    file_path = (UPLOADS_DIR / file_name).resolve()
    if not str(file_path).startswith(str(UPLOADS_DIR.resolve())):
        raise HTTPException(400, "不正なパスです。")
    if not file_path.exists():
        raise HTTPException(404, "ファイルが見つかりません。")
    return FileResponse(str(file_path))

app.mount("/", StaticFiles(directory="public"), name="static")
