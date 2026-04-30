import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Initialize Firebase Admin with error handling
let db: any = null;
let firebaseConfig: any = null;

try {
  const possiblePaths = [
    path.join(process.cwd(), 'firebase-applet-config.json'),
    path.join(__dirname, 'firebase-applet-config.json'),
    './firebase-applet-config.json'
  ];
  
  let configPath = possiblePaths.find(p => fs.existsSync(p));

  if (configPath) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    
    if (getApps().length === 0) {
      initializeApp({
        projectId: firebaseConfig.projectId,
      });
    }
    
    const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
    db = getFirestore(dbId);
    console.log(`Firebase Admin initialized: Project=${firebaseConfig.projectId}, DB=${dbId}`);
  } else {
    console.error('CRITICAL: firebase-applet-config.json not found in paths:', possiblePaths);
  }
} catch (error) {
  console.error('Firebase Admin initialization error:', error);
}

// Fallback Settings
const DEFAULT_BOT_TOKEN = '8707832885:AAGIzdFIDYGBsVVkR4ihKtVGDciILho0zfU';

const app = express();
app.use(express.json());

// Helper function to update Firestore with Fallback
async function updateBookingStatus(bookingId: string, newStatus: string) {
  // Try Admin SDK First
  if (db) {
    try {
      const bookingRef = db.collection('bookings').doc(bookingId);
      await bookingRef.update({
        status: newStatus,
        updatedAt: FieldValue.serverTimestamp()
      });
      console.log(`[Admin] Booking ${bookingId} updated to ${newStatus}`);
      return true;
    } catch (err: any) {
      console.warn('[Admin] Update failed, trying REST fallback...', err.message);
    }
  }
  
  // REST Fallback (Requires apiKey and projectId)
  if (!firebaseConfig) return false;
  
  const projectId = firebaseConfig.projectId;
  const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
  const apiKey = firebaseConfig.apiKey;
  
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/bookings/${bookingId}?updateMask.fieldPaths=status&updateMask.fieldPaths=updatedAt&key=${apiKey}`;
  
  const payload = {
    fields: {
      status: { stringValue: newStatus },
      updatedAt: { timestampValue: new Date().toISOString() }
    }
  };

  try {
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (resp.ok) {
      console.log(`[REST] Booking ${bookingId} updated to ${newStatus}`);
      return true;
    }
    const errData = await resp.json();
    console.error('[REST] Update failed:', errData);
    return false;
  } catch (err) {
    console.error('[REST] Update Exception:', err);
    return false;
  }
}

// Helper to get settings via Admin SDK
async function getBotTokenFromDB() {
  if (!db) return DEFAULT_BOT_TOKEN;
  
  try {
    const settingsSnap = await db.collection('settings').doc('global').get();
    if (settingsSnap.exists) {
      return settingsSnap.data()?.telegramBotToken || DEFAULT_BOT_TOKEN;
    }
    return DEFAULT_BOT_TOKEN;
  } catch (err) {
    console.error('Error fetching bot token:', err);
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
      let errorMessage = '';
      let success = false;
      
      if (!db) {
        errorMessage = 'Database not initialized on server.';
      } else {
        success = await updateBookingStatus(bookingId, action === 'approve' ? 'confirmed' : 'rejected');
        if (!success) errorMessage = 'Failed to update Firestore.';
      }

      const newStatus = action === 'approve' ? 'confirmed' : 'rejected';
      const statusLabel = newStatus === 'confirmed' ? 'DILULUSKAN' : 'DITOLAK';

      // 2. Get Bot Token
      const activeToken = await getBotTokenFromDB();

      // 3. Answer Callback with actual status
      await fetch(`https://api.telegram.org/bot${activeToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          callback_query_id: queryId,
          text: success 
            ? `Tempahan berjaya ${statusLabel.toLowerCase()}!` 
            : `Ralat: ${errorMessage}`
        })
      });

      if (success) {
         // 4. Update the message UI in Telegram only if DB update was successful
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
