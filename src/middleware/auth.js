import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

const JWT_SECRET = process.env.JWT_SECRET;

/**
 * Middleware que verifica el JWT propio (no el de Google).
 * El token lo emite /auth/google al hacer login.
 */
export async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'No autorizado.' });
    }

    const token = header.slice(7);
    const payload = jwt.verify(token, JWT_SECRET);

    // Verificar que el usuario siga activo en la BD
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, nombre: true, email: true, rol: true, activo: true, avatar: true },
    });

    if (!user || !user.activo) {
      return res.status(401).json({ message: 'Usuario inactivo o no encontrado.' });
    }

    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Token inválido o expirado.' });
  }
}

/**
 * Middleware que verifica rol admin.
 * Usar después de requireAuth.
 */
export function requireAdmin(req, res, next) {
  if (req.user?.rol !== 'admin') {
    return res.status(403).json({ message: 'Se requiere rol admin.' });
  }
  next();
}
