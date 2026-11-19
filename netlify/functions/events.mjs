import { errorResponse, json, queryOf, readJson, requireAdmin, sb, verifySession } from '../lib/_shared.mjs';
import { appwriteDataConfigured, listAppwriteDataRecords, saveAppwriteDataRecord } from '../lib/appwrite.mjs';

export default async function handler(request) {
  try {
    const method = request.method.toUpperCase();
    if (!['GET', 'POST'].includes(method)) return json({ message: 'Método no permitido.' }, 405, { Allow: 'GET, POST' });
    if (method === 'GET') {
      if (!verifySession(request)) requireAdmin(request);
      const query = queryOf(request);
      if (appwriteDataConfigured) {
        let rows = await listAppwriteDataRecords('analytics');
        const eventType = query.get('event_type');
        if (eventType?.startsWith('eq.')) rows = rows.filter(row => row.event_type === eventType.slice(3));
        rows.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
        const offset = Math.max(0, Number(query.get('offset')) || 0);
        const limit = Math.max(1, Math.min(1000, Number(query.get('limit')) || 100));
        return json(rows.slice(offset, offset + limit));
      }
      const { body } = await sb(`/rest/v1/store_analytics_events?${query.toString()}`);
      return json(body || []);
    }
    const payload = await readJson(request);
    if (!['add_to_cart', 'whatsapp_click'].includes(payload.event_type)) return json({ message: 'Tipo de actividad no válido.' }, 400);
    const quantity = Math.max(1, Math.min(1000, Math.trunc(Number(payload.quantity) || 1)));
    if (appwriteDataConfigured) {
      const id = crypto.randomUUID();
      const row = await saveAppwriteDataRecord('analytics', id, {
        id, event_type: payload.event_type, product_id: payload.product_id || null,
        product_name: String(payload.product_name || 'Producto').slice(0, 200),
        quantity, created_at: new Date().toISOString()
      });
      return json(row, 201);
    }
    const { body } = await sb('/rest/v1/store_analytics_events', {
      method: 'POST', headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ event_type: payload.event_type, product_id: payload.product_id || null, product_name: String(payload.product_name || 'Producto').slice(0, 200), quantity })
    });
    return json(body?.[0] || { ok: true }, 201);
  } catch (error) { return errorResponse(error); }
}

export const config = { path: '/rest/v1/store_analytics_events' };
