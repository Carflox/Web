import { errorResponse, json, queryOf, readJson, requireAdmin, sb, verifySession } from '../lib/_shared.mjs';
import {
  appwriteConfigured, deleteAppwriteProduct, getAppwriteProducts,
  saveAppwriteProduct, updateAppwriteProduct
} from '../lib/appwrite.mjs';

export default async function handler(request) {
  try {
    const method = request.method.toUpperCase();
    const admin = method === 'GET' ? !!verifySession(request) : true;
    if (method !== 'GET') requireAdmin(request);
    if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(method)) return json({ message: 'Método no permitido.' }, 405, { Allow: 'GET, POST, PATCH, DELETE' });

    const query = queryOf(request);
    if (appwriteConfigured) {
      if (method === 'GET') {
        const rows = await getAppwriteProducts(query);
        if (admin) return json(rows);
        return json(rows.map(({ cost_price, supplier, sort_order, ...product }) => product));
      }
      if (method === 'POST') {
        const payload = await readJson(request);
        const saved = await saveAppwriteProduct(payload);
        return json(saved, 201);
      }
      const idFilter = query.get('id') || '';
      const productId = idFilter.startsWith('eq.') ? decodeURIComponent(idFilter.slice(3)) : '';
      if (!productId) return json({ message: 'Falta un identificador de producto válido.' }, 400);
      if (method === 'PATCH') return json(await updateAppwriteProduct(productId, await readJson(request)));
      if (method === 'DELETE') {
        const deleted = await deleteAppwriteProduct(productId);
        return deleted ? json({ ok: true }) : json({ message: 'No se encontró el producto.' }, 404);
      }
    }
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
