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
  // セクション要素
  const authSection = document.getElementById('auth-section')
  const captureSection = document.getElementById('capture-section')
  const processingSection = document.getElementById('processing-section')
  const resultSection = document.getElementById('result-section')
  const queueSection = document.getElementById('queue-section')
  const errorSection = document.getElementById('error-section')

  // 認証要素
  const authStatusBadge = document.getElementById('auth-status-badge')
  const logoutBtn = document.getElementById('logout-btn')
  const googleLoginBtn = document.getElementById('google-login-btn')
  const manualTokenInput = document.getElementById('manual-token-input')
  const pasteTokenBtn = document.getElementById('paste-token-btn')
  const saveTokenBtn = document.getElementById('save-token-btn')
  const tokenErrorMsg = document.getElementById('token-error-msg')

  // モード切替 ＆ 撮影コントロール要素
  const modeSingleBtn = document.getElementById('mode-single-btn')
  const modeContinuousBtn = document.getElementById('mode-continuous-btn')
  const modeAutoBtn = document.getElementById('mode-auto-btn')

  const manualCaptureView = document.getElementById('manual-capture-view')
  const autoCaptureView = document.getElementById('auto-capture-view')
  const captureModeTitle = document.getElementById('capture-mode-title')
  const captureModeDesc = document.getElementById('capture-mode-desc')
  const captureBtnText = document.getElementById('capture-btn-text')
  const cameraInput = document.getElementById('camera-input')

  // オートキャプチャ要素
  const autoVideo = document.getElementById('auto-video')
  const autoCanvas = document.getElementById('auto-canvas')
  const docGuideBox = document.getElementById('doc-guide-box')
  const autoStatusText = document.getElementById('auto-status-text')
  const stopAutoBtn = document.getElementById('stop-auto-btn')

  // 単体処理 ＆ 結果プレビュー要素
  const processTitle = document.getElementById('process-title')
  const processDesc = document.getElementById('process-desc')
  const progressBar = document.getElementById('progress-bar')

  const cropCanvas = document.getElementById('crop-canvas')
  const mdPreview = document.getElementById('md-preview')
  const resultTitle = document.getElementById('result-title')
  const resetBtn = document.getElementById('reset-btn')

  // バックグラウンドキュー要素
  const queueCountText = document.getElementById('queue-count-text')
  const queueItemsContainer = document.getElementById('queue-items-container')
  const clearQueueBtn = document.getElementById('clear-queue-btn')

  // エラー表示要素
  const errorMessageText = document.getElementById('error-message-text')
  const copyErrorBtn = document.getElementById('copy-error-btn')
  const retryBtn = document.getElementById('retry-btn')

  // タブ要素
  const tabPreviewBtn = document.getElementById('tab-preview-btn')
  const tabMdBtn = document.getElementById('tab-md-btn')
  const tabPreviewContent = document.getElementById('tab-preview-content')
  const tabMdContent = document.getElementById('tab-md-content')

  // ステート定義
  let userAccessToken = localStorage.getItem('ocrx_google_user_token') || ''
  let currentScanMode = 'single' // 'single' | 'continuous' | 'auto'
  let activeVideoStream = null
  let autoDetectIntervalId = null
  let isAutoCapturing = false

  // バックグラウンド非同期処理キュー構造
  const backgroundQueue = [] // { id: string, file: File, status: 'pending'|'processing'|'completed'|'error', progress: string, title?: string, error?: string }
  let activeQueueWorkers = 0
  const MAX_CONCURRENT_WORKERS = 2

  // URL Hash 解析 (OAuth2 リダイレクト対応)
  if (window.location.hash) {
    const params = new URLSearchParams(window.location.hash.substring(1))
    const accessTokenFromHash = params.get('access_token')
    const errorFromHash = params.get('error')

    if (accessTokenFromHash) {
      userAccessToken = accessTokenFromHash
      localStorage.setItem('ocrx_google_user_token', userAccessToken)
      history.replaceState(null, '', window.location.pathname)
    } else if (errorFromHash) {
      const errorDesc = params.get('error_description') || errorFromHash
      setTimeout(() => {
        showError(`Google OAuth2 リダイレクトエラー (${errorFromHash}):\n${errorDesc}`)
      }, 100)
    }
  }

  /**
   * 認証状態の表示およびセクションの制御を行います。
   */
  function checkAuthStatus() {
    if (userAccessToken) {
      if (authStatusBadge) {
        authStatusBadge.textContent = '認証済み'
        authStatusBadge.className = 'badge badge-success'
      }
      if (logoutBtn) logoutBtn.classList.remove('hidden')
      showView('capture')
    } else {
      if (authStatusBadge) {
        authStatusBadge.textContent = '未認証'
        authStatusBadge.className = 'badge badge-warning'
      }
      if (logoutBtn) logoutBtn.classList.add('hidden')
      stopAutoCamera()
      showView('auth')
    }
  }

  /**
   * 認証トークンを解除（クリア）します。
   */
  function handleLogout() {
    userAccessToken = ''
    localStorage.removeItem('ocrx_google_user_token')
    checkAuthStatus()
  }

  if (logoutBtn) logoutBtn.addEventListener('click', handleLogout)

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
   * スキャンモードを切り替えます。
   *
   * @param {'single' | 'continuous' | 'auto'} mode
   */
  function switchScanMode(mode) {
    currentScanMode = mode

    modeSingleBtn.classList.toggle('active', mode === 'single')
    modeContinuousBtn.classList.toggle('active', mode === 'continuous')
    modeAutoBtn.classList.toggle('active', mode === 'auto')

    if (mode === 'single') {
      captureModeTitle.textContent = '確認スキャン'
      captureModeDesc.textContent = '1枚ずつ撮影しプレビュー確認を行う標準モードです。'
      captureBtnText.textContent = '📷 写真を撮影 / 選択'
      manualCaptureView.classList.remove('hidden')
      autoCaptureView.classList.add('hidden')
      stopAutoCamera()
    } else if (mode === 'continuous') {
      captureModeTitle.textContent = '⚡ 連続連写スキャン'
      captureModeDesc.textContent = '待ち時間ゼロ！パシャパシャ撮影し裏で非同期自動保存します。'
      captureBtnText.textContent = '⚡ 連続撮影を開始'
      manualCaptureView.classList.remove('hidden')
      autoCaptureView.classList.add('hidden')
      stopAutoCamera()
      queueSection.classList.remove('hidden')
    } else if (mode === 'auto') {
      manualCaptureView.classList.add('hidden')
      autoCaptureView.classList.remove('hidden')
      queueSection.classList.remove('hidden')
      startAutoCamera()
    }
  }

  if (modeSingleBtn) modeSingleBtn.addEventListener('click', () => switchScanMode('single'))
  if (modeContinuousBtn) modeContinuousBtn.addEventListener('click', () => switchScanMode('continuous'))
  if (modeAutoBtn) modeAutoBtn.addEventListener('click', () => switchScanMode('auto'))

  // -------------------------------------------------------------
  // オートシャッター ＆ 書類境界・ブレ静止検出エンジン
  // -------------------------------------------------------------
  let stableCounter = 0
  let prevImageData = null

  async function startAutoCamera() {
    try {
      stopAutoCamera()
      activeVideoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      autoVideo.srcObject = activeVideoStream
      autoStatusText.textContent = '書類を枠内に合わせて静止してください'
      docGuideBox.className = 'doc-guide-box'

      stableCounter = 0
      prevImageData = null
      autoDetectIntervalId = setInterval(analyzeLiveFrame, 300)
    } catch (err) {
      showError(`カメラの起動に失敗しました: ${err.message || err}\nブラウザのカメラアクセス許可をご確認ください。`)
    }
  }

  function stopAutoCamera() {
    if (autoDetectIntervalId) {
      clearInterval(autoDetectIntervalId)
      autoDetectIntervalId = null
    }
    if (activeVideoStream) {
      activeVideoStream.getTracks().forEach((track) => track.stop())
      activeVideoStream = null
    }
  }

  if (stopAutoBtn) stopAutoBtn.addEventListener('click', () => switchScanMode('single'))

  /**
   * リアルタイムのビデオフレームから手ブレ安定度と書類枠を検出します。
   */
  function analyzeLiveFrame() {
    if (!autoVideo || autoVideo.readyState !== 4 || isAutoCapturing) return

    const width = 160
    const height = 120
    autoCanvas.width = width
    autoCanvas.height = height
    const ctx = autoCanvas.getContext('2d')
    ctx.drawImage(autoVideo, 0, 0, width, height)

    const frame = ctx.getImageData(0, 0, width, height)
    const data = frame.data

    if (!prevImageData) {
      prevImageData = data
      return
    }

    // パクセル差分から画面の静止度（手ブレ収束）を計算
    let diff = 0
    for (let i = 0; i < data.length; i += 16) {
      diff += Math.abs(data[i] - prevImageData[i])
    }
    prevImageData = data

    const motionScore = diff / (width * height)

    if (motionScore < 3.5) {
      // 静止検出
      stableCounter++
      docGuideBox.className = 'doc-guide-box detected'
      autoStatusText.textContent = `🎯 書類検出中... (${stableCounter}/3)`

      if (stableCounter >= 3) {
        // 0.9秒間完全静止したため自動撮影を実行
        captureFromLiveStream()
      }
    } else {
      stableCounter = 0
      docGuideBox.className = 'doc-guide-box'
      autoStatusText.textContent = '書類を枠内に合わせて静止してください'
    }
  }

  /**
   * ライブカメラビデオストリームから静止画を自動キャプチャしキューへ投入します。
   */
  function captureFromLiveStream() {
    if (isAutoCapturing) return
    isAutoCapturing = true

    docGuideBox.className = 'doc-guide-box capturing'
    autoStatusText.textContent = '📸 キャプチャ中！'

    const captureCanvas = document.createElement('canvas')
    captureCanvas.width = autoVideo.videoWidth || 1280
    captureCanvas.height = autoVideo.videoHeight || 720
    const ctx = captureCanvas.getContext('2d')
    ctx.drawImage(autoVideo, 0, 0, captureCanvas.width, captureCanvas.height)

    captureCanvas.toBlob((blob) => {
      if (blob) {
        const file = new File([blob], `AutoScan_${Date.now()}.jpg`, { type: 'image/jpeg' })
        enqueueBackgroundJob(file)
      }
      setTimeout(() => {
        isAutoCapturing = false
        stableCounter = 0
        docGuideBox.className = 'doc-guide-box'
        autoStatusText.textContent = '書類を枠内に合わせて静止してください'
      }, 1500)
    }, 'image/jpeg', 0.92)
  }

  // -------------------------------------------------------------
  // バックグラウンド非同期処理 Queue エンジン
  // -------------------------------------------------------------

  /**
   * 撮影画像をバックグラウンド非同期 Queue に投入します。
   *
   * @param {File} file
   */
  function enqueueBackgroundJob(file) {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`
    const jobItem = {
      id: jobId,
      file: file,
      status: 'pending',
      progress: '待機中...',
    }

    backgroundQueue.push(jobItem)
    queueSection.classList.remove('hidden')
    renderQueueList()
    triggerQueueWorkers()
  }

  /**
   * バックグラウンド Queue ワーカーを動的に起動し最大並行数でトリガーします。
   */
  function triggerQueueWorkers() {
    while (activeQueueWorkers < MAX_CONCURRENT_WORKERS) {
      const pendingJob = backgroundQueue.find((j) => j.status === 'pending')
      if (!pendingJob) break

      activeQueueWorkers++
      pendingJob.status = 'processing'
      pendingJob.progress = 'Gemini AI 解析中...'
      renderQueueList()

      processSingleJob(pendingJob).finally(() => {
        activeQueueWorkers--
        triggerQueueWorkers()
      })
    }
  }

  /**
   * 1つのジョブを非同期で完全実行（Gemini ➔ Canvas Crop ➔ PDF生成 ➔ Google Drive 保存）します。
   *
   * @param {object} job
   */
  async function processSingleJob(job) {
    try {
      // 1. Base64 変換
      const imageBase64 = await fileToBase64(job.file)

      // 2. /api/analyze 呼び出し
      const analyzeRes = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: imageBase64.split(',')[1],
          mimeType: job.file.type || 'image/jpeg',
        }),
      })

      if (!analyzeRes.ok) throw new Error(`Analyze API Error (${analyzeRes.status})`)
      const analyzeData = await analyzeRes.json()

      job.progress = 'クロップ & PDF 生成中...'
      renderQueueList()

      // 3. クロップ Canvas 処理
      const img = await loadImage(imageBase64)
      const cropArea = calculateCropArea(analyzeData.box2d, img.width, img.height)

      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = cropArea.width
      tempCanvas.height = cropArea.height
      const ctx = tempCanvas.getContext('2d')
      ctx.drawImage(img, cropArea.x, cropArea.y, cropArea.width, cropArea.height, 0, 0, cropArea.width, cropArea.height)

      const croppedJpgBlob = dataURItoBlob(tempCanvas.toDataURL('image/jpeg', 0.9))

      // 4. Client-side PDF 生成
      const pdfBlob = await generatePdfFromImageBlob(croppedJpgBlob, cropArea.width, cropArea.height)

      job.progress = 'Drive に保存中...'
      renderQueueList()

      // 5. タインプスタンプ付きファイル名で Google Drive 保存
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

      const formData = new FormData()
      formData.append('title', fileTitle)
      formData.append('jpg', job.file, `${fileTitle}.jpg`)
      formData.append('markdown', analyzeData.markdown)
      formData.append('pdf', pdfBlob, `${fileTitle}.pdf`)
      formData.append('userAccessToken', userAccessToken)

      const saveRes = await fetch('/api/save', {
        method: 'POST',
        body: formData,
      })

      if (!saveRes.ok) throw new Error(`Save API Error (${saveRes.status})`)

      job.status = 'completed'
      job.title = fileTitle
      job.progress = '保存完了 ✅'
    } catch (err) {
      job.status = 'error'
      job.error = err.message || String(err)
      job.progress = '保存失敗 ❌'
    } finally {
      renderQueueList()
    }
  }

  /**
   * Queue モニター UI をリアルタイムレンダリングします。
   */
  function renderQueueList() {
    if (!queueItemsContainer || !queueCountText) return

    const total = backgroundQueue.length
    const completed = backgroundQueue.filter((j) => j.status === 'completed').length
    queueCountText.textContent = `${completed}/${total}`

    queueItemsContainer.innerHTML = ''

    backgroundQueue.slice().reverse().forEach((job) => {
      const itemEl = document.createElement('div')
      itemEl.className = 'queue-item'

      const statusClass =
        job.status === 'pending'
          ? 'status-pending'
          : job.status === 'processing'
          ? 'status-processing'
          : job.status === 'completed'
          ? 'status-completed'
          : 'status-error'

      const titleText = job.title || job.file.name || 'スキャン画像'

      itemEl.innerHTML = `
        <div class="queue-item-info">
          <span>📄</span>
          <span class="queue-item-title">${escapeHtml(titleText)}</span>
        </div>
        <span class="queue-item-status ${statusClass}">${escapeHtml(job.progress)}</span>
      `
      queueItemsContainer.appendChild(itemEl)
    })
  }

  if (clearQueueBtn) {
    clearQueueBtn.addEventListener('click', () => {
      // 処理中以外のジョブをクリア
      for (let i = backgroundQueue.length - 1; i >= 0; i--) {
        if (backgroundQueue[i].status !== 'processing') {
          backgroundQueue.splice(i, 1)
        }
      }
      renderQueueList()
    })
  }

  // -------------------------------------------------------------
  // ボタンイベントハンドラ類
  // -------------------------------------------------------------

  if (googleLoginBtn) {
    googleLoginBtn.addEventListener('click', () => {
      const redirectUri = window.location.origin
      const scope = encodeURIComponent('https://www.googleapis.com/auth/drive.file')
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&response_type=token&scope=${scope}&include_granted_scopes=true`

      window.location.href = authUrl
    })
  }

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

  // カメラ撮影・スキャンイベント（Single または Continuous）
  if (cameraInput) {
    cameraInput.addEventListener('change', async (e) => {
      const file = e.target.files?.[0]
      if (!file) return

      if (!userAccessToken) {
        showError('Google アカウントのアクセストークンが設定されていません。最初にログイン認証を行ってください。')
        return
      }

      if (currentScanMode === 'continuous') {
        // 連続スキャンモード: 画面をブロックせず直ちに非同期 Queue に投入
        enqueueBackgroundJob(file)
        cameraInput.value = '' // 直ちに次の撮影が可能な状態にクリア
        return
      }

      // シングルモード: 現状通り 1枚ごとにプログレス表示 ＆ 確認
      try {
        showView('processing')
        updateProgress(20, 'Gemini AI で解析中...', '文字起こし・Markdown化・トリミング位置を検出しています。')

        const imageBase64 = await fileToBase64(file)

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

        const img = await loadImage(imageBase64)
        const cropArea = calculateCropArea(analyzeData.box2d, img.width, img.height)

        cropCanvas.width = cropArea.width
        cropCanvas.height = cropArea.height
        const ctx = cropCanvas.getContext('2d')
        ctx.drawImage(img, cropArea.x, cropArea.y, cropArea.width, cropArea.height, 0, 0, cropArea.width, cropArea.height)

        const croppedJpgDataUrl = cropCanvas.toDataURL('image/jpeg', 0.9)
        const croppedJpgBlob = dataURItoBlob(croppedJpgDataUrl)

        const pdfBlob = await generatePdfFromImageBlob(croppedJpgBlob, cropArea.width, cropArea.height)

        updateProgress(85, 'ご自身の Google Drive に保存中...', '原本JPG, Markdown, PDFを自動保存しています。')

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

        if (mdPreview) mdPreview.textContent = analyzeData.markdown
        if (resultTitle) resultTitle.textContent = analyzeData.title
        showView('result')
      } catch (err) {
        showError(err.message || String(err))
      }
    })
  }

  // ユーティリティ関数
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

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }

  // 初期化時に認証状態をチェック
  checkAuthStatus()
})
