const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const { createCanvas } = require('canvas');
const qrcode = require('qrcode');
const express = require('express');
const pino = require('pino');

const app = express();
const PORT = process.env.PORT || 10000;

let latestQR = '';
const GROUP_ID = '120363411370862499@g.us';
const EXAM_DATE = new Date('2027-01-24T00:00:00+05:30');

function getDaysLeft() {
  return Math.ceil((EXAM_DATE - new Date()) / (1000 * 60 * 60 * 24));
}

async function generateImage(days) {
  const canvas = createCanvas(640, 640);
  const ctx = canvas.getContext('2d');
  
  // WHITE background - so you can see if WhatsApp is making it black
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 640, 640);
  
  // Black border
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 20;
  ctx.strokeRect(0, 0, 640, 640);
  
  // HUGE black number
  ctx.fillStyle = '#000000';
  ctx.font = 'bold 220px Sans';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(days.toString(), 320, 260);
  
  // Subtext
  ctx.font = 'bold 50px Sans';
  ctx.fillText('DAYS LEFT', 320, 400);
  
  ctx.font = 'bold 24px Sans';
  ctx.fillText('JEE 2027', 320, 500);

  const buf = canvas.toBuffer('image/jpeg', { quality: 0.9 });
  console.log('Image buffer size:', buf.length);
  return buf;
}

async function updateDP(sock) {
  try {
    const days = getDaysLeft();
    const img = await generateImage(days);
    console.log(`Updating DP, image size ${img.length} bytes for ${GROUP_ID}`);
    await sock.updateProfilePicture(GROUP_ID, img);
    console.log(`✅ DP UPDATED SUCCESS: ${days} days`);
  } catch (e) {
    console.log('❌ DP Error:', e.message, e.stack);
  }
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({
    auth: state,
    logger: pino({ level: 'silent' }),
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      latestQR = qr;
      console.log('📱 QR Generated - scan at Render URL');
    }
    if (connection === 'close') {
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Connection closed, reconnecting:', shouldReconnect);
      if (shouldReconnect) startBot();
      else { console.log('Logged out'); latestQR = ''; }
    }
    if (connection === 'open') {
      console.log('✅ Bot Connected to WhatsApp!');
      latestQR = '';
      try {
        const groups = await sock.groupFetchAllParticipating();
        console.log('--- ALL GROUPS LIST ---');
        for (let id in groups) {
          console.log(`${groups[id].subject} => ${id}`);
        }
        console.log('--- END LIST ---');
      } catch (e) { console.log('Fetch groups error', e.message); }
      await updateDP(sock);
    }
  });
}

startBot();

app.get('/', async (req, res) => {
  if (!latestQR) {
    return res.send(`<div style="text-align:center;font-family:sans-serif;padding:40px"><h2>✅ Bot Connected!</h2><p>${getDaysLeft()} Days Left</p><p>Check group DP now</p></div>`);
  }
  const qrImg = await qrcode.toDataURL(latestQR);
  res.send(`<div style="text-align:center;font-family:sans-serif;padding:20px"><h2>Scan QR</h2><img src="${qrImg}" style="width:300px"><p>Refreshes every 20 sec</p><script>setTimeout(()=>location.reload(),20000)</script></div>`);
});

app.listen(PORT, () => console.log('Server on ' + PORT));

// Auto update at midnight IST
setInterval(async () => {
  const ist = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  if (ist.getHours() === 0 && ist.getMinutes() < 2) {
    console.log('Midnight IST trigger');
    // re-get sock from auth? For now we will just rely on existing connection
  }
}, 60 * 1000);
