let selectedPackage = null;
let selectedQuantity = 0;
let selectedPrice = 0;
let manualSelectedNumbers = [];
let manualNumberCheckTimeout = null;
let lastManualAvailability = null;


document.addEventListener('DOMContentLoaded', () => {
  console.log('✓ App.js cargado');
  console.log('✓ App inicializado');

  actualizarMedidores();
  setupScrollReveal();
  updateCountdown();
  setInterval(updateCountdown, 1000);
  setupEventListeners();
  setupFilePreview();
  setupContinueButton();
  setupTicketMode();
  setupManualPicker();
});

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

function getTicketMode() {
  const checked = document.querySelector('input[name="ticketMode"]:checked');
  return checked ? checked.value : 'auto';
}

function setupTicketMode() {
  const radios = document.querySelectorAll('input[name="ticketMode"]');
  radios.forEach(radio => {
    radio.addEventListener('change', () => {
      updateManualNumbersHelp();
      renderManualTickets();
    });
  });

  updateManualNumbersHelp();
}

function setupManualPicker() {
  const btn = document.getElementById('btnAddManualNumber');
  const input = document.getElementById('manualNumberField');

  if (btn) {
    btn.addEventListener('click', addManualNumberFromInput);
  }

  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addManualNumberFromInput();
      }
    });

    input.addEventListener('input', () => {
      clearTimeout(manualNumberCheckTimeout);

      const value = Number(input.value);
      const status = document.getElementById('manualNumberStatus');

      input.classList.remove('is-valid', 'is-invalid');
      lastManualAvailability = null;

      if (!input.value.trim()) {
        if (status) status.innerHTML = '';
        return;
      }

      if (!Number.isInteger(value) || value < 1 || value > 100000) {
        input.classList.add('is-invalid');
        if (status) {
          status.innerHTML = `
            <div class="manual-number-status manual-number-status--error">
              <i class="fa-solid fa-circle-xmark"></i>
              Número inválido. Debe estar entre 1 y 100000.
            </div>
          `;
        }
        return;
      }

      if (manualSelectedNumbers.includes(value)) {
        input.classList.add('is-invalid');
        if (status) {
          status.innerHTML = `
            <div class="manual-number-status manual-number-status--error">
              <i class="fa-solid fa-circle-xmark"></i>
              Ese número ya lo agregaste a tu selección.
            </div>
          `;
        }
        return;
      }

      manualNumberCheckTimeout = setTimeout(() => {
        checkManualNumberAvailability(value);
      }, 350);
    });
  }

  renderManualTickets();
}

async function checkManualNumberAvailability(number) {
  const input = document.getElementById('manualNumberField');
  const status = document.getElementById('manualNumberStatus');

  if (!input || !status) return;

  try {
    status.innerHTML = `
      <div class="manual-number-status" style="background:rgba(255,255,255,0.05); border:1px solid rgba(255,255,255,0.08); color:#ddd;">
        <i class="fa-solid fa-spinner fa-spin"></i>
        Verificando disponibilidad...
      </div>
    `;

    const response = await fetch(`/api/check-number/${number}`);
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || 'No se pudo verificar el número');
    }

    lastManualAvailability = result.available;

    input.classList.remove('is-valid', 'is-invalid');

    if (result.available) {
      input.classList.add('is-valid');
      status.innerHTML = `
        <div class="manual-number-status manual-number-status--ok">
          <i class="fa-solid fa-circle-check"></i>
          El número ${String(number).padStart(5, '0')} está disponible.
        </div>
      `;
    } else {
      input.classList.add('is-invalid');
      status.innerHTML = `
        <div class="manual-number-status manual-number-status--error">
          <i class="fa-solid fa-circle-xmark"></i>
          El número ${String(number).padStart(5, '0')} ya fue comprado. Elige otro.
        </div>
      `;
    }
  } catch (error) {
    input.classList.remove('is-valid', 'is-invalid');
    input.classList.add('is-invalid');
    lastManualAvailability = false;

    status.innerHTML = `
      <div class="manual-number-status manual-number-status--error">
        <i class="fa-solid fa-triangle-exclamation"></i>
        ${error.message}
      </div>
    `;
  }
}

