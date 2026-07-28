# セットアップガイド (Setup Guide)

Webアプリ「ocrx」を動かすために必要な外部サービス（Google Cloud, Google Drive, Gemini API, Cloudflare）の初期設定手順です。

---

## 1. Google Cloud Console 設定 (Service Account 作成 & Drive API 有効化)

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセスし、プロジェクトを選択（または新規作成）。
2. **APIとサービス > ライブラリ** から **Google Drive API** を検索し、「有効にする」をクリック。
3. **IAMと管理 > サービスアカウント** に移動し、「サービスアカウントを作成」をクリック。
   - サービスアカウント名: 例 `ocrx-drive-writer`
   - ロール指定は不要（Google Driveのフォルダ共有で権限付与します）。
4. 作成されたサービスアカウントのメールアドレス（例: `ocrx-drive-writer@your-project.iam.gserviceaccount.com`）をコピー。
5. サービスアカウントの「操作」>「鍵を管理」>「鍵を追加」>「新しい鍵を作成」をクリックし、**JSON形式**を選択して作成・保存。

---

## 2. Google Drive 保存先フォルダの設定

1. Google Drive にアクセスし、スキャンデータ保存用フォルダを新規作成（例: `ocrx_scans`）。
2. 作成したフォルダを開き、ブラウザの URL を確認：
   `https://drive.google.com/drive/folders/1_34vNylphcKlZm-xpNVRA5KeAm1ttw-b`
   - URL 末尾の文字列（例: `1_34vNylphcKlZm-xpNVRA5KeAm1ttw-b`）が **フォルダ ID (`GDRIVE_FOLDER_ID`)** です。
3. フォルダの「共有」設定から、手順 1 でコピーしたサービスアカウントのメールアドレスを追加。
   - 権限: **編集者 (Editor)** を選択して保存。

---

## 3. Gemini API キーの発行

1. [Google AI Studio](https://aistudio.google.com/) にアクセス。
2. 「Get API Key」から新しい API キーを発行し、文字列をコピー (**`GEMINI_API_KEY`**)。

---

## 4. 環境変数の設定 (Secrets)

### ローカル開発環境 (`.dev.vars`)
プロジェクト直下に `.dev.vars` ファイルを作成し、以下のように設定します：

```env
GEMINI_API_KEY="your-gemini-api-key"
GDRIVE_FOLDER_ID="your-google-drive-folder-id"
GDRIVE_SERVICE_ACCOUNT_JSON='{"type":"service_account",...}'
```

### Cloudflare 本番環境 (Wrangler Secrets)
Wrangler CLI を利用して、Cloudflare 上に本番用シークレットを暗号化保存します：

```bash
# 1. Gemini API Key
npx wrangler secret put GEMINI_API_KEY

# 2. Google Drive Folder ID
npx wrangler secret put GDRIVE_FOLDER_ID

# 3. Google Service Account JSON (JSON全体を1行で入力)
npx wrangler secret put GDRIVE_SERVICE_ACCOUNT_JSON

# 4. (任意) AI エージェント用 Bearer 認証 API Key
npx wrangler secret put MICRO_APP_API_KEY
```
