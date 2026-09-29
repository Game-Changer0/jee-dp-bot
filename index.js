const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const express = require('express');
const pino = require('pino');
const { Jimp, loadFont } = require('jimp');

const app = express();
const PORT = process.env.PORT || 10000;
let latestQR = '';
let sockRef = null;
const GROUP_ID = '120363411370862499@g.us';
const EXAM_DATE = new Date('2027-01-24T00:00:00+05:30');

function getDaysLeft(){ return Math.ceil((EXAM_DATE - new Date()) / (1000*60*60*24)); }

async function generateImage(days){
  const image = new Jimp({ width: 800, height: 800, color: '#ffffff' });
  
  const fontBig = await loadFont('sans-128-black');
  const fontMed = await loadFont('sans-64-black');
  const fontSmall = await loadFont('sans-32-black');
  
  image.print({ font: fontBig, x: 0, y: 150, maxWidth: 800, maxHeight: 200, text: days.toString(), alignmentX: 'center' });
  image.print({ font: fontMed, x: 0, y: 350, maxWidth: 800, maxHeight: 100, text: 'DAYS LEFT', alignmentX: 'center' });
  image.print({ font: fontSmall, x: 0, y: 500, maxWidth: 800, maxHeight: 100, text: 'JEE 2027 - Academic Allies', alignmentX: 'center' });
  
  const buf = await image.getBuffer('image/jpeg');
  console.log('JIMP White DP created:', buf.length);
  return buf;
}

async function updateDP(sock){
  try{
    const days = getDaysLeft();
    const img = await generateImage(days);
    console.log('Updating DP...');
    await sock.updateProfilePicture(GROUP_ID, img);
    console.log(`✅ DP UPDATED SUCCESS: ${days} days - WHITE BG`);
  }catch(e){ console.log('❌ DP Error:', e.message, e.stack); }
}

async function startBot(){
  const { state, saveCreds } = await useMultiFileAuthState('auth_info');
  const sock = makeWASocket({ auth: state, logger: pino({ level: 'silent' }), printQRInTerminal: false });
  sockRef = sock;
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (update)=>{
    const { connection, lastDisconnect, qr } = update;
    if(qr){ latestQR = qr; console.log('QR Generated'); }
    if(connection === 'close'){
      const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== DisconnectReason.loggedOut;
      if(shouldReconnect) startBot();
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
  if(!latestQR) return res.send(`<h2>✅ Connected ${getDaysLeft()} days left</h2><a href="/update">Force Update DP</a>`);
  const qrImg = await qrcode.toDataURL(latestQR);
  res.send(`<div style="text-align:center"><h2>Scan QR</h2><img src="${qrImg}" style="width:300px"><script>setTimeout(()=>location.reload(),20000)</script></div>`);
});
app.get('/update', async (req,res)=>{
  if(!sockRef) return res.send('Bot not ready');
  await updateDP(sockRef);
  res.send('Updated! Check group');
});
app.listen(PORT, ()=>console.log('Server on '+PORT));
