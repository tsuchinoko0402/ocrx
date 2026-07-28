# ocrx - スマホ専用ドキュメント自動スキャン PWA

スマホから紙資料（書類、プリント、手書きメモ等）を撮影し、ワンタップで OCR・トリミング・Markdown化を行い、Google Drive に 3 点セット（原本JPG, Markdown, トリミングPDF）を自動保存する自分専用 PWA アプリ。

---

## 🚀 主な機能・特徴

- **ワンタップ全自動処理**: 撮影ボタンタップ後、プログレス表示のみで結果まで完結。
- **Gemini Vision による高度 OCR**: 印刷文字・手書きメモの高精度読み取り & Structured Outputs (JSON) によるタイトル・Markdown・座標抽出。
- **ブラウザ側高速トリミング & PDF生成**: スマホブラウザの Canvas API で余白をカットし、`pdf-lib` で軽量な PDF を自動作成。
- **Google Drive 自動保存 (3点セット)**: 原本 (`.jpg`)、OCRテキスト (`.md`)、トリミング済み (`.pdf`) を指定フォルダに同時保存。
- **AI Agent-First API 対応**: 人間向け PWA に加え、OpenAPI 規格 (`/openapi.json`) と Bearer 認証に対応し、AI エージェントからの自動呼び出しもサポート。

---

## 🛠 技術スタック

- **Frontend**: PWA (HTML5 / Vanilla JS / Canvas API / `pdf-lib`)
- **Backend**: Cloudflare Workers (TypeScript / Hono)
- **AI Engine**: Gemini API (`gemini-2.5-flash`)
- **Auth & Storage**: Google Service Account (JWT) / Google Drive API v3

---

## 📚 ドキュメント

セットアップおよびデプロイの詳細手順については、以下のドキュメントを参照してください：

- ⚙️ **[セットアップガイド (docs/setup.md)](docs/setup.md)**: GCP サービスアカウント、Google Drive フォルダ、Gemini API キー、Cloudflare Secrets の設定手順
- 🚀 **[デプロイガイド (docs/deployment.md)](docs/deployment.md)**: ローカル開発、Wrangler CLI 手動デプロイ、GitHub Actions による CI/CD 設定手順

---

## ⚡️ クイックスタート

```bash
# 依存関係のインストール
npm install

# ローカル開発サーバーの起動 (http://localhost:8787)
npm run dev

# Cloudflare Workers へ本番デプロイ
npm run deploy
```
