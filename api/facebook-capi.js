// Facebook Conversions API (CAPI) - Server-side Event Tracking
// Envia eventos para o Facebook via API de Conversões

const https = require('https');

const META_ACCESS_TOKEN = process.env.META_ACCESS_TOKEN;
const META_PIXEL_ID = process.env.META_PIXEL_ID || '958954899926961';
const META_API_VERSION = process.env.META_API_VERSION || 'v18.0';

function sha256(text) {
  const crypto = require('crypto');
  return crypto.createHash('sha256').update(text.toLowerCase().trim()).digest('hex');
}

function buildUserData(buyer) {
  const userData = {};

  if (buyer?.email) {
    userData.em = [sha256(buyer.email)];
  }
  if (buyer?.phone) {
    userData.pn = [sha256(buyer.phone)];
  }
  if (buyer?.name) {
    userData.fn = [sha256(buyer.name)];
  }

  return userData;
}

async function sendFacebookEvent(eventName, params = {}, userData = {}) {
  if (!META_ACCESS_TOKEN) {
    console.warn('META_ACCESS_TOKEN não configurado. Evento não enviado:', eventName);
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
  
  // contents array para Purchase/InitiateCheckout (cada produto individual)
  if (params.contents && Array.isArray(params.contents) && params.contents.length > 0) {
    customData.contents = params.contents;
  }

  const payload = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        user_data: {
          em: userData.em || [],
          pn: userData.pn || [],
          ...(userData.fn && { fn: userData.fn })
        },
        custom_data: customData
      }
    ]
  };

  const body = JSON.stringify(payload);
  console.log(`📤 Facebook CAPI - ${eventName}:`, JSON.stringify(payload, null, 2));
  
  const url = `https://graph.facebook.com/${META_API_VERSION}/${META_PIXEL_ID}/events?access_token=${META_ACCESS_TOKEN}`;

  try {
    const result = await new Promise((resolve, reject) => {
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

    if (result.statusCode === 200 && result.data?.events_received > 0) {
      console.log(`✅ Facebook CAPI: ${eventName} enviado com sucesso`);
    } else {
      console.warn(`⚠️ Facebook CAPI: ${eventName} - Status: ${result.statusCode}`, result.data);
    }

    return result;
  } catch (err) {
    console.error(`❌ Facebook CAPI error (${eventName}):`, err.message);
    return null;
  }
}

async function trackInitiateCheckout(buyer, params = {}) {
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
  }, userData);
}

async function trackPurchase(buyer, params = {}) {
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
  }, userData);
}

async function trackPageView(buyer) {
  const userData = buildUserData(buyer);
  return sendFacebookEvent('PageView', {
    currency: 'BRL'
  }, userData);
}

module.exports = { sendFacebookEvent, trackInitiateCheckout, trackPurchase, trackPageView, buildUserData };
