// SabbPe Onboarding Widget v5
// Deploy to: public/onboarding-widget.js in onboarding frontend repo
// Load via: <script src="/onboarding-widget.js"></script> in public/index.html

const WIDGET_CONFIG = {
  currentStep: 'welcome',
  jwt: '',
  merchantName: '',
  gatewayUrl: `${window.location.origin}/api/chat`,
  sttUrl: `${window.location.origin}/api/stt`,
  model: 'gemini-flash-latest',
};

const STEPS = {
  'welcome':           { label: 'Welcome',                  emoji: ' ' },
  'entity-type':       { label: 'Step 2 - Entity Type',     emoji: ' ' },
  'products':          { label: 'Step 3 - Products',        emoji: ' ' },
  'business-details':  { label: 'Step 4 - Business Details',emoji: ' ' },
  'person-kyc':        { label: 'Step 5 - KYC',             emoji: ' ' },
  'entity-documents':  { label: 'Step 6 - Documents',       emoji: ' ' },
  'doing-business':    { label: 'Step 7 - Address Proof',   emoji: ' ' },
  'bank-details':      { label: 'Step 8 - Bank Details',    emoji: ' ' },
  'kyc':               { label: 'Step 9 - Video KYC',       emoji: ' ' },
  'review':            { label: 'Step 10 - Review',         emoji: 'ok' },
  'agreement_pending': { label: 'Agreement Signing',        emoji: '  ' },
  'agreement_signed':  { label: 'Submitted!',               emoji: ' ' },
};

const STEP_PROMPTS = {
  'welcome':           'First greeting only. Say hello as Sahil, mention you can guide them through SabbPe onboarding, and ask how you can help. Do not list instructions yet.',
  'entity-type':       'First greeting only. Say they are on entity type selection and ask if they need help choosing the right business type. Do not explain all entity types yet.',
  'products':          'First greeting only. Say they are on products selection and ask what kind of payments they want to accept. Do not list products yet.',
  'business-details':  'First greeting only. Say they are on business details and ask what field they need help with. Do not list every field yet.',
  'person-kyc':        'First greeting only. Say they are on KYC and ask if they need help with PAN or Aadhaar. Do not explain the full process yet.',
  'entity-documents':  'First greeting only. Say they are on document upload and ask which business type they selected. Do not list documents until they answer.',
  'doing-business':    'First greeting only. Say they are on address proof and ask if their operating address is different from registered address.',
  'bank-details':      'First greeting only. Say they are on bank details and ask if they need help with account number, IFSC, or verification.',
  'kyc':               'First greeting only. Say they are on video KYC and ask if they want quick tips before recording.',
  'review':            'First greeting only. Say they are on review and ask which section they want to check before submitting.',
  'agreement_pending': 'First greeting only. Say they are at agreement signing and ask if they want help understanding anything before signing.',
  'agreement_signed':  'First greeting only. Congratulate them briefly and ask if they have any final questions.',
};

