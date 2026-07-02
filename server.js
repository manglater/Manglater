require('dotenv').config();

const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const ExcelJS = require('exceljs');

const EMAIL_ENABLED = String(process.env.EMAIL_ENABLED || '').toLowerCase() === 'true';
const EMAIL_FROM = process.env.EMAIL_FROM || 'Manglater <Manglater1225@gmail.com>';
const EMAIL_USER = process.env.EMAIL_USER || 'Manglater1225@gmail.com';
const EMAIL_PASS = process.env.EMAIL_PASS;

const APP_DIR = __dirname;
const DB_FILE = path.join(APP_DIR, 'db.json');
const UPLOAD_DIR = path.join(APP_DIR, 'uploads');
const EXCEL_FILE = path.join(APP_DIR, 'purchases.xlsx');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({
    purchases: {},
    assignedNumbers: [],
    admins: {
      admin: { password: 'admin' },
      admin1: { password: 'admin1' },
      admin2: { password: 'admin2' }
    },
    adminTokens: {},
    nextTicketNumber: 1
  }, null, 2));
}

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use((req, res, next) => {
  console.log(new Date().toISOString(), req.ip, req.method, req.url);
  next();
});

app.use('/uploads', express.static(UPLOAD_DIR));
app.use(express.static(APP_DIR, {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.js')) {
      res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
  }
}));

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

function readDB() {
  try {
    const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!data.purchases) data.purchases = {};
    if (!Array.isArray(data.assignedNumbers)) data.assignedNumbers = [];
    if (!data.admins) data.admins = {};
    if (!data.admins.admin) data.admins.admin = { password: 'admin' };
    if (!data.admins.admin1) data.admins.admin1 = { password: 'admin1' };
    if (!data.admins.admin2) data.admins.admin2 = { password: 'admin2' };
    if (!data.adminTokens) data.adminTokens = {};
    if (!data.nextTicketNumber) data.nextTicketNumber = 1;
    return data;
  } catch (e) {
    return {
      purchases: {},
      assignedNumbers: [],
      admins: {
        admin: { password: 'admin' },
        admin1: { password: 'admin1' },
        admin2: { password: 'admin2' }
      },
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

function parseManualNumbers(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map(n => Number(n)).filter(n => Number.isInteger(n));
  } catch (e) {
    return [];
  }
}

function validateManualNumbers(numbers, cantidad) {
  if (!Array.isArray(numbers)) {
    return { ok: false, error: 'manualNumbers inválido' };
  }

  if (numbers.length !== cantidad) {
    return { ok: false, error: `Debes seleccionar exactamente ${cantidad} números` };
  }

  const invalid = numbers.filter(n => n < 1 || n > 100000);
  if (invalid.length > 0) {
    return { ok: false, error: 'Todos los números deben estar entre 1 y 100000' };
  }

  const unique = new Set(numbers);
  if (unique.size !== numbers.length) {
    return { ok: false, error: 'No se permiten números repetidos en selección manual' };
  }

  return { ok: true };
}

async function rebuildExcelFromDB() {
  const db = readDB();
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Compras');

  sheet.addRow([
    'ID', 'Nombre', 'Cédula', 'Teléfono', 'Correo', 'Ciudad', 'Cantidad',
    'Modo', 'Números solicitados', 'Boletas asignadas',
    'Total', 'Comprobante', 'Status', 'Fecha'
  ]);

  Object.values(db.purchases).forEach(p => {
    if (!p) return;
    sheet.addRow([
      p.id || '',
      p.nombre || '',
      p.cedula || '',
      p.celular || '',
      p.email || '',
      p.ciudad || '',
      p.cantidad || 0,
      p.ticketMode || 'auto',
      (p.manualNumbers || []).map(b => String(b).padStart(5, '0')).join(', '),
      (p.boletas || []).map(b => String(b).padStart(5, '0')).join(', '),
      p.total || 0,
      p.comprobanteUrl || '',
      p.status || 'pending',
      p.createdAt || ''
    ]);
  });

  await workbook.xlsx.writeFile(EXCEL_FILE);
}

function getEmailTransporter() {
  if (!EMAIL_ENABLED || !EMAIL_USER || !EMAIL_PASS) return null;

  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    }
  });
}

