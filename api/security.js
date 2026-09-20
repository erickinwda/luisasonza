// security.js - Funções compartilhadas de segurança
// Criptografia, rate limiting, headers e validações

const crypto = require('crypto');

function deriveEncryptionKey() {
  const secret = process.env.BUCKPAY_SECRET_TOKEN;
  if (!secret) {
    throw new Error('BUCKPAY_SECRET_TOKEN não configurado');
  }
  return crypto.createHash('sha256').update(secret).update('payment-token-v1').digest();
}

function toBase64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function fromBase64Url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  return Buffer.from(str, 'base64');
}

function obfuscateExternalId(externalId) {
  if (!externalId) return null;
  try {
    const key = deriveEncryptionKey();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(String(externalId), 'utf8'),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();
    return toBase64Url(Buffer.concat([iv, tag, encrypted]));
  } catch (e) {
    return null;
  }
}

function deobfuscateExternalId(token) {
  if (!token) return null;
  try {
    const key = deriveEncryptionKey();
    const raw = fromBase64Url(token);
    if (raw.length < 12 + 16 + 8) return null;
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final()
    ]);
    return decrypted.toString('utf8');
  } catch (e) {
    return null;
  }
}

function getClientIp(req) {
  const forwarded = req.headers && req.headers['x-forwarded-for'];
  if (forwarded) {
    return forwarded.split(',')[0].trim();
  }
  return (req.connection && req.connection.remoteAddress) ||
         (req.socket && req.socket.remoteAddress) ||
         'unknown';
}

function setSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
}

function isValidExternalId(id) {
  return typeof id === 'string' && /^[a-zA-Z0-9_\-]{8,128}$/.test(id);
}

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;
const rateLimitStore = new Map();

function isRateLimited(ip, maxRequests, windowMs) {
  const max = maxRequests || RATE_LIMIT_MAX;
  const window = windowMs || RATE_LIMIT_WINDOW_MS;
  const now = Date.now();
  const key = ip || 'unknown';
  const entry = rateLimitStore.get(key);
  if (!entry || now - entry.start > window) {
    rateLimitStore.set(key, { count: 1, start: now });
    return false;
  }
  entry.count++;
  return entry.count > max;
}

module.exports = {
  obfuscateExternalId,
  deobfuscateExternalId,
  getClientIp,
  setSecurityHeaders,
  isValidExternalId,
  isRateLimited
};
