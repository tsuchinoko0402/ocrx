/**
 * 0-1000 スケールの正規化座標 box2d から Canvas ピクセル位置を算出します。
 *
 * @param {number[]} box2d - [ymin, xmin, ymax, xmax] 0-1000
 * @param {number} imageWidth - 元画像の幅ピクセル
 * @param {number} imageHeight - 元画像の高さピクセル
 * @returns {{ x: number, y: number, width: number, height: number }} ピクセル座標
 */
function calculateCropArea(box2d, imageWidth, imageHeight) {
  const [ymin, xmin, ymax, xmax] = box2d

  // 描画領域外参照エラーを防ぐため 0~元画像サイズにクランプ
  const x = Math.max(0, Math.min(imageWidth, Math.round((xmin / 1000) * imageWidth)))
  const y = Math.max(0, Math.min(imageHeight, Math.round((ymin / 1000) * imageHeight)))
  const right = Math.max(x, Math.min(imageWidth, Math.round((xmax / 1000) * imageWidth)))
  const bottom = Math.max(y, Math.min(imageHeight, Math.round((ymax / 1000) * imageHeight)))

  const width = Math.max(1, right - x)
  const height = Math.max(1, bottom - y)

  return { x, y, width, height }
}

document.addEventListener('DOMContentLoaded', () => {
  const cameraInput = document.getElementById('camera-input')
  const captureSection = document.getElementById('capture-section')
  const processingSection = document.getElementById('processing-section')
  const resultSection = document.getElementById('result-section')

  const processTitle = document.getElementById('process-title')
  const processDesc = document.getElementById('process-desc')
  const progressBar = document.getElementById('progress-bar')

  const cropCanvas = document.getElementById('crop-canvas')
  const mdPreview = document.getElementById('md-preview')
  const resultTitle = document.getElementById('result-title')
  const resetBtn = document.getElementById('reset-btn')

  const tabPreviewBtn = document.getElementById('tab-preview-btn')
  const tabMdBtn = document.getElementById('tab-md-btn')
  const tabPreviewContent = document.getElementById('tab-preview-content')
  const tabMdContent = document.getElementById('tab-md-content')

  /**
   * 表示画面を切り替えます。
   *
   * @param {'capture' | 'processing' | 'result'} viewName
   */
  function showView(viewName) {
    captureSection.classList.add('hidden')
    processingSection.classList.add('hidden')
    resultSection.classList.add('hidden')

    if (viewName === 'capture') captureSection.classList.remove('hidden')
    if (viewName === 'processing') processingSection.classList.remove('hidden')
    if (viewName === 'result') resultSection.classList.remove('hidden')
  }

  /**
   * プログレス状態を更新します。
   *
   * @param {number} percentage
   * @param {string} title
   * @param {string} desc
   */
  function updateProgress(percentage, title, desc) {
    progressBar.style.width = `${percentage}%`
    if (title) processTitle.textContent = title
    if (desc) processDesc.textContent = desc
  }

  // タブ切り替え処理
  tabPreviewBtn.addEventListener('click', () => {
    tabPreviewBtn.classList.add('active')
    tabMdBtn.classList.remove('active')
    tabPreviewContent.classList.remove('hidden')
    tabMdContent.classList.add('hidden')
  })

  tabMdBtn.addEventListener('click', () => {
    tabMdBtn.classList.add('active')
    tabPreviewBtn.classList.remove('active')
    tabMdContent.classList.remove('hidden')
    tabPreviewContent.classList.add('hidden')
  })

  resetBtn.addEventListener('click', () => {
    cameraInput.value = ''
    showView('capture')
  })

  // カメラ撮影・画像選択イベント
  cameraInput.addEventListener('change', async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      showView('processing')
      updateProgress(20, 'Gemini AI で解析中...', '文字起こし・Markdown化・トリミング位置を検出しています。')

      // 1. 画像ファイルを Base64 に変換
      const imageBase64 = await fileToBase64(file)

      // 2. Worker /api/analyze を呼び出し
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imageBase64.split(',')[1],
          mimeType: file.type || 'image/jpeg',
        }),
      })

      if (!analyzeRes.ok) {
        const errJson = await analyzeRes.json()
        throw new Error(errJson.error || 'Gemini 解析エラー')
      }

      const analyzeData = await analyzeRes.json()

      updateProgress(60, 'クロップ & PDF 生成中...', 'ブラウザで高精細クロップとPDFファイルを作成しています。')

      // 3. Canvas API で画像をトリミング
      const img = await loadImage(imageBase64)
      const cropArea = calculateCropArea(analyzeData.box2d, img.width, img.height)

      cropCanvas.width = cropArea.width
      cropCanvas.height = cropArea.height
      const ctx = cropCanvas.getContext('2d')
      ctx.drawImage(
        img,
        cropArea.x,
        cropArea.y,
        cropArea.width,
        cropArea.height,
        0,
        0,
        cropArea.width,
        cropArea.height
      )

      const croppedJpgDataUrl = cropCanvas.toDataURL('image/jpeg', 0.9)
      const croppedJpgBlob = dataURItoBlob(croppedJpgDataUrl)

      // 4. Client-side で pdf-lib を使い PDF 生成
      // サーバーのメモリ・CPU負荷を一切削減しクライアント側で完全処理するため
      const pdfBlob = await generatePdfFromImageBlob(croppedJpgBlob, cropArea.width, cropArea.height)

      updateProgress(85, 'Google Drive に保存中...', '原本JPG, Markdown, PDFをGoogle Driveへ自動保存しています。')

      // 5. /api/save 呼び出しで Google Drive へアップロード
      const formData = new FormData()
      formData.append('title', analyzeData.title)
      formData.append('jpg', file, `${analyzeData.title}.jpg`)
      formData.append('markdown', analyzeData.markdown)
      formData.append('pdf', pdfBlob, `${analyzeData.title}.pdf`)

      const saveRes = await fetch('/api/save', {
        method: 'POST',
        body: formData,
      })

      if (!saveRes.ok) {
        const errJson = await saveRes.json()
        throw new Error(errJson.error || 'Google Drive 保存エラー')
      }

      // 6. 結果プレビュー画面表示
      mdPreview.textContent = analyzeData.markdown
      resultTitle.textContent = analyzeData.title
      showView('result')
    } catch (err) {
      alert(`処理に失敗しました: ${err.message}`)
      showView('capture')
    }
  })

  /**
   * File オブジェクトを Data URL (Base64) 文字列に変換します。
   *
   * @param {File} file
   * @returns {Promise<string>}
   */
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = (err) => reject(err)
      reader.readAsDataURL(file)
    })
  }

  /**
   * Data URL から Image オブジェクトを作成します。
   *
   * @param {string} src
   * @returns {Promise<HTMLImageElement>}
   */
  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = (err) => reject(err)
      img.src = src
    })
  }

  /**
   * Data URI 文字列を Blob オブジェクトに変換します。
   *
   * @param {string} dataURI
   * @returns {Blob}
   */
  function dataURItoBlob(dataURI) {
    const byteString = atob(dataURI.split(',')[1])
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0]
    const ab = new ArrayBuffer(byteString.length)
    const ia = new Uint8Array(ab)
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i)
    }
    return new Blob([ab], { type: mimeString })
  }

  /**
   * クロップ画像 Blob から pdf-lib を用いて PDF ファイルを作成します。
   *
   * @param {Blob} imageBlob
   * @param {number} width
   * @param {number} height
   * @returns {Promise<Blob>}
   */
  async function generatePdfFromImageBlob(imageBlob, width, height) {
    const { PDFDocument } = window.PDFLib
    const pdfDoc = await PDFDocument.create()

    const imageBytes = await imageBlob.arrayBuffer()
    const embeddedImage = await pdfDoc.embedJpg(imageBytes)

    // クロップ画像の解像度・アスペクト比にピッタリ一致するページサイズを設定
    const page = pdfDoc.addPage([width, height])
    page.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width: width,
      height: height,
    })

    const pdfBytes = await pdfDoc.save()
    return new Blob([pdfBytes], { type: 'application/pdf' })
  }
})
