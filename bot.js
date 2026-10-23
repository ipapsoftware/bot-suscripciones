require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');

const token = process.env.TELEGRAM_BOT_TOKEN;const bot = new TelegramBot(token, { polling: true });

const ADMIN_ID = 8586608023;

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

const LIMITES = {
  gratis: 1,       
  mensual: 999,
  premium: 999
};

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
  
  const mensaje = `¡Hola! 👋 Soy tu asistente de alertas de suscripciones.\n\n` +
    `⚠️ Aviso Legal: Este bot es una herramienta de recordatorio personal. No realiza cobros automáticos, no cancela suscripciones y no está afiliado a las marcas mencionadas. El usuario es el único responsable de la gestión de sus finanzas.\n\n` +
    `📊 Tu plan actual: ${planEmoji} ${usuario.plan.toUpperCase()}\n` +
    `📌 Suscripciones creadas: ${totalCreadas} / ${LIMITES[usuario.plan]}\n\n` +
    `Elegí una opción:`;
  
  bot.sendMessage(chatId, mensaje, {
    reply_markup: {
      inline_keyboard: [
        [{ text: 'ℹ️ ¿Qué hace?', callback_data: 'info_bot' }, { text: '💰 Ver Planes', callback_data: 'precios_bot' }],
        [{ text: '➕ Agregar Suscripción', callback_data: 'agregar_menu' }, { text: '📋 Mis Suscripciones', callback_data: 'listar_menu' }]
      ]
    }
  });
});

bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  
  if (data === 'info_bot') {
    bot.sendMessage(chatId, 
      "¿Qué hace este bot?\n\n" +
      "Es un recordatorio que te avisa 2 días antes de que te cobren tus suscripciones, para que puedas cancelar a tiempo o continuar con ella sin sorpresas.\n\n" +
      "✅ No pagamos ninguna suscripción por vos\n" +
      "✅ No tenemos acceso a tus cuentas bancarias\n" +
      "✅ Solo te enviamos un mensaje a Telegram"
    );
  } 
  else if (data === 'precios_bot') {
    bot.sendMessage(chatId, 
      "💰 Nuestros Planes:\n\n" +
      "🟢 GRATIS - $0\n" +
      "1 suscripción en total. Ideal para probar.\n\n" +
      "🔵 MENSUAL - $2.500 ARS/mes\n" +
      "Suscripciones ilimitadas + soporte prioritario.\n\n" +
      "🟣 PREMIUM - $5.000 ARS (pago único)\n" +
      "De por vida + todas las funciones.\n\n" +
      "📲 Para activar un plan, escribinos a @NexusAyuda y te pasamos el link de pago de Mercado Pago."
    );
  }
  else if (data === 'agregar_menu') {
    const usuarios = leerUsuarios();
    const usuario = usuarios[chatId] || { plan: 'gratis', total_creadas: 0 };
    const totalCreadas = usuario.total_creadas || 0;
    
    if (totalCreadas >= LIMITES[usuario.plan]) {
      bot.sendMessage(chatId, 
        `⚠️ Llegaste al límite de tu plan ${usuario.plan} (${LIMITES[usuario.plan]} suscripción en total).\n\n` +
        `💡 Si la borraste, ya consumiste tu oportunidad gratuita. Actualizá a Mensual o Premium para tener ilimitadas.`
      );
      return;
    }
    mostrarMenuSuscripciones(chatId);
  }
  else if (data === 'listar_menu') {
    const db = leerDB();
    const rows = db.filter(s => s.chat_id === chatId);
    
    if (rows.length === 0) {
      bot.sendMessage(chatId, 'No tenés suscripciones. Usá "Agregar Suscripción".');
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
    
    if (nueva.length === db.length) {
      bot.sendMessage(chatId, '❌ No encontrada.');
    } else {
      guardarDB(nueva);
      bot.sendMessage(chatId, '✅ Eliminada. El recordatorio fue cancelado.\n\n⚠️ Nota: Si tenés el plan Gratis, ya consumiste tu única oportunidad.');
    }
  }
  else if (data.startsWith('select_')) {
    const index = parseInt(data.split('_')[1]);
    const sub = SUSCRIPCIONES_PREDEFINIDAS[index];
    if (!tempData.has(chatId)) tempData.set(chatId, {});
    
    tempData.get(chatId).nombre = sub.nombre;
    tempData.get(chatId).monto = 0; 
    tempData.get(chatId).step = 'esperando_monto';
    
    bot.sendMessage(chatId, `💰 ¿Cuánto pagás por ${sub.nombre}? (escribí solo el número)`);
  } 



  else if (data === 'custom') {
    if (!tempData.has(chatId)) tempData.set(chatId, {});
    tempData.get(chatId).step = 'custom_nombre';
    bot.sendMessage(chatId, '✏️ Escribí el nombre de la suscripción:');
  }
  else if (data === 'menu_principal') {
    // Simulamos el comportamiento del /start para volver al inicio
    const usuarios = leerUsuarios();
    const usuario = usuarios[chatId] || { plan: 'gratis', total_creadas: 0 };
    const planEmoji = usuario.plan === 'premium' ? '🟣' : usuario.plan === 'mensual' ? '🔵' : '🟢';
    const totalCreadas = usuario.total_creadas || 0;
    
    const mensaje = `🏠 Menú principal\n\n` +
      `📊 Tu plan actual: ${planEmoji} ${usuario.plan.toUpperCase()}\n` +
      `📌 Suscripciones creadas: ${totalCreadas} / ${LIMITES[usuario.plan]}\n\n` +
      `Elegí una opción:`;
    
    bot.sendMessage(chatId, mensaje, {
      reply_markup: {
        inline_keyboard: [
          [{ text: 'ℹ️ ¿Qué hace?', callback_data: 'info_bot' }, { text: '💰 Ver Planes', callback_data: 'precios_bot' }],
          [{ text: '➕ Agregar Suscripción', callback_data: 'agregar_menu' }, { text: '📋 Mis Suscripciones', callback_data: 'listar_menu' }]
        ]
      }
    });
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
  keyboard.push([{ text: '✏️ Otro (personalizado)', callback_data: 'custom' }]);
  bot.sendMessage(chatId, '📋 Seleccioná una suscripción:', { reply_markup: { inline_keyboard: keyboard } });
}

bot.on('message', (msg) => {
  if (!msg.text || msg.text.startsWith('/')) return;
  const chatId = msg.chat.id;
  const text = msg.text.trim();
  const userData = tempData.get(chatId);
  if (!userData) return;
  
  if (userData.step === 'custom_nombre') {
    userData.nombre = text;
    userData.step = 'esperando_monto';
    bot.sendMessage(chatId, `💰 ¿Cuánto pagás por ${text}? (escribí solo el número)`);
    return;
  }
  
  if (userData.step === 'esperando_monto') {
    const monto = parseFloat(text);
    if (isNaN(monto) || monto <= 0) { 
      bot.sendMessage(chatId, '❌ Monto inválido. Escribí un número válido.'); 
      return; 
    }
    userData.monto = monto;
    userData.step = 'esperando_dia';
    bot.sendMessage(chatId, '📅 ¿Qué día del mes te cobran? (escribí un número del 1 al 31)');
    return;
  }
  
  if (userData.step === 'esperando_dia') {
    const dia = parseInt(text);
    if (isNaN(dia) || dia < 1 || dia > 31) { 
      bot.sendMessage(chatId, '❌ Día inválido. Escribí un número del 1 al 31.'); 
      return; 
    }
    userData.dia = dia;
    
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
    const mensajeExito = `✅ ¡Suscripción guardada!\n📝 Nombre: ${userData.nombre}\n💰 Monto: ${montoTexto}\n📅 Día de cobro: ${dia} de cada mes\n🆔 ID: ${nuevaSub.id}\n\nTe avisaré 2 días antes del cobro.\n\n¿Qué querés hacer ahora?`;

    bot.sendMessage(chatId, mensajeExito, {
        reply_markup: {
            inline_keyboard: [
                [{ text: '➕ Agregar otra suscripción', callback_data: 'agregar_menu' }],
                [{ text: '🏠 Menú principal', callback_data: 'menu_principal' }]
            ]
        }
    });
    
    tempData.delete(chatId);
    return;



  }
});

bot.onText(/\/activar (\d+) (gratis|mensual|premium)/, (msg, match) => {
  const chatId = msg.chat.id;
  if (chatId !== ADMIN_ID) {
    bot.sendMessage(chatId, '❌ No tenés permiso para usar este comando.');
    return;
  }
  const userId = parseInt(match[1]);
  const plan = match[2];
  const usuarios = leerUsuarios();
  if (!usuarios[userId]) usuarios[userId] = { plan: 'gratis', total_creadas: 0 };
  
  usuarios[userId].plan = plan;
  usuarios[userId].desde = new Date().toISOString();
  guardarUsuarios(usuarios);
  
  bot.sendMessage(chatId, `✅ Usuario ${userId} activado con plan ${plan.toUpperCase()}`);
  bot.sendMessage(userId, `🎉 ¡Tu plan fue actualizado a ${plan.toUpperCase()}! Ya tenés acceso a suscripciones ilimitadas.`);
});

bot.onText(/\/listar/, (msg) => {
  const chatId = msg.chat.id;
  const db = leerDB();
  const rows = db.filter(s => s.chat_id === chatId);
  if (rows.length === 0) { bot.sendMessage(chatId, 'No tenés suscripciones.'); return; }
  let m = '📋 Tus suscripciones:\n\n';
  rows.forEach(r => { 
    const montoTexto = r.monto > 0 ? `$${r.monto}` : '$';
    m += `🆔 ${r.id} - ${r.nombre} (${montoTexto}) - Día ${r.dia_cobro}\n`; 
  });
  bot.sendMessage(chatId, m);
});

bot.onText(/\/eliminar (\d+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const id = parseInt(match[1]);
  let db = leerDB();
  const nueva = db.filter(s => !(s.id === id && s.chat_id === chatId));
  if (nueva.length === db.length) bot.sendMessage(chatId, '❌ No encontrada.');
  else { guardarDB(nueva); bot.sendMessage(chatId, '✅ Eliminada.'); }
});

cron.schedule('0 9 * * *', () => {
  console.log('Revisando suscripciones...');
  const diaActual = new Date().getDate();
  const diaAlerta = diaActual + 2 > 31 ? diaActual + 2 - 31 : diaActual + 2;
  const db = leerDB();
  const subs = db.filter(s => s.dia_cobro === diaAlerta);
  subs.forEach(s => {
    const montoTexto = s.monto > 0 ? `$${s.monto}` : '$';
    bot.sendMessage(s.chat_id, `⚠️ ALERTA DE SUSCRIPCIÓN\n\n📝 ${s.nombre}\n💰 Monto: ${montoTexto}\n📅 Se cobra en 2 días (día ${s.dia_cobro})`);
  });
  console.log(`Enviadas: ${subs.length}`);
});

// COMANDO SECRETO PARA ACTIVAR USUARIOS
bot.onText(/\/activar (.+)/, (msg, match) => {
    if (msg.from.id !== ADMIN_ID) {
        return bot.sendMessage(msg.chat.id, "⛔ No tenés permisos.");
    }
    
    const targetId = parseInt(match[1]);
    const filePath = path.join(__dirname, 'usuarios.json');
    let usuarios = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    let userFound = false;
    
    if (Array.isArray(usuarios)) {
        const index = usuarios.findIndex(u => u.id === targetId);
        if (index !== -1) { usuarios[index].plan = 'premium'; userFound = true; }
    } else {
        if (usuarios[targetId]) { usuarios[targetId].plan = 'premium'; userFound = true; }
    }

    if (userFound) {
        fs.writeFileSync(filePath, JSON.stringify(usuarios, null, 2));
        bot.sendMessage(msg.chat.id, `✅ ¡Listo! El usuario ${targetId} ahora es PREMIUM.`);
    } else {
        bot.sendMessage(msg.chat.id, `❌ No encontré al usuario ${targetId}.`);
    }
});

console.log('🤖 Bot iniciado...');
// Puerto para Render (no afecta el bot de Telegram)
const PORT = process.env.PORT || 3000;
const express = require('express');
const app = express();

app.get('/', (req, res) => res.send('Bot de suscripciones activo ✅'));
app.get('/health', (req, res) => res.status(200).send('OK'));
app.listen(PORT, () => console.log(`Servidor web corriendo en puerto ${PORT}`));