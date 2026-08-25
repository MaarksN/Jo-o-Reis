import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Serve Mesa HTML at root
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'Mesa_Tratamento_Joao_Bitrix_Pomodoro_AtlasGR_v1_0.html'));
});

// Serve static assets from directory
app.use(express.static(__dirname));

// Fallback for any other route
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'Mesa_Tratamento_Joao_Bitrix_Pomodoro_AtlasGR_v1_0.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
});
