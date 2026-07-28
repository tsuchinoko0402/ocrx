/**
 * 画像解析（OCR・Markdown化・トリミング）の結果構造
 */
export interface AnalyzeResult {
  /** ドキュメントのタイトル（タイトルがない場合は要約） */
  title: string
  /** マークダウン形式に変換された本文テキスト */
  markdown: string
  /** ドキュメント主要領域のバウンディングボックス [ymin, xmin, ymax, xmax] (0-1000スケール) */
  box2d: [number, number, number, number]
}

/**
 * Gemini API リクエストのテキストパート
 */
export interface GeminiContentPartText {
  text: string
}

/**
 * Gemini API リクエストの画像インラインデータパート
 */
export interface GeminiContentPartInlineData {
  inline_data: {
    mime_type: string
    data: string
  }
}

export type GeminiContentPart = GeminiContentPartText | GeminiContentPartInlineData

/**
 * Gemini API リクエストボディの構造定義
 */
export interface GeminiRequestBody {
  contents: Array<{
    parts: GeminiContentPart[]
  }>
  generationConfig: {
    response_mime_type: string
    response_schema: Record<string, unknown>
  }
}

