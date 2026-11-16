import { randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { errorResponse, fail, hashPassword, hashResetCode, json, newResetCode, productsBucket, queryOf, readJson, requireAdmin, sb, supabaseUrl, verifySession } from '../lib/_shared.mjs';

async function handleImage(request, pathname) {
  requireAdmin(request);
  const parts = pathname.split('/').slice(3).map(part => decodeURIComponent(part));
  const [bucket, ...pathParts] = parts;
  const imagePath = pathParts.join('/');
  if (bucket !== productsBucket || !imagePath.startsWith('products/') || imagePath.split('/').some(part => !part || part === '.' || part === '..')) return fail('Ruta de imagen no válida.', 400);
  if (!['POST', 'DELETE'].includes(request.method)) return fail('Método no permitido.', 405);
  if (request.method === 'POST') {
    const type = request.headers.get('content-type') || '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) return fail('Solo se aceptan imágenes JPG, PNG o WEBP.', 415);
    const bytes = await request.arrayBuffer();
    if (!bytes.byteLength || bytes.byteLength > 5 * 1024 * 1024) return fail('La imagen debe pesar entre 1 byte y 5 MB.', 400);
    const response = await fetch(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${imagePath.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'POST', headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': type, 'x-upsert': 'false', 'cache-control': '3600' }, body: bytes
    });
    const text = await response.text();
    if (!response.ok) throw Object.assign(new Error(text || 'Storage rechazó la imagen.'), { status: response.status });
    return json({ ok: true }, response.status);
  }
  const response = await fetch(`${supabaseUrl}/storage/v1/object/${encodeURIComponent(bucket)}/${imagePath.split('/').map(encodeURIComponent).join('/')}`, {
    method: 'DELETE', headers: { apikey: process.env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}` }
  });
  if (!response.ok) throw Object.assign(new Error('No se pudo eliminar la imagen.'), { status: response.status });
  return json({ ok: true });
}

async function passwordResetRequest(payload) {
  const email = String(payload.email || '').trim().toLowerCase();
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  if (email !== adminEmail) return json({ message: 'Si el correo coincide con la cuenta administradora, recibirás un código.' });
  if (!process.env.SMTP_USER || !process.env.SMTP_APP_PASSWORD) return fail('Configura el envío de correo SMTP en las variables de Netlify.', 503);
  const { body: rows } = await sb('/rest/v1/store_admin_password_resets?id=eq.1&select=requested_at');
  const lastTime = rows?.[0]?.requested_at ? Date.parse(rows[0].requested_at) : 0;
  if (lastTime && Date.now() - lastTime < 60000) return fail('Espera un minuto antes de solicitar otro código.', 429);
  const code = newResetCode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  await sb('/rest/v1/store_admin_password_resets?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: 1, email, code_hash: hashResetCode(code), expires_at: expiresAt, requested_at: new Date().toISOString(), attempts: 0 }) });
  try {
    const port = Number(process.env.SMTP_PORT || 587);
    const transport = nodemailer.createTransport({ host: process.env.SMTP_HOST || 'smtp.gmail.com', port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: (process.env.SMTP_APP_PASSWORD || '').replace(/\\s/g, '') } });
    await transport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: email, subject: 'Código para recuperar YC NICE LADY', text: `Tu código de recuperación es ${code}. Vence en 10 minutos. Si no solicitaste este cambio, ignora este correo.` });
  } catch {
    await sb('/rest/v1/store_admin_password_resets?id=eq.1', { method: 'DELETE' }).catch(() => {});
    return fail('No se pudo enviar el código. Revisa la configuración SMTP de Netlify.', 503);
  }
  return json({ message: 'Si el correo coincide con la cuenta administradora, recibirás un código.' });
}

async function passwordResetConfirm(payload) {
  const email = String(payload.email || '').trim().toLowerCase();
  const code = String(payload.code || '').trim();
  const password = String(payload.password || '');
  if (email !== String(process.env.ADMIN_EMAIL || '').trim().toLowerCase()) return fail('El código no es válido o venció.', 400);
  if (password.length < 12) return fail('La nueva contraseña debe tener al menos 12 caracteres.', 400);
  const { body: rows } = await sb('/rest/v1/store_admin_password_resets?id=eq.1&select=*');
  const reset = rows?.[0];
  if (!reset || reset.email !== email || Date.parse(reset.expires_at) <= Date.now() || Number(reset.attempts || 0) >= 5 || reset.code_hash !== hashResetCode(code)) {
    if (reset && Number(reset.attempts || 0) < 5) await sb('/rest/v1/store_admin_password_resets?id=eq.1', { method: 'PATCH', body: JSON.stringify({ attempts: Number(reset.attempts || 0) + 1 }) });
    return fail('El código no es válido o venció.', 400);
  }
  const salt = randomBytes(16).toString('hex');
  await sb('/rest/v1/store_admin_credentials?on_conflict=id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ id: 1, salt, password_hash: hashPassword(password, salt), updated_at: new Date().toISOString() }) });
  await sb('/rest/v1/store_admin_password_resets?id=eq.1', { method: 'DELETE' });
  return json({ message: 'Contraseña actualizada. Ya puedes iniciar sesión con la nueva contraseña.' });
}

export default async function handler(request) {
  try {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method.toUpperCase();

    if (path.startsWith('/api/images/')) return await handleImage(request, path);
    if (path === '/api/session' && method === 'GET') return json({ authenticated: !!verifySession(request) });
    if (path === '/api/password-reset/request' && method === 'POST') return await passwordResetRequest(await readJson(request));
    if (path === '/api/password-reset/confirm' && method === 'POST') return await passwordResetConfirm(await readJson(request));

    if (path === '/api/orders' && method === 'POST') {
      const payload = await readJson(request);
      const items = Array.isArray(payload.order_items) ? payload.order_items : [];
      if (!items.length || items.length > 100) return fail('El pedido no contiene productos válidos.', 400);
      const normalized = items.map(item => ({ id: String(item.id || ''), quantity: Math.max(1, Math.min(1000, Math.trunc(Number(item.quantity) || 1))) }));
      if (normalized.some(item => !/^[0-9a-f-]{36}$/i.test(item.id))) return fail('Hay un producto no válido en el pedido.', 400);
      await sb('/rest/v1/rpc/reserve_store_stock', { method: 'POST', body: JSON.stringify({ order_items: normalized }) });
      return json({ ok: true });
    }

    if (path === '/api/events/import' && method === 'POST') {
      requireAdmin(request);
      const payload = await readJson(request);
      if (!Array.isArray(payload.events)) return fail('La importación de actividad debe ser una lista.', 400);
      const events = payload.events.filter(item => ['add_to_cart', 'whatsapp_click'].includes(item.event_type)).map(item => ({
        event_type: item.event_type, product_id: item.product_id || null,
        product_name: String(item.product_name || 'Producto').slice(0, 200), quantity: Math.max(1, Math.min(1000, Number(item.quantity) || 1)), created_at: item.created_at || new Date().toISOString()
      }));
      if (events.length) await sb('/rest/v1/store_analytics_events', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(events) });
      return json({ ok: true, imported: events.length }, 201);
    }

    if (path === '/api/finance') {
      requireAdmin(request);
      if (method === 'GET') {
        const { body } = await sb(`/rest/v1/store_finance_entries?select=*&order=created_at.desc${url.searchParams.get('id') ? `&id=eq.${encodeURIComponent(url.searchParams.get('id'))}` : ''}`);
        return json(body || []);
      }
      if (method === 'POST') {
        const entry = await readJson(request);
        if (!['sale', 'expense'].includes(entry.entry_type) || !(Number(entry.amount) > 0)) return fail('Revisa el tipo y el monto del movimiento.', 400);
        const allowed = ['sale', 'delivery', 'gasolina', 'material_moto', 'productos', 'empaque', 'otros'];
        if (!allowed.includes(entry.category)) return fail('La categoría no es válida.', 400);
        const data = { entry_type: entry.entry_type, category: entry.category, description: String(entry.description || '').slice(0, 160), supplier: entry.supplier || null, amount: Number(entry.amount), product_id: entry.product_id || null, quantity: Math.max(1, Number(entry.quantity) || 1), cost_amount: Number(entry.cost_amount) || 0, analytics_event_id: entry.analytics_event_id || null, ...(entry.created_at ? { created_at: entry.created_at } : {}) };
        const { body } = await sb('/rest/v1/store_finance_entries', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify(data) });
        return json(body?.[0] || { ok: true }, 201);
      }
      if (method === 'DELETE') {
        const id = url.searchParams.get('id');
        if (!id) return fail('Falta el identificador del movimiento.', 400);
        await sb(`/rest/v1/store_finance_entries?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
        return json({ ok: true });
      }
      return fail('Método no permitido.', 405);
    }

    if (path === '/api/dismissed-whatsapp') {
      requireAdmin(request);
      if (method === 'GET') {
        const { body } = await sb('/rest/v1/store_whatsapp_order_resolutions?select=analytics_event_id');
        return json((body || []).map(row => String(row.analytics_event_id)));
      }
      if (method === 'POST') {
        const payload = await readJson(request);
        if (!payload.event_id) return fail('Falta event_id.', 400);
        await sb('/rest/v1/store_whatsapp_order_resolutions?on_conflict=analytics_event_id', { method: 'POST', headers: { Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify({ analytics_event_id: Number(payload.event_id), resolution: 'not_sold' }) });
        return json({ ok: true }, 201);
      }
      if (method === 'DELETE') {
        const eventId = url.searchParams.get('event_id');
        await sb(`/rest/v1/store_whatsapp_order_resolutions?analytics_event_id=eq.${encodeURIComponent(eventId)}`, { method: 'DELETE' });
        return json({ ok: true });
      }
    }
    return fail('Ruta API no encontrada.', 404);
  } catch (error) { return errorResponse(error); }
}

export const config = { path: '/api/*' };
