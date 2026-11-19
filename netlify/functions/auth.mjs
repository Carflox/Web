import { createSession, errorResponse, fail, hashPassword, json, passwordsMatch, readJson, sb, verifySession } from '../lib/_shared.mjs';
import { appwriteDataConfigured, getAppwriteDataRecord } from '../lib/appwrite.mjs';

export default async function handler(request) {
  try {
    const url = new URL(request.url);
    const path = (url.pathname
      .replace(/^\/.netlify\/functions\/auth(?=\/|$)/, '')
      .replace(/\/index\.html$/i, '')
      .replace(/\.html$/i, '')) || '/';
    const action = url.searchParams.get('action');
    if ((action === 'login' || path === '/auth/v1/token' || path === '/v1/token' || path === '/token' || path === '/') && request.method === 'POST' && action !== 'logout') {
      const payload = await readJson(request);
      const email = String(payload.email || '').trim().toLowerCase();
      const expectedEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
      if (!expectedEmail || !process.env.SESSION_SECRET) return fail('Configura ADMIN_EMAIL, ADMIN_PASSWORD y SESSION_SECRET en las variables de Netlify.', 503);
      let passwordOkay = false;
      const password = String(payload.password || '');
      const stored = appwriteDataConfigured ? await getAppwriteDataRecord('admin-credentials', 'primary') : null;
      if (stored?.salt && stored?.password_hash) {
        passwordOkay = hashPassword(password, stored.salt) === stored.password_hash;
      } else if (process.env.ADMIN_PASSWORD_SALT && process.env.ADMIN_PASSWORD_HASH) {
        passwordOkay = hashPassword(password, process.env.ADMIN_PASSWORD_SALT) === process.env.ADMIN_PASSWORD_HASH;
        if (!passwordOkay && process.env.CONTEXT === 'dev' && process.env.ADMIN_PASSWORD) {
          passwordOkay = passwordsMatch(password, process.env.ADMIN_PASSWORD);
        }
      } else if (process.env.ADMIN_PASSWORD) {
        passwordOkay = passwordsMatch(password, process.env.ADMIN_PASSWORD);
      } else {
        const { body: storedCredentials } = await sb('/rest/v1/store_admin_credentials?id=eq.1&select=salt,password_hash');
        if (storedCredentials?.length) passwordOkay = hashPassword(password, storedCredentials[0].salt) === storedCredentials[0].password_hash;
      }
      if (email !== expectedEmail || !passwordOkay) return fail('Invalid login credentials', 400);
      const token = createSession(expectedEmail);
      const expiresIn = 60 * 60 * 24 * 14;
      return json({ access_token: token, token_type: 'bearer', expires_in: expiresIn, expires_at: Math.floor(Date.now() / 1000) + expiresIn });
    }
    if ((action === 'logout' || path === '/auth/v1/logout' || path === '/v1/logout' || path === '/logout') && request.method === 'POST') return json({ ok: true });
    if (path === '/api/session/check' && request.method === 'GET') return json(!!verifySession(request));
    return fail('Ruta de autenticación no encontrada.', 404);
  } catch (error) { return errorResponse(error); }
}

