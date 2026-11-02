require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const express = require('express');

const token = process.env.TELEGRAM_BOT_TOKEN;
const ADMIN_ID = 8586608023;

// MODO POLLING
const bot = new TelegramBot(token, { polling: true });

const DB_PATH = path.join(__dirname, 'suscripciones.json');
const USERS_PATH = path.join(__dirname, 'usuarios.json');

function leerDB() {
  if (!fs.existsSync(DB_PATH)) return [];
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function guardarDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }

function leerUsuarios() {
  if (!fs.existsSync(USERS_PATH)) return {};
  return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
}
function guardarUsuarios(data) { fs.writeFileSync(USERS_PATH, JSON.stringify(data, null, 2)); }

const LIMITES = { gratis: 1, mensual: 999, premium: 999 };

const SUSCRIPCIONES_PREDEFINIDAS = [
  { nombre: 'Netflix', monto: 0 },
  { nombre: 'Disney+', monto: 0 },
  { nombre: 'Spotify', monto: 0 },
  { nombre: 'YouTube Premium', monto: 0 },
  { nombre: 'HBO Max', monto: 0 },
  { nombre: 'PayPal', monto: 0 },
  { nombre: 'Apple TV+', monto: 0 },
  { nombre: 'Amazon Prime', monto: 0 }
];

const tempData = new Map();

// Comando /start
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;
  const usuarios = leerUsuarios();
  if (!usuarios[chatId]) {
    usuarios[chatId] = { plan: 'gratis', desde: new Date().toISOString(), total_creadas: 0 };
    guardarUsuarios(usuarios);
  }
  const usuario = usuarios[chatId];
  const planEmoji = usuario.plan === 'premium' ? '🟣' : usuario.plan === 'mensual' ? '🔵' : '🟢';
  const totalCreadas = usuario.total_creadas || 0;
  
  bot.sendMessage(chatId, `¡Hola! 👋 Soy tu asistente de alertas de suscripciones.\n\n📊 Tu plan: ${planEmoji} ${usuario.plan.toUpperCase()}\n📌 Suscripciones: ${totalCreadas} / ${LIMITES[usuario.plan]}\n\nElegí una opción:`, {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'ℹ️ ¿Qué hace?', callback_data: 'info_bot' }, { text: '💰 Ver Planes', callback_data: 'precios_bot' }],
        [{ text: '➕ Agregar Suscripción', callback_data: 'agregar_menu' }, { text: '📋 Mis Suscripciones', callback_data: 'listar_menu' }]
      ]
    }
  });
});

// Callbacks de botones
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  if (data === 'info_bot') {
    bot.sendMessage(chatId, "Es un recordatorio que te avisa 2 días antes de que te cobren tus suscripciones.\n\n✅ No pagamos nada por vos\n✅ No tenemos acceso a tus cuentas\n✅ Solo te enviamos un mensaje a Telegram");
  } 
  else if (data === 'precios_bot') {
    bot.sendMessage(chatId, "💰 Nuestros Planes:\n\n🟢 GRATIS - $0 (1 suscripción)\n🔵 MENSUAL - $2.500 ARS/mes (Ilimitadas)\n🟣 PREMIUM - $5.000 ARS (De por vida)\n\nPara activar, escribinos a @NexusAyuda");
  }
  else if (data === 'agregar_menu') {
    const usuarios = leerUsuarios();
    const usuario = usuarios[chatId] || { plan: 'gratis', total_creadas: 0 };
    if ((usuario.total_creadas || 0) >= LIMITES[usuario.plan]) {
      bot.sendMessage(chatId, `⚠️ Llegaste al límite de tu plan ${usuario.plan}.\n💡 Actualizá a Mensual o Premium.`);
      return;
    }
    mostrarMenuSuscripciones(chatId);
  }
  else if (data === 'listar_menu') {
    const db = leerDB();
    const rows = db.filter(s => s.chat_id === chatId);
    if (rows.length === 0) {
      bot.sendMessage(chatId, 'No tenés suscripciones.');
    } else {
      let msg = '📋 Tus suscripciones:\n\n';
      const keyboard = [];
      rows.forEach(r => { 
        const montoTexto = r.monto > 0 ? `$${r.monto}` : '$';
        msg += `🆔 ${r.id} - ${r.nombre} (${montoTexto}) - Día ${r.dia_cobro}\n`;
        keyboard.push([{ text: `🗑️ Eliminar ${r.nombre}`, callback_data: `delete_${r.id}` }]);
      });
      bot.sendMessage(chatId, msg, { reply_markup: { inline_keyboard: keyboard } });
    }
  }
  else if (data.startsWith('delete_')) {
    const id = parseInt(data.split('_')[1]);
    let db = leerDB();
    const nueva = db.filter(s => !(s.id === id && s.chat_id === chatId));
    if (nueva.length === db.length) bot.sendMessage(chatId, '❌ No encontrada.');
    else { guardarDB(nueva); bot.sendMessage(chatId, '✅ Eliminada.'); }
  }
  else if (data.startsWith('select_')) {
    const index = parseInt(data.split('_')[1]);
    const sub = SUSCRIPCIONES_PREDEFINIDAS[index];
    if (!tempData.has(chatId)) tempData.set(chatId, {});
    tempData.get(chatId).nombre = sub.nombre;
    tempData.get(chatId).monto = 0; 
    tempData.get(chatId).step = 'esperando_monto';
    bot.sendMessage(chatId, `💰 ¿Cuánto pagás por ${sub.nombre}? (solo el número)`);
  } 
  else if (data === 'custom') {
    if (!tempData.has(chatId)) tempData.set(chatId, {});
    tempData.get(chatId).step = 'custom_nombre';
    bot.sendMessage(chatId, '✏️ Escribí el nombre de la suscripción:');
  }
  else if (data === 'menu_principal') {
    bot.emit('text', { chat: { id: chatId }, text: '/start', from: { id: chatId } });
  }
  bot.answerCallbackQuery(query.id);
});

