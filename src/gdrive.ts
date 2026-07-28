/**
 * Google Service Account JWT クレーム構造定義
 */
export interface ServiceAccountJwtPayload {
  /** サービスアカウントのメールアドレス */
  iss: string
  /** 要求する API スコープ */
  scope: string
  /** トークン受信者のターゲット URI */
  aud: string
  /** トークンの有効期限（Unix タイムスタンプ秒） */
  exp: number
  /** トークンの発行時刻（Unix タイムスタンプ秒） */
  iat: number
}

/**
 * Google Drive 保存用データパラメータ
 */
export interface SaveToDriveParams {
  /** 保存先 Google Drive フォルダ ID */
  folderId: string
  /** 保存するファイルの基本タイトル（拡張子除く） */
  title: string
  /** 原本 JPG 画像バイナリ */
  jpgData: Uint8Array
  /** マークダウンテキストデータ */
  mdText: string
  /** PDF バイナリデータ */
  pdfData: Uint8Array
}

/**
 * Google Service Account 用の JWT ペイロードオブジェクトを構築します。
 *
 * @param clientEmail - サービスアカウントのメールアドレス
 * @param scope - 要求する Google API スコープ
 * @param nowInSeconds - 現在時刻（Unix タイムスタンプ秒）
 * @returns 構築された JWT ペイロード
 */
export function buildJwtPayload(
  clientEmail: string,
  scope: string,
  nowInSeconds: number = Math.floor(Date.now() / 1000)
): ServiceAccountJwtPayload {
  return {
    iss: clientEmail,
    scope,
    // Google OAuth2 トークン要求エンドポイントの仕様に従い固定のトークンURLを指定
    aud: 'https://oauth2.googleapis.com/token',
    iat: nowInSeconds,
    // Google Token API の最大許容有効期間である 1 時間 (3600秒) に設定
    exp: nowInSeconds + 3600,
  }
}

/**
 * PEM 形式の PKCS8 秘密鍵文字列を WebCrypto 用の ArrayBuffer に変換します。
 *
 * @param pem - PEM 形式の秘密鍵文字列 (-----BEGIN PRIVATE KEY----- ...)
 * @returns デコードされたバイナリ ArrayBuffer
 */
function pemToArrayBuffer(pem: string): ArrayBuffer {
  // PEMヘッダー/フッターおよび改行コードを除去し、純粋なBase64文字列のみを取り出してバイナリ化するため
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')

  const binaryString = atob(base64)
  const bytes = new Uint8Array(binaryString.length)
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i)
  }
  return bytes.buffer
}

/**
 * WebCrypto API を使用して JWT ヘッダーとペイロードを RS256 署名し、アサーション用 JWT を生成します。
 *
 * @param payload - JWT ペイロード
 * @param privateKeyPem - Service Account の PKCS8 秘密鍵
 * @returns 署名済み JWT 文字列
 */
export async function createSignedJwt(
  payload: ServiceAccountJwtPayload,
  privateKeyPem: string
): Promise<string> {
  const header = { alg: 'RS256', typ: 'JWT' }

  const base64UrlEncode = (str: string): string => {
    // JWT 仕様 (RFC 7515) に従い Standard Base64 を URL-Safe Base64 に変換するため
    return btoa(str).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
  }

  const encodedHeader = base64UrlEncode(JSON.stringify(header))
  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const unsignedToken = `${encodedHeader}.${encodedPayload}`

  // Cloudflare Workers 環境で外部ライブラリ非依存で軽量かつ安全に RS256 鍵をインポート・署名するため WebCrypto API を使用
  const keyBuffer = pemToArrayBuffer(privateKeyPem)
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    keyBuffer,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signatureBuffer = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  )

  const signatureArray = new Uint8Array(signatureBuffer)
  let signatureString = ''
  for (let i = 0; i < signatureArray.length; i++) {
    signatureString += String.fromCharCode(signatureArray[i])
  }
  const encodedSignature = base64UrlEncode(signatureString)

  return `${unsignedToken}.${encodedSignature}`
}

/**
 * Service Account 認証情報から Google OAuth2 アクセストークンを取得します。
 *
 * @param saJson - Service Account JSON オブジェクト (`client_email`, `private_key` を含む)
 * @returns OAuth2 アクセストークン
 */
export async function getAccessTokenWithServiceAccount(saJson: {
  client_email: string
  private_key: string
}): Promise<string> {
  const scope = 'https://www.googleapis.com/auth/drive.file'
  const payload = buildJwtPayload(saJson.client_email, scope)
  const jwt = await createSignedJwt(payload, saJson.private_key)

  // Service Account から Bearer アクセストークンを取得するための Google OAuth2 エンドポイント規定フォーマット
  const bodyParams = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: jwt,
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: bodyParams.toString(),
  })

  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`Google OAuth2 Token API Error (${res.status}): ${errText}`)
  }

  const data = (await res.json()) as { access_token?: string }
  if (!data.access_token) {
    throw new Error('Google OAuth2 Token API response missing access_token')
  }
  return data.access_token
}

/**
 * Google Drive API v3 へのアップロード用 Multi-part (`multipart/related`) ボディを生成します。
 *
 * @param params - 保存パラメータ (フォルダID, タイトル, 各ファイルデータ)
 * @returns 生成されたボディバイト列、Content-Typeヘッダー文字列、バウンダリ文字列
 */
export async function buildMultipartBody(params: SaveToDriveParams): Promise<{
  body: Uint8Array
  contentType: string
  boundary: string
}> {
  // 複合ファイルデータ内で衝突しないランダムな境界文字列を生成
  const boundary = `-------314159265358979323846_${Date.now()}`
  const encoder = new TextEncoder()

  const parts: Uint8Array[] = []

  // 1. メタデータパート (全般情報の定義)
  parts.push(
    encoder.encode(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` +
        JSON.stringify({ name: `${params.title}.jpg`, parents: [params.folderId] }) +
        `\r\n`
    )
  )

  // 2. JPG 原本ファイルパート
  parts.push(
    encoder.encode(
      `--${boundary}\r\nContent-Type: image/jpeg\r\nContent-Disposition: form-data; name="file"; filename="${params.title}.jpg"\r\n\r\n`
    )
  )
  parts.push(params.jpgData)
  parts.push(encoder.encode(`\r\n`))

  // 3. Markdown テキストファイルパート
  parts.push(
    encoder.encode(
      `--${boundary}\r\nContent-Type: text/markdown; charset=UTF-8\r\nContent-Disposition: form-data; name="file"; filename="${params.title}.md"\r\n\r\n` +
        params.mdText +
        `\r\n`
    )
  )

  // 4. PDF トリミングファイルパート
  parts.push(
    encoder.encode(
      `--${boundary}\r\nContent-Type: application/pdf\r\nContent-Disposition: form-data; name="file"; filename="${params.title}.pdf"\r\n\r\n`
    )
  )
  parts.push(params.pdfData)
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
