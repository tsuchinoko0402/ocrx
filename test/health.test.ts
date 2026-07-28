import { describe, it, expect } from 'vitest'
import app from '../src/index'

describe('GET /api/health', () => {
  it('should return status ok and message', async () => {
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({
      status: 'ok',
      message: 'ocrx worker running',
    })
  })
})
