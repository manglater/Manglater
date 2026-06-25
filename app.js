let selectedPackage = null;
let selectedQuantity = 0;
let selectedPrice = 0;

// ── INICIALIZACIÓN ──────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  console.log('✓ App inicializado');

  actualizarMedidores();
  setupScrollReveal();
  updateCountdown();
  setInterval(updateCountdown, 1000);
  setupEventListeners();
  setupFilePreview();
  setupContinueButton();
});

// ── ACTUALIZACIÓN DE MEDIDORES ──────────────
async function actualizarMedidores() {
  try {
    const r = await fetch('/api/stats');
    const data = await r.json();

    if (!r.ok || !data.ok) {
      throw new Error(data?.error || 'Error cargando estadísticas');
    }

    const vendidos = data.vendidos ?? 0;
    const disponibles = data.disponibles ?? 0;
    const porcentaje = data.porcentaje ?? 0;

    const gaugeProgress = document.getElementById('gaugeProgress');
    const gaugePct = document.getElementById('gaugePct');
    const gaugeNeedle = document.getElementById('gaugeNeedle');
    const gaugeVendidos = document.getElementById('gaugeVendidos');
    const gaugeDisponibles = document.getElementById('gaugeDisponibles');

    if (gaugePct) gaugePct.innerHTML = porcentaje + '<span>%</span>';

    if (gaugeProgress) {
      const totalLength = 565;
      const strokeDasharray = (porcentaje / 100) * totalLength;
      gaugeProgress.style.strokeDasharray = strokeDasharray + ' ' + totalLength;
    }

    if (gaugeNeedle) {
      const angle = 225 + (porcentaje / 100) * 90;
      gaugeNeedle.style.transform = `rotate(${angle}deg)`;
    }

    if (gaugeVendidos) gaugeVendidos.textContent = vendidos.toLocaleString('es-CO');
    if (gaugeDisponibles) gaugeDisponibles.textContent = disponibles.toLocaleString('es-CO');
  } catch (e) {
    console.error('Error cargando medidor:', e);
  }
}

// ── SELECCIÓN DE PAQUETES ───────────────────
function selectPackage(event) {
  event.preventDefault();
  const element = event.currentTarget;

  document.querySelectorAll('.package-card').forEach(card => {
    card.classList.remove('is-selected');
  });

  element.classList.add('is-selected');
  selectedQuantity = parseInt(element.dataset.qty, 10);
  selectedPrice = parseInt(element.dataset.price, 10);
  selectedPackage = element;

  console.log(`📦 Paquete: ${selectedQuantity} números por $${selectedPrice}`);
  mostrarResumen();
}

// ── CÁLCULO PERSONALIZADO ───────────────────
function calculateCustom() {
  const input = document.getElementById('customQty');
  const cantidad = parseInt(input.value, 10);

  if (!cantidad || cantidad < 1) {
    mostrarToast('❌ Ingresa una cantidad válida', 'error');
    return;
  }

  let precioUnitario = 1500;
  if (cantidad >= 50) precioUnitario = 1400;
  if (cantidad >= 100) precioUnitario = 1200;
  if (cantidad >= 200) precioUnitario = 1000;

  selectedQuantity = cantidad;
  selectedPrice = cantidad * precioUnitario;
  selectedPackage = null;

  document.querySelectorAll('.package-card').forEach(card => {
    card.classList.remove('is-selected');
  });

  mostrarResumen();
}

