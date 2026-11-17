import { errorResponse, json, sb } from '../lib/_shared.mjs';
import { appwriteConfigured, appwriteImageUrl, getAppwriteProducts } from '../lib/appwrite.mjs';

const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);

export default async function handler(request, context) {
  try {
    const compact = context?.params?.compactId || new URL(request.url).pathname.split('/').pop();
    if (!/^[A-Za-z0-9_-]{22}$/.test(compact)) return new Response('Enlace de producto no válido', { status: 404 });
    const id = Buffer.from(compact, 'base64url').toString('hex').match(/.{8}|.{4}|.{4}|.{4}|.{12}/g)?.join('-');
    if (!id || id.length !== 36) return new Response('Enlace de producto no válido', { status: 404 });
    let product;
    if (appwriteConfigured) {
      const products = await getAppwriteProducts(new URLSearchParams({ id: `eq.${id}`, is_active: 'eq.true' }));
      product = products[0];
    } else {
      const { body } = await sb(`/rest/v1/products?id=eq.${encodeURIComponent(id)}&is_active=eq.true&select=id,name,price,image_path&limit=1`);
      product = body?.[0];
    }
    if (!product?.image_path) return new Response('No se encontró la foto del producto', { status: 404 });
    const imagePath = String(product.image_path).split('/').map(encodeURIComponent).join('/');
    const image = appwriteConfigured
      ? appwriteImageUrl(product.image_path)
      : `${process.env.SUPABASE_URL.replace(/\/$/, '')}/storage/v1/object/public/${encodeURIComponent(process.env.SUPABASE_PRODUCTS_BUCKET || 'product-images')}/${imagePath}`;
    const origin = new URL(request.url).origin;
    const title = `${product.name} | YC NICE LADY`;
    const description = `${product.name} · S/ ${Number(product.price || 0).toFixed(2)} · YC NICE LADY`;
    const url = `${origin}/f/${compact}`;
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta property="og:type" content="product"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:image" content="${esc(image)}"><meta property="og:url" content="${esc(url)}"><meta name="twitter:card" content="summary_large_image"><meta http-equiv="refresh" content="0;url=/"></head><body><a href="/">Ver ${esc(product.name)} en YC NICE LADY</a></body></html>`;
    return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  } catch (error) { return errorResponse(error); }
}

export const config = { path: '/f/:compactId' };
