import { Router } from 'express';
import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const JWT_SECRET       = process.env.JWT_SECRET;
const JWT_EXPIRES_IN   = '7d';
const ALLOWED_DOMAIN   = 'xperience.group';

const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);

/**
 * POST /auth/google
 * Body: { idToken: string }
 *
 * 1. Verifica el idToken con Google (firma real, no solo decode)
 * 2. Valida dominio @xperience.group
 * 3. Upsert del usuario en la BD
 * 4. Devuelve JWT propio + datos del usuario
 */
router.post('/google', async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) return res.status(400).json({ message: 'idToken requerido.' });

    // Verificar token con Google (valida firma, audiencia y expiración)
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const email   = payload.email || '';
    const domain  = email.split('@')[1] || '';

    if (domain !== ALLOWED_DOMAIN) {
      return res.status(403).json({ message: `Acceso restringido a cuentas @${ALLOWED_DOMAIN}.` });
    }

    // Upsert: crear usuario si no existe, actualizar datos de Google si cambió algo
    const user = await prisma.user.upsert({
      where: { email },
      create: {
        googleSub:  payload.sub,
        username:   email.split('@')[0],
        email,
        nombre:     payload.name || email.split('@')[0],
        iniciales:  getInitials(payload.name || email),
        avatar:     payload.picture,
        rol:        'comercial',  // rol por defecto; admin lo cambia desde BD
        activo:     true,
        ultimoLoginAt: new Date(),
      },
      update: {
        googleSub:     payload.sub,
        nombre:        payload.name || undefined,
        avatar:        payload.picture || undefined,
        ultimoLoginAt: new Date(),
      },
      select: {
        id: true, nombre: true, email: true, rol: true, activo: true, avatar: true, iniciales: true,
      },
    });

    if (!user.activo) {
      return res.status(403).json({ message: 'Tu cuenta está desactivada. Contacta a un administrador.' });
    }

    // Emitir JWT propio
    const token = jwt.sign(
      { sub: user.id, email: user.email, rol: user.rol },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    return res.json({ token, user });
  } catch (err) {
    console.error('[auth/google]', err);
    return res.status(401).json({ message: 'Token de Google inválido.' });
  }
});

/**
 * GET /auth/me
 * Devuelve el usuario autenticado actual.
 */
router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

// ─── helpers ──────────────────────────────────────────────────────────────────

function getInitials(name = '') {
  return name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

export default router;