// ── MOSTRAR RESUMEN ─────────────────────────
function mostrarResumen() {
  const summaryBar = document.getElementById('summaryBar');
  const summaryQty = document.getElementById('summaryQty');
  const summaryTotal = document.getElementById('summaryTotal');
  const pagoTotalText = document.getElementById('pagoTotalText');

  if (selectedQuantity > 0) {
    if (summaryQty) summaryQty.textContent = selectedQuantity;
    if (summaryTotal) summaryTotal.textContent = '$' + selectedPrice.toLocaleString('es-CO');
    if (pagoTotalText) pagoTotalText.textContent = '$' + selectedPrice.toLocaleString('es-CO');

    if (summaryBar) {
      summaryBar.style.display = 'flex';
      summaryBar.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }
}

// ── BOTÓN "CONTINUAR" ───────────────────────
function setupContinueButton() {
  const btnContinuar = document.getElementById('btn-continuar');
  if (btnContinuar) {
    btnContinuar.addEventListener('click', (e) => {
      e.preventDefault();
      const checkoutSection = document.getElementById('checkoutSection');
      if (checkoutSection) {
        checkoutSection.style.display = 'block';
        checkoutSection.scrollIntoView({ behavior: 'smooth' });
      }
    });
  }
}

// ── CONFIGURAR LISTENERS ────────────────────
function setupEventListeners() {
  const form = document.getElementById('formulario-pago');
  if (form) {
    form.addEventListener('submit', handleFormSubmit);
    console.log('✓ Formulario conectado');
  }
}

// ── MANEJO DEL FORMULARIO ───────────────────
async function handleFormSubmit(e) {
  e.preventDefault();
  console.log('📋 Formulario enviado');

  if (selectedQuantity === 0) {
    mostrarToast('❌ Por favor selecciona un paquete', 'error');
    return;
  }

  const nombre = document.getElementById('nombre')?.value.trim();
  const cedula = document.getElementById('cedula')?.value.trim();
  const celular = document.getElementById('celular')?.value.trim();
  const email = document.getElementById('email')?.value.trim();
  const emailConfirm = document.getElementById('emailConfirm')?.value.trim();
  const comprobanteInput = document.getElementById('comprobante');
  const comprobante = comprobanteInput?.files?.[0];

  if (!nombre || !cedula || !celular) {
    mostrarToast('❌ Por favor completa todos los campos requeridos (*)', 'error');
    return;
  }

  if (!email) {
    mostrarToast('❌ Por favor ingresa tu correo electrónico', 'error');
    return;
  }

  if (email !== emailConfirm) {
    mostrarToast('❌ Los correos no coinciden', 'error');
    return;
  }

  if (!comprobante) {
    mostrarToast('❌ Por favor adjunta el comprobante de pago', 'error');
    return;
  }

  const btn = e.target.querySelector('button[type="submit"]');
  const textoOriginal = btn?.textContent || 'Confirmar Compra';

  if (btn) {
    btn.disabled = true;
    btn.textContent = '⏳ Procesando...';
  }

  try {
    const formData = new FormData();
    formData.append('nombre', nombre);
    formData.append('cedula', cedula);
    formData.append('celular', celular);
    formData.append('email', email);
    formData.append('cantidad', selectedQuantity);
    formData.append('total', selectedPrice);
    formData.append('comprobante', comprobante);

    console.log('📤 Enviando compra...');
    const response = await fetch('/api/create-purchase', {
      method: 'POST',
      body: formData
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || !result.ok) {
      throw new Error(result.error || 'Error al crear la compra');
    }

    const purchaseId = result.purchaseId || result.id || 'N/A';

    mostrarRecibo(`
      <h2>✅ Compra Registrada</h2>
      <p>Hola <strong>${nombre}</strong>,</p>
      <p>Tu compra fue registrada con ID: <strong>${purchaseId}</strong></p>
      <p>Cantidad: <strong>${selectedQuantity} números</strong></p>
      <p>Total: <strong>$${selectedPrice.toLocaleString('es-CO')}</strong></p>
      <p style="color: #f39c12; font-weight: bold;">⏳ Estado: PENDIENTE DE VERIFICACIÓN</p>
      <p>Tu comprobante está siendo verificado. Te notificaremos por WhatsApp cuando se confirme y recibirás tus números de participación.</p>
      <p style="font-size: 0.9rem; color: #888;">Revisa tu WhatsApp: <strong>${celular}</strong></p>
    `);

    mostrarToast('✓ Compra registrada. Pendiente de verificación.', 'success');

    e.target.reset();
    selectedQuantity = 0;
    selectedPrice = 0;
    selectedPackage = null;

    document.querySelectorAll('.package-card').forEach(card => {
      card.classList.remove('is-selected');
    });

    const previewWrap = document.getElementById('comprobantePreview');
    const previewImg = document.getElementById('comprobantePreviewImg');

    if (previewWrap) previewWrap.style.display = 'none';
    if (previewImg) previewImg.src = '';

    const summaryBar = document.getElementById('summaryBar');
    if (summaryBar) summaryBar.style.display = 'none';

    const checkoutSection = document.getElementById('checkoutSection');
    if (checkoutSection) checkoutSection.style.display = 'none';

  } catch (error) {
    console.error('❌ Error:', error);
    mostrarToast(`❌ ${error.message || 'Error al procesar la compra'}`, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = textoOriginal;
    }
  }
}

// ── MOSTRAR RECIBO ──────────────────────────
function mostrarRecibo(html) {
  const modal = document.createElement('div');
  modal.className = 'modal-recibo';
  modal.innerHTML = `
    <div class="modal-recibo__content">
      <button class="modal-recibo__close" onclick="this.closest('.modal-recibo').remove()">
        <i class="fa-solid fa-xmark"></i>
      </button>
      ${html}
      <div class="modal-recibo__actions">
        <button class="btn btn--ghost" onclick="this.closest('.modal-recibo').remove()">
          Cerrar
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  if (!document.querySelector('style[data-modal-recibo]')) {
    const style = document.createElement('style');
    style.setAttribute('data-modal-recibo', 'true');
    style.textContent = `
      .modal-recibo {
        position: fixed; inset: 0; z-index: 300;
        background: rgba(0, 0, 0, 0.8);
        display: flex; align-items: center; justify-content: center;
        padding: 20px;
        animation: fadeIn 0.3s ease;
      }
      .modal-recibo__content {
        background: var(--asphalt); border: 1px solid var(--line);
        border-radius: 20px; padding: 40px;
        max-width: 700px; max-height: 90vh; overflow-y: auto;
        position: relative;
      }
      .modal-recibo__close {
        position: absolute; top: 20px; right: 20px;
        width: 36px; height: 36px; border-radius: 50%;
        background: var(--surface); border: 1px solid var(--line);
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; color: var(--parchment);
        transition: all 0.15s;
      }
      .modal-recibo__close:hover { background: var(--line); }
      .modal-recibo__actions {
        display: flex; gap: 12px; margin-top: 24px;
        border-top: 1px solid var(--line); padding-top: 24px;
        justify-content: center;
      }
      @keyframes fadeIn {
        from { opacity: 0; transform: scale(0.9); }
        to { opacity: 1; transform: scale(1); }
      }
    `;
    document.head.appendChild(style);
  }
}

// ── TOAST NOTIFICATIONS ─────────────────────
function mostrarToast(mensaje, tipo = 'info') {
  const toast = document.createElement('div');
  toast.className = 'toast ' + (tipo === 'success' ? 'success' : 'error');
  toast.innerHTML = `
    <i class="fa-solid fa-${tipo === 'success' ? 'check-circle' : 'exclamation-circle'}"></i>
    <p>${mensaje}</p>
  `;

  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// ── COUNTDOWN ───────────────────────────────
function updateCountdown() {
  const countdownEl = document.getElementById('countdownTime');
  if (!countdownEl) return;

  const sorteoDate = new Date('2026-08-15T18:00:00').getTime();
  const ahora = Date.now();
  const diferencia = sorteoDate - ahora;

  if (diferencia <= 0) {
    countdownEl.textContent = '¡El sorteo está aquí!';
    return;
  }

  const dias = Math.floor(diferencia / (1000 * 60 * 60 * 24));
  const horas = Math.floor((diferencia % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutos = Math.floor((diferencia % (1000 * 60 * 60)) / (1000 * 60));
  const segundos = Math.floor((diferencia % (1000 * 60)) / 1000);

  countdownEl.textContent = `${dias}d ${horas}h ${minutos}m ${segundos}s`;
}

// ── SCROLL REVEAL ───────────────────────────
function setupScrollReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
}

// ── PREVIEW DE COMPROBANTE ──────────────────
function setupFilePreview() {
  const fileInput = document.getElementById('comprobante');
  const previewWrap = document.getElementById('comprobantePreview');
  const previewImg = document.getElementById('comprobantePreviewImg');

  if (!fileInput) {
    console.warn('⚠️ Input de comprobante no encontrado');
    return;
  }

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];

    if (!file) {
      if (previewWrap) previewWrap.style.display = 'none';
      if (previewImg) previewImg.src = '';
      return;
    }

    const maxMB = 10;

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      mostrarToast('❌ Por favor sube una imagen (jpg, png) o PDF.', 'error');
      fileInput.value = '';
      if (previewWrap) previewWrap.style.display = 'none';
      if (previewImg) previewImg.src = '';
      return;
    }

    if (file.size > maxMB * 1024 * 1024) {
      mostrarToast(`❌ El comprobante no puede superar ${maxMB} MB.`, 'error');
      fileInput.value = '';
      if (previewWrap) previewWrap.style.display = 'none';
      if (previewImg) previewImg.src = '';
      return;
    }

    if (previewImg && previewWrap && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        previewImg.src = e.target.result;
        previewWrap.style.display = 'block';
      };
      reader.readAsDataURL(file);
    } else if (previewWrap) {
      if (previewImg) previewImg.src = '';
      previewWrap.style.display = 'block';
    }
  });
}

console.log('✓ App.js cargado');