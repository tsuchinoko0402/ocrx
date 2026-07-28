import { describe, it, expect } from 'vitest'
import { calculateCropArea } from '../src/crop-util'

describe('calculateCropArea', () => {
  it('should calculate pixel crop dimensions from normalized 0-1000 box2d', () => {
    const box2d: [number, number, number, number] = [100, 200, 800, 900]
    const imageWidth = 1000
    const imageHeight = 2000

    const crop = calculateCropArea(box2d, imageWidth, imageHeight)

    // ymin: 100/1000 * 2000 = 200
    // xmin: 200/1000 * 1000 = 200
    // ymax: 800/1000 * 2000 = 1600 -> height = 1600 - 200 = 1400
    // xmax: 900/1000 * 1000 = 900 -> width = 900 - 200 = 700
    expect(crop).toEqual({
      x: 200,
      y: 200,
      width: 700,
      height: 1400,
    })
  })

  it('should clamp out-of-bounds coordinates within image dimensions', () => {
    const box2d: [number, number, number, number] = [-50, -10, 1050, 1100]
    const imageWidth = 800
    const imageHeight = 600

    const crop = calculateCropArea(box2d, imageWidth, imageHeight)

    expect(crop.x).toBeGreaterThanOrEqual(0)
    expect(crop.y).toBeGreaterThanOrEqual(0)
    expect(crop.x + crop.width).toBeLessThanOrEqual(imageWidth)
    expect(crop.y + crop.height).toBeLessThanOrEqual(imageHeight)
  })
})
