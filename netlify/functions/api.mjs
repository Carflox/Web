import { randomBytes, randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';

import {
  errorResponse,
  fail,
  hashPassword,
  hashResetCode,
  json,
  newResetCode,
  readJson,
  requireAdmin,
  verifySession
} from '../lib/_shared.mjs';

import {
  appwriteConfigured,
  appwriteProductsBucketId,
  createAppwriteFile,
  deleteAppwriteFile,
  findAppwriteFileId,
  reserveAppwriteStock,
  listAppwriteDataRecords,
  getAppwriteDataRecord,
  saveAppwriteDataRecord,
  deleteAppwriteDataRecord,
  getAppwriteProducts,
  saveAppwriteProduct,
  updateAppwriteProduct,
  deleteAppwriteProduct
} from '../lib/appwrite.mjs';

const DATA_TYPES = {
  reset: 'password_reset',
  credentials: 'admin_credentials',
  analytics: 'store_analytics_events',
  finance: 'store_finance_entries',
  whatsapp: 'store_whatsapp_order_resolutions'
};

async function handleImage(request, pathname) {
  requireAdmin(request);

  const parts = pathname.split('/').slice(3).map(part => decodeURIComponent(part));
  const [bucket, ...pathParts] = parts;
  const imagePath = pathParts.join('/');
  const activeBucket = appwriteProductsBucketId;

  if (
    bucket !== activeBucket ||
    !imagePath ||
    imagePath.split('/').some(part => !part || part === '.' || part === '..')
  ) {
    return fail('Ruta de imagen no válida.', 400);
  }

  if (!['POST', 'DELETE'].includes(request.method)) {
    return fail('Método no permitido.', 405);
  }

  if (!appwriteConfigured) {
    return fail('Appwrite Storage no está configurado.', 503);
  }

  if (request.method === 'POST') {
    const type = request.headers.get('content-type') || '';

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
      return fail('Solo se aceptan imágenes JPG, PNG o WEBP.', 415);
    }

    const bytes = await request.arrayBuffer();

    if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024) {
      return fail('La imagen debe pesar entre 1 byte y 5 MB.', 400);
    }

    const file = await createAppwriteFile(
      imagePath.split(/[\\/]/).pop(),
      bytes,
      type
    );

    return json({ ok: true, fileId: file.$id }, 201);
  }

  const fileId = await findAppwriteFileId(imagePath);

  if (!fileId) {
    return json({ ok: true, removed: false });
  }

  await deleteAppwriteFile(fileId);
  return json({ ok: true });
}

async function passwordResetRequest(payload) {
  const email = String(payload.email || '').trim().toLowerCase();
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();

  if (email !== adminEmail) {
    return json({
      message: 'Si el correo coincide con la cuenta administradora, recibirás un código.'
    });
  }

  if (!process.env.SMTP_USER || !process.env.SMTP_APP_PASSWORD) {
    return fail('Configura el envío de correo SMTP en las variables de entorno.', 503);
  }

  const reset = await getAppwriteDataRecord(DATA_TYPES.reset, '1');
  const lastTime = reset?.requested_at ? Date.parse(reset.requested_at) : 0;

  if (lastTime && Date.now() - lastTime < 60000) {
    return fail('Espera un minuto antes de solicitar otro código.', 429);
  }

  const code = newResetCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await saveAppwriteDataRecord(DATA_TYPES.reset, '1', {
    id: '1',
    email,
    code_hash: hashResetCode(code),
    expires_at: expiresAt,
    requested_at: new Date().toISOString(),
    attempts: 0
  });

  try {
    const port = Number(process.env.SMTP_PORT || 587);

    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port,
      secure: port === 465,
      auth: {
        user: process.env.SMTP_USER,
        pass: (process.env.SMTP_APP_PASSWORD || '').replace(/\s/g, '')
      }
    });

    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'Código para recuperar YC NICE LADY',
      text: `Tu código de recuperación es ${code}. Vence en 10 minutos. Si no solicitaste este cambio, ignora este correo.`
    });
  } catch {
    await deleteAppwriteDataRecord(DATA_TYPES.reset, '1').catch(() => {});
    return fail('No se pudo enviar el código. Revisa la configuración SMTP.', 503);
  }

  return json({
    message: 'Si el correo coincide con la cuenta administradora, recibirás un código.'
  });
}

