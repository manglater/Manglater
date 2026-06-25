require('dotenv').config();

const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

// Normalizar número colombiano
function normalizeCOPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('57') && digits.length >= 12) return digits;
  if (digits.length === 10) return '57' + digits;
  if (digits.startsWith('0')) return '57' + digits.slice(1);
  return '57' + digits;
}

// Crear mensaje personalizado
function buildConfirmationMessage(purchase) {
  const boletas = (purchase.boletas || [])
    .map(n => String(n).padStart(5, '0'))
    .join(', ');

  return `✅ *COMPRA CONFIRMADA - MANGLATER*

Hola *${purchase.nombre || 'cliente'}* 👋

Tu compra fue aprobada y tus números están listos.

━━━━━━━━━━━━━━━━━━━━━━━━
🧾 *ID de Compra:* ${purchase.id}
🎟️ *Tus Boletas:* ${boletas}
📦 *Cantidad:* ${purchase.cantidad || 0} números
💰 *Total Pagado:* $${Number(purchase.total || 0).toLocaleString('es-CO')}
━━━━━━━━━━━━━━━━━━━━━━━━

¡Gracias por participar en el sorteo de la Honda XR 150L!

Sorteo oficial: *15 de Agosto, 2026* a las *6:00 PM*

Cualquier duda, estamos aquí 👇
📞 *+57 301 773 6812*

¡Suerte! 🍀`;
}

// Enviar WhatsApp
async function sendPurchaseConfirmationWhatsApp(purchase) {
  if (!WHATSAPP_PHONE_ID || !WHATSAPP_ACCESS_TOKEN) {
    console.error('❌ WhatsApp no configurado');
    return { ok: false, error: 'WhatsApp credentials missing' };
  }

  const recipientPhone = normalizeCOPhone(purchase?.celular);
  if (!recipientPhone) {
    return { ok: false, error: 'Invalid phone number' };
  }

  try {
    console.log(`📤 Enviando WhatsApp a: +${recipientPhone}`);

    const response = await fetch(
      `https://graph.instagram.com/v18.0/${WHATSAPP_PHONE_ID}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${WHATSAPP_ACCESS_TOKEN}`
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: recipientPhone,
          type: 'text',
          text: {
            body: buildConfirmationMessage(purchase)
          }
        })
      }
    );

    const result = await response.json();

    if (result.messages && result.messages[0]) {
      console.log(`✅ WhatsApp enviado! ID: ${result.messages[0].id}`);
      return { ok: true, messageId: result.messages[0].id, to: recipientPhone };
    } else {
      console.error('❌ Error:', result);
      return { ok: false, error: result.error?.message || 'Unknown error' };
    }
  } catch (e) {
    console.error('❌ Error enviando WhatsApp:', e.message);
    return { ok: false, error: e.message };
  }
}

module.exports = {
  sendPurchaseConfirmationWhatsApp
};