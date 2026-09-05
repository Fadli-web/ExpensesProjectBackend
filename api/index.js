const express = require('express');
const app = express();
const supabaseAdmin = require('../lib/supabaseAdmin');

// CORS middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// JSON body parser (10MB limit for base64 OCR receipts)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check and Supabase keep-alive ping
const healthHandler = async (req, res) => {
  const start = Date.now();
  let dbStatus = 'disconnected';
  let dbError = null;

  try {
    const { error } = await supabaseAdmin
      .from('profiles')
      .select('id', { count: 'exact', head: true });

    if (error) {
      dbError = error.message;
    } else {
      dbStatus = 'connected';
    }
  } catch (err) {
    dbError = err.message;
  }

  const durationMs = Date.now() - start;

  return res.status(dbStatus === 'connected' ? 200 : 503).json({
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    service: 'Expenses Note Backend API',
    database: dbStatus,
    latency_ms: durationMs,
    error: dbError,
    timestamp: new Date().toISOString(),
  });
};

app.get('/api/health', healthHandler);
app.get('/health', healthHandler);
app.get('/api', healthHandler);

// Mount modular sub-routers
app.use('/api/auth', require('../routes/auth'));
app.use('/api/profile', require('../routes/profile'));
app.use('/api/receipts', require('../routes/receipts'));
app.use('/api/dashboard', require('../routes/dashboard'));
app.use('/api/transactions', require('../routes/transactions'));
app.use('/api/export', require('../routes/export'));

// Fallback 404 for unknown API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

module.exports = app;
