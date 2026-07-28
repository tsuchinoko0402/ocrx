import { Hono } from 'hono'
import { analyzeImageWithGemini } from './gemini'
import { uploadUserFileToDrive } from './gdrive'

/**
 * Cloudflare Workers 環境変数バインディング定義
 */
export interface Env {
  /** Static Assets バインディング */
  ASSETS: Fetcher
  /** Gemini API Key シークレット */
  GEMINI_API_KEY?: string
  /** 使用する Gemini モデル名（未設定時は gemini-flash-latest を自動採用） */
  GEMINI_MODEL?: string
  /** Google Drive 保存先フォルダ ID (オプション) */
  GDRIVE_FOLDER_ID?: string
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
        summary: 'Analyze document image with Gemini AI',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  imageBase64: { type: 'string', description: 'Base64 encoded image data' },
                  mimeType: { type: 'string', description: 'Image MIME type' },
                },
                required: ['imageBase64'],
              },
            },
          },
        },
        responses: {
          '200': { description: 'Analysis result (title, markdown, box2d)' },
        },
      },
    },
    '/api/save': {
      post: {
        summary: 'Upload scanned set (JPG, Markdown, PDF) to user Google Drive',
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
                  userAccessToken: { type: 'string', description: 'User Google OAuth2 Access Token' },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'File upload status' },
          '400': { description: 'Missing files or access token' },
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
  if (!microAppApiKey) {
    return next()
  }

  const authHeader = c.req.header('Authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
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
    return c.json({ error: 'Server misconfiguration: GEMINI_API_KEY is not set' }, 500)
  }

  try {
    const body = await c.req.json<{ imageBase64?: string; mimeType?: string }>()
    if (!body?.imageBase64) {
      return c.json({ error: 'Missing required field: imageBase64' }, 400)
    }

    const mimeType = body.mimeType || 'image/jpeg'
    const modelName = c.env?.GEMINI_MODEL || 'gemini-flash-latest'
    const result = await analyzeImageWithGemini(body.imageBase64, mimeType, apiKey, modelName)

    return c.json(result)
  } catch (err: any) {
    return c.json({ error: err.message || 'Analysis failed' }, 500)
  }
})

/**
 * Google Drive 保存 API エンドポイント (`POST /api/save`)
 * ユーザー本人の OAuth2 アクセストークンを使用してストレージ容量エラーなくドライブへ保存します。
 */
app.post('/api/save', async (c) => {
  try {
    const formData = await c.req.formData()
    const title = (formData.get('title') as string) || `Scan_${Date.now()}`
    const jpgFile = formData.get('jpg') as File | null
    const mdText = (formData.get('markdown') as string) || ''
    const pdfFile = formData.get('pdf') as File | null

    // ヘッダーまたは FormData からユーザーのアクセストークンを取得
    let userAccessToken = formData.get('userAccessToken') as string | null
    if (!userAccessToken) {
      const authHeader = c.req.header('X-User-Google-Token')
      if (authHeader) userAccessToken = authHeader
    }

    if (!userAccessToken) {
      // ユーザーの Google アクセストークンが欠落している場合、認証要求エラーを返却
      return c.json({ error: 'Missing userAccessToken: Google OAuth2 authentication required' }, 400)
    }

    if (!jpgFile || !pdfFile) {
      return c.json({ error: 'Missing required files: jpg and pdf must be provided' }, 400)
    }

    const jpgData = new Uint8Array(await jpgFile.arrayBuffer())
    const pdfData = new Uint8Array(await pdfFile.arrayBuffer())

    const folderId = c.env?.GDRIVE_FOLDER_ID || undefined

    // ユーザー本人の Google アクセストークンを使って 3 ファイルをそれぞれ保存
    const [jpgRes, mdRes, pdfRes] = await Promise.all([
      uploadUserFileToDrive(
        { folderId, filename: `${title}.jpg`, mimeType: 'image/jpeg', content: jpgData },
        userAccessToken
      ),
      uploadUserFileToDrive(
        { folderId, filename: `${title}.md`, mimeType: 'text/markdown', content: mdText },
        userAccessToken
      ),
      uploadUserFileToDrive(
        { folderId, filename: `${title}.pdf`, mimeType: 'application/pdf', content: pdfData },
        userAccessToken
      ),
    ])

    return c.json({
      status: 'ok',
      files: {
        jpg: jpgRes,
        markdown: mdRes,
        pdf: pdfRes,
      },
    })
  } catch (err: any) {
    return c.json({ error: err.message || 'Failed to save to Google Drive' }, 500)
  }
})

export default app
