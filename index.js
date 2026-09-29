const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { createCanvas } = require('canvas');
const fs = require('fs');
const express = require('express');

const GROUP_NAME = "Academic Allies";
const JEE_DATE = new Date('2027-01-22');

const app = express();
app.get('/', (req,res) => res.send('Bot Alive - JEE ' + Math.ceil((JEE_DATE - new Date())/86400000) + ' days left'));
app.listen(10000, () => console.log('Server running on 10000'));

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        headless: true,
        executablePath: '/usr/bin/chromium',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
    }
});

client.on('qr', qr => {
    console.log('=== SCAN THIS QR ===');
    qrcode.generate(qr, {small: true});
});

client.on('ready', async () => {
    console.log('Ready!'); updateDP();
    setInterval(updateDP, 24*60*60*1000);
});

async function generateDP(days){
    const canvas = createCanvas(800,800);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle='#1a1c1e'; ctx.fillRect(0,0,800,800);
    ctx.strokeStyle='#f5d6b8'; ctx.lineWidth=8;
    ctx.beginPath(); ctx.arc(400,280,90,0,Math.PI*2); ctx.stroke();
    ctx.fillStyle='#ffeedc';
    ctx.font='bold 280px sans-serif'; ctx.fillText('jee',210,580);
    ctx.font='bold 60px sans-serif'; ctx.fillText(`${days} days left`,190,680);
    fs.writeFileSync('./dp.jpg', canvas.toBuffer('image/jpeg'));
    return './dp.jpg';
}

async function updateDP(){
    const days = Math.ceil((JEE_DATE - new Date())/86400000);
    const path = await generateDP(days>0?days:0);
    const chats = await client.getChats();
    const group = chats.find(c=>c.isGroup && c.name===GROUP_NAME);
    if(group){
        const media = require('whatsapp-web.js').MessageMedia.fromFilePath(path);
        await client.setGroupIcon(group.id._serialized, media);
        console.log('DP updated to '+days);
    } else {
        console.log('Group not found: ' + GROUP_NAME);
    }
}
client.initialize();
