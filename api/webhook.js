// Backend API - Webhook Handler Logic
// Recebe eventos da BuckPay (transaction.created, transaction.processed)
// TODOS OS PLANOS entregam o mesmo link do Telegram

const { trackPurchase } = require('./facebook-capi');

const TELEGRAM_LINK = 'https://t.me/+3rvnCKgtd5QwZmFh';

const STATUS_STORE = new Map();

function setPaymentStatus(externalId, status, extra = {}) {
  if (externalId) STATUS_STORE.set(externalId, { status, updatedAt: Date.now(), ...extra });
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
  const buyerEmail = data.buyer?.email || data.buyer_email || data?.customer?.email;
  const buyerName = data.buyer?.name || data.buyer_name || data?.customer?.name || 'Cliente';

  switch (eventType) {
    case 'transaction.created':
      console.log(`⏳ PIX gerado - aguardando pagamento. Pedido: ${externalId}`);
      setPaymentStatus(externalId, 'pending');
      break;

    case 'transaction.processed':
    case 'transaction.paid':
    case 'payment.processed':
      if (status === 'paid' || status === 'approved' || status === 'completed') {
        const amount = data.amount || data.total_amount || data?.transaction?.amount || 1490;
        const planName = data.product?.name || data?.plan_name || 'Eduarda Oficial - Acesso VIP';
        const orderBumpsData = data.orderbumps || data.order_bumps || data.metadata?.orderbumps || [];
        console.log(`✅ PAGAMENTO CONFIRMADO! Pedido: ${externalId}`);
        console.log(`   Comprador: ${buyerName} (${buyerEmail})`);
        console.log(`   Valor: R$ ${(amount / 100).toFixed(2)}`);
        console.log(`   📲 Link Telegram: ${TELEGRAM_LINK}`);
        if (orderBumpsData.length > 0) {
          console.log(`   🛒 Order Bumps:`, orderBumpsData.map(b => b.name).join(', '));
        }

        setPaymentStatus(externalId, 'paid', {
          link: TELEGRAM_LINK,
          buyerEmail,
          buyerName,
          orderBumps: orderBumpsData
        });

        // Monta lista de contents com plano + order bumps (cada um conta como 1 venda pro Facebook)
        const contents = [
          {
            id: 'EDUARDA_' + (data.plan || 'VIP').toUpperCase(),
            quantity: 1,
            item_price: amount / 100
          }
        ];
        let totalValue = amount / 100;
        
        orderBumpsData.forEach(function(bump) {
          contents.push({
            id: 'EDUARDA_' + bump.key.toUpperCase(),
            quantity: 1,
            item_price: bump.price
          });
          totalValue += bump.price;
        });

        try {
          await trackPurchase(
            { name: buyerName, email: buyerEmail },
            {
              value: totalValue,
              content_name: planName + (orderBumpsData.length > 0 ? ' + ' + orderBumpsData.length + ' extras' : ''),
              content_ids: contents.map(c => c.id),
              content_type: 'product',
              contents: contents,
              num_items: contents.length
            }
          );
        } catch (e) {
          console.error('Facebook CAPI Purchase error:', e);
        }
      } else if (status === 'pending' || status === 'waiting_payment') {
        console.log(`⏳ Pagamento pendente. Pedido: ${externalId}`);
        setPaymentStatus(externalId, 'pending');
      } else if (status === 'expired' || status === 'cancelled') {
        console.log(`❌ Pagamento ${status}. Pedido: ${externalId}`);
        setPaymentStatus(externalId, status);
      } else {
        console.log(`ℹ️ Status: ${status} - Pedido: ${externalId}`);
        setPaymentStatus(externalId, status);
      }
      break;

    case 'transaction.refunded':
    case 'transaction.chargeback':
      console.log(`⚠️ Reembolso/chargeback. Pedido: ${externalId}`);
      setPaymentStatus(externalId, 'refunded');
      break;

    default:
      console.log(`ℹ️ Evento não tratado: ${eventType}`);
  }

  return true;
}

module.exports = { processWebhook, getPaymentStatus, setPaymentStatus, TELEGRAM_LINK };
