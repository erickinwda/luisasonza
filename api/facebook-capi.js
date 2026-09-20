// Facebook Conversions API (CAPI) - Server-side Event Tracking
// Envia eventos para o Facebook via API de Conversões

const https = require('https');

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_PIXEL_ID = process.env.META_PIXEL_ID;
const META_API_VERSION = process.env.META_API_VERSION || 'v18.0';

function sha256(text) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(text.toLowerCase().trim()).digest('hex');
}

function buildUserData(buyer) {
  const userData = {};

  if (buyer && buyer.email) {
    userData.em = [sha256(buyer.email)];
  }
  if (buyer && buyer.phone) {
    userData.pn = [sha256(buyer.phone)];
  }
  if (buyer && buyer.name) {
    userData.fn = [sha256(buyer.name)];
  }

  return userData;
}

function makeFacebookRequest(body, url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: 443,
      path: urlObj.pathname + urlObj.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const request = https.request(options, (response) => {
      let data = '';
      response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        try {
          resolve({ statusCode: response.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ statusCode: response.statusCode, data });
        }
      });
    });

    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

async function sendFacebookEvent(eventName, params, userData, event_id, event_source_url) {
  params = params || {};
  userData = userData || {};

  if (!META_ACCESS_TOKEN || !META_PIXEL_ID) {
    console.warn('Configuração de rastreamento não inicializada. Evento não enviado:', eventName);
    return null;
  }

  const customData = {
    currency: params.currency || 'BRL',
    value: parseFloat(params.value) || 0
  };

  if (params.content_name) customData.content_name = params.content_name;
  if (params.content_ids) customData.content_ids = params.content_ids;
  if (params.content_category) customData.content_category = params.content_category;
  if (params.content_type) customData.content_type = params.content_type;
  if (params.num_items) customData.num_items = params.num_items;

  if (params.contents && Array.isArray(params.contents) && params.contents.length > 0) {
    customData.contents = params.contents;
  }

  const eventData = {
    event_name: eventName,
    event_time: Math.floor(Date.now() / 1000),
    action_source: 'website'
  };

  if (event_id) eventData.event_id = event_id;
  if (event_source_url) eventData.event_source_url = event_source_url;

  const user_data = {};
  if (userData.em && userData.em.length > 0) user_data.em = userData.em;
  if (userData.pn && userData.pn.length > 0) user_data.pn = userData.pn;
  if (userData.fn && userData.fn.length > 0) user_data.fn = userData.fn;
  eventData.user_data = user_data;
  eventData.custom_data = customData;

  const payload = { data: [eventData] };
  const body = JSON.stringify(payload);
  const url = 'https://graph.facebook.com/' + META_API_VERSION + '/' + META_PIXEL_ID + '/events?access_token=' + META_ACCESS_TOKEN;

  console.log('Evento de conversão enviado:', eventName, JSON.stringify(eventData));

  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await makeFacebookRequest(body, url);
      if (result.statusCode === 200 && result.data && result.data.events_received > 0) {
        console.log('Evento de conversão enviado com sucesso:', eventName);
        return result;
      }
      lastError = result;
      console.warn('Evento de conversão falhou (tentativa ' + (attempt + 1) + '/3):', eventName, result.statusCode, result.data);
    } catch (err) {
      lastError = err;
      console.warn('Erro no evento de conversão (tentativa ' + (attempt + 1) + '/3):', eventName, err.message);
    }
    if (attempt < 2) {
      await new Promise(resolve => setTimeout(resolve, 400 * (attempt + 1)));
    }
  }

  console.error('Falha ao enviar evento de conversão após 3 tentativas:', eventName, lastError);
  return null;
}

async function trackInitiateCheckout(buyer, params) {
  params = params || {};
  const userData = buildUserData(buyer);
  return sendFacebookEvent('InitiateCheckout', {
    content_name: params.content_name || 'Eduarda Oficial',
    content_ids: params.content_ids || ['EDUARDA_30DIAS'],
    content_category: 'Acesso VIP',
    value: params.value || 14.90,
    currency: params.currency || 'BRL',
    content_type: params.content_type || 'product',
    contents: params.contents,
    num_items: params.num_items || (params.contents ? params.contents.length : 1)
  }, userData, params.event_id, params.event_source_url);
}

async function trackPurchase(buyer, params) {
  params = params || {};
  const userData = buildUserData(buyer);
  return sendFacebookEvent('Purchase', {
    content_name: params.content_name || 'Eduarda Oficial',
    content_ids: params.content_ids || ['EDUARDA_30DIAS'],
    content_category: 'Acesso VIP',
    value: params.value || 14.90,
    currency: params.currency || 'BRL',
    content_type: params.content_type || 'product',
    contents: params.contents,
    num_items: params.num_items || (params.contents ? params.contents.length : 1)
  }, userData, params.event_id, params.event_source_url);
}

async function trackPageView(buyer) {
  const userData = buildUserData(buyer);
  return sendFacebookEvent('PageView', {
    currency: 'BRL'
  }, userData);
}

module.exports = { sendFacebookEvent, trackInitiateCheckout, trackPurchase, trackPageView, buildUserData };
