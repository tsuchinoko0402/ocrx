/**
 * Google Cloud Console にて作成された OAuth 2.0 クライアント ID
 */
const GOOGLE_CLIENT_ID = '639122043891-q39okfqfe62pi62filo5nkgutgbjmqrj.apps.googleusercontent.com'

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

  const x = Math.max(0, Math.min(imageWidth, Math.round((xmin / 1000) * imageWidth)))
  const y = Math.max(0, Math.min(imageHeight, Math.round((ymin / 1000) * imageHeight)))
  const right = Math.max(x, Math.min(imageWidth, Math.round((xmax / 1000) * imageWidth)))
  const bottom = Math.max(y, Math.min(imageHeight, Math.round((ymax / 1000) * imageHeight)))

  const width = Math.max(1, right - x)
  const height = Math.max(1, bottom - y)

  return { x, y, width, height }
}

document.addEventListener('DOMContentLoaded', () => {
  const authSection = document.getElementById('auth-section')
  const captureSection = document.getElementById('capture-section')
  const processingSection = document.getElementById('processing-section')
  const resultSection = document.getElementById('result-section')
  const errorSection = document.getElementById('error-section')

  const authStatusBadge = document.getElementById('auth-status-badge')
  const googleLoginBtn = document.getElementById('google-login-btn')
  const manualTokenInput = document.getElementById('manual-token-input')
  const pasteTokenBtn = document.getElementById('paste-token-btn')
  const saveTokenBtn = document.getElementById('save-token-btn')
  const tokenErrorMsg = document.getElementById('token-error-msg')
  const reauthBtn = document.getElementById('reauth-btn')

  const cameraInput = document.getElementById('camera-input')
  const processTitle = document.getElementById('process-title')
  const processDesc = document.getElementById('process-desc')
  const progressBar = document.getElementById('progress-bar')

  const cropCanvas = document.getElementById('crop-canvas')
  const mdPreview = document.getElementById('md-preview')
  const resultTitle = document.getElementById('result-title')
  const resetBtn = document.getElementById('reset-btn')

  const errorMessageText = document.getElementById('error-message-text')
  const copyErrorBtn = document.getElementById('copy-error-btn')
  const retryBtn = document.getElementById('retry-btn')

  const tabPreviewBtn = document.getElementById('tab-preview-btn')
  const tabMdBtn = document.getElementById('tab-md-btn')
  const tabPreviewContent = document.getElementById('tab-preview-content')
  const tabMdContent = document.getElementById('tab-md-content')

  let userAccessToken = localStorage.getItem('ocrx_google_user_token') || ''

  /**
   * 認証状態の表示およびセクションの制御を行います。
   */
  function checkAuthStatus() {
    if (userAccessToken) {
      if (authStatusBadge) {
        authStatusBadge.textContent = '認証済み (5TB)'
        authStatusBadge.className = 'badge badge-success'
      }
      showView('capture')
    } else {
      if (authStatusBadge) {
        authStatusBadge.textContent = '未認証'
        authStatusBadge.className = 'badge badge-warning'
      }
      showView('auth')
    }
  }

  /**
   * 表示画面を切り替えます。
   *
   * @param {'auth' | 'capture' | 'processing' | 'result' | 'error'} viewName
   */
  function showView(viewName) {
    if (authSection) authSection.classList.add('hidden')
    if (captureSection) captureSection.classList.add('hidden')
    if (processingSection) processingSection.classList.add('hidden')
    if (resultSection) resultSection.classList.add('hidden')
    if (errorSection) errorSection.classList.add('hidden')

    if (viewName === 'auth' && authSection) authSection.classList.remove('hidden')
    if (viewName === 'capture' && captureSection) captureSection.classList.remove('hidden')
    if (viewName === 'processing' && processingSection) processingSection.classList.remove('hidden')
    if (viewName === 'result' && resultSection) resultSection.classList.remove('hidden')
    if (viewName === 'error' && errorSection) errorSection.classList.remove('hidden')
  }

  /**
   * プログレス状態を更新します。
   *
   * @param {number} percentage
   * @param {string} title
   * @param {string} desc
   */
  function updateProgress(percentage, title, desc) {
    if (progressBar) progressBar.style.width = `${percentage}%`
    if (title && processTitle) processTitle.textContent = title
    if (desc && processDesc) processDesc.textContent = desc
  }

  /**
   * エラー画面を出力します。
   *
   * @param {string} msg
   */
  function showError(msg) {
    if (errorMessageText) errorMessageText.value = msg
    showView('error')
  }

  // Google Identity Services (GIS) OAuth2 ワンタップサインイン
  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', () => {
      try {
        if (window.google?.accounts?.oauth2) {
          // Google 公式 Identity Services SDK を用いてポップアップでトークンを取得
          const client = window.google.accounts.oauth2.initTokenClient({
            client_id: GOOGLE_CLIENT_ID,
            scope: 'https://www.googleapis.com/auth/drive.file',
            callback: (response) => {
              if (response.access_token) {
                userAccessToken = response.access_token
                localStorage.setItem('ocrx_google_user_token', userAccessToken)
                checkAuthStatus()
              } else if (response.error) {
                showError(`Google ログインエラー: ${response.error}`)
              }
            },
          })
          client.requestAccessToken()
        } else {
          showError('Google ログイン SDK の読み込みに失敗しました。ページをリロードするか下部手動入力をお試しください。')
        }
      } catch (err) {
        showError(`Google ログイン中に例外が発生しました: ${err.message || err}`)
      }
    })
  }

  // クリップボードからの自動貼り付けボタン
  if (pasteTokenBtn) {
    pasteTokenBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText()
        if (text && manualTokenInput) {
          manualTokenInput.value = text.trim()
          if (tokenErrorMsg) tokenErrorMsg.classList.add('hidden')
        }
      } catch (err) {
        if (manualTokenInput) manualTokenInput.focus()
      }
    })
  }

  // 手動トークン保存ボタン
  if (saveTokenBtn) {
    saveTokenBtn.addEventListener('click', () => {
      const token = manualTokenInput ? manualTokenInput.value.trim() : ''
      if (!token) {
        if (tokenErrorMsg) {
          tokenErrorMsg.textContent = '⚠️ Access Token を入力するか、クリップボードから貼り付けてください。'
          tokenErrorMsg.classList.remove('hidden')
        }
        return
      }

      if (tokenErrorMsg) tokenErrorMsg.classList.add('hidden')
      userAccessToken = token
      localStorage.setItem('ocrx_google_user_token', userAccessToken)
      if (manualTokenInput) manualTokenInput.value = ''
      checkAuthStatus()
    })
  }

  if (reauthBtn) {
    reauthBtn.addEventListener('click', () => {
      userAccessToken = ''
      localStorage.removeItem('ocrx_google_user_token')
      checkAuthStatus()
    })
  }

  if (copyErrorBtn) {
    copyErrorBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(errorMessageText ? errorMessageText.value : '')
        copyErrorBtn.textContent = '✅ コピー完了！'
        setTimeout(() => {
          copyErrorBtn.textContent = '📋 エラーをコピー'
        }, 2000)
      } catch (err) {
        if (errorMessageText) {
          errorMessageText.select()
          document.execCommand('copy')
        }
        copyErrorBtn.textContent = '✅ コピー完了！'
      }
    })
  }

  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      if (cameraInput) cameraInput.value = ''
      checkAuthStatus()
    })
  }

  if (tabPreviewBtn && tabMdBtn && tabPreviewContent && tabMdContent) {
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
  }

  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      if (cameraInput) cameraInput.value = ''
      checkAuthStatus()
    })
  }

  // カメラ撮影・スキャンイベント
  if (cameraInput) {
    cameraInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0]
      if (!file) return

      if (!userAccessToken) {
        showError('Google アカウントのアクセストークンが設定されていません。最初にログイン認証を行ってください。')
        return
      }

      try {
        showView('processing')
        updateProgress(20, 'Gemini AI で解析中...', '文字起こし・Markdown化・トリミング位置を検出しています。')

        // 1. 画像ファイルを Base64 に変換
        const imageBase64 = await fileToBase64(file)

        // 2. Worker /api/analyze 呼び出し
        const analyzeRes = await fetch('/api/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            imageBase64: imageBase64.split(',')[1],
            mimeType: file.type || 'image/jpeg',
          }),
        })

        if (!analyzeRes.ok) {
          const errText = await analyzeRes.text()
          throw new Error(`Analyze API Error (${analyzeRes.status}): ${errText}`)
        }

        const analyzeData = await analyzeRes.json()

        updateProgress(60, 'クロップ & PDF 生成中...', 'ブラウザで高精細クロップとPDFファイルを作成しています。')

        // 3. Canvas API でクロップ画像作成
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
        const pdfBlob = await generatePdfFromImageBlob(croppedJpgBlob, cropArea.width, cropArea.height)

        updateProgress(85, 'ご自身の Google Drive に保存中...', 'ユーザー容量 (5TB) を利用して原本JPG, Markdown, PDFを自動保存しています。')

        // 5. Google Drive 上で作成日時順に綺麗にソートできるよう YYYYMMDD_HHmmss 形式のタイムスタンプを付与
        const now = new Date()
        const timestamp = [
          now.getFullYear(),
          String(now.getMonth() + 1).padStart(2, '0'),
          String(now.getDate()).padStart(2, '0'),
          '_',
          String(now.getHours()).padStart(2, '0'),
          String(now.getMinutes()).padStart(2, '0'),
          String(now.getSeconds()).padStart(2, '0'),
        ].join('')

        const fileTitle = `${timestamp}_${analyzeData.title}`

        // ユーザーのアクセストークンを付与して /api/save を呼び出し
        const formData = new FormData()
        formData.append('title', fileTitle)
        formData.append('jpg', file, `${fileTitle}.jpg`)
        formData.append('markdown', analyzeData.markdown)
        formData.append('pdf', pdfBlob, `${fileTitle}.pdf`)
        formData.append('userAccessToken', userAccessToken)

        const saveRes = await fetch('/api/save', {
          method: 'POST',
          body: formData,
        })

        if (!saveRes.ok) {
          const errText = await saveRes.text()
          throw new Error(`Save API Error (${saveRes.status}): ${errText}`)
        }

        // 6. 結果プレビュー表示
        if (mdPreview) mdPreview.textContent = analyzeData.markdown
        if (resultTitle) resultTitle.textContent = analyzeData.title
        showView('result')
      } catch (err) {
        showError(err.message || String(err))
      }
    })
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.onerror = (err) => reject(err)
      reader.readAsDataURL(file)
    })
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = (err) => reject(err)
      img.src = src
    })
  }

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

  async function generatePdfFromImageBlob(imageBlob, width, height) {
    const { PDFDocument } = window.PDFLib
    const pdfDoc = await PDFDocument.create()

    const imageBytes = await imageBlob.arrayBuffer()
    const embeddedImage = await pdfDoc.embedJpg(imageBytes)

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

  // 初期化時に認証状態をチェック
  checkAuthStatus()
})
