import { applyCors } from '../lib/cors.js';

export default function handler(req, res) {
  if (applyCors(req, res)) return;

  res.status(200).json({
    status: 'ok',
    message: 'Expense Tracker Backend API is active and running',
    version: '1.0.0',
    time: new Date().toISOString(),
    documentation: 'https://github.com/Fadli-web/ExpensesNoteBackend#readme',
    endpoints: {
      health: 'GET /api/health',
      transactions: 'GET, POST /api/transactions',
      transaction_by_id: 'GET, PUT, PATCH, DELETE /api/transactions/:id',
      receipt_scan: 'POST /api/receipts/scan',
      receipt_upload: 'POST /api/receipts/upload',
      receipt_signed_url: 'GET /api/receipts/signed-url',
      dashboard_summary: 'GET /api/dashboard/summary',
      dashboard_top_merchants: 'GET /api/dashboard/top-merchants',
      dashboard_breakdown: 'GET /api/dashboard/breakdown',
      dashboard_trend: 'GET /api/dashboard/trend',
      export_csv: 'GET /api/export/csv',
      keep_alive: 'GET /api/keep-alive'
    }
  });
}
