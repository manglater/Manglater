// whatsapp.service.js
require('dotenv').config();

const enabled = String(process.env.TWILIO_ENABLED || '').toLowerCase() === 'true';

let client = null;
if (enabled && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
  try {
    const twilio = require('twilio');
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  } catch (e) {
    console.warn('⚠️ Twilio no instalado. WhatsApp deshabilitado.');
  }
}

function normalizeCOPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('57') && digits.length >= 12) return `+${digits}`;
  if (digits.length === 10) return `+57${digits}`;
  if (digits.startsWith('0')) return `+57${digits.slice(1)}`;
  return `+${digits}`;
}

function buildConfirmationMessage(purchase) {
  const boletas = (purchase.boletas || [])
    .map(n => String(n).padStart(5, '0'))
    .join(', ');

  return `✅ Compra confirmada - Manglater

Hola ${purchase.nombre || 'cliente'} 👋
Tu compra fue aprobada.

🧾 ID: ${purchase.id}
🎟️ Boletas: ${boletas || 'N/A'}
📦 Cantidad: ${purchase.cantidad || 0}
💰 Total: $${Number(purchase.total || 0).toLocaleString('es-CO')}

¡Gracias por participar!`;
}

async function sendPurchaseConfirmationWhatsApp(purchase) {
  if (!client) {
    return { ok: false, skipped: true, error: 'Twilio no configurado o deshabilitado' };
  }

  const toPhone = normalizeCOPhone(purchase?.celular);
  if (!toPhone) {
    return { ok: false, skipped: true, error: 'Celular inválido' };
  }

  const from = process.env.TWILIO_WHATSAPP_FROM;
  if (!from?.startsWith('whatsapp:')) {
    return { ok: false, skipped: true, error: 'TWILIO_WHATSAPP_FROM inválido' };
  }

  try {
    const msg = await client.messages.create({
      from,
      to: `whatsapp:${toPhone}`,
      body: buildConfirmationMessage(purchase)
    });

    return { ok: true, sid: msg.sid, to: toPhone };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  sendPurchaseConfirmationWhatsApp
};