async function addManualNumberFromInput() {
  const input = document.getElementById('manualNumberField');
  const status = document.getElementById('manualNumberStatus');
  if (!input) return;

  const mode = getTicketMode();
  if (mode !== 'manual') {
    mostrarToast('❌ Activa primero la selección manual.', 'error');
    return;
  }

  if (!selectedQuantity) {
    mostrarToast('❌ Primero selecciona un paquete.', 'error');
    return;
  }

  const value = Number(input.value);

  if (!Number.isInteger(value) || value < 1 || value > 100000) {
    mostrarToast('❌ Ingresa un número válido entre 1 y 100000.', 'error');
    input.classList.remove('is-valid');
    input.classList.add('is-invalid');
    return;
  }

  if (manualSelectedNumbers.includes(value)) {
    mostrarToast('❌ Ese número ya fue agregado.', 'error');
    input.classList.remove('is-valid');
    input.classList.add('is-invalid');
    return;
  }

  if (manualSelectedNumbers.length >= selectedQuantity) {
    mostrarToast(`❌ Solo puedes elegir ${selectedQuantity} números en este paquete.`, 'error');
    return;
  }

  try {
    const response = await fetch(`/api/check-number/${value}`);
    const result = await response.json();

    if (!response.ok || !result.ok) {
      throw new Error(result.error || 'No se pudo validar el número');
    }

    if (!result.available) {
      input.classList.remove('is-valid');
      input.classList.add('is-invalid');

      if (status) {
        status.innerHTML = `
          <div class="manual-number-status manual-number-status--error">
            <i class="fa-solid fa-circle-xmark"></i>
            El número ${String(value).padStart(5, '0')} ya fue comprado. Elige otro.
          </div>
        `;
      }

      mostrarToast('❌ Ese número ya fue comprado.', 'error');
      return;
    }

    manualSelectedNumbers.push(value);
    input.value = '';
    input.classList.remove('is-valid', 'is-invalid');
    lastManualAvailability = null;

    if (status) {
      status.innerHTML = `
        <div class="manual-number-status manual-number-status--ok">
          <i class="fa-solid fa-circle-check"></i>
          Número agregado correctamente.
        </div>
      `;
    }

    renderManualTickets();
    updateManualNumbersHelp();
  } catch (error) {
    input.classList.remove('is-valid');
    input.classList.add('is-invalid');
    mostrarToast(`❌ ${error.message}`, 'error');
  }
}

function removeManualNumber(number) {
  manualSelectedNumbers = manualSelectedNumbers.filter(n => n !== number);
  renderManualTickets();
  updateManualNumbersHelp();
}

function renderManualTickets() {
  const grid = document.getElementById('manualTicketsPreview');
  const counter = document.getElementById('manualNumbersCounter');
  const section = document.getElementById('manualNumbersSection');
  const mode = getTicketMode();

  if (!grid || !counter || !section) return;

  if (mode !== 'manual') {
    section.style.display = 'none';
    grid.innerHTML = '';
    counter.textContent = '0 seleccionados';
    return;
  }

  section.style.display = 'block';
  counter.textContent = `${manualSelectedNumbers.length} seleccionados${selectedQuantity ? ` de ${selectedQuantity}` : ''}`;

  if (manualSelectedNumbers.length === 0) {
    grid.innerHTML = '';
    return;
  }

  grid.innerHTML = manualSelectedNumbers
    .map(number => `
      <div class="manual-ticket">
        <div class="manual-ticket__top">
          <span class="manual-ticket__label">
            <i class="fa-solid fa-ticket"></i> BOLETO
          </span>
          <button type="button" class="manual-ticket__remove" onclick="removeManualNumber(${number})" aria-label="Eliminar número ${number}">
            <i class="fa-solid fa-xmark"></i>
          </button>
        </div>
        <div class="manual-ticket__number">${String(number).padStart(5, '0')}</div>
        <div class="manual-ticket__foot">Manglater • Selección manual</div>
      </div>
    `)
    .join('');
}

async function validateManualNumbers() {
  const mode = getTicketMode();
  if (mode !== 'manual') {
    return { ok: true, numbers: [] };
  }

  if (!selectedQuantity) {
    return { ok: false, error: 'Primero debes seleccionar un paquete.' };
  }

  if (manualSelectedNumbers.length !== selectedQuantity) {
    return {
      ok: false,
      error: `Debes elegir exactamente ${selectedQuantity} números para este paquete.`
    };
  }

  const invalid = manualSelectedNumbers.filter(n => n < 1 || n > 100000);
  if (invalid.length > 0) {
    return { ok: false, error: 'Todos los números deben estar entre 1 y 100000.' };
  }

  const unique = new Set(manualSelectedNumbers);
  if (unique.size !== manualSelectedNumbers.length) {
    return { ok: false, error: 'No puedes repetir números.' };
  }

  try {
    for (const number of manualSelectedNumbers) {
      const response = await fetch(`/api/check-number/${number}`);
      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.error || 'No se pudo validar uno de los números');
      }

      if (!result.available) {
        return {
          ok: false,
          error: `El número ${String(number).padStart(5, '0')} ya fue comprado.`
        };
      }
    }
  } catch (error) {
    return { ok: false, error: error.message };
  }

  return { ok: true, numbers: [...manualSelectedNumbers] };
}

