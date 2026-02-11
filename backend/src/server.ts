import express from 'express';
import cors from 'express';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Rota de Healthcheck
app.get('/api/v1', (req, res) => {
  res.json({ message: 'StreamForge API is running (Portable Mode) 🚀' });
});

// Importar rotas aqui depois que o usuário pedir
// app.use('/api/v1/auth', authRoutes);
// app.use('/api/v1/videos', videoRoutes);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
