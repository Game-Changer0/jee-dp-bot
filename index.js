const makeWASocket = require('@whiskeysockets/baileys').default;
const { useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode');
const express = require('express');
const pino = require('pino');
const Jimp = require('jimp');
const fs = require('fs');
const path = require('path');

const GROUP_ID = '120363411370862499@g.us';
const EXAM_DATE = new Date('2027-01-24T00:00:00+05:30');

const app = express();
const PORT = process.env.PORT || 10000;
let latestQR = '', sockRef = null;

function getDaysLeft(){ return Math.ceil((EXAM_DATE - new Date()) / (1000*60*60*24)); }

async function generateImage(days){
  const image = new Jimp(800, 800, '#0f172a');
  // yellow bottom bar
  const bar = new Jimp(800, 130, '#facc15');
  image.composite(bar, 0, 670);
  // dark card
  const card = new Jimp(620, 420, '#1e293b');
  image.composite(card, 90, 90);
  // blue circle decoration
  const circle = new Jimp(180, 180, '#3b82f6');
  circle.circle();
  image.composite(circle, 40, 40);

  const fontBig = await Jimp.loadFont(Jimp.FONT_SANS_128_WHITE);
  const fontMed = await Jimp.loadFont(Jimp.FONT_SANS_64_WHITE);
  const fontSmall = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK);
  const fontTiny = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE);

  image.print(fontTiny, 0, 115, { text: 'EVERY DAY COUNTS  •  JEE 2027', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 800, 30);
  image.print(fontBig, 0, 160, { text: days.toString(), alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 800, 200);
  image.print(fontMed, 0, 340, { text: 'DAYS LEFT', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 800, 100);
  image.print(fontSmall, 0, 705, { text: 'ACADEMIC ALLIES  •  LET\'S CRACK IT', alignmentX: Jimp.HORIZONTAL_ALIGN_CENTER }, 800, 50);

  return await image.getBufferAsync(Jimp.MIME_JPEG);
}

async function updateDP(sock){
  try{
    const days = getDaysLeft();
    const img = await generateImage(days);
    await sock.updateProfilePicture(GROUP_ID, img);
    console.log(`✅ DP UPDATED COLORED: ${days}`);
  }catch(e){ console.log('❌ DP Error:', e.message, e); }
}

async function restoreSession(){
  if(process.env.SESSION_BASE64){
    try{
      const data = JSON.parse(Buffer.from(process.env.SESSION_BASE64, 'base64').toString());
      if(!fs.existsSync('auth_info')) fs.mkdirSync('auth_info');
      for(const [file, content] of Object.entries(data)){
        fs.writeFileSync(path.join('auth_info', file), JSON.stringify(content));
      }
      console.log('✅ Session restored from ENV - NO QR NEEDED');
    }catch(e){ console.log('Restore failed', e.message); }
  }
}

async function startBot(){
  await restoreSession();
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
  if(!latestQR) return res.send(`<h2>✅ Connected - ${getDaysLeft()} days</h2><p>Colored DP Active</p><a href="/update">Force Update DP</a><br><br><a href="/get-session">GET SESSION_BASE64 - SAVE THIS</a>`);
  const qrImg = await qrcode.toDataURL(latestQR);
  res.send(`<div style="text-align:center"><h2>Scan QR - LAST TIME</h2><img src="${qrImg}" width="320"><p>After scan, go to /get-session</p><script>setTimeout(()=>location.reload(),20000)</script></div>`);
});
app.get('/update', async (req,res)=>{
  if(!sockRef) return res.send('Not ready');
  await updateDP(sockRef);
  res.send('Colored DP Updated!');
});
app.get('/get-session', (req,res)=>{
  try{
    const files = fs.readdirSync('auth_info');
    const data = {};
    for(const f of files){ data[f] = JSON.parse(fs.readFileSync(path.join('auth_info', f))); }
    const b64 = Buffer.from(JSON.stringify(data)).toString('base64');
    res.send(`<h3>Copy this FULL and add to Render ENV as SESSION_BASE64</h3><textarea style="width:95%;height:350px">${b64}</textarea>`);
  }catch(e){ res.send('Scan first! '+e.message); }
});
app.get('/logout', (req,res)=>{
  try{ fs.rmSync('auth_info', {recursive:true, force:true}); }catch(e){}
  res.send('Session cleared! Now Clear cache & Deploy');
});
app.listen(PORT, ()=>console.log('Server '+PORT));
