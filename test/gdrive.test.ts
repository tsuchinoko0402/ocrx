import { describe, it, expect } from 'vitest'
import { buildJwtPayload, buildMultipartBody } from '../src/gdrive'

describe('gdrive module', () => {
  describe('buildJwtPayload', () => {
    it('should create valid JWT payload for Google OAuth2 Service Account', () => {
      const clientEmail = 'ocrx-writer@project.iam.gserviceaccount.com'
      const scope = 'https://www.googleapis.com/auth/drive.file'
      const nowInSeconds = 1700000000

      const payload = buildJwtPayload(clientEmail, scope, nowInSeconds)

      expect(payload.iss).toBe(clientEmail)
      expect(payload.scope).toBe(scope)
      expect(payload.aud).toBe('https://oauth2.googleapis.com/token')
      expect(payload.iat).toBe(nowInSeconds)
      expect(payload.exp).toBe(nowInSeconds + 3600)
    })
  })

  describe('buildMultipartBody', () => {
    it('should create multi-part body with metadata and file attachments', async () => {
      const folderId = 'folder123'
      const title = '2026-07-29_書類'
      const jpgData = new Uint8Array([255, 216, 255, 224])
      const mdText = '# サンプル'
      const pdfData = new Uint8Array([37, 80, 68, 70])

      const { body, contentType, boundary } = await buildMultipartBody({
        folderId,
        title,
        jpgData,
        mdText,
        pdfData,
      })

      expect(contentType).toContain(`multipart/related; boundary=${boundary}`)
      expect(body).toBeInstanceOf(Uint8Array)

      const bodyText = new TextDecoder().decode(body)
      expect(bodyText).toContain(folderId)
      expect(bodyText).toContain(`${title}.jpg`)
      expect(bodyText).toContain(`${title}.md`)
      expect(bodyText).toContain(`${title}.pdf`)
    })
  })
})
