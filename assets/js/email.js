/**
 * =============================================
 * SERVICIO DE CORREOS AUTOMÁTICOS
 * =============================================
 * Usa EmailJS (https://www.emailjs.com) para enviar
 * correos desde el frontend sin servidor propio.
 *
 * CONFIGURACIÓN:
 * 1. Crea una cuenta en emailjs.com (gratis hasta 200 emails/mes)
 * 2. Conecta tu cuenta de Gmail o correo empresarial
 * 3. Crea una plantilla de email en EmailJS
 * 4. Reemplaza las credenciales de abajo con las tuyas
 */

const EmailService = (() => {

  // ── ⚙️ CREDENCIALES — reemplaza con las tuyas ──
  const EMAILJS_CONFIG = {
    PUBLIC_KEY:   'TU_PUBLIC_KEY_EMAILJS',      // ← Account → API Keys
    SERVICE_ID:   'TU_SERVICE_ID',              // ← Email Services → Service ID
    TEMPLATE_ID:  'TU_TEMPLATE_ID',             // ← Email Templates → Template ID
  };

  let inicializado = false;

  /**
   * Inicializa EmailJS con la clave pública.
   * Llama esto una vez al cargar la página.
   */
  function init() {
    if (typeof emailjs === 'undefined') {
      console.warn('[EmailService] EmailJS no está cargado. Verifica el script en el HTML.');
      return;
    }
    emailjs.init(EMAILJS_CONFIG.PUBLIC_KEY);
    inicializado = true;
    console.log('[EmailService] Inicializado correctamente.');
  }

  /**
   * Envía el correo de confirmación de compra al cliente.
   *
   * @param {object} resumen - objeto devuelto por Boletas.crearResumenCompra()
   * @returns {Promise}
   */
  async function enviarConfirmacionCompra(resumen) {
    if (!inicializado) {
      console.error('[EmailService] No inicializado. Llama EmailService.init() primero.');
      return;
    }

    if (!resumen.cliente.email) {
      console.warn('[EmailService] El cliente no proporcionó email. Correo omitido.');
      return;
    }

    // Construimos los parámetros que la plantilla de EmailJS recibirá
    const templateParams = {
      // Datos del cliente
      to_email:     resumen.cliente.email,
      to_name:      resumen.cliente.nombre,
      cedula:       resumen.cliente.cedula,
      celular:      resumen.cliente.celular,

      // Datos de la compra
      codigo_compra:    resumen.codigoCompra,
      fecha_compra:     resumen.fecha,
      cantidad_boletos: resumen.cantidad,
      total_pagado:     resumen.totalFormateado,

      // Boletos (enviamos como string separado por comas y como lista)
      lista_boletos: resumen.boletosFormateados.join(', '),
      boletos_html:  resumen.boletosFormateados
        .map(b => `<span class="boleto-num">${b}</span>`)
        .join(' '),

      // Sorteo
      fecha_sorteo:  resumen.sorteo.fecha,
      hora_sorteo:   resumen.sorteo.hora,
      premio:        resumen.sorteo.premio,

      // Contacto
      whatsapp:      '+57 300 000 0000',
      email_contacto: 'contacto@manglater.co',
    };

    try {
      const response = await emailjs.send(
        EMAILJS_CONFIG.SERVICE_ID,
        EMAILJS_CONFIG.TEMPLATE_ID,
        templateParams
      );
      console.log('[EmailService] Correo enviado:', response.status, response.text);
      return response;
    } catch (error) {
      console.error('[EmailService] Error al enviar correo:', error);
      throw error;
    }
  }

  /**
   * Genera el HTML del recibo que también se muestra en pantalla.
   * El mismo contenido que se manda por email.
   *
   * @param {object} resumen
   * @returns {string} HTML del recibo
   */
  function generarHTMLRecibo(resumen) {
    const boletosHTML = resumen.boletosFormateados
      .map(b => `<span class="recibo__boleto">${b}</span>`)
      .join('');

    return `
      <div class="recibo">
        <div class="recibo__header">
          <div class="recibo__logo">
            <i class="fa-solid fa-motorcycle"></i>
          </div>
          <div>
            <h2 class="recibo__titulo">¡Compra Confirmada! 🎉</h2>
            <p class="recibo__codigo">Código: <strong>${resumen.codigoCompra}</strong></p>
          </div>
        </div>

        <div class="recibo__seccion">
          <h4>Tus Datos</h4>
          <div class="recibo__fila"><span>Nombre</span><strong>${resumen.cliente.nombre}</strong></div>
          <div class="recibo__fila"><span>Cédula</span><strong>${resumen.cliente.cedula}</strong></div>
          <div class="recibo__fila"><span>Celular</span><strong>${resumen.cliente.celular}</strong></div>
          ${resumen.cliente.email ? `<div class="recibo__fila"><span>Email</span><strong>${resumen.cliente.email}</strong></div>` : ''}
        </div>

        <div class="recibo__seccion">
          <h4>Resumen de Compra</h4>
          <div class="recibo__fila"><span>Boletos adquiridos</span><strong>${resumen.cantidad}</strong></div>
          <div class="recibo__fila"><span>Total pagado</span><strong style="color:var(--trail-gold)">${resumen.totalFormateado}</strong></div>
          <div class="recibo__fila"><span>Fecha de compra</span><strong>${resumen.fecha}</strong></div>
        </div>

        <div class="recibo__seccion">
          <h4>Tus Números de Boleta</h4>
          <div class="recibo__boletos">${boletosHTML}</div>
        </div>

        <div class="recibo__sorteo">
          <i class="fa-solid fa-trophy"></i>
          <div>
            <strong>Fecha del Sorteo: ${resumen.sorteo.fecha}</strong>
            <span>${resumen.sorteo.hora} — Premio: ${resumen.sorteo.premio}</span>
          </div>
        </div>

        <p class="recibo__nota">
          Guarda este recibo. Tus números también serán enviados a tu correo y WhatsApp.
          ¿Preguntas? Escríbenos al <strong>+57 300 000 0000</strong>.
        </p>
      </div>
    `;
  }

  // ── API pública ─────────────────────────────
  return {
    init,
    enviarConfirmacionCompra,
    generarHTMLRecibo,
  };
})();