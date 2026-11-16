import { createSession, errorResponse, fail, hashPassword, json, passwordsMatch, readJson, sb, verifySession } from '../lib/_shared.mjs';

export default async function handler(request) {
  try {
    const url = new URL(request.url);
    if (url.pathname === '/auth/v1/token' && request.method === 'POST') {
      const payload = await readJson(request);
      const email = String(payload.email || '').trim().toLowerCase();
      const expectedEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      if (!expectedEmail || !process.env.SESSION_SECRET) return fail('Configura ADMIN_EMAIL, ADMIN_PASSWORD y SESSION_SECRET en las variables de Netlify.', 503);
      let passwordOkay = false;
      const password = String(payload.password || '');
      if (process.env.ADMIN_PASSWORD_SALT && process.env.ADMIN_PASSWORD_HASH) {
        passwordOkay = hashPassword(password, process.env.ADMIN_PASSWORD_SALT) === process.env.ADMIN_PASSWORD_HASH;
      } else {
        const { body: stored } = await sb('/rest/v1/store_admin_credentials?id=eq.1&select=salt,password_hash');
        if (stored?.length) passwordOkay = hashPassword(password, stored[0].salt) === stored[0].password_hash;
        else passwordOkay = passwordsMatch(password, process.env.ADMIN_PASSWORD || '');
      }
      if (email !== expectedEmail || !passwordOkay) return fail('Invalid login credentials', 400);
      const token = createSession(expectedEmail);
      const expiresIn = 60 * 60 * 24 * 14;
      return json({ access_token: token, token_type: 'bearer', expires_in: expiresIn, expires_at: Math.floor(Date.now() / 1000) + expiresIn });
    }
    if (url.pathname === '/auth/v1/logout' && request.method === 'POST') return json({ ok: true });
    if (url.pathname === '/rest/v1/rpc/is_store_admin' && request.method === 'POST') return json(!!verifySession(request));
    return fail('Ruta de autenticación no encontrada.', 404);
  } catch (error) { return errorResponse(error); }
}

export const config = { path: ['/auth/*', '/rest/v1/rpc/is_store_admin'] };
