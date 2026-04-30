import { Router } from 'express';
import { prisma } from '../lib/prisma.js';

const router = Router();

/**
 * GET /public/quotes/:token
 * Vista pública de la propuesta para el cliente.
 * No requiere auth — solo un token válido y no expirado.
 */
router.get('/quotes/:token', async (req, res) => {
  try {
    const { token } = req.params;

    const quote = await prisma.quote.findFirst({
      where: {
        publicToken: token,
        deletedAt:   null,
      },
      select: {
        id:               true,
        folio:            true,
        estatus:          true,
        clienteSnapshot:  true,
        proyectoNombre:   true,
        proyectoTipo:     true,
        proyectoEstatus:  true,
        proyectoUbicacion: true,
        proyectoDescripcion: true,
        proyectoMateriales: true,
        submarca:         true,
        esquemaPago:      true,
        notasPago:        true,
        subtotal:         true,
        descuentoPct:     true,
        descuentoTotal:   true,
        total:            true,
        moneda:           true,
        publicTokenExpiresAt: true,
        fechaCreacion:    true,
        productos: {
          select: {
            productoId:     true,
            nombreSnapshot: true,
            configSnapshot: true,
            precioFinal:    true,
            configurado:    true,
            orden:          true,
          },
          orderBy: { orden: 'asc' },
        },
      },
    });

    if (!quote) {
      return res.status(404).json({ message: 'Propuesta no encontrada o link inválido.' });
    }

    if (quote.publicTokenExpiresAt && new Date() > quote.publicTokenExpiresAt) {
      return res.status(410).json({ message: 'Este link ha expirado. Solicita uno nuevo.' });
    }

    // Registrar vista del cliente (sin bloquear la respuesta)
    prisma.quoteEvent.create({
      data: {
        quoteId:   quote.id,
        eventType: 'vista_publica',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] || null,
      },
    }).catch(() => {});

    res.json(quote);
  } catch (err) {
    console.error('[public GET /quotes/:token]', err);
    res.status(500).json({ message: 'Error al obtener propuesta.' });
  }
});

export default router;