const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&display=swap');

  #sb-fab {
    position: fixed; bottom: 24px; right: 24px;
    width: 58px; height: 58px; border-radius: 50%;
    background: linear-gradient(135deg, #1557C4, #2176FF);
    color: white; border: none; font-size: 22px;
    cursor: pointer; z-index: 9998;
    box-shadow: 0 4px 20px rgba(21,87,196,0.4);
    transition: transform 0.2s, box-shadow 0.2s;
    display: flex; align-items: center; justify-content: center;
  }
  #sb-fab:hover { transform: scale(1.1); box-shadow: 0 6px 28px rgba(21,87,196,0.5); }
  #sb-fab .sb-badge {
    position: absolute; top: -3px; right: -3px;
    width: 16px; height: 16px; border-radius: 50%;
    background: #FF4757; border: 2px solid white;
    display: none;
  }
  #sb-fab .sb-badge.show { display: block; }

  #sb-panel {
    position: fixed; bottom: 96px; right: 24px;
    width: 360px; height: 530px;
    background: #fff; border-radius: 20px;
    box-shadow: 0 12px 48px rgba(0,0,0,0.15), 0 2px 8px rgba(0,0,0,0.08);
    display: flex; flex-direction: column;
    z-index: 9999; overflow: hidden;
    font-family: 'DM Sans', sans-serif;
    transform: scale(0.92) translateY(16px);
    opacity: 0; pointer-events: none;
    transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease;
  }
  #sb-panel.open {
    transform: scale(1) translateY(0);
    opacity: 1; pointer-events: all;
  }

  #sb-header {
    background: linear-gradient(135deg, #1557C4 0%, #2176FF 100%);
    padding: 14px 16px; display: flex; align-items: center; gap: 10px;
  }
  .sb-avatar {
    width: 36px; height: 36px; border-radius: 50%;
    background: rgba(255,255,255,0.2);
    display: flex; align-items: center; justify-content: center;
    font-size: 18px; flex-shrink: 0;
  }
  .sb-header-text { flex: 1; }
  .sb-header-name { color: white; font-weight: 600; font-size: 14px; line-height: 1.2; }
  .sb-header-sub { color: rgba(255,255,255,0.75); font-size: 11px; }
  .sb-close-btn {
    background: rgba(255,255,255,0.15); border: none; color: white;
    width: 28px; height: 28px; border-radius: 50%;
    font-size: 14px; cursor: pointer; display: flex;
    align-items: center; justify-content: center;
    transition: background 0.15s;
  }
  .sb-close-btn:hover { background: rgba(255,255,255,0.25); }

  #sb-step-bar {
    background: #EBF0FB; padding: 7px 16px;
    font-size: 11.5px; color: #1557C4; font-weight: 600;
    letter-spacing: 0.02em; display: flex; align-items: center; gap: 6px;
  }

  #sb-messages {
    flex: 1; overflow-y: auto; padding: 14px 12px;
    display: flex; flex-direction: column; gap: 10px;
    scroll-behavior: smooth;
  }
  #sb-messages::-webkit-scrollbar { width: 4px; }
  #sb-messages::-webkit-scrollbar-track { background: transparent; }
  #sb-messages::-webkit-scrollbar-thumb { background: #d0d8e8; border-radius: 4px; }

  .sb-msg {
    max-width: 88%; padding: 10px 13px;
    border-radius: 14px; font-size: 13px; line-height: 1.55;
    word-wrap: break-word; animation: sb-pop 0.2s ease;
  }
  @keyframes sb-pop {
    from { opacity: 0; transform: translateY(6px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .sb-msg.bot {
    background: #F0F4FF; color: #1a1a2e;
    border-bottom-left-radius: 4px; align-self: flex-start;
    border: 1px solid #e0e8f8;
  }
  .sb-msg.user {
    background: linear-gradient(135deg, #1557C4, #2176FF);
    color: white; border-bottom-right-radius: 4px; align-self: flex-end;
  }
  .sb-msg.error {
    background: #FFF0F0; color: #C0392B;
    border: 1px solid #FECACA; border-bottom-left-radius: 4px;
    align-self: flex-start;
  }
  .sb-retry-btn {
    display: inline-block; margin-top: 6px; padding: 4px 12px;
    background: #1557C4; color: white; border: none; border-radius: 6px;
    font-size: 12px; cursor: pointer; font-family: 'DM Sans', sans-serif;
  }
  .sb-retry-btn:hover { background: #1044A0; }
  .sb-typing {
    align-self: flex-start;
    display: flex; align-items: center; gap: 4px;
    background: #F0F4FF; padding: 10px 14px; border-radius: 14px;
    border-bottom-left-radius: 4px; border: 1px solid #e0e8f8;
    animation: sb-pop 0.2s ease;
  }
  .sb-typing span {
    width: 7px; height: 7px; border-radius: 50%;
    background: #1557C4; display: inline-block;
    animation: sb-bounce 1.2s infinite;
  }
  .sb-typing span:nth-child(2) { animation-delay: 0.2s; }
  .sb-typing span:nth-child(3) { animation-delay: 0.4s; }
  @keyframes sb-bounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30% { transform: translateY(-5px); opacity: 1; }
  }

  #sb-input-area {
    border-top: 1px solid #e8ecf4; padding: 10px 12px;
    display: flex; flex-direction: column; gap: 8px;
  }
  #sb-input-row {
    display: flex; gap: 8px; align-items: flex-end;
  }
  #sb-input {
    flex: 1; border: 1.5px solid #d0d8e8; border-radius: 10px;
    padding: 9px 12px; font-size: 13px; outline: none;
    resize: none; max-height: 80px; min-height: 38px;
    font-family: 'DM Sans', sans-serif; color: #1a1a2e;
    transition: border-color 0.15s; line-height: 1.4;
  }
  #sb-input:focus { border-color: #1557C4; }
  #sb-input::placeholder { color: #aab4cc; }

  #sb-mic-btn {
    width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
    background: #F0F4FF; border: 1.5px solid #d0d8e8;
    color: #1557C4; font-size: 16px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: all 0.15s; position: relative;
  }
  #sb-mic-btn:hover { background: #e0e8fb; border-color: #1557C4; }
  #sb-mic-btn.listening {
    background: #FF4757; border-color: #FF4757; color: white;
    animation: sb-pulse 1s infinite;
  }
  @keyframes sb-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(255,71,87,0.4); }
    50% { box-shadow: 0 0 0 6px rgba(255,71,87,0); }
  }
  #sb-mic-btn.unsupported { opacity: 0.35; cursor: not-allowed; }

  #sb-send-btn {
    width: 38px; height: 38px; border-radius: 10px; flex-shrink: 0;
    background: linear-gradient(135deg, #1557C4, #2176FF);
    border: none; color: white; font-size: 15px; cursor: pointer;
    display: flex; align-items: center; justify-content: center;
    transition: opacity 0.15s, transform 0.15s;
  }
  #sb-send-btn:hover { opacity: 0.9; transform: scale(1.05); }
  #sb-send-btn:disabled { opacity: 0.4; cursor: default; transform: none; }

  #sb-speech-status {
    font-size: 11px; color: #FF4757; font-weight: 500;
    text-align: center; display: none; letter-spacing: 0.02em;
  }
  #sb-speech-status.show { display: block; }

  #sb-lang-indicator {
    font-size: 10px; color: #1557C4; font-weight: 600;
    background: #EBF0FB; border-radius: 6px; padding: 2px 8px;
    display: inline-block; margin-left: 6px; letter-spacing: 0.02em;
  }

  #sb-lang-select {
    width: 110px; height: 38px; border-radius: 10px; flex-shrink: 0;
    background: #F0F4FF; border: 1.5px solid #d0d8e8;
    color: #1557C4; font-size: 11px; font-weight: 600;
    cursor: pointer; text-align: left; padding: 0 8px;
    font-family: 'DM Sans', sans-serif;
    -webkit-appearance: none; -moz-appearance: none; appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='5'%3E%3Cpath d='M0 0l4 5 4-5z' fill='%231557C4'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 8px center;
    padding-right: 24px;
  }
  #sb-lang-select:focus { border-color: #1557C4; outline: none; }

  #sb-no-speech-note {
    font-size: 10.5px; color: #aab4cc; text-align: center;
    display: none; padding: 2px 0;
  }
  #sb-no-speech-note.show { display: block; }

  @media (max-width: 400px) {
    #sb-panel { width: calc(100vw - 24px); right: 12px; bottom: 80px; }
    #sb-fab { bottom: 16px; right: 16px; }
  }
