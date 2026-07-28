import { AnalyzeResult, GeminiRequestBody } from './types'

/**
 * Gemini API に対するプロンプト
 * @note box2d は 0-1000 スケールの正規化座標で要求します。
 * クライアント側（Canvas）で元画像の幅・高さに関わらず汎用的に比率計算を行えるようにするためです。
 */
export const GEMINI_PROMPT = `Analyze the provided document image.
1. Extract the main document title (concise summary if untitled).
2. Transcribe and format all content into clean Markdown.
3. Locate the primary document content area and return its bounding box in box2d format [ymin, xmin, ymax, xmax] using normalized coordinates 0-1000.`

/**
 * Gemini API 用の Structured Outputs スキーマ定義
 */
export const GEMINI_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING', description: 'Main document title' },
    markdown: { type: 'STRING', description: 'Transcribed content in Markdown' },
    box2d: {
      type: 'ARRAY',
      description: 'Bounding box [ymin, xmin, ymax, xmax] 0-1000 scale',
      items: { type: 'INTEGER' },
    },
  },
  required: ['title', 'markdown', 'box2d'],
}

/**
 * Gemini 2.5 Flash API へのリクエストボディを作成します。
 *
 * @param imageBase64 - 画像の Base64 文字列
 * @param mimeType - 画像の MIME タイプ (例: 'image/png', 'image/jpeg')
 * @returns 構築された Gemini API リクエストボディ
 */
export function buildGeminiRequest(imageBase64: string, mimeType: string): GeminiRequestBody {
  return {
    contents: [
      {
        parts: [
          { text: GEMINI_PROMPT },
          {
            inline_data: {
              mime_type: mimeType,
              data: imageBase64,
            },
          },
        ],
      },
    ],
    generationConfig: {
      // 理由: LLMの出力揺れによるパース失敗を防ぎ、型安全に解析結果を取得するために Structured Outputs を強制
      response_mime_type: 'application/json',
      response_schema: GEMINI_RESPONSE_SCHEMA,
    },
  }
}

/**
 * Gemini API のレスポンスをパースし、型定義に適合するか検証します。
 *
 * @param rawResponse - Gemini API から返却された生の JSON オブジェクト
 * @returns 構造化された解析結果 (AnalyzeResult)
 * @throws レスポンスに必須フィールドが含まれない場合にエラー
 */
export function parseGeminiResponse(rawResponse: any): AnalyzeResult {
  const candidate = rawResponse?.candidates?.[0]
  const text = candidate?.content?.parts?.[0]?.text
  if (!text) {
    // 理由: APIキー無効やコンテンツフィルタリング等で候補が得られなかった場合に早期失敗させるため
    throw new Error('Invalid response from Gemini API: missing content text')
  }

  const parsed = JSON.parse(text)
  if (!parsed.title || !parsed.markdown || !Array.isArray(parsed.box2d)) {
    // 理由: スキーマ不適合のデータが後続処理（PDF作成やDrive保存）へ流出して予期せぬクラッシュを引き起こすのを防ぐため
    throw new Error('Invalid Gemini output schema: missing required fields')
  }

  return {
    title: parsed.title,
    markdown: parsed.markdown,
    box2d: parsed.box2d as [number, number, number, number],
  }
}

/**
 * Gemini API を呼び出して画像の解析（OCR・マークダウン化・トリミング位置検出）を実行します。
 *
 * @param imageBase64 - 画像の Base64 文字列
 * @param mimeType - 画像の MIME タイプ
 * @param apiKey - Gemini API キー
 * @returns 解析結果のプロミス
 */
export async function analyzeImageWithGemini(
  imageBase64: string,
  mimeType: string,
  apiKey: string
): Promise<AnalyzeResult> {
  // 理由: コストとレスポンス速度のバランスが優れている gemini-2.5-flash モデルを採用
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`
  const body = buildGeminiRequest(imageBase64, mimeType)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Gemini API error (${response.status}): ${errorText}`)
  }

  const rawJson = await response.json()
  return parseGeminiResponse(rawJson)
}
