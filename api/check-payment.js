// API Endpoint: Check Payment Status
// GET /api/check-payment?external_id=xxx
// SÓ RETORNA O LINK APÓS PAGAMENTO CONFIRMADO (status === 'paid')

const https = require('https');
const { getPaymentStatus } = require('./webhook.js');

const DELIVERY_LINK = 'https://t.me/+3rvnCKgtd5QwZmFh';

module.exports = async (req, res) => {
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

  const { external_id } = req.query || {};

  if (!external_id) {
    return res.status(400).json({ error: 'external_id é obrigatório' });
  }

  const cached = getPaymentStatus(external_id);

  if (cached && cached.status === 'paid') {
    return res.status(200).json({
      status: 'paid',
      external_id,
      link: DELIVERY_LINK,
      message: 'Pagamento confirmado! Seu acesso está liberado.'
    });
  }

  if (cached) {
    return res.status(200).json({
      status: cached.status,
      external_id
    });
  }

  const BUCKPAY_TOKEN = process.env.BUCKPAY_SECRET_TOKEN;
  if (!BUCKPAY_TOKEN) {
    return res.status(500).json({ error: 'Configuração inválida' });
  }

  const options = {
    hostname: 'api.realtechdev.com.br',
    port: 443,
    path: `/v1/transactions/external_id/${external_id}`,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${BUCKPAY_TOKEN}`,
      'User-Agent': process.env.BUCKPAY_USER_AGENT || 'Buckpay API',
      'Content-Type': 'application/json'
    }
  };

  try {
    const result = await new Promise((resolve, reject) => {
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

    if (result.statusCode === 200) {
      const d = result.data.data || result.data;
      const status = d.status;

      res.status(200).json({
        status,
        external_id: d.external_id,
        payment_method: d.payment_method,
        total_amount: d.total_amount || d.amount,
        ...(status === 'paid' ? { link: DELIVERY_LINK, message: 'Pagamento confirmado! Seu acesso está liberado.' } : {})
      });
    } else {
      res.status(result.statusCode).json({ error: 'Transação não encontrada' });
    }
  } catch (err) {
    console.error('Erro ao consultar transação:', err);
    res.status(500).json({ error: 'Erro interno' });
  }
};