`;

class SabbPeOnboardingWidget {
  constructor(config) {
    this.config = config;
    this.isOpen = false;
    this.messages = [];
    this.loading = false;
    this.currentStep = config.currentStep || 'welcome';
    this.mediaRecorder = null;
    this.audioStream = null;
    this.audioChunks = [];
    this.isListening = false;
    this.speechSupported = false;
    this.gatewayUrl = config.gatewayUrl || `${window.location.origin}/api/chat`;
    this.sttUrl = config.sttUrl || (this.gatewayUrl.includes('/api/chat')
      ? this.gatewayUrl.replace(/\/api\/chat$/, '/api/stt')
      : `${window.location.origin}/api/stt`);
    this.sttLang = localStorage.getItem('sabbpe_language') || 'en';
    this.hasGreetedStep = new Set();
    this._lastFailedPayload = null;
    this._build();
    this._initSpeech();
  }

  _build() {
    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);

    this.fab = document.createElement('button');
    this.fab.id = 'sb-fab';
    this.fab.title = 'Chat with Sahil';
    this.fab.innerHTML = '💬 <div class="sb-badge" id="sb-badge"></div>';

    this.panel = document.createElement('div');
    this.panel.id = 'sb-panel';
    this.panel.innerHTML = `
      <div id="sb-header">
        <div class="sb-avatar">🤖</div>
        <div class="sb-header-text">
          <div class="sb-header-name">Sahil - SabbPe Guide</div>
          <div class="sb-header-sub" id="sb-online-status">● Online</div>
        </div>
        <button class="sb-close-btn" id="sb-close">✕</button>
      </div>
      <div id="sb-step-bar">
        <span id="sb-step-emoji">📋</span>
        <span id="sb-step-label">Welcome</span>
      </div>
      <div id="sb-messages"></div>
      <div id="sb-input-area">
        <div id="sb-speech-status">🎤 Listening</div>
        <div id="sb-input-row">
          <textarea id="sb-input" placeholder="Ask Sahil anything ✨" rows="1"></textarea>
          <select id="sb-lang-select" title="Select language">
            <option value="en">English</option>
            <option value="hi">Hindi</option>
            <option value="te">Telugu</option>
            <option value="bn">Bengali</option>
            <option value="ta">Tamil</option>
            <option value="kn">Kannada</option>
            <option value="ml">Malayalam</option>
            <option value="mr">Marathi</option>
            <option value="gu">Gujarati</option>
            <option value="pa">Punjabi</option>
            <option value="ne">Nepali</option>
            <option value="ur">Urdu</option>
            <option value="sa">Sanskrit</option>
            <option value="sd">Sindhi</option>
            <option value="or">Odia</option>
            <option value="as">Assamese</option>
          </select>
          <button id="sb-mic-btn" title="Speak your question">🎤</button>
          <button id="sb-send-btn" title="Send">➤</button>
        </div>
        <div id="sb-no-speech-note"></div>
      </div>
    `;

    document.body.appendChild(this.fab);
    document.body.appendChild(this.panel);

    this.msgContainer  = document.getElementById('sb-messages');
    this.inputEl       = document.getElementById('sb-input');
    this.micBtn        = document.getElementById('sb-mic-btn');
    this.sendBtn       = document.getElementById('sb-send-btn');
    this.stepLabel     = document.getElementById('sb-step-label');
    this.stepEmoji     = document.getElementById('sb-step-emoji');
    this.speechStatus  = document.getElementById('sb-speech-status');
    this.noSpeechNote  = document.getElementById('sb-no-speech-note');
    this.badge         = document.getElementById('sb-badge');
    this.langSelect    = document.getElementById('sb-lang-select');
    this.langIndicator = document.getElementById('sb-lang-indicator');

    this.langSelect.value = this.sttLang;
    this.langSelect.addEventListener('change', () => {
      this.sttLang = this.langSelect.value;
      localStorage.setItem('sabbpe_language', this.sttLang);
      this._updateLangLabel();
    });

    this.fab.addEventListener('click', () => this.toggle());
    document.getElementById('sb-close').addEventListener('click', () => this.toggle(false));
    this.sendBtn.addEventListener('click', () => this.send());
    this.micBtn.addEventListener('click', () => this.toggleMic());
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
    });
    this.inputEl.addEventListener('input', () => {
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 80) + 'px';
    });

    this._updateStepBar(this.currentStep);
  }

  _initSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    this.hasWebSpeech = Boolean(SpeechRecognition);

    if (!navigator.mediaDevices || !window.MediaRecorder) {
      this.speechSupported = false;
      this.micBtn.classList.add('unsupported');
      this.micBtn.title = 'Voice input not supported on this browser.';
      this.noSpeechNote.textContent = 'Voice input not available on this browser.';
      this.noSpeechNote.classList.add('show');
      return;
    }
    this.speechSupported = true;
  }

  async toggleMic() {
    if (this._resetIdleTimer) this._resetIdleTimer();
    if (!this.speechSupported) return;

    this.sttLang = localStorage.getItem('sabbpe_language') || 'en';
    this._updateLangLabel();

    if (this.isListening) {
      this._stopRecording();
    } else {
      this._startRecording();
    }
  }

  _getLangCode() {
    const map = {
      en: 'en-IN', hi: 'hi-IN', te: 'te-IN', bn: 'bn-IN', ta: 'ta-IN',
      kn: 'kn-IN', ml: 'ml-IN', mr: 'mr-IN', gu: 'gu-IN', pa: 'pa-IN',
      ne: 'ne-NP', ur: 'ur-PK', sa: 'sa-IN', sd: 'sd-PK', or: 'or-IN',
      as: 'as-IN'
    };
    return map[this.sttLang] || 'en-IN';
  }

  async _startRecording() {
    this.isListening = true;
    this.micBtn.classList.add('listening');
    this.micBtn.innerHTML = '⏹';
    this.micBtn.title = 'Tap to stop';
    this.speechStatus.classList.add('show');
    this.inputEl.placeholder = 'Listening ...';

    try {
      this.audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const source = this.audioCtx.createMediaStreamSource(this.audioStream);
      const sampleRate = this.audioCtx.sampleRate;
      this.recordSampleRate = sampleRate;

      // Record raw PCM samples directly (no WebM encoding)
      this.audioPCM = [];
      this.scriptNode = this.audioCtx.createScriptProcessor(4096, 1, 1);
      this.scriptNode.onaudioprocess = (e) => {
        const channel = e.inputBuffer.getChannelData(0);
        this.audioPCM.push(new Float32Array(channel));
      };
      source.connect(this.scriptNode);
      this.scriptNode.connect(this.audioCtx.destination);
    } catch (err) {
      console.error('Mic access error:', err);
      this._resetMicUI();
      this._showNoSpeech('Could not access microphone.');
    }
  }

  _stopRecording() {
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(t => t.stop());
      this.audioStream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close();
      this.audioCtx = null;
    }
    this.inputEl.placeholder = 'Converting speech to text...';

    // Convert recorded PCM to WAV and send to STT
    if (this.audioPCM && this.audioPCM.length > 0) {
      const wavBlob = this._encodePCMToWav(this.audioPCM);
      this.audioPCM = [];
      if (wavBlob.size < 1000) {
        this._resetMicUI();
        this._showNoSpeech('No speech detected. Try again.');
        return;
      }
      this._processAudio(wavBlob);
    } else {
      this._resetMicUI();
      this._showNoSpeech('No speech detected. Try again.');
    }
  }

  _resetMicUI() {
    this.isListening = false;
    this.micBtn.classList.remove('listening');
    this.micBtn.innerHTML = '🎤';
    this.micBtn.title = 'Speak your question';
    this.speechStatus.classList.remove('show');
    this.inputEl.placeholder = 'Ask Sahil anything ✨';
  }

  _encodePCMToWav(pcmChunks) {
    const numChannels = 1;
    const bitsPerSample = 16;
    const sampleRate = this.recordSampleRate || 48000;

    // Concatenate all PCM chunks
    let totalLen = 0;
    for (const chunk of pcmChunks) totalLen += chunk.length;
    const allSamples = new Float32Array(totalLen);
    let off = 0;
    for (const chunk of pcmChunks) {
      allSamples.set(chunk, off);
      off += chunk.length;
    }

    // Normalize volume to prevent clipping
    let maxVal = 0;
    for (let i = 0; i < allSamples.length; i++) {
      const abs = Math.abs(allSamples[i]);
      if (abs > maxVal) maxVal = abs;
    }
    const gain = maxVal > 0 ? Math.min(1, 0.95 / maxVal) : 1;

    const dataSize = allSamples.length * numChannels * (bitsPerSample / 8);
    const bufferSize = 44 + dataSize;
    const buffer = new ArrayBuffer(bufferSize);
    const view = new DataView(buffer);

    function writeStr(offset, str) {
      for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
    }

    writeStr(0, 'RIFF');
    view.setUint32(4, bufferSize - 8, true);
    writeStr(8, 'WAVE');
    writeStr(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
    view.setUint16(32, numChannels * (bitsPerSample / 8), true);
    view.setUint16(34, bitsPerSample, true);
    writeStr(36, 'data');
    view.setUint32(40, dataSize, true);

    let pos = 44;
    for (let i = 0; i < allSamples.length; i++) {
      const s = Math.max(-1, Math.min(1, allSamples[i] * gain));
      view.setInt16(pos, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      pos += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  async _sendToSTT(audioBlob) {
    console.log('STT: calling', this.sttUrl, 'size:', audioBlob.size);
    const resp = await fetch(this.sttUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'audio/wav',
        'X-Language': this.sttLang,
      },
      body: audioBlob,
      signal: AbortSignal.timeout(30000),
    });

    if (!resp.ok) {
      throw new Error(`STT API ${resp.status}`);
    }

    const data = await resp.json();
    const transcript = data.data?.transcript || '';
    if (!transcript) {
      console.warn('STT response returned empty transcript', data);
    }
    return transcript;
  }

  _showNoSpeech(msg) {
    this._resetMicUI();
    this.noSpeechNote.textContent = msg;
    this.noSpeechNote.classList.add('show');
    setTimeout(() => this.noSpeechNote.classList.remove('show'), 4000);
  }

  async _processAudio(wavBlob) {
    try {
      const transcript = await this._sendToSTT(wavBlob);

      // Use STT result
      this.inputEl.value = transcript;
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 80) + 'px';
      this.inputEl.placeholder = 'Ask Sahil anything ';

      if (transcript.trim()) {
        setTimeout(() => this.send(), 200);
      }
    } catch (err) {
      console.error('STT error:', err);
      this.inputEl.placeholder = 'Ask Sahil anything ✨';
      this._showNoSpeech('Could not convert speech. Please try again.');
    }
  }

  toggle(state) {
    this.isOpen = (state !== undefined) ? state : !this.isOpen;
    this.panel.classList.toggle('open', this.isOpen);
    this.badge.classList.remove('show');

    if (this.isOpen && !this.hasGreetedStep.has(this.currentStep)) {
      this._proactiveGreet(this.currentStep);
    }
  }

  async _proactiveGreet(step) {
    if (this.hasGreetedStep.has(step)) return;
    this.hasGreetedStep.add(step);

    const prompt = STEP_PROMPTS[step];
    if (!prompt) return;

    this._setLoading(true);

    try {
      const reply = await this._callGateway([
        { role: 'user', content: `[CURRENT_STEP: ${step}] ${prompt}` }
      ]);
      this._setLoading(false);
      this._addMsg('bot', reply);
    } catch(err) {
      this._setLoading(false);
      this._showError(err, [
        { role: 'user', content: `[CURRENT_STEP: ${step}] ${prompt}` }
      ]);
    }
  }

  async send() {
    if (this._resetIdleTimer) this._resetIdleTimer();
    const text = this.inputEl.value.trim();
    if (!text || this.loading) return;

    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';
    this._addMsg('user', text);
    this._setLoading(true);

    const history = this.messages.map(m => ({
      role: m.role === 'bot' ? 'assistant' : 'user',
      content: m.text
    }));
    history[history.length - 1].content = `[CURRENT_STEP: ${this.currentStep}] ${text}`;

    try {
      const reply = await this._callGateway(history);
      this._setLoading(false);
      this._addMsg('bot', reply);
    } catch(err) {
      this._setLoading(false);
      this._showError(err, history);
    }
  }

  _showError(err, payload) {
    this._lastFailedPayload = payload;
    let msg = '';
    let isAuth = false;

    if (err.message && err.message.includes('NO_TOKEN')) {
      msg = 'Chat is not configured yet. Please contact support@sabbpe.com for help.';
      isAuth = true;
    } else if (err.message && err.message.includes('401')) {
      msg = 'Session expired. Please refresh the page to continue.';
      isAuth = true;
    } else if (err.message && err.message.includes('403')) {
      msg = 'Access denied. Please refresh the page.';
      isAuth = true;
    } else if (err.name === 'TypeError' || (err.message && err.message.includes('Failed to fetch'))) {
      msg = 'Unable to connect. Please check your internet connection.';
    } else if (err.message && err.message.includes('timeout')) {
      msg = 'Request timed out. Please try again.';
    } else {
      msg = 'Something went wrong. Please try again.';
    }

    const div = document.createElement('div');
    div.className = 'sb-msg error';
    div.innerHTML = msg;

    if (!isAuth && this._lastFailedPayload) {
      const retryBtn = document.createElement('button');
      retryBtn.className = 'sb-retry-btn';
      retryBtn.textContent = 'Retry';
      retryBtn.onclick = () => {
        div.remove();
        this._retryLastMessage();
      };
      div.appendChild(document.createElement('br'));
      div.appendChild(retryBtn);
    }

    this.msgContainer.appendChild(div);
    this.msgContainer.scrollTop = this.msgContainer.scrollHeight;
  }

  async _retryLastMessage() {
    if (!this._lastFailedPayload) return;
    this._setLoading(true);
    try {
      const reply = await this._callGateway(this._lastFailedPayload);
      this._setLoading(false);
      this._addMsg('bot', reply);
      this._lastFailedPayload = null;
    } catch(err) {
      this._setLoading(false);
      this._showError(err, this._lastFailedPayload);
    }
  }

  async _callGateway(messages) {
    const headers = {
      'Content-Type': 'application/json',
    };

    if (this.config.jwt) {
      headers.Authorization = this.config.jwt;
    }

    const resp = await fetch(this.config.gatewayUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: false,
        max_tokens: 120,
      }),
      signal: AbortSignal.timeout(60000),
    });
    if (!resp.ok) throw new Error(`Gateway ${resp.status}`);
    const data = await resp.json();
    return data.choices?.[0]?.message?.content || 'Sorry, no response. Please try again.';
  }

  _addMsg(role, text) {
    this.messages.push({ role, text });
    const div = document.createElement('div');
    div.className = `sb-msg ${role}`;
    div.textContent = text;
    this.msgContainer.appendChild(div);
    this.msgContainer.scrollTop = this.msgContainer.scrollHeight;

    if (!this.isOpen && role === 'bot') {
      this.badge.classList.add('show');
    }
  }

  _setLoading(on) {
    this.loading = on;
    this.sendBtn.disabled = on;
    this.micBtn.disabled = on;
    if (on) {
      this.typingEl = document.createElement('div');
      this.typingEl.className = 'sb-typing';
      this.typingEl.innerHTML = '<span></span><span></span><span></span>';
      this.msgContainer.appendChild(this.typingEl);
      this.msgContainer.scrollTop = this.msgContainer.scrollHeight;
    } else if (this.typingEl) {
      this.typingEl.remove();
      this.typingEl = null;
    }
  }

  _updateStepBar(step) {
    const meta = STEPS[step] || { label: step, emoji: ' ' };
    if (this.stepLabel) this.stepLabel.textContent = meta.label;
    if (this.stepEmoji) this.stepEmoji.textContent = meta.emoji;
  }

  updateStep(newStep) {
    if (newStep === this.currentStep) return;
    this.currentStep = newStep;
    this._updateStepBar(newStep);

    if (this.isOpen) {
      this._proactiveGreet(newStep);
    } else {
      this.badge.classList.add('show');
    }
  }

  setResetIdleTimer(fn) {
    this._resetIdleTimer = fn;
  }

  setJwt(jwt) {
    this.config.jwt = jwt;
  }

  setGatewayUrl(url) {
    this.config.gatewayUrl = url;
    this.gatewayUrl = url;
    if (!this.config.sttUrl) {
      this.sttUrl = url.includes('/api/chat') ? url.replace(/\/api\/chat$/, '/api/stt') : this.sttUrl;
    }
  }

  setModel(model) {
    this.config.model = model;
  }

  setSttLang(lang) {
    this.sttLang = lang;
    this._updateLangLabel();
  }

  setSttUrl(url) {
    this.sttUrl = url;
  }

  _updateLangLabel() {
    if (this.langSelect) {
      this.langSelect.value = this.sttLang;
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.SabbPeWidget = new SabbPeOnboardingWidget(WIDGET_CONFIG);
  });
} else {
  window.SabbPeWidget = new SabbPeOnboardingWidget(WIDGET_CONFIG);
}
