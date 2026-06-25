require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');

// ✅ CONFIGURACIÓN META WHATSAPP BUSINESS API
const WHATSAPP_ENABLED = String(process.env.WHATSAPP_ENABLED || '').toLowerCase() === 'true';
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_ID;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;

// ✅ RUTAS Y DIRECTORIOS
const APP_DIR = __dirname;
const DB_FILE = path.join(APP_DIR, 'db.json');
const UPLOAD_DIR = path.join(APP_DIR, 'uploads');
const EXCEL_FILE = path.join(APP_DIR, 'purchases.xlsx');

// ✅ CREAR DIRECTORIOS SI NO EXISTEN
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ✅ INICIALIZAR BD
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({
    purchases: {},
    assignedNumbers: [],
    admins: { admin: { password: 'admin' } },
    adminTokens: {},
    nextTicketNumber: 1
  }, null, 2));
}

// ✅ CONFIGURACIÓN EXPRESS
const app = express();
const PORT = process.env.PORT || process.env.MOCK_PORT || 3000;
const HOST = process.env.MOCK_HOST || '0.0.0.0';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ LOGGER DE REQUESTS
app.use((req, res, next) => {
  console.log(new Date().toISOString(), req.ip, req.method, req.url);
  next();
});

// ✅ SERVIR ARCHIVOS ESTÁTICOS
app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(APP_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
  }
}));

// ✅ CONFIGURACIÓN MULTER (SUBIR ARCHIVOS)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const safe = Date.now() + '-' + file.originalname.replace(/\s+/g, '_');
    cb(null, safe);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Tipo no permitido'));
  }
});

// ✅ FUNCIONES DE BASE DE DATOS
function readDB() {
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!data.purchases) data.purchases = {};
    if (!Array.isArray(data.assignedNumbers)) data.assignedNumbers = [];
    if (!data.admins) data.admins = {};
    if (!data.admins.admin) data.admins.admin = { password: 'admin' };
    if (!data.adminTokens) data.adminTokens = {};
    if (!data.nextTicketNumber) data.nextTicketNumber = 1;
    return data;
  } catch (e) {
    return {
      purchases: {},
      assignedNumbers: [],
      admins: { admin: { password: 'admin' } },
      adminTokens: {},
      nextTicketNumber: 1
    };
  }
}

function writeDBAtomic(db) {
  const tmp = `${DB_FILE}.tmp`;
  try {
    const bak = `${DB_FILE}.bak.${Date.now()}`;
    if (fs.existsSync(DB_FILE)) fs.copyFileSync(DB_FILE, bak);
  } catch (e) {}
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmp, DB_FILE);
}

// ✅ RECONSTRUIR EXCEL DESDE BD
async function rebuildExcelFromDB() {
  const db = readDB();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Compras');
  sheet.addRow(['ID', 'Nombre', 'Cédula', 'Teléfono', 'Correo', 'Cantidad', 'Boletas', 'Total', 'Comprobante', 'Status', 'Fecha']);
  
  Object.values(db.purchases).forEach(p => {
    if (!p) return;
    sheet.addRow([
      p.id || '',
      p.nombre || '',
      p.cedula || '',
      p.celular || '',
      p.email || '',
      p.cantidad || 0,
      (p.boletas || []).map(b => String(b).padStart(5, '0')).join(', ') || '',
      p.total || 0,
      p.comprobanteUrl || '',
      p.status || 'pending',
      p.createdAt || ''
    ]);
  });
  await workbook.xlsx.writeFile(EXCEL_FILE);
}

