import { errorResponse, json, queryOf, readJson, requireAdmin, sb, verifySession } from '../lib/_shared.mjs';

export default async function handler(request) {
  try {
    const method = request.method.toUpperCase();
    if (!['GET', 'POST'].includes(method)) return json({ message: 'Método no permitido.' }, 405, { Allow: 'GET, POST' });
    if (method === 'GET') {
      if (!verifySession(request)) requireAdmin(request);
      const { body } = await sb(`/rest/v1/store_analytics_events?${queryOf(request).toString()}`);
      return json(body || []);
    }
    const payload = await readJson(request);
    if (!['add_to_cart', 'whatsapp_click'].includes(payload.event_type)) return json({ message: 'Tipo de actividad no válido.' }, 400);
    const quantity = Math.max(1, Math.min(1000, Math.trunc(Number(payload.quantity) || 1)));
    const { body } = await sb('/rest/v1/store_analytics_events', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ event_type: payload.event_type, product_id: payload.product_id || null, product_name: String(payload.product_name || 'Producto').slice(0, 200), quantity })
    });
    return json(body?.[0] || { ok: true }, 201);
  } catch (error) { return errorResponse(error); }
}

export const config = { path: '/rest/v1/store_analytics_events' };