async function passwordResetConfirm(payload) {
  const email = String(payload.email || '').trim().toLowerCase();
  const code = String(payload.code || '').trim();
  const password = String(payload.password || '');

  if (email !== String(process.env.ADMIN_EMAIL || '').trim().toLowerCase()) {
    return fail('El código no es válido o venció.', 400);
  }

  if (password.length < 12) {
    return fail('La nueva contraseña debe tener al menos 12 caracteres.', 400);
  }

  const reset = await getAppwriteDataRecord(DATA_TYPES.reset, '1');

  if (
    !reset ||
    reset.email !== email ||
    Date.parse(reset.expires_at) <= Date.now() ||
    Number(reset.attempts || 0) >= 5 ||
    reset.code_hash !== hashResetCode(code)
  ) {
    if (reset && Number(reset.attempts || 0) < 5) {
      await saveAppwriteDataRecord(DATA_TYPES.reset, '1', {
        ...reset,
        attempts: Number(reset.attempts || 0) + 1
      });
    }

    return fail('El código no es válido o venció.', 400);
  }

  const salt = randomBytes(16).toString('hex');

  await saveAppwriteDataRecord(DATA_TYPES.credentials, '1', {
    id: '1',
    salt,
    password_hash: hashPassword(password, salt),
    updated_at: new Date().toISOString()
  });

  await deleteAppwriteDataRecord(DATA_TYPES.reset, '1');

  return json({
    message: 'Contraseña actualizada. Ya puedes iniciar sesión con la nueva contraseña.'
  });
}

async function handleOrders(payload) {
  const items = Array.isArray(payload.order_items) ? payload.order_items : [];

  if (!items.length || items.length > 100) {
    return fail('El pedido no contiene productos válidos.', 400);
  }

  const normalized = items.map(item => ({
    id: String(item.id || ''),
    quantity: Math.max(
      1,
      Math.min(1000, Math.trunc(Number(item.quantity) || 1))
    )
  }));

  if (normalized.some(item => !item.id)) {
    return fail('Hay un producto no válido en el pedido.', 400);
  }

  await reserveAppwriteStock(normalized);

  return json({ ok: true });
}

// The request authentication is handled by the route before this function.
async function handleFinance(request, url, method) {
  requireAdmin(request);

  if (method === 'GET') {
    const entries = await listAppwriteDataRecords(DATA_TYPES.finance);

    const id = url.searchParams.get('id');

    const filtered = id
      ? entries.filter(entry => String(entry.id) === String(id))
      : entries;

    return json(
      filtered.sort((a, b) =>
        String(b.created_at || '').localeCompare(String(a.created_at || ''))
      )
    );
  }

  if (method === 'POST') {
    const entry = await readJson(request);

    if (!['sale', 'expense'].includes(entry.entry_type) || !(Number(entry.amount) > 0)) {
      return fail('Revisa el tipo y el monto del movimiento.', 400);
    }

    const allowed = [
      'sale',
      'delivery',
      'gasolina',
      'material_moto',
      'productos',
      'empaque',
      'otros'
    ];

    if (!allowed.includes(entry.category)) {
      return fail('La categoría no es válida.', 400);
    }

    const id = randomUUID();

    const data = {
      id,
      entry_type: entry.entry_type,
      category: entry.category,
      description: String(entry.description || '').slice(0, 160),
      supplier: entry.supplier || null,
      amount: Number(entry.amount),
      product_id: entry.product_id || null,
      product_name: String(entry.product_name || '').trim().slice(0, 90) || null,
      quantity: Math.max(1, Number(entry.quantity) || 1),
      cost_amount: Number(entry.cost_amount) || 0,
      analytics_event_id: entry.analytics_event_id || null,
      created_at: entry.created_at || new Date().toISOString()
    };

    const saved = await saveAppwriteDataRecord(DATA_TYPES.finance, id, data);

    return json(saved, 201);
  }

  if (method === 'DELETE') {
    const id = url.searchParams.get('id');

    if (!id) {
      return fail('Falta el identificador del movimiento.', 400);
    }

    await deleteAppwriteDataRecord(DATA_TYPES.finance, id);
    return json({ ok: true });
  }

  return fail('Método no permitido.', 405);
}

