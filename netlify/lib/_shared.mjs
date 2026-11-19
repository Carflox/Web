import { createHmac, timingSafeEqual, pbkdf2Sync, randomInt, createHash } from 'node:crypto';

export const supabaseUrl = (process.env.SUPABASE_URL || 'https://kwqoowouazoqmneejuxz.supabase.co').replace(/\/$/, '');
export const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
export const productsBucket = process.env.SUPABASE_PRODUCTS_BUCKET || 'product-images';

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}
export function fail(message, status = 400) { return json({ message }, status); }
export async function readJson(request) { try { return await request.json(); } catch { throw Object.assign(new Error('El contenido enviado no es JSON válido.'), { status: 400 }); } }
export function assertConfigured() { if (!serviceKey) throw new Error('Configura SUPABASE_SERVICE_ROLE_KEY en las variables de Netlify.'); }

export async function sb(path, options = {}) {
  assertConfigured();

  const headers = new Headers(options.headers || {});
  headers.set('apikey', serviceKey);
  headers.set('Authorization', `Bearer ${serviceKey}`);

  if (
    options.body !== undefined &&
    !(options.body instanceof ArrayBuffer) &&
    !headers.has('Content-Type')
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${supabaseUrl}${path}`, {
    ...options,
    headers
  });

  const text = await response.text();
  let body = null;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  if (!response.ok) {
    const message =
      body && typeof body === 'object'
        ? (body.message || body.error_description || body.error || body.hint)
        : body;

    throw Object.assign(
      new Error(message || `Supabase respondió ${response.status}.`),
      { status: response.status }
    );
  }

  return { body, response };
}

const encode = value => Buffer.from(value).toString('base64url');

export function createSession(email) {
  const secret = process.env.SESSION_SECRET || '';
  if (!secret) throw new Error('Configura SESSION_SECRET en Netlify.');

  const now = Math.floor(Date.now() / 1000);
  const head = encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = encode(JSON.stringify({
    sub: email,
    iat: now,
    exp: now + 60 * 60 * 24 * 14
  }));

  const unsigned = `${head}.${payload}`;

  return `${unsigned}.${createHmac('sha256', secret)
    .update(unsigned)
    .digest('base64url')}`;
}

export function verifySession(request) {
  const token = (request.headers.get('authorization') || '')
    .replace(/^Bearer\s+/i, '')
    .trim();

  const [head, payload, signature, extra] = token.split('.');

  if (!head || !payload || !signature || extra || !process.env.SESSION_SECRET) {
    return null;
  }

  const expected = createHmac('sha256', process.env.SESSION_SECRET)
    .update(`${head}.${payload}`)
    .digest();

  const actual = Buffer.from(signature, 'base64url');

  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    return null;
  }

  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString());

    return claims.sub && claims.exp > Date.now() / 1000 ? claims : null;
  } catch {
    return null;
  }
}

export function requireAdmin(request) {
  const claims = verifySession(request);

  if (
    !claims ||
    claims.sub.toLowerCase() !==
      (process.env.ADMIN_EMAIL || '').trim().toLowerCase()
  ) {
    throw Object.assign(
      new Error('Sesión vencida. Ingresa nuevamente al panel.'),
      { status: 401 }
    );
  }

  return claims;
}
export function passwordsMatch(candidate, expected) {
  const a = Buffer.from(String(candidate)); const b = Buffer.from(String(expected));
  return a.length === b.length && timingSafeEqual(a, b);
}
export const hashPassword = (password, salt) => pbkdf2Sync(password, Buffer.from(salt, 'hex'), 310000, 32, 'sha256').toString('hex');
export const hashResetCode = code => createHash('sha256').update(String(code)).digest('hex');
export const newResetCode = () => String(randomInt(0, 1000000)).padStart(6, '0');
export const queryOf = request => new URL(request.url).searchParams;
export function errorResponse(error) {
  const status = Number(error?.status) || 500;
  return json({ message: status === 500 && !error?.status ? 'Error interno del servidor.' : String(error.message || 'No se pudo completar la operación.') }, status);
}
