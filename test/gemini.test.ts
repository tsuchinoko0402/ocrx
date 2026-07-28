import { describe, it, expect } from 'vitest'
import { buildGeminiRequest, parseGeminiResponse } from '../src/gemini'
import { AnalyzeResult } from '../src/types'

describe('gemini module', () => {
  describe('buildGeminiRequest', () => {
    it('should build valid Gemini API request payload with structured output schema', () => {
      const imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      const mimeType = 'image/png'

      const reqBody = buildGeminiRequest(imageBase64, mimeType)

      expect(reqBody.contents[0].parts).toHaveLength(2)
      expect(reqBody.contents[0].parts[1]).toEqual({
        inline_data: {
          mime_type: 'image/png',
          data: imageBase64,
        },
      })
      expect(reqBody.generationConfig.response_mime_type).toBe('application/json')
      expect(reqBody.generationConfig.response_schema).toBeDefined()
    })
  })

  describe('parseGeminiResponse', () => {
    it('should parse raw json text into AnalyzeResult', () => {
      const mockRawJson = JSON.stringify({
        title: 'テスト資料',
        markdown: '# テストタイトル\n本文テキスト',
        box2d: [100, 200, 800, 900],
      })

      const mockApiResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: mockRawJson }],
            },
          },
        ],
      }

      const result: AnalyzeResult = parseGeminiResponse(mockApiResponse)

      expect(result).toEqual({
        title: 'テスト資料',
        markdown: '# テストタイトル\n本文テキスト',
        box2d: [100, 200, 800, 900],
      })
    })

    it('should throw an error if candidates or text are missing', () => {
      expect(() => parseGeminiResponse({})).toThrow()
    })
  })
})
