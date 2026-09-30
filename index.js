const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const express = require('express');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');
const { createCanvas } = require('canvas');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 10000;
const AUTH_FOLDER = './auth_info';
const TARGET_GROUP_ID = process.env.GROUP_ID || ''; // put your group id like 123456@g.us or leave empty to auto-detect

// --- SESSION RESTORE FROM ENV (for Render Free) ---
if (process.env.SESSION_BASE64) {
  try {
    console.log('Restoring session from ENV...');
    if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });
    const decoded = Buffer.from(process.env.SESSION_BASE64, 'base64').toString();
    const files = JSON.parse(decoded);
    for (const fileName in files) {
      fs.writeFileSync(path.join(AUTH_FOLDER, fileName), files[fileName], 'utf8');
    }
    console.log('Session restored from ENV');
  } catch (e) {
    console.log('ENV restore failed:', e.message);
  }
}

let sock;
let qrString = null;
let isConnected = false;

function getDaysLeft() {
  const jeeDate = new Date('2027-01-24T00:00:00+05:30'); // JEE 2027 date change if needed
  const today = new Date();
  const diff = jeeDate - today;
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return days > 0? days : 0;
}

async function generateDP() {
  const days = getDaysLeft();
  const canvas = createCanvas(500, 500);
  const ctx = canvas.getContext('2d');

  // Colorful gradient background
  const gradient = ctx.createLinearGradient(0, 0, 500, 500);
  gradient.addColorStop(0, '#FF512F');
  gradient.addColorStop(0.5, '#DD2476');
  gradient.addColorStop(1, '#1A2980');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 500, 500);

  // White box
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fillRect(30, 30, 440, 440);

  // Text
  ctx.fillStyle = '#000';
  ctx.font = 'bold 80px Arial';
  ctx.textAlign = 'center';
  ctx.fillText(`${days}`, 250, 220);
  ctx.font = 'bold 40px Arial';
  ctx.fillText('DAYS LEFT', 250, 270);
  ctx.font = '20px Arial';
  ctx.fillText('JEE 2027', 250, 320);

  // Small decor
  ctx.font = '16px Arial';
  ctx.fillStyle = '#555';
  ctx.fillText('Game-Changer Bot', 250, 400);

  return canvas.toBuffer('image/png');
}

async function updateGroupDP() {
  if (!sock ||!isConnected) return;
  try {
    const buffer = await generateDP();
    // If GROUP_ID is set, use it, else update all groups
    if (TARGET_GROUP_ID) {
      await sock.updateProfilePicture(TARGET_GROUP_ID, buffer);
      console.log(`✅ DP UPDATED for ${TARGET_GROUP_ID} - ${getDaysLeft()} days`);
    } else {
      const groups = await sock.groupFetchAllParticipating();
      for (const id in groups) {
        try {
          await sock.updateProfilePicture(id, buffer);
          console.log(`✅ DP UPDATED for ${id}`);
          await new Promise(r => setTimeout(r, 3000)); // avoid rate limit
        } catch (e) { console.log(`DP fail for ${id}:`, e.message); }
      }
    }
  } catch (e) {
    console.log('DP Update Error:', e.message);
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: state,
    printQRInTerminal: false,
    browser: ['JEE Bot', 'Chrome', '1.0'],
    markOnlineOnConnect: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      qrString = qr;
      console.log('QR generated');
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode!== DisconnectReason.loggedOut;
      console.log('Connection closed, reconnecting:', shouldReconnect);
      isConnected = false;
      if (shouldReconnect) startBot();
    } else if (connection === 'open') {
      isConnected = true;
      qrString = null;
      console.log('Bot Connected!');
      await updateGroupDP();
    }
  });

  // --- ANTI-DISAPPEARING FIXED ---
  sock.ev.on('groups.update', async (updates) => {
    for (const update of updates) {
      try {
        console.log('Group update:', update);
        // Check if ephemeral enabled
        if (update.ephemeralDuration!== undefined && update.ephemeralDuration!== 0) {
          console.log(`Disappearing ON detected in ${update.id}, turning OFF...`);
          await new Promise(r => setTimeout(r, 2000));
          try {
            await sock.groupToggleEphemeral(update.id, 0);
            console.log(`✅ Disappearing OFF in ${update.id}`);
            // Notify
            const author = update.author? update.author.split('@')[0] : 'Someone';
            await sock.sendMessage(update.id, {
              text: `⚠️ Disappearing messages turned ON by @${author} — turned OFF automatically to keep JEE countdown safe.`,
              mentions: update.author? [update.author] : []
            });
          } catch (e) {
            console.log('Failed to toggle ephemeral:', e.message);
            // Try alternative method
            try {
              await sock.sendMessage(update.id, { disappearingMessagesInChat: 0 });
            } catch {}
          }
        }
      } catch (e) {
        console.log('groups.update error', e.message);
      }
    }
  });

  // Backup listener for some WA versions
  sock.ev.on('chats.update', async (chats) => {
    // some clients send ephemeral here
  });
}

// Midnight IST = 18:30 UTC previous day
cron.schedule('30 18 * * *', () => {
  console.log('Midnight IST - Updating DP');
  updateGroupDP();
}, { timezone: 'UTC' });

// --- Web Server ---
app.get('/', async (req, res) => {
  if (isConnected) {
    res.send(`<h1>✅ Connected - ${getDaysLeft()} Days Left</h1><p><a href="/get-session">Get Session</a></p>`);
  } else if (qrString) {
    const qrImage = await QRCode.toDataURL(qrString);
    res.send(`<h1>Scan QR</h1><img src="${qrImage}" style="width:300px"><p>Refresh after scan</p><script>setTimeout(()=>location.reload(),10000)</script>`);
  } else {
    res.send('<h1>Starting Bot... Refresh in 5 sec</h1><script>setTimeout(()=>location.reload(),5000)</script>');
  }
});

app.get('/get-session', (req, res) => {
  try {
    if (!fs.existsSync(AUTH_FOLDER)) return res.send('No auth folder yet, scan first');
    const files = {};
    const fileNames = fs.readdirSync(AUTH_FOLDER);
    for (const f of fileNames) {
      files[f] = fs.readFileSync(path.join(AUTH_FOLDER, f), 'utf8');
    }
    const b64 = Buffer.from(JSON.stringify(files)).toString('base64');
    res.send(`<h2>Copy this full code and paste in Render ENV as SESSION_BASE64</h2><textarea style="width:100%;height:400px">${b64}</textarea>`);
  } catch (e) {
    res.send('Error: ' + e.message);
  }
});

app.listen(PORT, () => console.log('Server on', PORT));

startBot();
