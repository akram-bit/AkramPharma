/* ================================================================
   صيدليتي — scanner.js  (v3)
   BarcodeScanner Module — مرتبط بـ DataService
   Primary:  Native BarcodeDetector API
   Fallback: ZXing-js
================================================================ */

'use strict';

const BarcodeScanner = (() => {

  /* ─── private state ─ */
  let _stream = null, _detector = null, _animFrame = null;
  let _scanning = false, _lastCode = null, _lastCodeTime = 0, _scanCount = 0;
  let _torchTrack = null, _torchActive = false;
  let _options = {}, _manualOpen = false;
  let _zxingReader = null, _useZxing = false;

  const DEBOUNCE_MS   = 2000;
  const ACCEPTED_FMTS = ['ean_13','ean_8','code_128','upc_a','upc_e','qr_code'];
  const VIDEO_CONSTRAINTS = {
    video: {
      facingMode: { ideal: 'environment' },
      width:  { ideal: 1280, min: 640 },
      height: { ideal: 720,  min: 480 },
    }
  };

  let $overlay, $video, $canvas, $frame, $scanLine, $loading,
      $errorState, $errorMsg, $hint, $lastScan, $countBadge,
      $torchBtn, $flashEl, $manualOverlay, $manualInput, $ctx;

  /* ─── Build DOM ─ */
  function _buildDOM() {
    if (document.getElementById('scanner-overlay')) return;
    const el = document.createElement('div');
    el.innerHTML = `
    <div class="scanner-overlay" id="scanner-overlay">
      <div class="scanner-header">
        <div class="scanner-title-block">
          <div class="scanner-title" id="scanner-title">ماسح الباركود</div>
          <div class="scanner-subtitle" id="scanner-subtitle">EAN-13 · Code-128 · UPC</div>
        </div>
        <button class="scanner-close-btn" id="scanner-close-btn"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="scanner-viewport">
        <video id="scanner-video" playsinline muted autoplay></video>
        <canvas id="scanner-canvas"></canvas>
        <div class="scanner-mask"><div class="scanner-cutout" id="scanner-cutout"></div></div>
        <div class="scanner-frame" id="scanner-frame">
          <div class="scanner-corner-bl"></div>
          <div class="scanner-corner-br"></div>
        </div>
        <div class="scan-line" id="scan-line"></div>
        <div class="scan-success-flash" id="scan-flash"></div>
        <div class="scanner-loading" id="scanner-loading">
          <div class="spin-ring"></div>
          <p>جاري تشغيل الكاميرا...</p>
        </div>
        <div class="scanner-error" id="scanner-error">
          <div class="scanner-error-icon"><i class="fa-solid fa-video-slash"></i></div>
          <h3>تعذّر فتح الكاميرا</h3>
          <p id="scanner-error-msg">تأكد من السماح بالوصول إلى الكاميرا.</p>
          <button class="scanner-retry-btn" id="scanner-retry-btn">
            <i class="fa-solid fa-rotate-right"></i><span>إعادة المحاولة</span>
          </button>
        </div>
      </div>
      <div class="scanner-status-area">
        <div class="scanner-hint" id="scanner-hint">وجّه الكاميرا نحو الباركود</div>
        <div class="scanner-last-scan" id="scanner-last-scan"></div>
        <div class="scanner-count-badge" id="scanner-count-badge"></div>
      </div>
      <div class="scanner-controls">
        <div class="scanner-controls-row">
          <button class="scanner-ctrl-btn" id="scanner-torch-btn">
            <i class="fa-solid fa-bolt"></i><span>فلاش</span>
          </button>
          <button class="scanner-manual-btn" id="scanner-manual-btn">
            <i class="fa-solid fa-keyboard"></i><span>إدخال يدوي</span>
          </button>
        </div>
      </div>
      <div class="scanner-manual-overlay" id="scanner-manual-overlay">
        <div class="scanner-manual-sheet">
          <div class="modal-handle"></div>
          <h4>أدخل رقم الباركود يدوياً</h4>
          <div class="scanner-manual-input-wrap">
            <input type="text" id="scanner-manual-input" inputmode="numeric"
              placeholder="مثال: 6912345678901" autocomplete="off">
            <button class="scanner-manual-confirm" id="scanner-manual-confirm">
              <i class="fa-solid fa-check"></i> تأكيد
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="not-found-sheet" id="nf-sheet">
      <div class="nf-icon"><i class="fa-solid fa-barcode"></i></div>
      <div class="nf-title">الباركود غير موجود في المخزن</div>
      <div class="nf-code" id="nf-code"></div>
      <div class="nf-actions">
        <button class="btn-outline" onclick="BarcodeScanner.closeNotFound()">
          <i class="fa-solid fa-xmark"></i> إغلاق
        </button>
        <button class="btn-primary" style="flex:1" onclick="BarcodeScanner.addNewDrug()">
          <i class="fa-solid fa-plus"></i> إضافة دواء جديد
        </button>
      </div>
    </div>`;
    document.body.appendChild(el);
    _cacheDOM();
    _bindEvents();
  }

  function _cacheDOM() {
    $overlay       = document.getElementById('scanner-overlay');
    $video         = document.getElementById('scanner-video');
    $canvas        = document.getElementById('scanner-canvas');
    $frame         = document.getElementById('scanner-frame');
    $scanLine      = document.getElementById('scan-line');
    $loading       = document.getElementById('scanner-loading');
    $errorState    = document.getElementById('scanner-error');
    $errorMsg      = document.getElementById('scanner-error-msg');
    $hint          = document.getElementById('scanner-hint');
    $lastScan      = document.getElementById('scanner-last-scan');
    $countBadge    = document.getElementById('scanner-count-badge');
    $torchBtn      = document.getElementById('scanner-torch-btn');
    $flashEl       = document.getElementById('scan-flash');
    $manualOverlay = document.getElementById('scanner-manual-overlay');
    $manualInput   = document.getElementById('scanner-manual-input');
    $ctx           = $canvas.getContext('2d', { willReadFrequently: true });
  }

  function _bindEvents() {
    document.getElementById('scanner-close-btn').addEventListener('click', close);
    document.getElementById('scanner-retry-btn').addEventListener('click', _retryCamera);
    $torchBtn.addEventListener('click', toggleTorch);
    document.getElementById('scanner-manual-btn').addEventListener('click', () => {
      _manualOpen = true;
      $manualOverlay.classList.add('open');
      setTimeout(() => $manualInput.focus(), 300);
    });
    document.getElementById('scanner-manual-confirm').addEventListener('click', _confirmManual);
    $manualInput.addEventListener('keydown', e => { if (e.key === 'Enter') _confirmManual(); });
    $manualOverlay.addEventListener('click', e => {
      if (e.target === $manualOverlay) { $manualOverlay.classList.remove('open'); _manualOpen = false; }
    });
    document.addEventListener('keydown', e => {
      if (e.key !== 'Escape') return;
      if (_manualOpen) { $manualOverlay.classList.remove('open'); _manualOpen = false; }
      else if ($overlay && $overlay.classList.contains('open')) close();
    });
  }

  /* ─── Open ─ */
  async function open(options) {
    options = options || {};
    _buildDOM();
    _options = {
      mode:       options.mode       || 'single',
      onDetected: options.onDetected || null,
      onClose:    options.onClose    || null,
      title:      options.title      || 'ماسح الباركود',
      hint:       options.hint       || 'وجّه الكاميرا نحو الباركود',
      vibration:  options.vibration  !== false,
      sound:      options.sound      !== false,
    };
    _lastCode = null; _lastCodeTime = 0; _scanCount = 0; _torchActive = false;
    $errorState.classList.remove('visible');
    document.getElementById('scanner-title').textContent    = _options.title;
    document.getElementById('scanner-subtitle').textContent =
      _options.mode === 'continuous' ? 'وضع المسح المتكرر' : 'EAN-13 · Code-128 · UPC';
    $hint.textContent = _options.hint;
    $lastScan.classList.remove('visible');
    $countBadge.classList.remove('visible');
    $overlay.classList.add('open');
    $scanLine.classList.add('paused');

    // تحقق من حالة إذن الكاميرا قبل الفتح
    await _checkPermissionThenStart();
  }

  /* ─── Permission check ─ */
  async function _checkPermissionThenStart() {
    // إذا الـ API مش متاحة (HTTP أو متصفح قديم) اذهب مباشرة للكاميرا
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      $loading.style.display = 'none';
      _showError({ name: 'NotFoundError' });
      return;
    }

    // تحقق من الإذن الحالي إذا كان Permissions API متاحاً
    try {
      const perm = await navigator.permissions.query({ name: 'camera' });
      if (perm.state === 'denied') {
        // مرفوض مسبقاً — أظهر شاشة التعليمات بدون طلب
        $loading.style.display = 'none';
        _showPermissionDenied();
        return;
      }
      if (perm.state === 'prompt') {
        // لم يُسأل بعد — أظهر شاشة طلب الإذن أولاً
        $loading.style.display = 'none';
        _showPermissionPrompt();
        return;
      }
      // granted — تابع مباشرة
      $loading.style.display = 'flex';
      await _startCamera();
    } catch (_) {
      // Permissions API غير مدعومة — اذهب مباشرة وسيُسأل تلقائياً
      $loading.style.display = 'flex';
      await _startCamera();
    }
  }

  /* ─── شاشة طلب الإذن (أول مرة) ─ */
  function _showPermissionPrompt() {
    if (!$errorState || !$errorMsg) return;
    $errorState.innerHTML = `
      <div class="scanner-perm-icon">
        <i class="fa-solid fa-camera"></i>
      </div>
      <h3>نحتاج إذن الكاميرا</h3>
      <p>لمسح الباركود، يحتاج التطبيق إلى الوصول لكاميرا جهازك.<br>اضغط الزر أدناه وأجب بـ <strong>«سماح»</strong> عند الطلب.</p>
      <button class="scanner-retry-btn" id="scanner-allow-btn">
        <i class="fa-solid fa-camera"></i>
        <span>السماح بالكاميرا</span>
      </button>
      <button class="scanner-manual-btn" style="margin-top:10px" id="scanner-manual-fallback-btn">
        <i class="fa-solid fa-keyboard"></i>
        <span>إدخال الباركود يدوياً</span>
      </button>
    `;
    $errorState.classList.add('visible');

    document.getElementById('scanner-allow-btn').addEventListener('click', async () => {
      $errorState.classList.remove('visible');
      $loading.style.display = 'flex';
      await _startCamera(); // هنا سيظهر popup الإذن من المتصفح
    });

    document.getElementById('scanner-manual-fallback-btn').addEventListener('click', () => {
      $errorState.classList.remove('visible');
      _manualOpen = true;
      $manualOverlay.classList.add('open');
      setTimeout(() => $manualInput.focus(), 300);
    });
  }

  /* ─── شاشة الإذن المرفوض (blocked) ─ */
  function _showPermissionDenied() {
    if (!$errorState) return;

    // اكتشف نوع المتصفح لتعليمات مناسبة
    const ua = navigator.userAgent;
    const isChrome  = /Chrome/.test(ua) && !/Edg/.test(ua);
    const isFirefox = /Firefox/.test(ua);
    const isSafari  = /Safari/.test(ua) && !/Chrome/.test(ua);
    const isAndroid = /Android/.test(ua);
    const isIOS     = /iPhone|iPad/.test(ua);

    let steps = '';
    if (isAndroid && isChrome) {
      steps = `<ol class="scanner-perm-steps">
        <li>اضغط على أيقونة القفل <i class="fa-solid fa-lock"></i> في شريط العنوان</li>
        <li>اضغط على <strong>«الأذونات»</strong></li>
        <li>فعّل <strong>«الكاميرا»</strong></li>
        <li>أعد تحميل الصفحة</li>
      </ol>`;
    } else if (isIOS && isSafari) {
      steps = `<ol class="scanner-perm-steps">
        <li>افتح <strong>الإعدادات</strong> على الآيفون</li>
        <li>انتقل إلى <strong>Safari ← الكاميرا</strong></li>
        <li>اختر <strong>«سماح»</strong></li>
        <li>ارجع وأعد فتح الصفحة</li>
      </ol>`;
    } else if (isFirefox) {
      steps = `<ol class="scanner-perm-steps">
        <li>اضغط على أيقونة الكاميرا <i class="fa-solid fa-video-slash"></i> في شريط العنوان</li>
        <li>اختر <strong>«سماح»</strong> من القائمة</li>
        <li>أعد تحميل الصفحة</li>
      </ol>`;
    } else {
      steps = `<ol class="scanner-perm-steps">
        <li>ابحث عن أيقونة <i class="fa-solid fa-video-slash"></i> أو <i class="fa-solid fa-lock"></i> في شريط العنوان</li>
        <li>اضغط عليها وأعطِ إذن الكاميرا</li>
        <li>أعد تحميل الصفحة</li>
      </ol>`;
    }

    $errorState.innerHTML = `
      <div class="scanner-perm-icon denied">
        <i class="fa-solid fa-video-slash"></i>
      </div>
      <h3>إذن الكاميرا محظور</h3>
      <p>قام المتصفح بحظر الوصول للكاميرا. لتفعيله:</p>
      ${steps}
      <button class="scanner-retry-btn" id="scanner-retry-after-perm">
        <i class="fa-solid fa-rotate-right"></i>
        <span>حاول مجدداً بعد السماح</span>
      </button>
      <button class="scanner-manual-btn" style="margin-top:10px" id="scanner-manual-denied-btn">
        <i class="fa-solid fa-keyboard"></i>
        <span>إدخال الباركود يدوياً</span>
      </button>
    `;
    $errorState.classList.add('visible');

    document.getElementById('scanner-retry-after-perm').addEventListener('click', () => {
      $errorState.classList.remove('visible');
      $loading.style.display = 'flex';
      setTimeout(_startCamera, 300);
    });

    document.getElementById('scanner-manual-denied-btn').addEventListener('click', () => {
      $errorState.classList.remove('visible');
      _manualOpen = true;
      $manualOverlay.classList.add('open');
      setTimeout(() => $manualInput.focus(), 300);
    });
  }

  /* ─── Camera ─ */
  async function _startCamera() {
    try {
      _stopStream();
      _stream = await navigator.mediaDevices.getUserMedia(VIDEO_CONSTRAINTS);
      $video.srcObject = _stream;
      await new Promise(res => { $video.onloadedmetadata = () => $video.play().then(res).catch(res); });
      $canvas.width  = $video.videoWidth  || 1280;
      $canvas.height = $video.videoHeight || 720;
      await _initDetector();
      $loading.style.display = 'none';
      $scanLine.classList.remove('paused');
      _scanning = true;
      _scanLoop();
      _torchTrack = _stream.getVideoTracks()[0];
      const caps = _torchTrack?.getCapabilities?.() || {};
      $torchBtn.style.opacity       = caps.torch ? '1' : '0.35';
      $torchBtn.style.pointerEvents = caps.torch ? 'auto' : 'none';
    } catch (err) {
      $loading.style.display = 'none';
      // إذا رُفض الإذن أثناء الطلب (المستخدم ضغط رفض)
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        _showPermissionDenied();
      } else {
        _showError(err);
      }
    }
  }

  async function _initDetector() {
    if ('BarcodeDetector' in window) {
      try {
        const supported = await BarcodeDetector.getSupportedFormats?.() || ACCEPTED_FMTS;
        const fmts = ACCEPTED_FMTS.filter(f => supported.includes(f));
        _detector = new BarcodeDetector({ formats: fmts.length ? fmts : ACCEPTED_FMTS });
        _useZxing = false;
        return;
      } catch (_) {}
    }
    _useZxing = true;
    if (!_zxingReader) await _loadZxing();
  }

  async function _loadZxing() {
    return new Promise(resolve => {
      if (window.ZXing) { _setupZxing(); resolve(); return; }
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/@zxing/library@0.21.3/umd/index.min.js';
      s.onload  = () => { _setupZxing(); resolve(); };
      s.onerror = () => { _zxingReader = null; resolve(); };
      document.head.appendChild(s);
    });
  }

  function _setupZxing() {
    if (!window.ZXing || _zxingReader) return;
    const hints = new Map();
    hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [
      ZXing.BarcodeFormat.EAN_13, ZXing.BarcodeFormat.EAN_8,
      ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.UPC_A, ZXing.BarcodeFormat.UPC_E,
    ]);
    hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
    _zxingReader = new ZXing.MultiFormatReader();
    _zxingReader.setHints(hints);
  }

  /* ─── Scan loop ─ */
  function _scanLoop() {
    if (!_scanning) return;
    _animFrame = requestAnimationFrame(async () => {
      if (!_scanning) return;
      try { await _decode(); } catch (_) {}
      if (_scanning) _scanLoop();
    });
  }

  async function _decode() {
    if ($video.readyState < $video.HAVE_ENOUGH_DATA) return;
    let code = null;
    if (!_useZxing && _detector) {
      const barcodes = await _detector.detect($video);
      if (barcodes && barcodes.length > 0) code = barcodes[0].rawValue;
    } else if (_zxingReader) {
      $ctx.drawImage($video, 0, 0, $canvas.width, $canvas.height);
      try {
        const imgData  = $ctx.getImageData(0, 0, $canvas.width, $canvas.height);
        const lum      = new ZXing.RGBLuminanceSource(imgData.data, $canvas.width, $canvas.height);
        const binary   = new ZXing.HybridBinarizer(lum);
        const result   = _zxingReader.decode(new ZXing.BinaryBitmap(binary));
        if (result) code = result.getText();
      } catch (_) {}
    }
    if (code) _onCodeDetected(code);
  }

  /* ─── Detected ─ */
  function _onCodeDetected(code) {
    const now = Date.now();
    if (code === _lastCode && (now - _lastCodeTime) < DEBOUNCE_MS) return;
    _lastCode = code; _lastCodeTime = now; _scanCount++;
    _flashSuccess();
    if (_options.vibration && navigator.vibrate) navigator.vibrate([60]);
    if (_options.sound) _beep();
    $frame.classList.add('success');
    setTimeout(() => $frame.classList.remove('success'), 800);
    $lastScan.textContent = '✓ ' + code;
    $lastScan.classList.add('visible');
    if (_options.mode === 'continuous') {
      $countBadge.textContent = _scanCount + ' مسح';
      $countBadge.classList.add('visible');
      $scanLine.classList.add('paused');
      setTimeout(() => $scanLine.classList.remove('paused'), 700);
    }
    if (_options.onDetected) _options.onDetected(code, _scanCount);
    if (_options.mode === 'single') setTimeout(close, 500);
  }

  function _flashSuccess() {
    if (!$flashEl) return;
    $flashEl.classList.remove('flash');
    $flashEl.offsetWidth;
    $flashEl.classList.add('flash');
  }

  let _audioCtx = null;
  function _beep() {
    try {
      _audioCtx = _audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      const osc = _audioCtx.createOscillator();
      const gain= _audioCtx.createGain();
      osc.connect(gain); gain.connect(_audioCtx.destination);
      osc.frequency.value = 1800; osc.type = 'sine';
      gain.gain.setValueAtTime(0.3, _audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.15);
      osc.start(_audioCtx.currentTime); osc.stop(_audioCtx.currentTime + 0.15);
    } catch (_) {}
  }

  async function toggleTorch() {
    if (!_torchTrack) return;
    try {
      _torchActive = !_torchActive;
      await _torchTrack.applyConstraints({ advanced: [{ torch: _torchActive }] });
      $torchBtn.classList.toggle('active-torch', _torchActive);
    } catch (_) {
      showToast('الفلاش غير مدعوم على هذا الجهاز');
      _torchActive = false;
    }
  }

  function _confirmManual() {
    const val = ($manualInput.value || '').trim();
    if (!val) return;
    $manualOverlay.classList.remove('open');
    _manualOpen = false;
    $manualInput.value = '';
    _onCodeDetected(val);
  }

  function _showError(err) {
    if (!$errorState) return;
    let msg = 'حدث خطأ غير متوقع أثناء تشغيل الكاميرا.';
    if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      msg = 'لا توجد كاميرا على هذا الجهاز. استخدم الإدخال اليدوي.';
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      msg = 'الكاميرا مستخدمة من تطبيق آخر. أغلقه وحاول مجدداً.';
    } else if (err.name === 'OverconstrainedError') {
      msg = 'لا تدعم الكاميرا الجودة المطلوبة. جاري إعادة المحاولة...';
      // fallback: try without constraints
      setTimeout(() => _startCameraBasic(), 600);
      return;
    } else if (err.name === 'SecurityError') {
      msg = 'الكاميرا محظورة بسبب سياسة الأمان. تأكد من استخدام HTTPS.';
    }
    $errorState.innerHTML = `
      <div class="scanner-error-icon"><i class="fa-solid fa-video-slash"></i></div>
      <h3>تعذّر فتح الكاميرا</h3>
      <p id="scanner-error-msg">${msg}</p>
      <button class="scanner-retry-btn" id="scanner-retry-btn">
        <i class="fa-solid fa-rotate-right"></i><span>إعادة المحاولة</span>
      </button>
      <button class="scanner-manual-btn" style="margin-top:10px" id="scanner-manual-err-btn">
        <i class="fa-solid fa-keyboard"></i><span>إدخال يدوي</span>
      </button>
    `;
    $errorState.classList.add('visible');
    document.getElementById('scanner-retry-btn').addEventListener('click', _retryCamera);
    document.getElementById('scanner-manual-err-btn').addEventListener('click', () => {
      $errorState.classList.remove('visible');
      _manualOpen = true;
      $manualOverlay.classList.add('open');
      setTimeout(() => $manualInput.focus(), 300);
    });
  }

  async function _startCameraBasic() {
    try {
      _stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      $video.srcObject = _stream;
      await new Promise(res => { $video.onloadedmetadata = () => $video.play().then(res).catch(res); });
      $canvas.width  = $video.videoWidth  || 640;
      $canvas.height = $video.videoHeight || 480;
      await _initDetector();
      $errorState.classList.remove('visible');
      $loading.style.display = 'none';
      $scanLine.classList.remove('paused');
      _scanning = true;
      _scanLoop();
    } catch (err2) {
      _showError(err2);
    }
  }

  function _retryCamera() {
    $errorState.classList.remove('visible');
    $loading.style.display = 'flex';
    setTimeout(_checkPermissionThenStart, 300);
  }

  function _stopStream() {
    if (_animFrame) { cancelAnimationFrame(_animFrame); _animFrame = null; }
    _scanning = false;
    if (_torchActive && _torchTrack) {
      _torchTrack.applyConstraints({ advanced: [{ torch: false }] }).catch(() => {});
      _torchActive = false;
    }
    if (_stream) { _stream.getTracks().forEach(t => t.stop()); _stream = null; }
    if ($video) $video.srcObject = null;
  }

  function close() {
    _stopStream();
    if ($overlay)       $overlay.classList.remove('open');
    if ($manualOverlay) { $manualOverlay.classList.remove('open'); _manualOpen = false; }
    if (_options.onClose) _options.onClose(_scanCount);
  }

  /* ─── Not-found sheet ─ */
  let _lastNotFoundCode = null;
  function _showNotFound(code) {
    _lastNotFoundCode = code;
    const sheet = document.getElementById('nf-sheet');
    const codeEl= document.getElementById('nf-code');
    if (codeEl)   codeEl.textContent = code;
    if (sheet) {
      sheet.classList.add('open');
      setTimeout(() => sheet.classList.remove('open'), 6000);
    }
  }

  function closeNotFound() {
    const sheet = document.getElementById('nf-sheet');
    if (sheet) sheet.classList.remove('open');
  }

  function addNewDrug() {
    closeNotFound();
    close();
    // Pass the unrecognised barcode to the add-drug form
    if (_lastNotFoundCode) AppState.setPendingBarcode(_lastNotFoundCode);
    navigate('screen-add-drug');
    showToast('أدخل بيانات الدواء الجديد — الباركود مُعبَّأ تلقائياً');
  }

  /* ══════════════════════════════════════════════════════════════
     PUBLIC OPENERS — كل شاشة لها opener مخصص
  ════════════════════════════════════════════════════════════════ */

  /** شاشة إضافة / تعديل دواء — Single mode */
  function openForDrugForm(inputEl) {
    open({
      mode: 'single',
      title: 'مسح باركود الدواء',
      hint:  'وجّه الكاميرا نحو باركود العلبة',
      onDetected: async (code) => {
        // Fill the barcode input
        if (inputEl) {
          inputEl.value = code;
          inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        }
        // Check for duplicate immediately
        const isDup = await DataService.isDuplicateBarcode(code, AddDrugUI._editId);
        if (isDup) {
          const existing = (await DataService.findByBarcode(code));
          showToast(
            existing ? ('⚠️ موجود مسبقاً: ' + existing.name) : '⚠️ هذا الباركود مكرر',
            'warn'
          );
          if (existing) AddDrugUI._showDuplicateWarning(code);
        } else {
          showToast('✓ تمت قراءة الباركود: ' + code, 'success');
        }
      },
    });
  }

  /** شاشة المخزن — Single mode + فلترة فورية */
  function openForInventorySearch(inputEl) {
    open({
      mode: 'single',
      title: 'البحث بالباركود',
      hint:  'وجّه الكاميرا لمسح الدواء',
      onDetected: async (code) => {
        // Fill search input
        if (inputEl) inputEl.value = code;
        // Run real search
        AppState.inventory.searchQuery = code;
        await InventoryUI.apply();
        const results = AppState.inventory.filtered;
        if (results.length > 0) {
          showToast('✓ ' + results[0].name + (results.length > 1 ? ' (+' + (results.length-1) + ')' : ''), 'success');
        } else {
          // اقتراح إضافة دواء جديد بدلاً من toast فقط
          _showNotFound(code);
        }
      },
    });
  }

  /** شاشة الفواتير — Continuous mode */
  function openForSales() {
    open({
      mode: 'continuous',
      title: 'إضافة بالباركود',
      hint:  'امسح الدواء لإضافته فوراً للفاتورة',
      onDetected: async (code, count) => {
        const drug = await DataService.findByBarcode(code);
        if (drug) {
          CartService.addDrug(drug);
          // Update scanner UI with drug name
          $lastScan.textContent = '✓ تمت إضافة: ' + drug.name;
          $lastScan.classList.add('visible');
          $countBadge.textContent = count + ' صنف مضاف';
          $countBadge.classList.add('visible');
        } else {
          // Error vibration pattern
          if (navigator.vibrate) navigator.vibrate([40, 60, 40]);
          $lastScan.textContent = '✗ غير موجود: ' + code;
          $lastScan.classList.add('visible');
          _showNotFound(code);
        }
      },
      onClose: (count) => {
        if (count > 0) showToast('تم إغلاق الماسح — ' + count + ' صنف مضاف', 'success');
      },
    });
  }

  /* ─── Public API ─ */
  return {
    open, close, toggleTorch,
    closeNotFound, addNewDrug,
    openForDrugForm, openForInventorySearch, openForSales,
    // expose for external use
    lookupDrug: (barcode) => DataService.findByBarcode(barcode),
  };

})();
