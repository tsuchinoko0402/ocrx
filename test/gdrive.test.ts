import { describe, it, expect } from 'vitest'
import { buildSingleFileMultipartBody } from '../src/gdrive'

describe('gdrive module with User Access Token', () => {
  describe('buildSingleFileMultipartBody', () => {
    it('should create valid 2-part multipart body with optional folderId', async () => {
      const folderId = 'folder123'
      const filename = '2026-07-29_書類.jpg'
      const mimeType = 'image/jpeg'
      const fileData = new Uint8Array([255, 216, 255, 224])

      const { body, contentType, boundary } = await buildSingleFileMultipartBody({
        folderId,
        filename,
        mimeType,
        content: fileData,
      })

      expect(contentType).toContain(`multipart/related; boundary=${boundary}`)
      expect(body).toBeInstanceOf(Uint8Array)

      const bodyText = new TextDecoder().decode(body)
      expect(bodyText).toContain(folderId)
      expect(bodyText).toContain(filename)
      expect(bodyText).toContain('image/jpeg')
    })

    it('should create valid multipart body without folderId (root drive)', async () => {
      const filename = '2026-07-29_書類.md'
      const mimeType = 'text/markdown'
      const fileData = '# Hello'

      const { body } = await buildSingleFileMultipartBody({
        filename,
        mimeType,
        content: fileData,
      })

      const bodyText = new TextDecoder().decode(body)
      expect(bodyText).toContain(filename)
      expect(bodyText).not.toContain('parents')
    })
  })
})
