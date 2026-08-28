// API Endpoint: Webhook Handler
// POST /api/webhook
// Recebe eventos da BuckPay (transaction.created, transaction.processed)

const crypto = require('crypto');
const { processWebhook } = require('../webhook.js');

function validarAssinatura(rawBody, signature) {
  const webhookToken = process.env.BUCKPAY_WEBHOOK_TOKEN;
  if (!webhookToken || !signature) return false;

  const expected = crypto
    .createHmac('sha256', webhookToken)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature)
    );
  } catch {
    return false;
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});

  const signature =
    req.headers['x-buckpay-signature'] ||
    req.headers['x-signature'] ||
    req.headers['signature'];

  const webhookToken = process.env.BUCKPAY_WEBHOOK_TOKEN;
  if (webhookToken) {
    if (!validarAssinatura(rawBody, signature)) {
      console.warn('Webhook com assinatura inválida ou ausente');
      return res.status(401).json({ error: 'Assinatura inválida' });
    }
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
