require('dotenv').config();
const app = require('./api/index');

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`\n✅ ExpendNote Backend API berjalan di http://localhost:${PORT}`);
  console.log(`   Health check: http://localhost:${PORT}/api/health\n`);
});
