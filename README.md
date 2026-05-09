## 注意事項(絶対嫁！！read plzなんだが！？)

このアプリは学習目的・個人利用目的の簡易実装であり、本番環境や不特定多数が利用する環境での運用は想定していない。外部公開する場合は、HTTPS化、CSRF対策、ファイル名サニタイズ、MIMEタイプ検証、ログ管理、セッション管理の強化などが必要である。


# LAN内交換テーブル

同一LAN内の自分の端末間でテキスト・URL・ファイルを手軽に受け渡すWebアプリ。

Python / FastAPI 製。DBなし・個人利用専用。

## 制作背景

複数端末間で、メモ、URL、画像、PDFなどを一時的に受け渡したい場面がある。既存のクラウドサービスを使う方法もあるが、個人利用かつ同一LAN内で完結する用途であれば、より小さく単純な仕組みで十分な場合がある。

本アプリでは、同一LAN内の自分の端末間でテキスト・URL・ファイルを受け渡すことを目的に、Python/FastAPIで軽量なWebアプリを実装した。

## 実装した機能

- ID・パスワードによるログイン
- bcryptによるパスワードハッシュ照合
- Discord Webhookを用いた6桁OTP送信
- OTPの有効期限と試行回数制限
- セッションCookieによるログイン状態管理
- テキスト・URL・メモの投稿
- ファイルアップロード
- 許可拡張子・禁止拡張子による制限
- 投稿一覧の検索
- 重要ラベルによる絞り込み
- 投稿削除

## セキュリティ上の設計意図

本アプリはインターネット公開を目的とせず、個人利用かつ同一LAN内での利用を前提としている。

同一LAN内であっても無認証のファイル共有は避けるべきだと考え、ID・パスワード認証に加えて、Discord Webhookを用いたOTP認証を追加した。また、ログイン後はHttpOnly Cookieでセッションを管理し、ファイルアップロードでは危険性の高い拡張子を拒否するようにした。

秘密情報は`.env`に分離し、GitHubには`.env.example`のみを置く。

## 今後の改善点

- ファイル名のサニタイズを強化する
- MIMEタイプ検証を追加する
- CSRF対策を追加する
- セッション管理を永続化する
- テストコードを追加する
- Raspberry Pi上でのLAN内運用を検証する
---

## セットアップ

### 1. 依存関係インストール

```bash
pip install -r requirements.txt
```

### 2. 環境変数設定

`.env.example` をコピーして `.env` を作成し、各項目を設定する。

```bash
cp .env.example .env
```

パスワードハッシュの生成例：

```bash
python -c "import bcrypt; print(bcrypt.hashpw(b'your_password', bcrypt.gensalt()).decode())"
```

セッションシークレットの生成例：

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

### 3. Discord Webhook の設定（OTP送信）

Discord でサーバー → チャンネル設定 → 連携サービス → Webhookを作成し、URLを `.env` の `DISCORD_WEBHOOK_URL` に設定する。

`DISCORD_WEBHOOK_URL` を空のままにすると、OTPはサーバーのコンソールに出力される（開発・テスト用）。

---

## 起動

### 開発中（ローカルのみ）

```bash
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

アクセス: http://127.0.0.1:8000

### LAN内公開

```bash
uvicorn main:app --host 0.0.0.0 --port 8000
```

アクセス: http://192.168.x.x:8000（自PCのローカルIPを確認）

---

## 画面構成

| URL | 説明 |
|-----|------|
| `/login` | ID・パスワードでログイン |
| `/verify` | 6桁OTPの入力 |
| `/board` | 交換テーブル本体 |

---

## ディレクトリ構成

```
lan-exchange-table/
├─ main.py              # FastAPIサーバー
├─ requirements.txt
├─ .env                 # 環境変数（Gitに含めない）
├─ .env.example
├─ .gitignore
├─ data/
│  └─ items.json        # 投稿データ（Gitに含めない）
├─ uploads/             # アップロードファイル（Gitに含めない）
│  └─ .gitkeep
├─ public/
│  ├─ login.html
│  ├─ verify.html
│  ├─ board.html
│  ├─ styles.css
│  └─ app.js
└─ README.md
```

---

## セキュリティ注意事項

- `.env` を Git にコミットしない
- Discord Webhook URL を外部に漏らさない
- ルーターのポート開放・ngrok等のトンネルは使わない
- LAN外への公開は想定外（認証あっても非推奨）
