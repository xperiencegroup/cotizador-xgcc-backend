import { Router } from 'express';
import { nanoid } from 'nanoid';
import { prisma } from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Llama a la función next_folio() de PostgreSQL (atómica con SEQUENCE) */
async function generateFolio() {
  const result = await prisma.$queryRaw`SELECT cotizador_next_folio() AS folio`;
  return result[0].folio;
}

/** Campos a devolver en listados */
const QUOTE_SELECT = {
  id: true,
  folio: true,
  estatus: true,
  clienteSnapshot: true,
  proyectoNombre: true,
  proyectoTipo: true,
  submarca: true,
  subtotal: true,
  descuentoPct: true,
  descuentoTotal: true,
  total: true,
  moneda: true,
  publicToken: true,
  creadoPor: true,
  creador: { select: { nombre: true, email: true, avatar: true } },
  fechaCreacion: true,
  fechaActualizacion: true,
  enviadaAt: true,
  productos: {
    select: {
      id: true,
      productoId: true,
      nombreSnapshot: true,
      configSnapshot: true,
      precioCalculado: true,
      precioFinal: true,
      configurado: true,
      orden: true,
    },
    orderBy: { orden: 'asc' },
  },
};

// ─── GET /quotes ───────────────────────────────────────────────────────────────

router.get('/', async (req, res) => {
  try {
    const quotes = await prisma.quote.findMany({
      where: { deletedAt: null },
      select: QUOTE_SELECT,
      orderBy: { fechaCreacion: 'desc' },
    });
    res.json(quotes);
  } catch (err) {
    console.error('[quotes GET /]', err);
    res.status(500).json({ message: 'Error al obtener cotizaciones.' });
  }
});

// ─── POST /quotes/next-folio ──────────────────────────────────────────────────

router.post('/next-folio', async (req, res) => {
  try {
    const folio = await generateFolio();
    res.json({ folio });
  } catch (err) {
    console.error('[quotes POST /next-folio]', err);
    res.status(500).json({ message: 'Error al generar folio.' });
  }
});

// ─── GET /quotes/:id ──────────────────────────────────────────────────────────

router.get('/:id', async (req, res) => {
  try {
    const quote = await prisma.quote.findFirst({
      where: { id: req.params.id, deletedAt: null },
      select: QUOTE_SELECT,
    });
    if (!quote) return res.status(404).json({ message: 'Cotización no encontrada.' });
    res.json(quote);
  } catch (err) {
    console.error('[quotes GET /:id]', err);
    res.status(500).json({ message: 'Error al obtener cotización.' });
  }
});

// ─── POST /quotes ─────────────────────────────────────────────────────────────

