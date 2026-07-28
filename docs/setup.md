# ocrx - セットアップガイド

本ガイドでは、`ocrx` をセットアップし、Google OAuth 2.0 認証および Gemini API を連携させる手順を説明します。

---

## 1. 必要な環境変数

`.dev.vars`（ローカル環境用）および Cloudflare Workers Secrets（本番環境用）に設定するパラメータ一覧：

| 環境変数名 | 説明 | 必須度 |
|---|---|---|
| `GEMINI_API_KEY` | Google AI Studio で発行した Gemini API キー | **必須** |
| `GEMINI_MODEL` | 使用するモデル（デフォルト: `gemini-flash-latest`） | 任意 |
| `GDRIVE_FOLDER_ID` | 保存先 Google Drive フォルダ ID | 任意（省略時はマイドライブ直下） |
| `MICRO_APP_API_KEY` | AI エージェント呼出用 Bearer 認証 API Key | 任意 |

---

## 2. Google OAuth 2.0 クライアント ID の設定

1. **[Google Cloud Console 認証情報画面](https://console.cloud.google.com/apis/credentials)** を開きます。
2. **「＋ 認証情報を作成」 > 「OAuth クライアント ID」** を選択します。
3. アプリケーションの種類: **「ウェブ アプリケーション」**
4. 以下を登録します：
   - **承認済みの JavaScript 生成元**:
     - `http://localhost:8787`
     - `https://ocrx.tsuchinoko.workers.dev`
   - **承認済みのリダイレクト URI**:
     - `http://localhost:8787`
     - `https://ocrx.tsuchinoko.workers.dev`
5. 生成されたクライアント ID を `public/app.js` の `GOOGLE_CLIENT_ID` に指定します。
