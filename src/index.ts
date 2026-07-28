import { Hono } from 'hono'
import { analyzeImageWithGemini } from './gemini'
import { getAccessTokenWithServiceAccount, buildMultipartBody } from './gdrive'

/**
 * Cloudflare Workers 環境変数バインディング定義
 */
export interface Env {
  /** Static Assets バインディング */
  ASSETS: Fetcher
  /** Gemini API Key シークレット */
  GEMINI_API_KEY?: string
  /** Google Drive 保存先フォルダ ID */
  GDRIVE_FOLDER_ID?: string
  /** Google Service Account JSON シークレット */
  GDRIVE_SERVICE_ACCOUNT_JSON?: string
  /** AI エージェント用 Bearer 認証 API Key シークレット */
  MICRO_APP_API_KEY?: string
}

const app = new Hono<{ Bindings: Env }>()

/**
 * OpenAPI 3.0 仕様オブジェクト定義
 */
const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'ocrx API',
    version: '1.0.0',
    description: 'Document OCR, Markdown transcription, and Google Drive upload API for AI agents and PWA',
  },
  paths: {
    '/api/health': {
      get: {
        summary: 'Health check endpoint',
        responses: {
          '200': { description: 'Worker is running' },
        },
      },
    },
    '/api/analyze': {
      post: {
        summary: 'Analyze document image with Gemini 2.5 Flash',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  imageBase64: { type: 'string', description: 'Base64 encoded image data' },
                  mimeType: { type: 'string', description: 'Image MIME type (e.g. image/jpeg, image/png)' },
                },
                required: ['imageBase64'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Analysis result (title, markdown, box2d)' },
          '400': { description: 'Invalid payload' },
          '401': { description: 'Unauthorized' },
        },
      },
    },
    '/api/save': {
      post: {
        summary: 'Upload scanned set (JPG, Markdown, PDF) to Google Drive',
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  jpg: { type: 'string', format: 'binary' },
                  markdown: { type: 'string' },
                  pdf: { type: 'string', format: 'binary' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'File upload status' },
          '400': { description: 'Missing file components' },
          '500': { description: 'Google Drive API error' },
        },
      },
    },
  },
}

/**
 * API Key Bearer 認証ミドルウェア
 */
app.use('/api/*', async (c, next) => {
  const microAppApiKey = c.env?.MICRO_APP_API_KEY
  // MICRO_APP_API_KEY が未設定の場合はパブリックツールとして認証を通過させる
  if (!microAppApiKey) {
    return next()
  }

  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // 認証キー未提示のリクエストを遮断し不正アクセスを抑止するため
    return c.json({ error: 'Unauthorized: missing or invalid Bearer token' }, 401)
  }

  const token = authHeader.substring(7)
  if (token !== microAppApiKey) {
    return c.json({ error: 'Unauthorized: invalid API key' }, 401)
  }

  return next()
})

/**
 * ヘルスチェックエンドポイント
 */
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', message: 'ocrx worker running' })
})

/**
 * OpenAPI 仕様スキーマ提供エンドポイント
 */
app.get('/openapi.json', (c) => {
  return c.json(openApiSpec)
})

/**
 * 画像解析 API エンドポイント (`POST /api/analyze`)
 */
app.post('/api/analyze', async (c) => {
  const apiKey = c.env?.GEMINI_API_KEY
  if (!apiKey) {
    // Workers のシークレット未設定による実行時障害を明確化してデバッグを容易にするため
    return c.json({ error: 'Server misconfiguration: GEMINI_API_KEY is not set' }, 500)
  }

  try {
    const body = await c.req.json<{ imageBase64?: string; mimeType?: string }>()
    if (!body?.imageBase64) {
      return c.json({ error: 'Missing required field: imageBase64' }, 400)
    }

    const mimeType = body.mimeType || 'image/jpeg'
    const result = await analyzeImageWithGemini(body.imageBase64, mimeType, apiKey)

    return c.json(result)
  } catch (err: any) {
    return c.json({ error: err.message || 'Analysis failed' }, 500)
  }
})

/**
 * Google Drive 保存 API エンドポイント (`POST /api/save`)
 */
app.post('/api/save', async (c) => {
  const saJsonStr = c.env?.GDRIVE_SERVICE_ACCOUNT_JSON
  const folderId = c.env?.GDRIVE_FOLDER_ID

  if (!saJsonStr || !folderId) {
    return c.json(
      { error: 'Server misconfiguration: GDRIVE_SERVICE_ACCOUNT_JSON or GDRIVE_FOLDER_ID is missing' },
      500
    )
  }

  try {
    const formData = await c.req.formData()
    const title = (formData.get('title') as string) || `Scan_${Date.now()}`
    const jpgFile = formData.get('jpg') as File | null
    const mdText = (formData.get('markdown') as string) || ''
    const pdfFile = formData.get('pdf') as File | null

    if (!jpgFile || !pdfFile) {
      // 3点セット保存の必須構成要素が欠けている場合の不正リクエストを弾くため
      return c.json({ error: 'Missing required files: jpg and pdf must be provided' }, 400)
    }

    const jpgData = new Uint8Array(await jpgFile.arrayBuffer())
    const pdfData = new Uint8Array(await pdfFile.arrayBuffer())

    // サービスアカウント JSON をパースしてアクセストークンを取得
    const saJson = JSON.parse(saJsonStr)
    const accessToken = await getAccessTokenWithServiceAccount(saJson)

    // Multi-part ボディの構築
    const { body, contentType } = await buildMultipartBody({
      folderId,
      title,
      jpgData,
      mdText,
      pdfData,
    })

    // Google Drive API v3 に multipart アップロードリクエストを送信
    const driveRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': contentType,
        },
        body: body as unknown as BodyInit,
      }
    )

    if (!driveRes.ok) {
      const errText = await driveRes.text()
      return c.json({ error: `Google Drive API upload failed (${driveRes.status}): ${errText}` }, 500)
    }

    const uploadedFileData = await driveRes.json()
    return c.json({ status: 'ok', file: uploadedFileData })
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to save to Google Drive' }, 500)
  }
})

export default app
