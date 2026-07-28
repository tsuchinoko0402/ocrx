/**
 * Google Drive 単一ファイル保存パラメータ
 */
export interface SingleFileUploadParams {
  /** 保存先 Google Drive フォルダ ID (省略時はマイドライブ直下) */
  folderId?: string
  /** ファイル名（拡張子含む） */
  filename: string
  /** ファイルの MIME タイプ */
  mimeType: string
  /** ファイルデータ（バイナリ Uint8Array または 文字列） */
  content: Uint8Array | string
}

/**
 * Google Drive API v3 仕様に従い単一ファイルアップロード用 Multi-part (`multipart/related`) ボディを生成します。
 *
 * @param params - アップロードファイルパラメータ
 * @returns 生成されたボディバイト列、Content-Typeヘッダー文字列、バウンダリ文字列
 */
export async function buildSingleFileMultipartBody(params: SingleFileUploadParams): Promise<{
  body: Uint8Array
  contentType: string
  boundary: string
}> {
  // 複合ファイルデータ内で衝突しないランダムな境界文字列を生成
  const boundary = `-------314159265358979323846_${Date.now()}`
  const encoder = new TextEncoder()

  const parts: Uint8Array[] = []

  // 1. メタデータパート (ファイル名および保存先フォルダIDの定義)
  const metadata: Record<string, any> = {
    name: params.filename,
  }

  if (params.folderId) {
    metadata.parents = [params.folderId]
  }

  parts.push(
    encoder.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify(metadata) +
        `\r\n`
    )
  )

  // 2. ファイル実体パート
  parts.push(
    encoder.encode(
      `--${boundary}\r\nContent-Type: ${params.mimeType}\r\n\r\n`
    )
  )

  const contentBytes =
    typeof params.content === 'string' ? encoder.encode(params.content) : params.content
  parts.push(contentBytes)
  parts.push(encoder.encode(`\r\n--${boundary}--\r\n`))

  // 複数の Uint8Array を1つの連続したメモリ領域に結合し、fetch body として直接送信可能にするため
  const totalLength = parts.reduce((acc, part) => acc + part.length, 0)
  const combinedBody = new Uint8Array(totalLength)
  let offset = 0
  for (const part of parts) {
    combinedBody.set(part, offset)
    offset += part.length
  }

  return {
    body: combinedBody,
    contentType: `multipart/related; boundary=${boundary}`,
    boundary,
  }
}

/**
 * ユーザーの Google アクセストークンを使用して単一ファイルを Google Drive API v3 に直接保存します。
 * ユーザー本人のストレージが直接使用されるため容量制限エラーを回避できます。
 *
 * @param params - 保存ファイル情報
 * @param userAccessToken - ユーザーの OAuth2 アクセストークン
 * @returns アップロードされたファイルの Google Drive API メタデータ結果
 */
export async function uploadUserFileToDrive(
  params: SingleFileUploadParams,
  userAccessToken: string
): Promise<any> {
  const { body, contentType } = await buildSingleFileMultipartBody(params)

  const response = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${userAccessToken}`,
        'Content-Type': contentType,
      },
      body: body as unknown as BodyInit,
    }
  )

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Google Drive API upload failed (${response.status}): ${errText}`)
  }

  return response.json()
}
