import express from 'express';
import cors from 'cors';
import authRouter        from './routes/auth.js';
import quotesRouter      from './routes/quotes.js';
import discountRouter    from './routes/discountCodes.js';
import publicRouter      from './routes/public.js';

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173').split(',');

app.use(cors({
  origin: (origin, cb) => {
    // Permitir requests sin origin (Postman, curl) en desarrollo
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origen no permitido — ${origin}`));
  },
  credentials: true,
}));

// ─── BODY PARSER ──────────────────────────────────────────────────────────────
app.use(express.json({ limit: '2mb' }));

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ─── ROUTES ───────────────────────────────────────────────────────────────────
app.use('/api/auth',           authRouter);
app.use('/api/quotes',         quotesRouter);
app.use('/api/discount-codes', discountRouter);
app.use('/api/public',         publicRouter);

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ message: 'Ruta no encontrada.' }));

// ─── ERROR HANDLER ────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ message: err.message || 'Error interno del servidor.' });
});

// ─── START ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ API corriendo en http://localhost:${PORT}`);
});

export default app;
