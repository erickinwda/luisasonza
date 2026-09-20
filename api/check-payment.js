// API Endpoint: Check Payment Status
// GET /api/payment-status?token=xxx
// SÓ RETORNA O LINK APÓS PAGAMENTO CONFIRMADO (status === 'paid')
// Com fallback CAPI Purchase caso o webhook não dispare
// Rate limiting, validação, criptografia e segurança

const https = require('https');
const { getPaymentStatus, setPaymentStatus } = require('./webhook.js');
const { trackPurchase } = require('./facebook-capi');
const { deobfuscateExternalId, getClientIp, setSecurityHeaders, isRateLimited, isValidExternalId } = require('./security');

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 30;
const SITE_URL = process.env.SITE_URL || 'https://www.privacy-eduarda.site';

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function makeRequest(options) {
  return new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          resolve({ statusCode: response.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ statusCode: response.statusCode, data: data });
        }
      });
    });
    request.on('error', reject);
    request.end();
  });
}

async function fireFallbackPurchase(externalId, d) {
  const buyerName = d.buyer && d.buyer.name || d.buyer_name || d.customer && d.customer.name;
  const buyerEmail = d.buyer && d.buyer.email || d.buyer_email || d.customer && d.customer.email;
  const planName = d.product && d.product.name || d.plan_name || 'Eduarda Oficial - Acesso VIP';
  const amount = d.total_amount || d.amount || 1490;
  const event_id = `evt_${externalId}`;

  const contents = [
    {
      id: 'EDUARDA_' + (d.plan || 'VIP').toUpperCase(),
      quantity: 1,
      item_price: amount / 100
    }
  ];

  try {
    await trackPurchase(
      { name: buyerName, email: buyerEmail },
      {
        event_id: event_id,
        event_source_url: SITE_URL,
        value: amount / 100,
        content_name: planName,
        content_ids: contents.map(c => c.id),
        content_type: 'product',
        contents: contents,
        num_items: contents.length,
        currency: 'BRL'
      }
    );
    console.log('CAPI Purchase fallback disparado para:', externalId);
  } catch (e) {
    console.error('CAPI Purchase fallback error:', e);
  }
}

module.exports = async (req, res) => {
  setSecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return res.status(429).json({ error: 'Muitas requisições. Tente novamente em 1 minuto.' });
  }

  const TELEGRAM_LINK = process.env.TELEGRAM_LINK;
  if (!TELEGRAM_LINK) {
    console.error('TELEGRAM_LINK não configurado');
    return res.status(500).json({ error: 'Configuração do servidor inválida' });
  }

  const { token, external_id } = req.query || {};
  const rawExternalId = token ? deobfuscateExternalId(token) : external_id;

  if (!rawExternalId || !isValidExternalId(rawExternalId)) {
    return res.status(400).json({ error: 'Identificador de pagamento inválido' });
  }

  const cached = getPaymentStatus(rawExternalId);

  if (cached && cached.status === 'paid') {
    return res.status(200).json({
      status: 'paid',
      external_id: token,
      link: TELEGRAM_LINK,
      message: 'Pagamento confirmado! Seu acesso está liberado.'
    });
  }

  if (cached) {
    return res.status(200).json({
      status: cached.status,
      external_id: token
    });
  }

  const BUCKPAY_SECRET_TOKEN = process.env.BUCKPAY_SECRET_TOKEN;
  if (!BUCKPAY_SECRET_TOKEN) {
    return res.status(500).json({ error: 'Configuração inválida' });
  }
  const PAYMENT_API_HOST = process.env.PAYMENT_API_HOST || 'api.realtechdev.com.br';

  const options = {
    hostname: PAYMENT_API_HOST,
    port: 443,
    path: `/v1/transactions/external_id/${encodeURIComponent(rawExternalId)}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${BUCKPAY_SECRET_TOKEN}`,
      'User-Agent': 'Mozilla/5.0 (compatible; payment-processor/1.0)',
      'Content-Type': 'application/json'
    }
  };

  try {
    const result = await makeRequest(options);

    if (result.statusCode === 200) {
      const d = result.data.data || result.data;
      const status = d.status;

      if (status === 'paid' && !(cached && cached.status === 'paid')) {
        setPaymentStatus(rawExternalId, 'paid', { link: TELEGRAM_LINK });
        await fireFallbackPurchase(rawExternalId, d);
      }

      res.status(200).json({
        status,
        external_id: token,
        payment_method: d.payment_method,
        total_amount: d.total_amount || d.amount,
        event_id: d.metadata && d.metadata.event_id || `evt_${rawExternalId}`,
        ...(status === 'paid' ? { link: TELEGRAM_LINK, message: 'Pagamento confirmado! Seu acesso está liberado.' } : {})
      });
    } else {
      res.status(result.statusCode).json({ error: 'Transação não encontrada' });
    }
  } catch (err) {
    console.error('Erro ao consultar transação:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
};
