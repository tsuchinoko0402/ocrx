# ocrx - デプロイガイド

Cloudflare Workers への手動デプロイおよびローカル確認手順です。

---

## 1. ローカル開発環境での確認

```bash
# テストと型チェック
npm test
npm run check

# ローカルサーバー起動
npm run dev
# -> http://localhost:8787 で PWA UI が利用可能
```

---

## 2. Cloudflare Workers 本番デプロイ

```bash
# シークレットの設定
npx wrangler secret put GEMINI_API_KEY

# 本番環境へデプロイ
npm run deploy
# -> Deployed to https://ocrx.tsuchinoko.workers.dev
```
