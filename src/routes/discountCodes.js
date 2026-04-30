import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

const SELECT = {
  id: true, codigo: true, nombre: true, descripcion: true,
  descuentoPct: true, activo: true, validoDesde: true, validoHasta: true,
  maxUsos: true, usosActuales: true, createdAt: true,
};

// GET /discount-codes
router.get('/', async (req, res) => {
  try {
    const codes = await prisma.discountCode.findMany({
      where: { deletedAt: null },
      select: SELECT,
      orderBy: { createdAt: 'desc' },
    });
    res.json(codes);
  } catch (err) {
    res.status(500).json({ message: 'Error al obtener códigos.' });
  }
});

// PUT /discount-codes  — reemplaza la lista completa (comportamiento del frontend actual)
router.put('/', async (req, res) => {
  try {
    const codes = req.body; // array de códigos
    if (!Array.isArray(codes)) return res.status(400).json({ message: 'Se esperaba un array.' });

    const result = await prisma.$transaction(
      codes.map((c) =>
        prisma.discountCode.upsert({
          where:  { codigo: c.codigo },
          create: {
            codigo:       c.codigo,
            nombre:       c.nombre || c.codigo,
            descripcion:  c.descripcion || null,
            descuentoPct: c.descuentoPct || c.descuento_pct || 0,
            activo:       c.activo ?? true,
            validoDesde:  c.validoDesde || null,
            validoHasta:  c.validoHasta || null,
            maxUsos:      c.maxUsos || null,
            createdBy:    req.user.id,
          },
          update: {
            nombre:       c.nombre,
            descripcion:  c.descripcion || null,
            descuentoPct: c.descuentoPct || c.descuento_pct,
            activo:       c.activo ?? true,
            validoDesde:  c.validoDesde || null,
            validoHasta:  c.validoHasta || null,
            maxUsos:      c.maxUsos || null,
          },
          select: SELECT,
        })
      )
    );

    res.json(result);
  } catch (err) {
    console.error('[discount-codes PUT /]', err);
    res.status(500).json({ message: 'Error al guardar códigos.' });
  }
});

export default router;
