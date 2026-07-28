/**
 * クロップ領域のピクセル座標構造
 */
export interface CropArea {
  /** 切り出し開始 X ピクセル位置 */
  x: number
  /** 切り出し開始 Y ピクセル位置 */
  y: number
  /** 切り出し幅ピクセル */
  width: number
  /** 切り出し高さピクセル */
  height: number
}

/**
 * Gemini から返却された 0-1000 スケールの正規化座標 box2d [ymin, xmin, ymax, xmax] と
 * 画像の実際のピクセル幅・高さから、Canvas クロップ領域のピクセル座標を算出します。
 *
 * @param box2d - 0-1000 スケールの正規化バウンディングボックス [ymin, xmin, ymax, xmax]
 * @param imageWidth - 画像の実際の幅（ピクセル）
 * @param imageHeight - 画像の実際の高さ（ピクセル）
 * @returns 算出された Canvas 用ピクセル座標オブジェクト
 */
export function calculateCropArea(
  box2d: [number, number, number, number],
  imageWidth: number,
  imageHeight: number
): CropArea {
  const [ymin, xmin, ymax, xmax] = box2d

  // LLMの出力結果が画像領域外を指していた場合に Canvas 描き込みで画面外参照エラーが発生するのを防ぐため、0~imageDim にクランプ
  const x = Math.max(0, Math.min(imageWidth, Math.round((xmin / 1000) * imageWidth)))
  const y = Math.max(0, Math.min(imageHeight, Math.round((ymin / 1000) * imageHeight)))
  const right = Math.max(x, Math.min(imageWidth, Math.round((xmax / 1000) * imageWidth)))
  const bottom = Math.max(y, Math.min(imageHeight, Math.round((ymax / 1000) * imageHeight)))

  // 画像領域全体より小さい最小サイズ (1px) を保証し、幅0や高さ0の無効な描画指示を回避するため
  const width = Math.max(1, right - x)
  const height = Math.max(1, bottom - y)

  return { x, y, width, height }
}