// ✅ FUNCIÓN PARA ENVIAR WHATSAPP CON META API
async function sendWhatsAppConfirmation(purchase) {
  
  // Validar que WhatsApp esté habilitado
  if (!WHATSAPP_ENABLED) {
    console.log('⚠️ WhatsApp DESHABILITADO en .env');
    return { ok: false, skipped: true, error: 'WhatsApp disabled' };
  }

  // Validar que tengamos las credenciales
  if (!WHATSAPP_PHONE_ID || !WHATSAPP_ACCESS_TOKEN) {
    console.error('❌ FALTA CONFIGURAR:');
    console.error('   - WHATSAPP_PHONE_ID');
    console.error('   - WHATSAPP_ACCESS_TOKEN');
    console.error('Verifica tu archivo .env');
    return { ok: false, skipped: true, error: 'WhatsApp credentials missing' };
  }

  // PASO 1: Limpiar el número de teléfono del cliente
  const recipientPhone = String(purchase.celular || '').replace(/\D/g, '');
  
  // Validar que sea un número válido
  if (recipientPhone.length < 10) {
    console.error('❌ Número inválido:', purchase.celular);
    return { ok: false, error: 'Invalid phone number' };
  }

  // PASO 2: Convertir a formato internacional (+57...)
  let formattedPhone = recipientPhone;
  
  if (!formattedPhone.startsWith('57')) {
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '57' + formattedPhone.slice(1);
    } else if (formattedPhone.length === 10) {
      formattedPhone = '57' + formattedPhone;
    } else {
      formattedPhone = '57' + formattedPhone;
    }
  }

  console.log(`📞 Número original: ${purchase.celular}`);
  console.log(`📞 Número formateado: +${formattedPhone}`);

  // PASO 3: Formatear las boletas
  const boletas = (purchase.boletas || [])
    .map(n => String(n).padStart(5, '0'))
    .join(', ');

  // PASO 4: Crear el mensaje
  const mensajeText = `✅ *COMPRA CONFIRMADA - MANGLATER*

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

  // PASO 5: Enviar a Meta API
  try {
    console.log(`\n📤 ENVIANDO WHATSAPP...`);
    console.log(`   A: +${formattedPhone}`);
    console.log(`   Cliente: ${purchase.nombre}`);
    console.log(`   Boletas: ${boletas}`);

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
          to: formattedPhone,
          type: 'text',
          text: {
            body: mensajeText
          }
        })
      }
    );

    // PASO 6: Procesar la respuesta
    const result = await response.json();

    if (result.messages && result.messages[0]) {
      console.log(`✅ WhatsApp ENVIADO EXITOSAMENTE!`);
      console.log(`   Message ID: ${result.messages[0].id}`);
      
      return {
        ok: true,
        messageId: result.messages[0].id,
        to: formattedPhone,
        timestamp: new Date().toISOString()
      };
    } else {
      console.error(`❌ ERROR ENVIANDO WHATSAPP:`);
      console.error(JSON.stringify(result, null, 2));
      
      return { 
        ok: false, 
        error: result.error?.message || 'Unknown error from Meta' 
      };
    }

  } catch (e) {
    console.error('❌ ERROR EN LA CONEXIÓN CON META API:');
    console.error(e.message);
    return { ok: false, error: e.message };
  }
}

// ✅ ENDPOINTS API

// Health check
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ✅ Endpoint de estadísticas (medidor)
app.get('/api/stats', (req, res) => {
  try {
    const db = readDB();
    const totalBoletos = 100000;
    const vendidos = Array.isArray(db.assignedNumbers) ? db.assignedNumbers.length : 0;
    const disponibles = Math.max(0, totalBoletos - vendidos);
    const porcentaje = Math.round((vendidos / totalBoletos) * 100);

    res.json({
      ok: true,
      totalBoletos,
      vendidos,
      disponibles,
      porcentaje
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ✅ Endpoint para subir comprobante
app.post('/api/upload-comprobante', upload.single('comprobante'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ ok: false, error: 'No file uploaded' });
  }
  res.json({
    ok: true,
    url: `/uploads/${req.file.filename}`,
    filename: req.file.filename
  });
});

// Crear compra
app.post('/api/create-purchase', upload.single('comprobante'), async (req, res) => {
  try {
    const body = req.body || {};
    const file = req.file;
    const db = readDB();

    const id = 'MCK-' + Date.now();
    const purchase = {
      id,
      nombre: body.nombre || '',
      cedula: body.cedula || '',
      celular: body.celular || '',
      email: body.email || '',
      cantidad: Number(body.cantidad || 1),
      total: Number(body.total || 0),
      comprobanteUrl: file ? `/uploads/${file.filename}` : '',
      status: 'pending',
      boletas: [],
      createdAt: new Date().toISOString()
    };

    db.purchases[id] = purchase;
    writeDBAtomic(db);
    await rebuildExcelFromDB();

    console.log(`✓ Compra creada: ${id} | ${purchase.nombre} | ${purchase.celular}`);
    res.json({ ok: true, purchaseId: id, purchase });
  } catch (err) {
    console.error('Create purchase error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Compras pendientes
app.get('/api/pending-purchases', (req, res) => {
  try {
    const db = readDB();
    const pending = Object.values(db.purchases).filter(p => p && p.status === 'pending');
    res.json({ ok: true, purchases: pending });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Buscar por celular o cédula
app.get('/api/my-purchases', (req, res) => {
  try {
    const { cedula, celular, id } = req.query;
    const db = readDB();

    if (id) {
      const p = db.purchases[id];
      if (!p) return res.status(404).json({ ok: false, error: 'Not found' });
      return res.json({ ok: true, purchase: p });
    }

    if (celular) {
      const normalized = String(celular).replace(/\D/g, '');
      const list = Object.values(db.purchases).filter(p => 
        p && String(p.celular || '').replace(/\D/g, '') === normalized
      );
      return res.json({ ok: true, purchases: list });
    }

    if (!cedula) return res.status(400).json({ ok: false, error: 'cedula o celular required' });

    const list = Object.values(db.purchases).filter(p => p && p.cedula === cedula);
    res.json({ ok: true, purchases: list });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Admin register
app.post('/api/admin-register', (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ ok: false, error: 'username y password requeridos' });

    const db = readDB();
    if (db.admins[username]) return res.status(400).json({ ok: false, error: 'ya existe' });

    db.admins[username] = { password };
    writeDBAtomic(db);
    res.json({ ok: true, username });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Admin login
app.post('/api/admin-login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    const db = readDB();
    const admin = db.admins[username];

    if (!admin || admin.password !== password) {
      return res.status(401).json({ ok: false, error: 'credenciales inválidas' });
    }

    const token = 'AT-' + uuidv4();
    db.adminTokens[token] = { username, createdAt: new Date().toISOString() };
    writeDBAtomic(db);

    console.log(`✓ Admin login: ${username}`);
    res.json({ ok: true, token, username });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

let confirming = false;

// Confirmar compra con WhatsApp
app.post('/api/confirm-purchase', async (req, res) => {
  try {
    const token = req.headers['x-admin-token'];
    const db = readDB();

    if (!token) return res.status(401).json({ ok: false, error: 'token requerido' });
    if (!db.adminTokens[token]) return res.status(403).json({ ok: false, error: 'token inválido' });

    const { purchaseId } = req.body || {};
    if (!purchaseId) return res.status(400).json({ ok: false, error: 'purchaseId requerido' });

    if (confirming) return res.status(423).json({ ok: false, error: 'en proceso' });
    confirming = true;

    try {
      const purchase = db.purchases[purchaseId];
      if (!purchase) {
        confirming = false;
        return res.status(404).json({ ok: false, error: 'no encontrada' });
      }

      if (purchase.status === 'confirmed') {
        confirming = false;
        return res.status(400).json({ ok: false, error: 'ya confirmada' });
      }

      const assignedNumbers = Array.isArray(db.assignedNumbers) ? db.assignedNumbers : [];
      let next = db.nextTicketNumber || 1;
      const boletas = [];
      const cantidadNecesaria = purchase.cantidad || 1;

      while (boletas.length < cantidadNecesaria) {
        if (!assignedNumbers.includes(next)) {
          boletas.push(next);
          assignedNumbers.push(next);
        }
        next++;
      }

      purchase.status = 'confirmed';
      purchase.boletas = boletas;
      purchase.confirmedAt = new Date().toISOString();

      db.assignedNumbers = assignedNumbers;
      db.purchases[purchaseId] = purchase;
      db.nextTicketNumber = next;
      writeDBAtomic(db);
      await rebuildExcelFromDB();

      // ✅ ENVIAR WHATSAPP
      const whatsapp = await sendWhatsAppConfirmation(purchase);

      console.log(`✓ CONFIRMADA: ${purchase.nombre} | Boletas: ${boletas.join(', ')}`);
      console.log('📲 WhatsApp:', whatsapp);

      confirming = false;
      res.json({ ok: true, boletas, purchase, whatsapp });
    } catch (e) {
      confirming = false;
      throw e;
    }
  } catch (e) {
    console.error('Confirm error:', e);
    confirming = false;
    res.status(500).json({ ok: false, error: e.message });
  }
});

// DB dump
app.get('/api/db', (req, res) => {
  try {
    res.json(readDB());
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// ✅ VALIDAR CONFIGURACIÓN ANTES DE INICIAR
console.log(`\n🔧 VALIDANDO CONFIGURACIÓN...`);

if (!WHATSAPP_PHONE_ID) {
  console.error('❌ ERROR: Falta WHATSAPP_PHONE_ID en .env');
  process.exit(1);
}
if (!WHATSAPP_ACCESS_TOKEN) {
  console.error('❌ ERROR: Falta WHATSAPP_ACCESS_TOKEN en .env');
  process.exit(1);
}
if (!process.env.WHATSAPP_ENABLED) {
  console.warn('⚠️ ADVERTENCIA: WHATSAPP_ENABLED no configurado en .env');
}

console.log(`✅ Configuración válida\n`);

// ✅ INICIAR SERVIDOR
app.listen(PORT, HOST, () => {
  console.log(`\n🚀 SERVIDOR MANGLATER`);
  console.log(`📍 URL: http://localhost:${PORT}`);
  console.log(`💾 DB: ${DB_FILE}`);
  console.log(`📂 Uploads: ${UPLOAD_DIR}`);
  console.log(`📊 Excel: ${EXCEL_FILE}`);
  console.log(`🔑 Admin: admin / admin`);
  console.log(`\n📱 WhatsApp Config:`);
  console.log(`   Enabled: ${WHATSAPP_ENABLED ? '✅ SÍ' : '❌ NO'}`);
  console.log(`   Phone ID: ${WHATSAPP_PHONE_ID ? '✅ Configurado' : '❌ Falta'}`);
  console.log(`   Token: ${WHATSAPP_ACCESS_TOKEN ? '✅ Configurado' : '❌ Falta'}\n`);
});