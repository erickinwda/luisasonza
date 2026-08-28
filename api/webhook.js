// Backend API - Webhook Handler Logic
// Recebe eventos da BuckPay (transaction.created, transaction.processed)

const { trackPurchase } = require('./facebook-capi');

const STATUS_STORE = new Map();

function setPaymentStatus(externalId, status) {
  if (externalId) STATUS_STORE.set(externalId, { status, updatedAt: Date.now() });
}

function getPaymentStatus(externalId) {
  return STATUS_STORE.get(externalId);
}

async function processWebhook(payload, eventType) {
  console.log('=== BUCKPAY WEBHOOK ===');
  console.log('Evento:', eventType);
  console.log('Payload:', JSON.stringify(payload, null, 2));
  console.log('========================');

  const data = payload?.data || payload;
  const status = data.status || payload?.status;
  const externalId = data.external_id || payload?.external_id;
  const buyerEmail = data.buyer?.email || data.buyer_email;
  const buyerName = data.buyer?.name || data.buyer_name || 'Cliente';

  switch (eventType) {
    case 'transaction.created':
      console.log(`⏳ PIX gerado - aguardando pagamento. Pedido: ${externalId}`);
      setPaymentStatus(externalId, 'pending');
      break;

    case 'transaction.processed':
      if (status === 'paid') {
        const amount = data.amount || data.total_amount || 1490;
        const planName = data.product?.name || 'Eduarda Oficial';
        console.log(`✅ PAGAMENTO CONFIRMADO! Pedido: ${externalId}`);
        console.log(`   Comprador: ${buyerName} (${buyerEmail})`);
        setPaymentStatus(externalId, 'paid');

        try {
          await trackPurchase(
            { name: buyerName, email: buyerEmail },
            { value: amount / 100, content_name: planName }
          );
        } catch (e) {
          console.error('Facebook CAPI Purchase error:', e);
        }
      } else if (status === 'pending') {
        console.log(`⏳ Pagamento pendente. Pedido: ${externalId}`);
        setPaymentStatus(externalId, 'pending');
      } else if (status === 'expired') {
        console.log(`❌ Pagamento expirado. Pedido: ${externalId}`);
        setPaymentStatus(externalId, 'expired');
      } else {
        console.log(`ℹ️ Status: ${status} - Pedido: ${externalId}`);
        setPaymentStatus(externalId, status);
      }
      break;

    default:
      console.log(`ℹ️ Evento não tratado: ${eventType}`);
  }

  return true;
}

module.exports = { processWebhook, getPaymentStatus, setPaymentStatus };