async function sendPurchaseConfirmationEmail(purchase) {
  if (!EMAIL_ENABLED) {
    console.log('⚠️ Email deshabilitado');
    return { ok: false, skipped: true, error: 'Email disabled' };
  }

  if (!purchase.email) {
    return { ok: false, error: 'Purchase has no email' };
  }

  const transporter = getEmailTransporter();
  if (!transporter) {
    return { ok: false, error: 'Email transporter not configured' };
  }

  const boletas = (purchase.boletas || [])
    .map(n => String(n).padStart(5, '0'))
    .join(', ');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#222;max-width:640px;margin:0 auto;">
      <h2 style="color:#8a6418;margin-bottom:12px;">Confirmación de compra</h2>

      <p>Hola <strong>${purchase.nombre || 'cliente'}</strong>,</p>

      <p>
        Este correo confirma que tu compra fue verificada correctamente en <strong>Manglater</strong>
        y que tus números ya fueron asignados.
      </p>

      <div style="background:#f8f8f8;padding:16px 18px;border-radius:10px;border:1px solid #ddd;margin:18px 0;">
        <p style="margin:0 0 8px;"><strong>ID de compra:</strong> ${purchase.id}</p>
        <p style="margin:0 0 8px;"><strong>Cantidad:</strong> ${purchase.cantidad || 0}</p>
        <p style="margin:0 0 8px;"><strong>Total registrado:</strong> $${Number(purchase.total || 0).toLocaleString('es-CO')}</p>
        <p style="margin:0;"><strong>Números asignados:</strong> ${boletas}</p>
      </div>

      <p>
        Si deseas consultarlos nuevamente, puedes hacerlo desde la página usando este mismo correo electrónico.
      </p>

      <div style="margin-top:18px;padding:12px 14px;background:#fff8e8;border:1px solid #ecd9a2;border-radius:10px;color:#5f4a12;">
        <strong>Importante:</strong> si no vuelves a ver nuestros correos en tu bandeja principal,
        revisa las carpetas de <strong>Spam</strong>, <strong>No deseado</strong> o <strong>Promociones</strong>
        y marca este mensaje como seguro.
      </div>

      <p style="margin-top:22px;">
        Gracias por tu compra.
      </p>

      <p style="margin-top:20px;color:#666;font-size:14px;">
        Equipo Manglater<br>
        Manglater1225@gmail.com
      </p>
    </div>
  `;

  try {
    const info = await transporter.sendMail({
      from: EMAIL_FROM,
      to: purchase.email,
      subject: 'Confirmación de compra y asignación de números - Manglater',
      html,
      text: `Hola ${purchase.nombre || 'cliente'}. Tu compra en Manglater fue verificada correctamente. ID de compra: ${purchase.id}. Números asignados: ${boletas}. Si no encuentras próximos correos en tu bandeja principal, revisa spam, no deseado o promociones.`
    });

    return {
      ok: true,
      messageId: info.messageId
    };
  } catch (e) {
    console.error('Email send error:', e.message);
    return { ok: false, error: e.message };
  }
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
    emailEnabled: EMAIL_ENABLED,
    emailFrom: EMAIL_FROM
  });
});

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

app.post('/api/create-purchase', upload.single('comprobante'), async (req, res) => {
  try {
    const body = req.body || {};
    const file = req.file;
    const db = readDB();

    const cantidad = Number(body.cantidad || 1);
    const total = Number(body.total || 0);
    const ticketMode = body.ticketMode === 'manual' || body.ticketMode === 'visual' ? body.ticketMode : 'auto';
    const manualNumbers = (ticketMode === 'manual' || ticketMode === 'visual') ? parseManualNumbers(body.manualNumbers) : [];

    if (ticketMode === 'manual' || ticketMode === 'visual') {
      const validation = validateManualNumbers(manualNumbers, cantidad);
      if (!validation.ok) {
        return res.status(400).json({ ok: false, error: validation.error });
      }
    }

    const id = 'MCK-' + Date.now();
    const purchase = {
      id,
      nombre: body.nombre || '',
      cedula: body.cedula || '',
      celular: body.celular || '',
      email: String(body.email || '').trim().toLowerCase(),
      ciudad: body.ciudad || '',
      cantidad,
      total,
      ticketMode,
      manualNumbers,
      comprobanteUrl: file ? `/uploads/${file.filename}` : '',
      status: 'pending',
      boletas: [],
      createdAt: new Date().toISOString()
    };

    db.purchases[id] = purchase;
    writeDBAtomic(db);
    await rebuildExcelFromDB();

    console.log(`✓ Compra creada: ${id} | ${purchase.nombre} | ${purchase.email} | modo: ${ticketMode}`);
    res.json({ ok: true, purchaseId: id, purchase });
  } catch (err) {
    console.error('Create purchase error:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.get('/api/pending-purchases', (req, res) => {
  try {
    const db = readDB();
    const pending = Object.values(db.purchases).filter(p => p && p.status === 'pending');
    res.json({ ok: true, purchases: pending });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/my-purchases', (req, res) => {
  try {
    const { email, celular, id } = req.query;
    const db = readDB();

    if (id) {
      const p = db.purchases[id];
      if (!p) return res.status(404).json({ ok: false, error: 'Not found' });
      return res.json({ ok: true, purchase: p });
    }

    if (celular) {
      const normalized = String(celular).replace(/\D/g, '');
      const list = Object.values(db.purchases).filter(
        p => p && String(p.celular || '').replace(/\D/g, '') === normalized
      );
      return res.json({ ok: true, purchases: list });
    }

    if (!email) {
      return res.status(400).json({ ok: false, error: 'email requerido' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const list = Object.values(db.purchases).filter(
      p => p && String(p.email || '').trim().toLowerCase() === normalizedEmail
    );

    res.json({ ok: true, purchases: list });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/admin-register', (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ ok: false, error: 'username y password requeridos' });
    }

    const db = readDB();
    if (db.admins[username]) {
      return res.status(400).json({ ok: false, error: 'ya existe' });
    }

    db.admins[username] = { password };
    writeDBAtomic(db);
    res.json({ ok: true, username });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

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
      let boletas = [];
      const cantidadNecesaria = purchase.cantidad || 1;

      if (purchase.ticketMode === 'manual' || purchase.ticketMode === 'visual') {
        const manualNumbers = Array.isArray(purchase.manualNumbers) ? purchase.manualNumbers : [];

        const validation = validateManualNumbers(manualNumbers, cantidadNecesaria);
        if (!validation.ok) {
          confirming = false;
          return res.status(400).json({ ok: false, error: validation.error });
        }

        const alreadyTaken = manualNumbers.filter(n => assignedNumbers.includes(n));
        if (alreadyTaken.length > 0) {
          confirming = false;
          return res.status(409).json({
            ok: false,
            error: `Estos números ya no están disponibles: ${alreadyTaken.join(', ')}`
          });
        }

        boletas = [...manualNumbers];
        assignedNumbers.push(...manualNumbers);
      } else {
        const assignedSet = new Set(assignedNumbers);

        while (boletas.length < cantidadNecesaria) {
          const randomNumber = Math.floor(Math.random() * 100000) + 1;

          if (!assignedSet.has(randomNumber)) {
            boletas.push(randomNumber);
            assignedNumbers.push(randomNumber);
            assignedSet.add(randomNumber);
          }
        }
      }

      purchase.status = 'confirmed';
      purchase.boletas = boletas;
      purchase.confirmedAt = new Date().toISOString();

      db.assignedNumbers = assignedNumbers;
      db.purchases[purchaseId] = purchase;

      writeDBAtomic(db);
      await rebuildExcelFromDB();

      const emailResult = await sendPurchaseConfirmationEmail(purchase);

      console.log(`✓ CONFIRMADA: ${purchase.nombre} | Boletas: ${boletas.join(', ')}`);
      console.log('📧 Email:', emailResult);

      confirming = false;
      res.json({ ok: true, boletas, purchase, email: emailResult });
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

app.get('/api/check-number/:number', (req, res) => {
  try {
    const number = Number(req.params.number);
    const db = readDB();

    if (!Number.isInteger(number) || number < 1 || number > 100000) {
      return res.status(400).json({
        ok: false,
        available: false,
        error: 'Número inválido'
      });
    }

    const assignedNumbers = Array.isArray(db.assignedNumbers) ? db.assignedNumbers : [];
    const available = !assignedNumbers.includes(number);

    res.json({
      ok: true,
      number,
      available
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      available: false,
      error: e.message
    });
  }
});

app.get('/api/assigned-numbers', (req, res) => {
  try {
    const db = readDB();
    res.json({ ok: true, assignedNumbers: db.assignedNumbers || [] });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/admin-search-by-ticket', (req, res) => {
  try {
    const token = req.headers['x-admin-token'];
    if (!token) return res.status(401).json({ ok: false, error: 'token requerido' });

    const db = readDB();
    if (!db.adminTokens[token]) return res.status(403).json({ ok: false, error: 'token inválido' });

    const { number } = req.query;
    if (!number) {
      return res.status(400).json({ ok: false, error: 'número de ticket requerido' });
    }

    const ticketNum = Number(number);
    if (!Number.isInteger(ticketNum) || ticketNum < 1 || ticketNum > 100000) {
      return res.status(400).json({ ok: false, error: 'Número de ticket inválido (1-100000)' });
    }

    const results = Object.values(db.purchases).filter(p => {
      if (!p) return false;
      const boletas = Array.isArray(p.boletas) ? p.boletas : [];
      const manualNums = Array.isArray(p.manualNumbers) ? p.manualNumbers : [];
      return boletas.includes(ticketNum) || manualNums.includes(ticketNum);
    });

    res.json({ ok: true, purchases: results, ticketNumber: ticketNum });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.post('/api/update-purchase-field', (req, res) => {
  try {
    const token = req.headers['x-admin-token'];
    if (!token) return res.status(401).json({ ok: false, error: 'token requerido' });

    const db = readDB();
    if (!db.adminTokens[token]) return res.status(403).json({ ok: false, error: 'token inválido' });

    const { purchaseId, field, value } = req.body || {};
    if (!purchaseId || !field) {
      return res.status(400).json({ ok: false, error: 'purchaseId y field requeridos' });
    }

    const allowedFields = ['ciudad', 'nombre', 'cedula', 'celular', 'email'];
    if (!allowedFields.includes(field)) {
      return res.status(400).json({ ok: false, error: 'Campo no permitido para edición' });
    }

    const purchase = db.purchases[purchaseId];
    if (!purchase) {
      return res.status(404).json({ ok: false, error: 'Compra no encontrada' });
    }

    purchase[field] = value;
    db.purchases[purchaseId] = purchase;
    writeDBAtomic(db);
    rebuildExcelFromDB();

    console.log(`✓ Campo actualizado: ${purchaseId} → ${field} = "${value}"`);
    res.json({ ok: true, purchase });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

app.get('/api/admin-search-by-name', (req, res) => {
  try {
    const token = req.headers['x-admin-token'];
    if (!token) return res.status(401).json({ ok: false, error: 'token requerido' });

    const db = readDB();
    if (!db.adminTokens[token]) return res.status(403).json({ ok: false, error: 'token inválido' });

    const { name } = req.query;
    if (!name || !name.trim()) {
      return res.status(400).json({ ok: false, error: 'nombre requerido' });
    }

    const query = name.trim().toLowerCase();
    const results = Object.values(db.purchases).filter(p => {
      return p && p.nombre && p.nombre.toLowerCase().includes(query);
    });

    res.json({ ok: true, purchases: results });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

console.log(`\n🔧 VALIDANDO CONFIGURACIÓN...`);

if (EMAIL_ENABLED) {
  if (!EMAIL_USER) console.error('❌ ERROR: Falta EMAIL_USER');
  if (!EMAIL_PASS) console.error('❌ ERROR: Falta EMAIL_PASS');
  console.log(`📧 Email habilitado con ${EMAIL_USER}`);
} else {
  console.warn('⚠️ Email deshabilitado');
}

console.log(`✅ Configuración cargada\n`);

app.listen(PORT, HOST, () => {
  console.log(`\n🚀 SERVIDOR MANGLATER`);
  console.log(`📍 Host: ${HOST}`);
  console.log(`📍 Port: ${PORT}`);
  console.log(`💾 DB: ${DB_FILE}`);
  console.log(`📂 Uploads: ${UPLOAD_DIR}`);
  console.log(`📊 Excel: ${EXCEL_FILE}`);
  console.log(`🔑 Admin: admin / admin`);
  console.log(`📧 Email enabled: ${EMAIL_ENABLED ? '✅ SÍ' : '❌ NO'}`);
  console.log(`📧 Email from: ${EMAIL_FROM}\n`);
});