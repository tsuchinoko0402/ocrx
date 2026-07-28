import { describe, it, expect, vi } from 'vitest'
import app from '../src/index'

describe('Workers API Endpoints (src/index.ts)', () => {
  describe('GET /openapi.json', () => {
    it('should return OpenAPI 3.0 specification JSON', async () => {
      const res = await app.request('/openapi.json')
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json.openapi).toBe('3.0.0')
      expect(json.info.title).toBe('ocrx API')
      expect(json.paths['/api/analyze']).toBeDefined()
      expect(json.paths['/api/save']).toBeDefined()
    })
  })

  describe('Bearer Auth Middleware', () => {
    it('should allow request when MICRO_APP_API_KEY is not set', async () => {
      const res = await app.request('/api/health')
      expect(res.status).toBe(200)
    })

    it('should block unauthorized request when MICRO_APP_API_KEY is set', async () => {
      const env = { MICRO_APP_API_KEY: 'secret-key-123' }

      // 認証ヘッダーなし
      const resNoAuth = await app.request('/api/analyze', { method: 'POST' }, env)
      expect(resNoAuth.status).toBe(401)

      // 不正な Bearer トークン
      const resWrongAuth = await app.request(
        '/api/analyze',
        {
          method: 'POST',
          headers: { Authorization: 'Bearer wrong-key' },
        },
        env
      )
      expect(resWrongAuth.status).toBe(401)

      // 正しい Bearer トークン
      const resCorrectAuth = await app.request(
        '/api/analyze',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer secret-key-123',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        },
        env
      )
      // リクエストボディ無効のエラー（400）になるが、認証（401）は通過すること
      expect(resCorrectAuth.status).not.toBe(401)
    })
  })
})
