import { applyCors } from '../lib/cors.js';

export default function handler(req, res) {
  if (applyCors(req, res)) return;

  const acceptsHtml = (req.headers.accept || '').includes('text/html');
  const wantsJson = req.query.format === 'json' || req.query.json !== undefined;

  // Jika dibuka langsung lewat browser (bukan Postman/fetch JSON), tampilkan landing page status yang cantik
  if (acceptsHtml && !wantsJson) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(renderLandingPage());
  }

  // Response JSON standar untuk API / Postman / Frontend
  return res.status(200).json({
    status: 'ok',
    message: 'Expense Tracker Backend API is active and running',
    version: '1.0.0',
    time: new Date().toISOString(),
  });
}

function renderLandingPage() {
  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Expense Tracker – Backend API</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    :root {
      --bg-base: #0a0e17;
      --bg-surface: #111827;
      --bg-card: rgba(17, 24, 39, 0.75);
      --border-color: rgba(255, 255, 255, 0.08);
      --border-glow: rgba(16, 185, 129, 0.25);
      --text-main: #f3f4f6;
      --text-muted: #9ca3af;
      --text-dim: #6b7280;
      --accent-emerald: #10b981;
      --accent-emerald-glow: rgba(16, 185, 129, 0.2);
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--bg-base);
      color: var(--text-main);
      font-family: 'Plus Jakarta Sans', sans-serif;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 40px 20px;
      line-height: 1.5;
      position: relative;
    }
    body::before {
      content: '';
      position: absolute;
      top: -100px;
      left: 50%;
      transform: translateX(-50%);
      width: 600px;
      height: 400px;
      background: radial-gradient(circle, rgba(16, 185, 129, 0.12) 0%, rgba(59, 130, 246, 0.06) 50%, transparent 70%);
      filter: blur(60px);
      z-index: 0;
      pointer-events: none;
    }
    .container { width: 100%; max-width: 880px; position: relative; z-index: 1; }
    .header { text-align: center; margin-bottom: 32px; }
    .status-pill {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 0.85rem;
      font-weight: 600;
      color: #34d399;
      margin-bottom: 16px;
      box-shadow: 0 0 20px var(--accent-emerald-glow);
    }
    .pulse-dot {
      width: 8px; height: 8px;
      background-color: #10b981;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
      70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
      100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }
    h1 {
      font-size: 2.2rem;
      font-weight: 800;
      letter-spacing: -0.03em;
      background: linear-gradient(135deg, #ffffff 40%, #9ca3af 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }
    .subtitle { color: var(--text-muted); font-size: 0.95rem; max-width: 600px; margin: 0 auto; }
    .tester-card {
      background: var(--bg-card);
      backdrop-filter: blur(16px);
      border: 1px solid var(--border-color);
      border-radius: 16px;
      padding: 24px;
      margin-bottom: 32px;
      box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
    }
    .tester-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 14px;
      flex-wrap: wrap;
      gap: 12px;
    }
    .tester-title { font-size: 1rem; font-weight: 700; color: #fff; }
    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #10b981;
      color: #042f2e;
      font-weight: 600;
      font-size: 0.85rem;
      padding: 8px 16px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      text-decoration: none;
      transition: all 0.15s;
    }
    .btn:hover { background: #34d399; transform: translateY(-1px); }
    .btn-secondary {
      background: rgba(255, 255, 255, 0.08);
      color: var(--text-main);
      border: 1px solid var(--border-color);
    }
    .btn-secondary:hover { background: rgba(255, 255, 255, 0.12); }
    .response-terminal {
      background: #060911;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      padding: 14px 16px;
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.82rem;
      color: #38bdf8;
      overflow-x: auto;
      white-space: pre;
    }
    .section-title { font-size: 1.15rem; font-weight: 700; margin-bottom: 14px; color: #fff; }
    .endpoint-grid { display: grid; gap: 10px; }
    .endpoint-item {
      background: var(--bg-card);
      backdrop-filter: blur(12px);
      border: 1px solid var(--border-color);
      border-radius: 12px;
      padding: 12px 18px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      transition: transform 0.15s;
    }
    .endpoint-item:hover { transform: translateX(2px); border-color: rgba(255, 255, 255, 0.14); }
    .endpoint-left { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .method-badge {
      font-family: 'JetBrains Mono', monospace;
      font-size: 0.72rem;
      font-weight: 700;
      padding: 4px 8px;
      border-radius: 6px;
      text-transform: uppercase;
    }
    .method-get { background: rgba(2, 132, 199, 0.2); color: #38bdf8; border: 1px solid rgba(2, 132, 199, 0.4); }
    .method-post { background: rgba(5, 150, 105, 0.2); color: #34d399; border: 1px solid rgba(5, 150, 105, 0.4); }
    .method-patch { background: rgba(217, 119, 6, 0.2); color: #fbbf24; border: 1px solid rgba(217, 119, 6, 0.4); }
    .method-delete { background: rgba(225, 29, 72, 0.2); color: #fb7185; border: 1px solid rgba(225, 29, 72, 0.4); }
    .endpoint-path { font-family: 'JetBrains Mono', monospace; font-size: 0.88rem; color: #f3f4f6; }
    .endpoint-desc { color: var(--text-dim); font-size: 0.82rem; }
    .auth-badge { font-size: 0.7rem; background: rgba(255, 255, 255, 0.06); color: #d1d5db; padding: 2px 7px; border-radius: 4px; }
    footer { margin-top: 40px; text-align: center; color: var(--text-dim); font-size: 0.82rem; }
  </style>
</head>
<body>
  <div class="container">
    <header class="header">
      <div class="status-pill">
        <span class="pulse-dot"></span>
        API Operational &amp; Healthy
      </div>
      <h1>Expense Tracker Backend</h1>
      <p class="subtitle">
        Serverless REST API aktif dan berjalan normal. Backend ini siap melayani aplikasi Frontend dan pengujian via Postman.
      </p>
    </header>

    <div class="tester-card">
      <div class="tester-header">
        <div class="tester-title">⚡ Live Server Status</div>
        <div style="display: flex; gap: 8px;">
          <button id="btn-test" class="btn" onclick="testHealth()">Ping /api/health</button>
          <a href="/api/health?format=json" target="_blank" class="btn btn-secondary">Raw JSON ↗</a>
        </div>
      </div>
      <div id="response-box" class="response-terminal">// Memeriksa koneksi server...</div>
    </div>

    <div class="section-title">📚 Daftar Endpoint API</div>
    <div class="endpoint-grid">
      <div class="endpoint-item">
        <div class="endpoint-left">
          <span class="method-badge method-get">GET</span>
          <span class="endpoint-path">/api/health</span>
          <span class="endpoint-desc">Cek status aktif server</span>
        </div>
        <span class="auth-badge">Public</span>
      </div>
      <div class="endpoint-item">
        <div class="endpoint-left">
          <span class="method-badge method-get">GET</span>
          <span class="endpoint-path">/api/transactions</span>
          <span class="endpoint-desc">List riwayat transaksi + filter + paginasi</span>
        </div>
        <span class="auth-badge">Bearer JWT</span>
      </div>
      <div class="endpoint-item">
        <div class="endpoint-left">
          <span class="method-badge method-post">POST</span>
          <span class="endpoint-path">/api/transactions</span>
          <span class="endpoint-desc">Tambah catatan transaksi baru</span>
        </div>
        <span class="auth-badge">Bearer JWT</span>
      </div>
      <div class="endpoint-item">
        <div class="endpoint-left">
          <span class="method-badge method-patch">PATCH</span>
          <span class="endpoint-path">/api/transactions/:id</span>
          <span class="endpoint-desc">Update field transaksi</span>
        </div>
        <span class="auth-badge">Bearer JWT</span>
      </div>
      <div class="endpoint-item">
        <div class="endpoint-left">
          <span class="method-badge method-delete">DELETE</span>
          <span class="endpoint-path">/api/transactions/:id</span>
          <span class="endpoint-desc">Hapus transaksi &amp; foto struk storage</span>
        </div>
        <span class="auth-badge">Bearer JWT</span>
      </div>
      <div class="endpoint-item">
        <div class="endpoint-left">
          <span class="method-badge method-post">POST</span>
          <span class="endpoint-path">/api/receipts/scan</span>
          <span class="endpoint-desc">OCR AI struk belanja via Google Gemini</span>
        </div>
        <span class="auth-badge">Bearer JWT</span>
      </div>
      <div class="endpoint-item">
        <div class="endpoint-left">
          <span class="method-badge method-post">POST</span>
          <span class="endpoint-path">/api/receipts/upload</span>
          <span class="endpoint-desc">Upload foto struk ke Supabase Storage</span>
        </div>
        <span class="auth-badge">Bearer JWT</span>
      </div>
      <div class="endpoint-item">
        <div class="endpoint-left">
          <span class="method-badge method-get">GET</span>
          <span class="endpoint-path">/api/receipts/signed-url</span>
          <span class="endpoint-desc">Signed URL preview foto (5 menit)</span>
        </div>
        <span class="auth-badge">Bearer JWT</span>
      </div>
      <div class="endpoint-item">
        <div class="endpoint-left">
          <span class="method-badge method-get">GET</span>
          <span class="endpoint-path">/api/dashboard/summary</span>
          <span class="endpoint-desc">Metrik pengeluaran bulan ini vs lalu</span>
        </div>
        <span class="auth-badge">Bearer JWT</span>
      </div>
      <div class="endpoint-item">
        <div class="endpoint-left">
          <span class="method-badge method-get">GET</span>
          <span class="endpoint-path">/api/dashboard/top-merchants</span>
          <span class="endpoint-desc">Leaderboard merchant pengeluaran terbesar</span>
        </div>
        <span class="auth-badge">Bearer JWT</span>
      </div>
      <div class="endpoint-item">
        <div class="endpoint-left">
          <span class="method-badge method-get">GET</span>
          <span class="endpoint-path">/api/dashboard/breakdown</span>
          <span class="endpoint-desc">Breakdown persentase per kategori</span>
        </div>
        <span class="auth-badge">Bearer JWT</span>
      </div>
      <div class="endpoint-item">
        <div class="endpoint-left">
          <span class="method-badge method-get">GET</span>
          <span class="endpoint-path">/api/dashboard/trend</span>
          <span class="endpoint-desc">Tren pengeluaran harian sepanjang bulan</span>
        </div>
        <span class="auth-badge">Bearer JWT</span>
      </div>
      <div class="endpoint-item">
        <div class="endpoint-left">
          <span class="method-badge method-get">GET</span>
          <span class="endpoint-path">/api/export/csv</span>
          <span class="endpoint-desc">Unduh laporan dalam format file CSV</span>
        </div>
        <span class="auth-badge">Bearer JWT</span>
      </div>
      <div class="endpoint-item">
        <div class="endpoint-left">
          <span class="method-badge method-get">GET</span>
          <span class="endpoint-path">/api/keep-alive</span>
          <span class="endpoint-desc">Cron ping pencegah auto-pause Supabase</span>
        </div>
        <span class="auth-badge">Secret Header</span>
      </div>
    </div>

    <footer>
      <p>Expense Tracker Backend &bull; REST API Serverless</p>
    </footer>
  </div>

  <script>
    async function testHealth() {
      const box = document.getElementById('response-box');
      const btn = document.getElementById('btn-test');
      box.textContent = '// Menghubungi /api/health?format=json ...';
      btn.disabled = true;
      const start = performance.now();
      try {
        const res = await fetch('/api/health?format=json');
        const latency = Math.round(performance.now() - start);
        const data = await res.json();
        box.textContent = '// HTTP 200 OK (Latency: ' + latency + 'ms)\\n' + JSON.stringify(data, null, 2);
      } catch (err) {
        box.textContent = '// Error: ' + err.message;
      } finally {
        btn.disabled = false;
      }
    }
    testHealth();
  </script>
</body>
</html>`;
}
