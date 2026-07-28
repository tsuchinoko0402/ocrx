# デプロイガイド (Deployment Guide)

Cloudflare Workers への手動デプロイおよび GitHub Actions による CI/CD 自動デプロイの手順です。

---

## 1. ローカル開発・事前確認

開発サーバーを起動し、ローカル環境（`http://localhost:8787`）で動作を確認します：

```bash
# 依存関係のインストール
npm install

# TypeScript 型チェック
npm run check

# ローカル開発サーバー起動
npm run dev
# または
npx wrangler dev
```

---

## 2. CLI からの直接デプロイ (Wrangler Deploy)

CLI 経由で Cloudflare Workers 本番環境へ直接デプロイする手順です：

```bash
# Cloudflare へのログイン（初回のみ）
npx wrangler login

# 本番デプロイ実行
npm run deploy
# または
npx wrangler deploy
```

デプロイ完了後、ターミナルにアクセス用 URL（例: `https://ocrx.<subdomain>.workers.dev`）が表示されます。

---

## 3. GitHub Actions による CI/CD 自動デプロイ設定

GitHub Actions を利用して、PR 時の自動テスト（CI）および `main` ブランチマージ時の自動デプロイ（CD）を構築します。

### 3.1. GitHub Repository Secrets の登録
GitHub リポジトリの **Settings > Secrets and variables > Actions** にて、以下 2 つの Secrets を登録します：

1. **`CLOUDFLARE_API_TOKEN`**:
   - Cloudflare Dashboard 右上アイコン > **My Profile > API Tokens** から `Edit Cloudflare Workers` テンプレートで作成した API トークン
2. **`CLOUDFLARE_ACCOUNT_ID`**:
   - Cloudflare Dashboard のサイドバーに表示されている Account ID

### 3.2. ワークフロー概要
- **CI (`.github/workflows/ci.yml`)**:
  - `main` ブランチに対する Pull Request 作成・更新時に `npm run check` (TypeScript型チェック) を実行。
- **CD (`.github/workflows/cd.yml`)**:
  - `main` ブランチへの `git push`（マージ）時に Cloudflare Workers へ自動本番デプロイを実行。