function mostrarMenuSuscripciones(chatId) {
  const keyboard = [];
  let row = [];
  SUSCRIPCIONES_PREDEFINIDAS.forEach((sub, i) => {
    row.push({ text: sub.nombre, callback_data: `select_${i}` });
    if (row.length === 3) { keyboard.push(row); row = []; }
  });
  if (row.length > 0) keyboard.push(row);
  keyboard.push([{ text: '✏️ Otro', callback_data: 'custom' }]);
  bot.sendMessage(chatId, '📋 Seleccioná:', { reply_markup: { inline_keyboard: keyboard } });
}

// Manejo de mensajes de texto
bot.on('message', (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const userData = tempData.get(chatId);
  if (!userData) return;
  
  if (userData.step === 'custom_nombre') {
    userData.nombre = msg.text.trim();
    userData.step = 'esperando_monto';
    bot.sendMessage(chatId, `💰 ¿Cuánto pagás por ${userData.nombre}? (solo el número)`);
  }
  else if (userData.step === 'esperando_monto') {
    const monto = parseFloat(msg.text.trim());
    if (isNaN(monto) || monto <= 0) { bot.sendMessage(chatId, '❌ Monto inválido.'); return; }
    userData.monto = monto;
    userData.step = 'esperando_dia';
    bot.sendMessage(chatId, '📅 ¿Qué día del mes te cobran? (1 al 31)');
  }
  else if (userData.step === 'esperando_dia') {
    const dia = parseInt(msg.text.trim());
    if (isNaN(dia) || dia < 1 || dia > 31) { bot.sendMessage(chatId, '❌ Día inválido.'); return; }
    
    const db = leerDB();
    const nuevaSub = {
      id: db.length > 0 ? Math.max(...db.map(s => s.id)) + 1 : 1,
      chat_id: chatId,
      nombre: userData.nombre,
      monto: userData.monto,
      dia_cobro: dia
    };
    db.push(nuevaSub);
    guardarDB(db);
    
    const usuarios = leerUsuarios();
    if (!usuarios[chatId]) usuarios[chatId] = { plan: 'gratis', total_creadas: 0 };
    usuarios[chatId].total_creadas = (usuarios[chatId].total_creadas || 0) + 1;
    guardarUsuarios(usuarios);

    const montoTexto = userData.monto > 0 ? `$${userData.monto}` : '$';
    bot.sendMessage(chatId, `✅ ¡Guardada!\n📝 ${userData.nombre}\n💰 ${montoTexto}\n📅 Día ${dia}\n🆔 ID: ${nuevaSub.id}`, {
      reply_markup: {
        inline_keyboard: [
          [{ text: '➕ Agregar otra', callback_data: 'agregar_menu' }],
          [{ text: '🏠 Menú', callback_data: 'menu_principal' }]
        ]
      }
    });
    tempData.delete(chatId);
  }
});

// Comando de admin
bot.onText(/\/activar (\d+) (gratis|mensual|premium)/, (msg, match) => {
  if (msg.chat.id !== ADMIN_ID) { bot.sendMessage(msg.chat.id, '❌ Sin permiso.'); return; }
  const userId = parseInt(match[1]);
  const plan = match[2];
  const usuarios = leerUsuarios();
  if (!usuarios[userId]) usuarios[userId] = { plan: 'gratis', total_creadas: 0 };
  usuarios[userId].plan = plan;
  usuarios[userId].desde = new Date().toISOString();
  guardarUsuarios(usuarios);
  bot.sendMessage(msg.chat.id, `✅ Usuario ${userId} activado: ${plan.toUpperCase()}`);
  bot.sendMessage(userId, `🎉 Tu plan es ahora ${plan.toUpperCase()}!`);
});

// Cron para alertas diarias
cron.schedule('0 9 * * *', () => {
  console.log('Revisando suscripciones...');
  const diaActual = new Date().getDate();
  const diaAlerta = diaActual + 2 > 31 ? diaActual + 2 - 31 : diaActual + 2;
  const db = leerDB();
  const subs = db.filter(s => s.dia_cobro === diaAlerta);
  subs.forEach(s => {
    const montoTexto = s.monto > 0 ? `$${s.monto}` : '$';
    bot.sendMessage(s.chat_id, `⚠️ ALERTA\n\n📝 ${s.nombre}\n💰 ${montoTexto}\n📅 Se cobra en 2 días (día ${s.dia_cobro})`);
  });
  console.log(`Enviadas: ${subs.length}`);
});

// Servidor Express para UptimeRobot
const PORT = process.env.PORT || 3000;
const app = express();
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(PORT, () => console.log(`Servidor web corriendo en puerto ${PORT}`));

console.log('🤖 Bot iniciado en modo Polling...');