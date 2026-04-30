import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import admin from 'firebase-admin';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load Firebase Config safely
const firebaseConfigPath = path.join(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigPath, 'utf8'));

// Initialize Firebase Admin
const adminApp = !admin.apps.length 
  ? admin.initializeApp({ projectId: firebaseConfig.projectId })
  : admin.app();

const db = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Log all requests for debugging
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });

  // API Health Check
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // API Route for Telegram Webhook
  app.post('/api/telegram-webhook', async (req, res) => {
    console.log('Received Telegram Webhook Payload');
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
        updatedAt: FieldValue.serverTimestamp()
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
      console.warn('Setup Webhook attempt with missing token or URL');
      return res.status(400).json({ ok: false, description: 'Token and URL are required' });
    }

    try {
      const tokenStr = String(token);
      const urlStr = String(url);
      const webhookUrl = `${urlStr}/api/telegram-webhook`;
      
      console.log(`Setting up webhook for bot: ${tokenStr.slice(0, 5)}... with URL: ${webhookUrl}`);
      
      const tgRes = await fetch(`https://api.telegram.org/bot${tokenStr}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
      const data: any = await tgRes.json();
      
      console.log('Telegram API Response:', data);
      return res.json(data);
    } catch (err: any) {
      console.error('Setup Webhook Internal Error:', err);
      return res.status(500).json({ ok: false, description: err.message || 'Internal Server Error' });
    }
  });

  // Handle a recurring issue: browser asking for health check or setup with trailing slash
  app.get('/api/setup-telegram-webhook/', (req, res) => {
    res.redirect(301, req.url.slice(0, -1));
  });

  // Catch-all for API routes to prevent HTML 404s
  app.all('/api/*', (req, res) => {
    res.status(404).json({ ok: false, description: `Route ${req.method} ${req.url} not found` });
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

// Global error handling for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

startServer();
