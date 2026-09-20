const crypto = require('crypto');
const { processWebhook } = require('../webhook.js');

const webhookTokenValue = process.env.BUCKPAY_WEBHOOK_SECRET || process.env.BUCKPAY_WEBHOOK_TOKEN;

function validarAssinatura(rawBody, signature) {
  if (!webhookTokenValue || !signature) return false;

  let expectedHex = null;
  try {
    expectedHex = crypto
      .createHmac('sha256', webhookTokenValue)
      .update(rawBody)
      .digest('hex');
  } catch {
    return false;
  }

  const sig = String(signature).trim().toLowerCase();
  const candidates = [];

  if (sig.startsWith('sha256=')) {
    candidates.push(sig.replace(/^sha256=/, ''));
  } else {
    candidates.push(sig);
  }

  for (const candidate of candidates) {
    try {
      const expectedBuf = Buffer.from(expectedHex, 'hex');
      const candidateBuf = Buffer.from(candidate, 'hex');
      if (expectedBuf.length === candidateBuf.length && crypto.timingSafeEqual(expectedBuf, candidateBuf)) {
        return true;
      }
    } catch {
      continue;
    }
  }

  return false;
}

module.exports = async (req, res) => {
  const contentType = req.headers['content-type'] || '';
  if (contentType && contentType.indexOf('application/json') === -1) {
    console.warn('Webhook rejeitado: content-type inválido');
    return res.status(415).json({ error: 'Content-Type inválido' });
  }

  const rawBodyLength = parseInt(req.headers['content-length'] || '0', 10);
  if (rawBodyLength > 262144) {
    console.warn('Webhook rejeitado: body muito grande');
    return res.status(413).json({ error: 'Body muito grande' });
  }

  const ALLOWED_WEBHOOK_IPS = process.env.BUCKPAY_WEBHOOK_IPS;
  if (ALLOWED_WEBHOOK_IPS) {
    const forwarded = req.headers['x-forwarded-for'];
    const clientIp = forwarded ? forwarded.split(',')[0].trim() :
      (req.connection && req.connection.remoteAddress) || (req.socket && req.socket.remoteAddress) || '';
    const allowed = ALLOWED_WEBHOOK_IPS.split(',').map(ip => ip.trim()).filter(Boolean);
    if (allowed.length > 0 && allowed.indexOf(clientIp) === -1) {
      console.warn('Webhook rejeitado por IP não autorizado:', clientIp);
      return res.status(403).json({ error: 'IP não autorizado' });
    }
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});

  const signature =
    req.headers['x-buckpay-signature'] ||
    req.headers['x-signature'] ||
    req.headers['signature'] ||
    req.headers['her2'] ||
    req.headers['x-her2'];

  if (!webhookTokenValue) {
    console.error('BUCKPAY_WEBHOOK_SECRET não configurado');
    return res.status(500).json({ error: 'Configuração de webhook inválida' });
  }
  if (!signature) {
    console.warn('Assinatura ausente no webhook');
    return res.status(401).json({ error: 'Assinatura inválida' });
  }
  if (!validarAssinatura(rawBody, signature)) {
    console.warn('Webhook com assinatura inválida');
    return res.status(401).json({ error: 'Assinatura inválida' });
  }

  try {
    const body = req.body || {};
    const eventType =
      body.event ||
      body.type ||
      body.event_type ||
      req.headers['x-buckpay-event'];

    if (!eventType) {
      console.log('Webhook recebido sem event type. Body:', JSON.stringify(body));
      return res.status(200).json({ received: true });
    }

    await processWebhook(body, eventType);

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Erro ao processar webhook:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};
