import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Firebase Admin
const firebaseConfigFile = path.join(__dirname, 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigFile, 'utf-8'));

admin.initializeApp({
  projectId: firebaseConfig.projectId,
});

const db = getFirestore(firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Logging Middleware
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
    next();
  });

  // API Routes
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Telegram Webhook
  app.post('/api/telegram-webhook', async (req, res) => {
    try {
      console.log('Received Telegram Webhook Update');
      const { callback_query } = req.body;

      if (callback_query) {
        const { data, message: tgMessage, from } = callback_query;
        const [action, bookingId] = data.split(':');

        if (!bookingId || !action) {
           return res.status(400).send('Invalid data');
        }

        const bookingRef = db.collection('bookings').doc(bookingId);
        const bookingSnap = await bookingRef.get();

        if (!bookingSnap.exists) {
          return res.status(404).send('Booking not found');
        }

        const booking = bookingSnap.data();
        const newStatus = action === 'approve' ? 'confirmed' : 'rejected';

        await bookingRef.update({
          status: newStatus,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Update Telegram message
        const botToken = req.query.token as string; // We'll pass token in URL for simple security or fetch from DB
        
        // Better: Fetch settings from Firestore
        const settingsSnap = await db.collection('settings').doc('global').get();
        const settings = settingsSnap.data();
        const activeToken = settings?.telegramBotToken || botToken;

        if (activeToken) {
           const statusText = newStatus === 'confirmed' ? '✅ TELAH DILULUSKAN' : '❌ TELAH DITOLAK';
           const updatedText = tgMessage.text + `\n\n${statusText} oleh ${from.first_name}`;
           
           await fetch(`https://api.telegram.org/bot${activeToken}/editMessageText`, {
             method: 'POST',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({
               chat_id: tgMessage.chat.id,
               message_id: tgMessage.message_id,
               text: updatedText,
               parse_mode: 'Markdown'
             })
           });
        }

        return res.json({ ok: true });
      }

      res.json({ ok: true });
    } catch (error) {
      console.error('Webhook error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Webhook Setup Helper
  app.get('/api/setup-telegram-webhook', async (req, res) => {
    const { token, url } = req.query;
    if (!token || !url) return res.status(400).json({ ok: false, description: 'Token and URL required' });

    try {
      const webhookUrl = `${url}/api/telegram-webhook`;
      const telegramApiUrl = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`;
      
      console.log('Setting webhook to:', webhookUrl);
      
      const response = await fetch(telegramApiUrl);
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      console.error('Webhook setup error:', error);
      res.status(500).json({ ok: false, description: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
