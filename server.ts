import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Firebase Admin with error handling
let firebaseConfig: any = null;
try {
  const firebaseConfigFile = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(firebaseConfigFile)) {
    firebaseConfig = JSON.parse(fs.readFileSync(firebaseConfigFile, 'utf-8'));
    admin.initializeApp({
      projectId: firebaseConfig.projectId,
    });
    console.log('Firebase Admin initialized for Project:', firebaseConfig.projectId);
  } else {
    console.warn('Warning: firebase-applet-config.json not found.');
  }
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
}

// Fallback Settings (Using provided details)
const DEFAULT_BOT_TOKEN = '8707832885:AAGIzdFIDYGBsVVkR4ihKtVGDciILho0zfU';

const app = express();
app.use(express.json());

// Helper function to update Firestore via REST (More reliable on Vercel without SA)
async function updateBookingStatus(bookingId: string, newStatus: string) {
  if (!firebaseConfig) return false;
  
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId || '(default)'}/documents/bookings/${bookingId}?updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt&key=${firebaseConfig.apiKey}`;
  
  const payload = {
    fields: {
      status: { stringValue: newStatus },
      updatedAt: { timestampValue: new Date().toISOString() }
    }
  };

  try {
    const res = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    return res.ok;
  } catch (err) {
    console.error('REST Update Error:', err);
    return false;
  }
}

// Helper to get settings via REST
async function getBotTokenFromDB() {
  if (!firebaseConfig) return DEFAULT_BOT_TOKEN;
  
  const url = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/${firebaseConfig.firestoreDatabaseId || '(default)'}/documents/settings/global?key=${firebaseConfig.apiKey}`;
  
  try {
    const res = await fetch(url);
    if (!res.ok) return DEFAULT_BOT_TOKEN;
    const data = await res.json();
    return data.fields?.telegramBotToken?.stringValue || DEFAULT_BOT_TOKEN;
  } catch (err) {
    return DEFAULT_BOT_TOKEN;
  }
}

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', v: '2.1', timestamp: new Date().toISOString() });
});

// Telegram Webhook
app.post('/api/telegram-webhook', async (req, res) => {
  try {
    const { callback_query } = req.body;

    if (callback_query) {
      const { id: queryId, data, message: tgMessage, from } = callback_query;
      const [action, bookingId] = data.split(':');

      if (!bookingId || !action) {
         return res.status(400).send('Invalid data');
      }

      // 1. Update Database
      const success = await updateBookingStatus(bookingId, action === 'approve' ? 'confirmed' : 'rejected');
      const newStatus = action === 'approve' ? 'confirmed' : 'rejected';
      const statusLabel = newStatus === 'confirmed' ? 'DILULUSKAN' : 'DITOLAK';

      // 2. Get Bot Token
      const activeToken = await getBotTokenFromDB();

      // 3. Answer Callback (Crucial to stop loading spinner in Telegram)
      await fetch(`https://api.telegram.org/bot${activeToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: queryId,
          text: `Tempahan berjaya ${statusLabel.toLowerCase()}!`
        })
      });

      if (success) {
         // 4. Update the message UI in Telegram
         const statusEmoji = newStatus === 'confirmed' ? '✅' : '❌';
         const updatedText = tgMessage.text + `\n\n${statusEmoji} TELAH ${statusLabel} oleh ${from.first_name}`;
         
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

async function setupVite() {
  const PORT = 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Development server running on http://localhost:${PORT}`);
    });
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    }
    
    if (!process.env.VERCEL) {
      app.listen(PORT, '0.0.0.0', () => {
        console.log(`Production server running on http://localhost:${PORT}`);
      });
    }
  }
}

setupVite();

export default app;
