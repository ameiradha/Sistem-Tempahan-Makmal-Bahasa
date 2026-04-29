import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

const db = getFirestore(firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Route for Telegram Webhook
  app.post('/api/telegram-webhook', async (req, res) => {
    const { callback_query } = req.body;

    if (!callback_query) {
      return res.sendStatus(200);
    }

    const { id: queryId, data, message } = callback_query;
    const [action, bookingId] = data.split(':');

    try {
      const bookingRef = db.collection('bookings').doc(bookingId);
      const bookingDoc = await bookingRef.get();

      if (!bookingDoc.exists) {
        return res.json({
          method: 'answerCallbackQuery',
          callback_query_id: queryId,
          text: 'Ralat: Tempahan tidak ditemui.'
        });
      }

      const status = action === 'approve' ? 'confirmed' : 'rejected';
      const statusText = status === 'confirmed' ? 'DILULUSKAN' : 'DITOLAK';

      await bookingRef.update({
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Update original message
      const originalText = message.text;
      const updatedText = `${originalText}\n\n✅ *STATUS: ${statusText}* (melalui Telegram @${callback_query.from.username || 'admin'})`;

      // Answer Telegram
      return res.json({
        method: 'editMessageText',
        chat_id: message.chat.id,
        message_id: message.message_id,
        text: updatedText,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [] } // Remove buttons
      });

    } catch (err) {
      console.error('Webhook Error:', err);
      return res.json({
        method: 'answerCallbackQuery',
        callback_query_id: queryId,
        text: 'Ralat teknikal berlaku.'
      });
    }
  });

  // API to setup Webhook
  app.get('/api/setup-telegram-webhook', async (req, res) => {
    const { token, url } = req.query;
    if (!token || !url) {
      return res.status(400).json({ ok: false, description: 'Token and URL are required' });
    }

    try {
      const tgRes = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${url}/api/telegram-webhook`);
      const data = await tgRes.json();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ ok: false, description: err.message });
    }
  });

  // API Health Check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok' });
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
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
