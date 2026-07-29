/** Self-contained HTML viewer — enter ZIP code, then browse decrypted files. */
export const buildOpenDocumentsHtml = (): string => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SabbPe — Open Merchant Documents</title>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
      color: #1f2937;
      padding: 24px;
    }
    .wrap { max-width: 720px; margin: 0 auto; }
    .card {
      background: #fff;
      border-radius: 16px;
      box-shadow: 0 12px 32px rgba(0,0,0,0.08);
      border: 1px solid #e5e7eb;
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #10b981, #059669);
      color: #fff;
      padding: 28px 32px;
      text-align: center;
    }
    .header h1 { margin: 0 0 8px; font-size: 24px; }
    .header p { margin: 0; opacity: 0.9; font-size: 15px; }
    .body { padding: 32px; }
    label { display: block; font-weight: 600; margin-bottom: 8px; color: #374151; }
    input[type="text"], input[type="password"] {
      width: 100%;
      padding: 14px 16px;
      font-size: 18px;
      letter-spacing: 2px;
      font-family: monospace;
      border: 2px solid #d1d5db;
      border-radius: 10px;
      text-transform: uppercase;
    }
    input:focus { outline: none; border-color: #10b981; }
    .btn {
      width: 100%;
      margin-top: 16px;
      padding: 14px;
      font-size: 16px;
      font-weight: 600;
      color: #fff;
      background: linear-gradient(135deg, #10b981, #059669);
      border: none;
      border-radius: 10px;
      cursor: pointer;
    }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .hint { color: #6b7280; font-size: 14px; line-height: 1.6; margin: 16px 0 0; }
    .error {
      display: none;
      margin-top: 16px;
      padding: 12px 16px;
      background: #fef2f2;
      border: 1px solid #fecaca;
      color: #b91c1c;
      border-radius: 8px;
      font-size: 14px;
    }
    .file-pick { margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; }
    .file-pick input[type="file"] { width: 100%; font-size: 14px; }
    #files { display: none; margin-top: 24px; }
    #files h2 { margin: 0 0 16px; font-size: 18px; }
    .file-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 16px;
      background: #f9fafb;
      border: 1px solid #e5e7eb;
      border-radius: 10px;
      margin-bottom: 10px;
    }
    .file-name { font-weight: 500; word-break: break-all; }
    .file-actions a, .file-actions button {
      padding: 8px 14px;
      font-size: 13px;
      font-weight: 600;
      border-radius: 8px;
      text-decoration: none;
      border: none;
      cursor: pointer;
      background: #10b981;
      color: #fff;
    }
    .steps {
      background: #fffbeb;
      border: 1px solid #fde68a;
      border-radius: 10px;
      padding: 16px;
      margin-bottom: 24px;
      font-size: 14px;
      color: #92400e;
      line-height: 1.7;
    }
    .steps ol { margin: 8px 0 0; padding-left: 20px; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <div class="header">
        <h1>🔐 SabbPe Merchant Documents</h1>
        <p>Enter your ZIP code from the email to view files</p>
      </div>
      <div class="body">
        <div class="steps">
          <strong>How to open:</strong>
          <ol>
            <li>Extract this ZIP folder first (right-click → Extract All).</li>
            <li>Double-click <strong>OPEN_DOCUMENTS.html</strong> (this page).</li>
            <li>Enter your code from the email (e.g. SABBPE-A7X9K2MN).</li>
            <li>Click <strong>Unlock Documents</strong> to see all files inside.</li>
          </ol>
        </div>

        <label for="code">Your ZIP code</label>
        <input id="code" type="text" placeholder="SABBPE-XXXXXXXX" autocomplete="off" />

        <button class="btn" id="unlockBtn" type="button">Unlock Documents</button>
        <p class="hint">The code was sent in the same email as this ZIP attachment.</p>
        <div class="error" id="error"></div>

        <div class="file-pick" id="filePick" style="display:none;">
          <label for="zipFile">Select <strong>documents.zip</strong> from this folder</label>
          <input id="zipFile" type="file" accept=".zip,application/zip" />
        </div>

        <div id="files">
          <h2>📁 Documents inside</h2>
          <div id="fileList"></div>
        </div>
      </div>
    </div>
  </div>
  <script>
    const INNER_ZIP = 'documents.zip';
    let zipArrayBuffer = null;

    const codeInput = document.getElementById('code');
    const unlockBtn = document.getElementById('unlockBtn');
    const errorEl = document.getElementById('error');
    const filePick = document.getElementById('filePick');
    const zipFileInput = document.getElementById('zipFile');
    const filesSection = document.getElementById('files');
    const fileList = document.getElementById('fileList');

    function showError(msg) {
      errorEl.style.display = 'block';
      errorEl.textContent = msg;
    }

    function clearError() {
      errorEl.style.display = 'none';
      errorEl.textContent = '';
    }

    async function loadInnerZip() {
      if (zipArrayBuffer) return zipArrayBuffer;
      try {
        const resp = await fetch(INNER_ZIP);
        if (!resp.ok) throw new Error('fetch failed');
        zipArrayBuffer = await resp.arrayBuffer();
        return zipArrayBuffer;
      } catch {
        filePick.style.display = 'block';
        if (zipFileInput.files && zipFileInput.files[0]) {
          zipArrayBuffer = await zipFileInput.files[0].arrayBuffer();
          return zipArrayBuffer;
        }
        throw new Error('Could not load documents.zip. Extract the folder first, or select documents.zip below.');
      }
    }

    zipFileInput.addEventListener('change', async () => {
      if (zipFileInput.files && zipFileInput.files[0]) {
        zipArrayBuffer = await zipFileInput.files[0].arrayBuffer();
        clearError();
      }
    });

    codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') unlockBtn.click();
    });

    unlockBtn.addEventListener('click', async () => {
      clearError();
      const code = codeInput.value.trim().toUpperCase();
      if (!code) {
        showError('Please enter your ZIP code from the email.');
        return;
      }
      if (!/^SABBPE-[A-Z0-9]{8}$/.test(code)) {
        showError('Code format should be SABBPE-XXXXXXXX (8 letters/numbers).');
        return;
      }

      unlockBtn.disabled = true;
      unlockBtn.textContent = 'Unlocking…';

      try {
        const buffer = await loadInnerZip();
        const zip = await JSZip.loadAsync(buffer, { password: code });
        const names = Object.keys(zip.files).filter((n) => !zip.files[n].dir);
        if (!names.length) {
          showError('No files found. Check that you entered the correct code.');
          return;
        }

        fileList.innerHTML = '';
        names.sort().forEach((name) => {
          const row = document.createElement('div');
          row.className = 'file-row';
          const label = document.createElement('span');
          label.className = 'file-name';
          label.textContent = name;
          const actions = document.createElement('div');
          actions.className = 'file-actions';
          const openBtn = document.createElement('button');
          openBtn.type = 'button';
          openBtn.textContent = 'Open';
          openBtn.addEventListener('click', async () => {
            const blob = await zip.file(name).async('blob');
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank');
          });
          actions.appendChild(openBtn);
          row.appendChild(label);
          row.appendChild(actions);
          fileList.appendChild(row);
        });

        filesSection.style.display = 'block';
        filePick.style.display = 'none';
      } catch (err) {
        showError('Wrong code or could not open ZIP. Use the exact code from your email (e.g. SABBPE-A7X9K2MN).');
      } finally {
        unlockBtn.disabled = false;
        unlockBtn.textContent = 'Unlock Documents';
      }
    });

    loadInnerZip().catch(() => {
      filePick.style.display = 'block';
    });
  </script>
</body>
</html>`;
