// API Endpoint: Create Payment (PIX)
// Serverless function for Vercel
// Suporta múltiplos planos + order bumps via parâmetro "plan"
// Com validação server-side, rate limiting, criptografia e segurança

const https = require('https');
const { trackInitiateCheckout } = require('./facebook-capi');
const { obfuscateExternalId, getClientIp, setSecurityHeaders, isRateLimited } = require('./security');

const PLANS = {
  '14dias':   { name: '14 DIAS',   amount: 1233 },
  '30dias':   { name: '30 DIAS',   amount: 1490 },
  '3meses':   { name: '3 MESES',   amount: 1990 },
  'video_exclusivo':   { name: 'VÍDEO EXCLUSIVO',   amount: 690 }
};

const OB_NAMES = {
  virginia:  { name: 'Virginia Fonseca',  amount: 999 },
  vivi:     { name: 'Vivi Noronha',      amount: 899 },
  nicolle:  { name: 'Nicolle Caroline',  amount: 1490 },
  luisa:    { name: 'Luísa Sonza',       amount: 990 }
};

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 10;
const MAX_BODY_SIZE = 65536;

function isValidEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function isValidName(name) {
  return typeof name === 'string' && name.trim().length >= 2 && name.trim().length <= 100;
}

function makeRequest(body, options) {
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
    request.write(body);
    request.end();
  });
}

module.exports = async (req, res) => {
  setSecurityHeaders(res);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const clientIp = getClientIp(req);
  if (isRateLimited(clientIp, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS)) {
    return res.status(429).json({ error: 'Muitas requisições. Tente novamente em 1 minuto.' });
  }

  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_BODY_SIZE) {
    return res.status(413).json({ error: 'Corpo da requisição muito grande' });
  }

  const BUCKPAY_SECRET_TOKEN = process.env.BUCKPAY_SECRET_TOKEN;
  if (!BUCKPAY_SECRET_TOKEN) {
    console.error('BUCKPAY_SECRET_TOKEN não configurado');
    return res.status(500).json({ error: 'Configuração de servidor inválida' });
  }
  const PAYMENT_API_HOST = process.env.PAYMENT_API_HOST || 'api.realtechdev.com.br';

  let bodyData = {};
  try {
    if (req.body) {
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      if (rawBody.length > MAX_BODY_SIZE) {
        return res.status(413).json({ error: 'Corpo da requisição muito grande' });
      }
      bodyData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    }
  } catch (e) {
    console.error('Erro ao parsear body:', e);
    return res.status(400).json({ error: 'Corpo da requisição inválido' });
  }

  const name = (bodyData.name || '').toString().trim();
  const email = (bodyData.email || '').toString().trim().toLowerCase();
  const planKey = (bodyData.plan || '').toString().toLowerCase();

  if (!isValidName(name)) {
    return res.status(400).json({ error: 'Nome inválido (mínimo 2 caracteres)' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'E-mail inválido' });
  }
  if (!PLANS[planKey]) {
    return res.status(400).json({ error: 'Plano inválido' });
  }

  const plan = PLANS[planKey];

  const rawBumps = Array.isArray(bodyData.orderbumps) ? bodyData.orderbumps : [];
  const validatedBumps = [];
  const seenKeys = new Set();
  for (const bump of rawBumps) {
    const key = String(bump && bump.key || '').toLowerCase();
    if (OB_NAMES[key] && !seenKeys.has(key)) {
      seenKeys.add(key);
      validatedBumps.push({ key, name: OB_NAMES[key].name, amount: OB_NAMES[key].amount });
    }
  }

  const totalAmount = plan.amount + validatedBumps.reduce((sum, b) => sum + b.amount, 0);

  const externalId = `pix_${planKey}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const event_id = `evt_${planKey}_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

  let productName = `Eduarda Oficial - ${plan.name}`;
  if (validatedBumps.length > 0) {
    const bumpsNames = validatedBumps.map(b => b.name).join(', ');
    productName += ' + ' + bumpsNames;
  }

  const payload = {
    external_id: externalId,
    payment_method: 'pix',
    amount: totalAmount,
    buyer: {
      name: name,
      email: email,
      phone: '5511999999999'
    },
    product: {
      name: productName
    },
    metadata: {
      plan: plan.name,
      plan_key: planKey,
      orderbumps: validatedBumps,
      event_id: event_id
    }
  };

  const body = JSON.stringify(payload);
  console.log('Payload enviado:', JSON.stringify(payload, null, 2));

  const contents = [
    {
      id: 'EDUARDA_' + planKey.toUpperCase(),
      quantity: 1,
      item_price: plan.amount / 100
    }
  ];
  validatedBumps.forEach(function(b) {
    contents.push({
      id: 'EDUARDA_' + b.key.toUpperCase(),
      quantity: 1,
      item_price: b.amount / 100
    });
  });

  try {
    await trackInitiateCheckout({ name, email }, {
      value: totalAmount / 100,
      content_name: productName,
      content_ids: contents.map(function(c) { return c.id; }),
      content_type: 'product',
      contents: contents,
      num_items: contents.length,
      event_id: event_id
    });
  } catch (e) {
    console.error('Facebook CAPI InitiateCheckout error:', e);
  }

  const options = {
    hostname: PAYMENT_API_HOST,
    port: 443,
    path: '/v1/transactions',
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${BUCKPAY_SECRET_TOKEN}`,
      'User-Agent': 'Mozilla/5.0 (compatible; payment-processor/1.0)',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  };

  try {
    const result = await makeRequest(body, options);
    console.log('Payment API response status:', result.statusCode);

    if (result.statusCode >= 200 && result.statusCode < 300) {
      const d = result.data.data || result.data;

      let pixCode = null;
      let qrcodeBase64 = null;

      if (d.pix) {
        pixCode = d.pix.code || d.pix.emv || d.pix.pix_code || null;
        qrcodeBase64 = d.pix.qrcode_base64 || d.pix.qr_code_base64 || null;
      }

      const obfuscatedExternalId = obfuscateExternalId(d.external_id || externalId);

      res.status(200).json({
        id: d.id || externalId,
        external_id: obfuscatedExternalId,
        status: d.status || 'pending',
        payment_method: d.payment_method || 'pix',
        plan: planKey,
        plan_name: plan.name,
        amount: plan.amount,
        orderbumps: validatedBumps.map(b => ({ key: b.key, name: b.name })),
        pix: {
          code: pixCode,
          qrcode_base64: qrcodeBase64
        },
        total_amount: d.total_amount || d.amount || totalAmount,
        event_id: event_id,
        created_at: d.created_at || new Date().toISOString()
      });
    } else {
      console.error('Payment API error:', result.statusCode);
      res.status(result.statusCode).json({
        error: 'Falha ao criar transação',
        detail: result.data && result.data.error && result.data.error.detail || result.data && result.data.error && result.data.error.message || JSON.stringify(result.data)
      });
    }
  } catch (err) {
    console.error('Request error:', err);
    res.status(500).json({ error: 'Internal server error', detail: err.message });
  }
};