router.post('/', async (req, res) => {
  try {
    const body = req.body;
    const folio = body.folio || (await generateFolio());

    const quote = await prisma.quote.create({
      data: {
        folio,
        estatus:             body.estatus     || 'borrador',
        clienteId:           body.clienteId   || null,
        clienteSnapshot:     body.cliente     || body.clienteSnapshot || {},
        proyectoNombre:      body.proyecto?.nombre     || body.proyectoNombre || '',
        proyectoTipo: mapProyectoTipo(body.proyecto?.tipo || body.proyectoTipo || 'residencial-horizontal'),
        proyectoEstatus:     body.proyecto?.estatus    || body.proyectoEstatus || 'preventa',
        proyectoUbicacion:   body.proyecto?.ubicacion  || body.proyectoUbicacion || null,
        proyectoUnidades:    body.proyecto?.unidades   || body.proyectoUnidades  || null,
        proyectoSuperficie:  body.proyecto?.superficie || body.proyectoSuperficie || null,
        proyectoDescripcion: body.proyecto?.descripcion || body.proyectoDescripcion || null,
        proyectoMateriales:  body.proyecto?.materiales || body.proyectoMateriales || {},
        submarca:            body.submarca    || 'group',
        submarcaManual:      body.submarcaManual || false,
        esquemaPago:         mapEsquemaPago(body.esquemaPago || body.pago?.esquema) || 'doce_iguales',
        notasPago:           body.pago?.notas || body.notasPago || null,
        licenciaPrepagada:   body.licenciaPrepagada    || false,
        licenciaPrepagadaPrecio: body.licenciaPrepagadaPrecio || 20000,
        bundleAplicado:      body.descuentos?.bundle   || body.bundleAplicado || false,
        bundlePct:           body.descuentos?.bundlePct || body.bundlePct || 10,
        elementosPrevios:    body.descuentos?.elementosPrevios || body.elementosPrevios || false,
        elementosPreviosPct: body.descuentos?.elementosPreviosPct || body.elementosPreviosPct || 5,
        subtotal:            body.subtotal    || 0,
        descuentoPct:        body.descuentoPct || 0,
        descuentoTotal:      body.descuentoTotal || 0,
        ajusteManual:        body.ajusteManual  || 0,
        total:               body.total || 0,
        moneda:              body.moneda || 'MXN',
        creadoPor:           req.user.id,
        productos: {
          create: (body.productos || body.productos || []).map((p, idx) => ({
            productoId:      p.id || p.productoId,
            nombreSnapshot:  p.nombre || p.nombreSnapshot || p.id,
            configSnapshot:  p.config || p.configSnapshot || {},
            precioCalculado: p.precioCalculado || 0,
            precioFinal:     p.precioFinal || p.precioCalculado || 0,
            configurado:     p.configurado ?? false,
            orden:           p.orden ?? idx,
          })),
        },
      },
      select: QUOTE_SELECT,
    });

    // Registrar evento
    await prisma.quoteEvent.create({
      data: { quoteId: quote.id, eventType: 'creada', userId: req.user.id },
    });

    res.status(201).json(quote);
  } catch (err) {
    console.error('[quotes POST /]', err);
    res.status(500).json({ message: 'Error al crear cotización.' });
  }
});

// ─── PUT /quotes/:id ──────────────────────────────────────────────────────────

router.put('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body;

    // Verificar que exista y no esté eliminada
    const existing = await prisma.quote.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return res.status(404).json({ message: 'Cotización no encontrada.' });

    // Reconstruir productos si vienen en el body
    if (body.productos) {
      await prisma.quoteProducto.deleteMany({ where: { quoteId: id } });
    }

    const quote = await prisma.quote.update({
      where: { id },
      data: {
        ...(body.estatus           && { estatus: body.estatus }),
        ...(body.clienteSnapshot   && { clienteSnapshot: body.clienteSnapshot }),
        ...(body.cliente           && { clienteSnapshot: body.cliente }),
        ...(body.proyectoNombre    && { proyectoNombre: body.proyectoNombre }),
        ...(body.proyecto?.nombre  && { proyectoNombre: body.proyecto.nombre }),
        ...(body.proyecto?.tipo && { proyectoTipo: mapProyectoTipo(body.proyecto.tipo) }),
        ...(body.proyecto?.estatus && { proyectoEstatus: body.proyecto.estatus }),
        ...(body.proyecto?.ubicacion  && { proyectoUbicacion: body.proyecto.ubicacion }),
        ...(body.proyecto?.unidades   && { proyectoUnidades: body.proyecto.unidades }),
        ...(body.proyecto?.superficie && { proyectoSuperficie: body.proyecto.superficie }),
        ...(body.proyecto?.descripcion && { proyectoDescripcion: body.proyecto.descripcion }),
        ...(body.proyecto?.materiales  && { proyectoMateriales: body.proyecto.materiales }),
        ...(body.submarca          && { submarca: body.submarca }),
        ...(body.esquemaPago       && { esquemaPago: mapEsquemaPago(body.esquemaPago) }),
        ...(body.pago?.esquema     && { esquemaPago: mapEsquemaPago(body.pago.esquema) }),
        ...(body.pago?.notas !== undefined && { notasPago: body.pago.notas }),
        ...(body.subtotal !== undefined    && { subtotal: body.subtotal }),
        ...(body.descuentoPct !== undefined && { descuentoPct: body.descuentoPct }),
        ...(body.descuentoTotal !== undefined && { descuentoTotal: body.descuentoTotal }),
        ...(body.ajusteManual !== undefined && { ajusteManual: body.ajusteManual }),
        ...(body.total !== undefined       && { total: body.total }),
        ...(body.bundleAplicado !== undefined && { bundleAplicado: body.bundleAplicado }),
        ...(body.elementosPrevios !== undefined && { elementosPrevios: body.elementosPrevios }),
        fechaActualizacion: new Date(),
        ...(body.productos && {
          productos: {
            create: body.productos.map((p, idx) => ({
              productoId:      p.id || p.productoId,
              nombreSnapshot:  p.nombre || p.nombreSnapshot || p.id,
              configSnapshot:  p.config || p.configSnapshot || {},
              precioCalculado: p.precioCalculado || 0,
              precioFinal:     p.precioFinal || p.precioCalculado || 0,
              configurado:     p.configurado ?? false,
              orden:           p.orden ?? idx,
            })),
          },
        }),
      },
      select: QUOTE_SELECT,
    });

    await prisma.quoteEvent.create({
      data: { quoteId: id, eventType: 'actualizada', userId: req.user.id },
    });

    res.json(quote);
  } catch (err) {
    console.error('[quotes PUT /:id]', err);
    res.status(500).json({ message: 'Error al actualizar cotización.' });
  }
});

