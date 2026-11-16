import { errorResponse, json, queryOf, readJson, requireAdmin, sb, verifySession } from '../lib/_shared.mjs';

export default async function handler(request) {
  try {
    const method = request.method.toUpperCase();
    const admin = method === 'GET' ? !!verifySession(request) : true;
    if (method !== 'GET') requireAdmin(request);
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) return json({ message: 'Método no permitido.' }, 405, { Allow: 'GET, POST, PATCH, DELETE' });

    const query = queryOf(request);
    if (method === 'GET') {
      if (!admin) query.set('is_active', 'eq.true');
      const { body } = await sb(`/rest/v1/products?${query.toString()}`);
      if (admin) return json(body || []);
      return json((body || []).map(({ cost_price, supplier, sort_order, ...product }) => product));
    }

    const payload = method === 'DELETE' ? undefined : await readJson(request);
    const prefer = method === 'POST'
      ? 'resolution=merge-duplicates,return=minimal'
      : 'return=minimal';
    const url = `/rest/v1/products${query.size ? `?${query.toString()}` : ''}`;
    const { response, body } = await sb(url, {
      method,
      headers: { Prefer: prefer },
      ...(payload === undefined ? {} : { body: JSON.stringify(payload) })
    });
    return json(body || { ok: true }, method === 'POST' ? 201 : response.status || 200);
  } catch (error) { return errorResponse(error); }
}

export const config = { path: '/rest/v1/products' };
