const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const path = require('path');
const fs = require('fs');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const WEB3FORMS_ACCESS_KEY = process.env.WEB3FORMS_ACCESS_KEY || '';

// إعداد خيارات الأمان وحماية الهيدر
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// تحديد حد للطلبات لتفادي الاستغلال
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100, // الحد الأقصى 100 طلب لكل عنوان IP
  message: { error: 'Trop de requêtes, veuillez réessayer plus tard.' }
});
app.use('/api/', limiter);

// خدمة الملفات الثابتة من المجلد الرئيسي مباشرة (.)
app.use(express.static(path.join(__dirname, '.')));

// نقطة فحص حالة السيرفر
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// استقبال بيانات نموذج التواصل والاحتفاظ بها
app.post('/api/contact', async (req, res) => {
  try {
    const { name, email, phone, subject, message } = req.body;

    if (!name || !email || !message) {
      return res.status(400).json({ success: false, error: 'Champs requis manquants.' });
    }

    const contactData = {
      timestamp: new Date().toISOString(),
      name,
      email,
      phone: phone || '',
      subject: subject || '',
      message
    };

    // حفظ الرسائل في ملف محلي كنسخة احتياطية
    const logFile = path.join(__dirname, 'messages.json');
    let messages = [];
    if (fs.existsSync(logFile)) {
      try {
        const fileData = fs.readFileSync(logFile, 'utf8');
        messages = JSON.parse(fileData);
      } catch (e) {
        messages = [];
      }
    }
    messages.push(contactData);
    fs.writeFileSync(logFile, JSON.stringify(messages, null, 2));

    // إذا تم إعداد مفتاح Web3Forms يتم الإرسال عبره
    if (WEB3FORMS_ACCESS_KEY) {
      try {
        const response = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            access_key: WEB3FORMS_ACCESS_KEY,
            name,
            email,
            phone,
            subject,
            message
          })
        });
        const data = await response.json();
        return res.json({ success: true, web3forms: data });
      } catch (err) {
        console.error('Erreur Web3Forms:', err);
      }
    }

    return res.json({ success: true, message: 'Message enregistré avec succès.' });
  } catch (error) {
    console.error('Erreur serveur contact:', error);
    res.status(500).json({ success: false, error: 'Erreur interne du serveur.' });
  }
});

// توجيه جميع الطلبات الأخرى إلى index.html من المجلد الرئيسي
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// تشغيل الخادم
function start() {
  const server = app.listen(PORT, () => {
    console.log(`Spectra International - serveur démarré sur port ${PORT} (${NODE_ENV})`);
    if (!WEB3FORMS_ACCESS_KEY) {
      console.warn('[contact] WEB3FORMS_ACCESS_KEY est vide : les messages seront seulement archivés dans le fichier.');
    }
  });

  const shutdown = (signal) => {
    console.log(`${signal} reçu, arrêt du serveur...`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  return server;
}

if (require.main === module) {
  start();
}

module.exports = app;