// ─── DELETE /quotes/:id (soft delete) ────────────────────────────────────────

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await prisma.quote.findFirst({ where: { id, deletedAt: null } });
    if (!existing) return res.status(404).json({ message: 'Cotización no encontrada.' });

    await prisma.quote.update({
      where: { id },
      data: { deletedAt: new Date() },
    });

    res.status(204).send();
  } catch (err) {
    console.error('[quotes DELETE /:id]', err);
    res.status(500).json({ message: 'Error al eliminar cotización.' });
  }
});

// ─── POST /quotes/:id/send ────────────────────────────────────────────────────
// Genera public_token y marca como enviada

router.post('/:id/send', async (req, res) => {
  try {
    const { id } = req.params;
    const { emails } = req.body;

    const token = nanoid(48);
    const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 días

    const quote = await prisma.quote.update({
      where: { id },
      data: {
        estatus:             'enviada',
        publicToken:         token,
        publicTokenExpiresAt: expires,
        enviadaAt:           new Date(),
        enviadaAEmails:      emails || [],
        fechaActualizacion:  new Date(),
      },
      select: QUOTE_SELECT,
    });

    await prisma.quoteEvent.create({
      data: {
        quoteId: id,
        eventType: 'enviada',
        userId: req.user.id,
        metadata: { emails },
      },
    });

    res.json(quote);
  } catch (err) {
    console.error('[quotes POST /:id/send]', err);
    res.status(500).json({ message: 'Error al enviar cotización.' });
  }
});

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * El frontend usa strings como '12-iguales', '40-30-30', etc.
 * Prisma enum usa valores mapeados. Esta función traduce.
 */
function mapEsquemaPago(value) {
  const map = {
    '12-iguales':   'doce_iguales',
    'iguala-mayor': 'iguala_mayor',
    '40-30-30':     'cuarenta_30_30',
    '50-50':        'cincuenta_50',
    'anticipo-12m': 'anticipo_12m',
    'bimestral':    'bimestral',
    'por-avance':   'por_avance',
    'custom':       'custom',
  };
  return map[value] || value;
}

function mapProyectoTipo(value) {
  const map = {
    'residencial-horizontal': 'residencial_horizontal',
    'residencial-vertical':   'residencial_vertical',
  };
  return map[value] || value;
}

export default router;
