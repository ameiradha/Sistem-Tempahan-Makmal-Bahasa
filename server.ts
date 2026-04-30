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

  // Helper to interact with Telegram API
  async function callTelegram(method: string, token: string, body: any) {
    try {
      const resp = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      return await resp.json();
    } catch (err) {
      console.error(`Telegram API Call Error (${method}):`, err);
      return { ok: false, description: 'Network error' };
    }
  }

  // API Route for Telegram Webhook
  app.post('/api/telegram-webhook', async (req, res) => {
    console.log('[WEBHOOK] Received Payload:', JSON.stringify(req.body, null, 2));
    const { callback_query } = req.body;

    if (!callback_query) {
      console.log('[WEBHOOK] No callback_query, ignoring.');
      return res.sendStatus(200);
    }

    const { id: queryId, data, message, from } = callback_query;
    
    try {
      // Fetch settings to get the token
      const settingsSnap = await db.collection('settings').doc('global').get();
      const settings = settingsSnap.data() || {};
      const token = settings.telegramBotToken;

      if (!token) {
        console.error('[WEBHOOK ERROR] Bot Token not found in settings/global');
        return res.sendStatus(200);
      }

      // Always answer the callback query immediately to stop the spinning icon
      await callTelegram('answerCallbackQuery', token, { callback_query_id: queryId });

      // Handle data
      const delimiter = data.includes(':') ? ':' : '_';
      const parts = data.split(delimiter).map((s: string) => s.trim());
      const action = parts[0];
      const bookingId = parts[1];

      console.log(`[WEBHOOK] Action: ${action}, BookingId: ${bookingId}, Source: ${from.username || from.id}`);

      if (bookingId === 'TEST_ID') {
        const statusText = action === 'approve' ? 'DILULUSKAN (TEST ✅)' : 'DITOLAK (TEST ❌)';
        const originalText = message?.text || 'Testing Bot';
        const updatedText = `🧪 *TESTING BOT SYSTEM*\n\n${originalText.split('\n\n')[0]}\n\n✨ *STATUS:* ${statusText}\n\nWebhook dan Bot anda berfungsi dengan baik!`;
        
        await callTelegram('editMessageText', token, {
          chat_id: message.chat.id,
          message_id: message.message_id,
          text: updatedText,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard: [] }
        });
        return res.sendStatus(200);
      }

      const bookingRef = db.collection('bookings').doc(bookingId);
      const bookingDoc = await bookingRef.get();

      if (!bookingDoc.exists) {
        console.warn(`[WEBHOOK] Booking ${bookingId} not found`);
        await callTelegram('sendMessage', token, {
          chat_id: message.chat.id,
          text: '❌ Ralat: Tempahan tidak ditemui. Mungkin ia telah dipadam.'
        });
        return res.sendStatus(200);
      }

      const status = action === 'approve' ? 'confirmed' : 'rejected';
      const statusText = status === 'confirmed' ? 'DILULUSKAN' : 'DITOLAK';

      await bookingRef.update({
        status,
        updatedAt: FieldValue.serverTimestamp()
      });

      const userMark = from.username ? `@${from.username}` : (from.first_name || 'Admin');
      const updatedText = `${message.text}\n\n✅ *STATUS: ${statusText}* (oleh ${userMark})`;

      await callTelegram('editMessageText', token, {
        chat_id: message.chat.id,
        message_id: message.message_id,
        text: updatedText,
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [] }
      });

    } catch (err: any) {
      console.error('[WEBHOOK ERROR] Internal failure:', err);
    }

    return res.sendStatus(200);
  });

  // API to setup Webhook
  app.get('/api/setup-telegram-webhook', async (req, res) => {
    const { token, url } = req.query;
    
    // Set explicit JSON header
    res.setHeader('Content-Type', 'application/json');

    if (!token || !url) {
      console.warn('Setup Webhook attempt with missing token or URL');
      return res.status(400).json({ ok: false, description: 'Bot Token dan URL sistem diperlukan. Sila pastikan anda telah simpan tetapan.' });
    }

    try {
      const tokenStr = String(token).trim();
      const urlStr = String(url).trim();
      
      // Ensure url doesn't have trailing slash for consistency
      const cleanUrl = urlStr.endsWith('/') ? urlStr.slice(0, -1) : urlStr;
      const webhookUrl = `${cleanUrl}/api/telegram-webhook`;
      
      console.log(`[DEBUG] Memulakan setup webhook...`);
      console.log(`[DEBUG] Bot Token: ${tokenStr.slice(0, 10)}...`);
      console.log(`[DEBUG] Webhook URL: ${webhookUrl}`);
      
      const tgRes = await fetch(`https://api.telegram.org/bot${tokenStr}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
      
      if (!tgRes.ok) {
        const errBody = await tgRes.text();
        console.error(`[TELEGRAM ERROR] Status: ${tgRes.status}`, errBody);
        return res.status(tgRes.status).json({ 
          ok: false, 
          description: `Telegram API memberikan ralat (${tgRes.status}). Adakah Bot Token anda sah?` 
        });
      }

      const data: any = await tgRes.json();
      console.log('[DEBUG] Jawapan Telegram:', data);
      return res.json(data);
    } catch (err: any) {
      console.error('[CRITICAL ERROR] Setup Webhook:', err);
      return res.status(500).json({ 
        ok: false, 
        description: `Ralat Dalaman Server: ${err.message || 'Sila cuba lagi sebentar.'}` 
      });
    }
  });

  // API to test Telegram Bot connection
  app.get('/api/test-telegram-bot', async (req, res) => {
    const { token, chatId } = req.query;
    res.setHeader('Content-Type', 'application/json');

    console.log(`[DEBUG] Menguji bot Telegram...`);
    console.log(`[DEBUG] Chat ID: ${chatId}`);

    if (!token || !chatId) {
      return res.status(400).json({ ok: false, description: 'Bot Token dan Admin Chat ID diperlukan.' });
    }

    try {
      const message = `🧪 *TESTING BOT SYSTEM*\n\nIni adalah mesej ujian untuk memastikan bot dan webhook anda berfungsi dengan baik.\n\nSila klik butang di bawah untuk menguji respon sistem (Test ID):`;
      
      const keyboard = {
        inline_keyboard: [
          [
            { text: '✅ TEST LULUS', callback_data: `approve_TEST_ID` },
            { text: '❌ TEST TOLAK', callback_data: `reject_TEST_ID` }
          ]
        ]
      };

      const tgUrl = `https://api.telegram.org/bot${token}/sendMessage`;
      const tgRes = await fetch(tgUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'Markdown',
          reply_markup: keyboard
        })
      });

      const data: any = await tgRes.json();
      return res.json(data);
    } catch (err: any) {
      return res.status(500).json({ ok: false, description: err.message });
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
