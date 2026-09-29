const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const express = require('express');
const pino = require('pino');
const Jimp = require('jimp');

const app = express();
const PORT = process.env.PORT || 10000;
let latestQR = '';
let sockRef = null;
const GROUP_ID = '120363411370862499@g.us';
const EXAM_DATE = new Date('2027-01-24T00:00:00+05:30');

function getDaysLeft(){ return Math.ceil((EXAM_DATE - new Date()) / (1000*60*60*24)); }

async function generateImage(days){
  const image = new Jimp(800, 800, '#ffffff');
  const fontBig = await Jimp.loadFont(Jimp.FONT_SANS_128_BLACK);
  const fontMed = await Jimp.loadFont(Jimp.FONT_SANS_64_BLACK);
  const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
  image.print(fontBig, 0, 150, { text: days.toString(), alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 800, 200);
  image.print(fontMed, 0, 350, { text: 'DAYS LEFT', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 800, 100);
  image.print(fontSmall, 0, 500, { text: 'JEE 2027 - Academic Allies', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 800, 100);
  const buf = await image.getBufferAsync(Jimp.MIME_JPEG);
  console.log('Image created', buf.length);
  return buf;
}

async function updateDP(sock){
  try{
    const days = getDaysLeft();
    const img = await generateImage(days);
    await sock.updateProfilePicture(GROUP_ID, img);
    console.log(`✅ DP UPDATED: ${days} days`);
  }catch(e){ console.log('❌ DP Error:', e.message); }
}

async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }) });
  sockRef = sock;
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (update)=>{
    const { connection, lastDisconnect, qr } = update;
    if(qr) latestQR = qr;
    if(connection === 'close'){
      if(lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut) startBot();
    }
    if(connection === 'open'){
      console.log('✅ Bot Connected!');
      latestQR = '';
      await updateDP(sock);
    }
  });
}
startBot();

app.get('/', async (req,res)=>{
  if(!latestQR) return res.send(`<h2>Connected ${getDaysLeft()} days</h2><a href="/update">Force Update</a>`);
  const qrImg = await qrcode.toDataURL(latestQR);
  res.send(`<div style="text-align:center"><h2>Scan QR</h2><img src="${qrImg}" width="300"><script>setTimeout(()=>location.reload(),20000)</script></div>`);
});
app.get('/update', async (req,res)=>{
  if(!sockRef) return res.send('Not ready');
  await updateDP(sockRef);
  res.send('Updated!');
});
app.listen(PORT, ()=>console.log('Server '+PORT));