async function handleDismissedWhatsApp(request, url, method) {
  requireAdmin(request);

  if (method === 'GET') {
    const records = await listAppwriteDataRecords(DATA_TYPES.whatsapp);

    return json(records.map(row => String(row.analytics_event_id)));
  }

  if (method === 'POST') {
    const payload = await readJson(request);

    if (!payload.event_id) {
      return fail('Falta event_id.', 400);
    }

    const id = String(payload.event_id);

    await saveAppwriteDataRecord(DATA_TYPES.whatsapp, id, {
      id,
      analytics_event_id: Number(payload.event_id),
      resolution: 'not_sold'
    });

    return json({ ok: true }, 201);
  }

  if (method === 'DELETE') {
    const eventId = url.searchParams.get('event_id');

    if (!eventId) {
      return fail('Falta event_id.', 400);
    }

    await deleteAppwriteDataRecord(DATA_TYPES.whatsapp, eventId);
    return json({ ok: true });
  }

  return fail('Método no permitido.', 405);
}

export default async function handler(request) {
  try {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (path.startsWith('/api/images/')) {
      return await handleImage(request, path);
    }

    if (path === '/api/session' && method === 'GET') {
      return json({ authenticated: !!verifySession(request) });
    }

    if (path === '/api/password-reset/request' && method === 'POST') {
      return await passwordResetRequest(await readJson(request));
    }

    if (path === '/api/password-reset/confirm' && method === 'POST') {
      return await passwordResetConfirm(await readJson(request));
    }

    if (path === '/api/orders' && method === 'POST') {
      return await handleOrders(await readJson(request));
    }

    if (path === '/api/events/import' && method === 'POST') {
      requireAdmin(request);
      const payload = await readJson(request);

      if (!Array.isArray(payload.events)) {
        return fail('La importación de actividad debe ser una lista.', 400);
      }

      const events = payload.events
        .filter(item => ['add_to_cart', 'whatsapp_click'].includes(item.event_type))
        .map(item => ({
          id: randomUUID(),
          event_type: item.event_type,
          product_id: item.product_id || null,
          product_name: String(item.product_name || 'Producto').slice(0, 200),
          quantity: Math.max(1, Math.min(1000, Number(item.quantity) || 1)),
          created_at: item.created_at || new Date().toISOString()
        }));

      for (const event of events) {
        await saveAppwriteDataRecord(DATA_TYPES.analytics, event.id, event);
      }

      return json({ ok: true, imported: events.length }, 201);
    }

    if (path === '/api/finance') {
      return await handleFinance(request, url, method);
    }

    if (path === '/api/dismissed-whatsapp') {
      return await handleDismissedWhatsApp(request, url, method);
    }

    // PRODUCTOS APPWRITE
    if (path === '/api/products' && method === 'GET') {
      const data = await getAppwriteProducts(url.searchParams);
      return json(data);
    }

    if (path === '/api/products' && method === 'POST') {
      requireAdmin(request);
        const payload = await readJson(request);
          const result = await saveAppwriteProduct(payload);
      return json(result, 201);
    }

    if (path.startsWith('/api/products/') && method === 'PUT') {
      requireAdmin(request);
        const productId = decodeURIComponent(path.split('/').pop());
          const payload = await readJson(request);
            const result = await updateAppwriteProduct(productId, payload);
      return json(result);
    }

    if (path.startsWith('/api/products/') && method === 'DELETE') {
      requireAdmin(request);
        const productId = decodeURIComponent(path.split('/').pop());
      await deleteAppwriteProduct(productId);
        return json({ ok: true });
    }

    return fail('Ruta API no encontrada.', 404);
  } catch (error) {
    return errorResponse(error);
  }
}

export const config = { path: '/api/*' };
