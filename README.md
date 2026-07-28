# ocrx - スマホ専用ドキュメント自動スキャン PWA

スマホから紙資料（書類、プリント、手書きメモ等）を撮影し、ワンタップで OCR・トリミング・Markdown化を行い、ご自身の Google Drive に 3 点セット（原本JPG, Markdown, トリミングPDF）を自動保存する自分専用 PWA アプリ。

---

## 🚀 主な機能・特徴

- **3つのスキャンモード搭載**:
  1. 🔍 **確認スキャン**: 1枚ずつ撮影し、プレビューで OCR テキストやトリミング画像を確認する標準モード。
  2. ⚡ **連続連写スキャン**: 待ち時間ゼロ！パシャパシャ連写撮影し、バックグラウンド Queue が非同期で並行保存。
  3. 🎯 **オート撮影スキャン**: カメラ映像から書類枠と手ブレ収束（0.9秒静止）を自動検知し、ボタンを押さずに自動キャプチャ＆保存。
- **Google Drive へ直接自動保存**:
  - Google OAuth 2.0 ユーザー直接認証に対応。サービスアカウントの容量制限を受けることなく、自分自身の Google Drive に保存されます。
  - ファイル名には日時順で綺麗にソートできるタイムスタンプ (`YYYYMMDD_HHmmss_タイトル`) を自動付与。
- **Gemini Vision AI による高度 OCR**:
  - 印刷文字・手書きメモの高精度読み取り & Structured Outputs (JSON) によるタイトル・Markdown・座標抽出。
- **ブラウザ側高速トリミング & PDF生成**:
  - スマホブラウザの Canvas API で余白をカットし、`pdf-lib` で軽量な PDF を自動作成。
- **AI Agent-First REST API 対応**:
  - OpenAPI 3.0 規格 (`/openapi.json`) と Bearer 認証キーに対応し、Claude Code や AI エージェントからのプログラム直接呼び出しもサポート。

---

## 🛠 技術スタック

- **Frontend**: PWA (HTML5 / Vanilla JS / Canvas API / `pdf-lib` / Google Identity Services)
- **Backend**: Cloudflare Workers (TypeScript / Hono)
- **AI Engine**: Gemini API (`gemini-flash-latest` / `gemini-2.5-flash`)
- **Auth & Storage**: Google OAuth 2.0 (Redirect & GIS) / Google Drive API v3

---

## 📚 ドキュメント

セットアップおよびデプロイの詳細手順については、以下のドキュメントを参照してください：

- ⚙️ **[セットアップガイド (docs/setup.md)](docs/setup.md)**: Google OAuth 2.0 クライアント ID、Google Drive フォルダ、Gemini API キーの設定手順
- 🚀 **[デプロイガイド (docs/deployment.md)](docs/deployment.md)**: ローカル開発、Wrangler CLI デプロイ手順

---

## ⚡️ クイックスタート

```bash
# 依存関係のインストール
npm install

# ユニットテストの実行
npm test

# 型チェックの実行
npm run check

# ローカル開発サーバーの起動 (http://localhost:8787)
npm run dev

# Cloudflare Workers へ本番デプロイ
npm run deploy
```

---

## 🌐 本番公開 URL

- **App**: [https://ocrx.tsuchinoko.workers.dev](https://ocrx.tsuchinoko.workers.dev)
- **OpenAPI Spec**: `https://ocrx.tsuchinoko.workers.dev/openapi.json`
