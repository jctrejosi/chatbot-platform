const axios = require('axios');

const API_VERSION = 'v22.0';
const BASE_URL = `https://graph.facebook.com/${API_VERSION}`;

// Caché por botId (o 'global') para tokens y phone number IDs
const tokenCache = new Map();
const phoneIdCache = new Map();

function defaults() {
  return {
    appId: process.env.WHATSAPP_APP_ID,
    appSecret: process.env.WHATSAPP_APP_SECRET,
    wabaId: process.env.WHATSAPP_WABA_ID,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: process.env.WHATSAPP_ACCESS_TOKEN,
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN,
    phone: process.env.WHATSAPP_PHONE,
  };
}

/**
 * Build config object from bot settings (per-bot) or env vars (global fallback).
 * @param {object} [settings] — getSettings(botId) result
 */
function buildConfig(settings) {
  if (!settings) return defaults();
  return {
    appId: settings.whatsappAppId || process.env.WHATSAPP_APP_ID,
    appSecret: settings.whatsappAppSecret || process.env.WHATSAPP_APP_SECRET,
    wabaId: settings.whatsappWabaId || process.env.WHATSAPP_WABA_ID,
    phoneNumberId: settings.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID,
    accessToken: settings.whatsappAccessToken || process.env.WHATSAPP_ACCESS_TOKEN,
    verifyToken: settings.whatsappVerifyToken || process.env.WHATSAPP_VERIFY_TOKEN,
    phone: settings.whatsappPhone || process.env.WHATSAPP_PHONE,
  };
}

/**
 * Get (and cache) an access token for a bot config.
 */
async function getAccessToken(config) {
  const key = config.phoneNumberId || 'global';
  if (tokenCache.has(key)) return tokenCache.get(key);
  if (config.accessToken) {
    tokenCache.set(key, config.accessToken);
    return config.accessToken;
  }

  const { data } = await axios.get(`https://graph.facebook.com/oauth/access_token`, {
    params: { client_id: config.appId, client_secret: config.appSecret, grant_type: 'client_credentials' },
  });
  tokenCache.set(key, data.access_token);
  console.log('Token de acceso generado desde App ID + Secret');
  return data.access_token;
}

/**
 * Discover the phone number ID from the WABA (and cache it).
 */
async function getPhoneNumberId(config) {
  const key = config.wabaId || 'global';
  if (phoneIdCache.has(key)) return phoneIdCache.get(key);
  if (config.phoneNumberId) {
    phoneIdCache.set(key, config.phoneNumberId);
    return config.phoneNumberId;
  }

  const token = await getAccessToken(config);
  const { data } = await axios.get(`${BASE_URL}/${config.wabaId}/phone_numbers`, {
    params: { access_token: token },
  });

  const numbers = data.data || [];
  if (numbers.length === 0) throw new Error('No se encontraron números de teléfono en esta cuenta');

  const preferred = numbers.find((n) => n.display_phone_number === config.phone) || numbers[0];
  phoneIdCache.set(key, preferred.id);
  console.log(`Número WhatsApp detectado: ${preferred.display_phone_number} (ID: ${preferred.id})`);
  return preferred.id;
}

function isVassagoChannel(settings) {
  const channel = (settings && settings.whatsappChannel) || process.env.WHATSAPP_CHANNEL || 'meta';
  return channel === 'vassago';
}

/** URL base de un servicio whatsapp_history (settings del bot o env). */
function historyBaseUrl(settings) {
  const url = (settings && settings.whatsappHistoryUrl) || process.env.WHATSAPP_HISTORY_URL || '';
  return url.replace(/\/+$/, '');
}

async function sendViaHistory(url, to, text) {
  // whatsapp_history normaliza el destino: si es JID (contiene @) se usa tal
  // cual; si es número, se le agrega @c.us. Los grupos requieren el JID completo.
  const payload = String(to).includes('@') ? { id: to, message: text } : { phone: to, message: text };
  const { data } = await axios.post(`${url}/api/send`, payload, { timeout: 30000 });
  if (data && data.ok === false) throw new Error(data.error || 'whatsapp_history rechazó el envío');
  return data;
}

/**
 * Valida la conexión con una instancia de whatsapp_history (canal vassago):
 *  1) que responda en /api/status,
 *  2) que la sesión de WhatsApp Web esté "conectado",
 *  3) que el número conectado coincida con el configurado (si se pasó).
 * Devuelve { ok, error?, phone? } — nunca lanza.
 */
async function testVassagoConnection({ url, expectedPhone }) {
  const base = (url || '').replace(/\/+$/, '');
  if (!base) return { ok: false, error: 'Falta la URL del servicio whatsapp_history.' };

  let data;
  try {
    const res = await axios.get(`${base}/api/status`, { timeout: 6000 });
    data = res.data;
  } catch (e) {
    const detail = e.code === 'ECONNABORTED' ? 'timeout' : e.code === 'ECONNREFUSED' ? 'conexión rechazada' : e.code || e.message;
    return { ok: false, error: `No se pudo conectar con ${base} (${detail}). ¿Está corriendo whatsapp_history?` };
  }

  const status = data && data.status;
  const phone = (data && data.phone) || null;
  if (!status) {
    return { ok: false, error: `${base} respondió, pero /api/status no tiene el formato esperado.` };
  }
  if (status !== 'conectado') {
    const hint =
      status === 'esperando_qr'
        ? ' La sesión está esperando el QR: escanéalo en la interfaz de whatsapp_history.'
        : '';
    return { ok: false, error: `La sesión de ${base} está "${status}" (debe estar "conectado").${hint}` };
  }

  if (expectedPhone) {
    const digits = (s) => String(s || '').replace(/\D/g, '');
    const a = digits(phone);
    const b = digits(expectedPhone);
    if (a && b && a !== b) {
      return {
        ok: false,
        error: `La sesión conectada es ${phone || '(desconocido)'}, distinta del número configurado (${expectedPhone}). Revisa el campo "Número de la sesión WhatsApp Web".`,
      };
    }
  }

  return { ok: true, phone };
}

async function sendMessage(to, text, settings) {
  if (isVassagoChannel(settings)) {
    const url = historyBaseUrl(settings);
    if (!url) {
      throw new Error('Canal "vassago" sin URL: define whatsappHistoryUrl (settings del bot) o WHATSAPP_HISTORY_URL (env)');
    }
    return sendViaHistory(url, to, text);
  }

  const cfg = buildConfig(settings);
  const token = await getAccessToken(cfg);
  const phoneNumberId = await getPhoneNumberId(cfg);

  const { data } = await axios.post(`${BASE_URL}/${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text',
    text: { body: text },
  }, { headers: { Authorization: `Bearer ${token}` } });
  return data;
}

async function markAsRead(sender, messageId, settings) {
  if (isVassagoChannel(settings)) {
    // En WhatsApp Web el visto se gestiona en la propia pestaña del navegador.
    return { ok: true };
  }

  const cfg = buildConfig(settings);
  const token = await getAccessToken(cfg);
  const phoneNumberId = await getPhoneNumberId(cfg);

  const { data } = await axios.post(`${BASE_URL}/${phoneNumberId}/messages`, {
    messaging_product: 'whatsapp', status: 'read', message_id: messageId,
  }, { headers: { Authorization: `Bearer ${token}` } });
  return data;
}

module.exports = { sendMessage, markAsRead, getPhoneNumberId, buildConfig, isVassagoChannel, testVassagoConnection };