function updateManualNumbersHelp() {
  const mode = getTicketMode();
  const help = document.getElementById('manualNumbersHelp');

  if (!help) return;

  if (mode !== 'manual') {
    help.innerHTML = '';
    return;
  }

  if (!selectedQuantity) {
    help.innerHTML = '<span style="color:#f39c12;">Selecciona primero un paquete.</span>';
    return;
  }

  const faltan = selectedQuantity - manualSelectedNumbers.length;

  if (faltan > 0) {
    help.innerHTML = `<span style="color:#f39c12;">Te faltan ${faltan} número(s) por elegir.</span>`;
  } else if (faltan === 0) {
    help.innerHTML = `<span style="color:#5c8a5f;">✓ Ya completaste tus ${selectedQuantity} números.</span>`;
  } else {
    help.innerHTML = `<span style="color:#e74c3c;">Tienes más números de los permitidos.</span>`;
  }
}

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

  if (manualSelectedNumbers.length > selectedQuantity) {
    manualSelectedNumbers = manualSelectedNumbers.slice(0, selectedQuantity);
  }

  console.log(`📦 Paquete: ${selectedQuantity} números por $${selectedPrice}`);
  mostrarResumen();
  updateManualNumbersHelp();
  renderManualTickets();
}

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

function setupContinueButton() {
  const btnContinuar = document.getElementById('btn-continuar');
  if (btnContinuar) {
    btnContinuar.addEventListener('click', (e) => {
      e.preventDefault();
if (selectedQuantity === 0) {
    mostrarToast('❌ Primero selecciona un paquete.', 'error');
    return;
  }

  const mode = getTicketMode();
  if (mode === 'manual') {
    const validation =  validateManualNumbers();
    if (!validation.ok) {
      mostrarToast(`❌ ${validation.error}`, 'error');
      return;
    }
  }

  const checkoutSection = document.getElementById('checkoutSection');
  if (checkoutSection) {
    checkoutSection.style.display = 'block';
    checkoutSection.scrollIntoView({ behavior: 'smooth' });
  }
});
  }
}

function setupEventListeners() {
  const form = document.getElementById('formulario-pago');
  if (form) {
    form.addEventListener('submit', handleFormSubmit);
    console.log('✓ Formulario conectado');
  }
}

async function handleFormSubmit(e) {
  e.preventDefault();
  console.log('📋 Formulario enviado');

  if (selectedQuantity === 0) {
    mostrarToast('❌ Por favor selecciona un paquete', 'error');
    return;
  }

  const mode = getTicketMode();
  let manualNumbers = [];

  if (mode === 'manual') {
    const validation =  validateManualNumbers();
    if (!validation.ok) {
      mostrarToast(`❌ ${validation.error}`, 'error');
      return;
    }
    manualNumbers = validation.numbers;
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
    formData.append('ticketMode', mode);
    formData.append('manualNumbers', JSON.stringify(manualNumbers));
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
      <p>Modo de selección: <strong>${mode === 'manual' ? 'Manual' : 'Automático'}</strong></p>
      ${mode === 'manual' ? `<p>Números elegidos: <strong>${manualNumbers.map(n => String(n).padStart(5, '0')).join(', ')}</strong></p>` : ''}
      <p>Total: <strong>$${selectedPrice.toLocaleString('es-CO')}</strong></p>
      <p style="color: #f39c12; font-weight: bold;">⏳ Estado: PENDIENTE DE VERIFICACIÓN</p>
      <p>Tu comprobante está siendo verificado. Cuando se confirme la compra, recibirás un correo con tus números asignados.</p>
      <p style="font-size: 0.9rem; color: #888;">Si no lo ves en tu bandeja principal, revisa spam, promociones o correo no deseado.</p>
      <p style="font-size: 0.9rem; color: #888;">Revisa tu correo: <strong>${email}</strong></p>
    `);

    mostrarToast('✓ Compra registrada. Pendiente de verificación.', 'success');

    e.target.reset();
    selectedQuantity = 0;
    selectedPrice = 0;
    selectedPackage = null;
    manualSelectedNumbers = [];

    document.querySelectorAll('.package-card').forEach(card => {
      card.classList.remove('is-selected');
    });

    const previewWrap = document.getElementById('comprobantePreview');
    const previewImg = document.getElementById('comprobantePreviewImg');
    const summaryBar = document.getElementById('summaryBar');
    const checkoutSection = document.getElementById('checkoutSection');
    const help = document.getElementById('manualNumbersHelp');
    const autoRadio = document.querySelector('input[name="ticketMode"][value="auto"]');
    const input = document.getElementById('manualNumberField');

    if (previewWrap) previewWrap.style.display = 'none';
    if (previewImg) previewImg.src = '';
    if (summaryBar) summaryBar.style.display = 'none';
    if (checkoutSection) checkoutSection.style.display = 'none';
    if (help) help.innerHTML = '';
    if (input) input.value = '';
    if (autoRadio) autoRadio.checked = true;

    renderManualTickets();
    updateManualNumbersHelp();
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