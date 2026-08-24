const axios = require('axios');
const {
  shouldEscalate,
  sendEscalationEmail, checkPendingEscalation, setPendingEscalation, clearPendingEscalation,
  wasAnswerClear, trackNegative, resetNegative,
  sendClientEmail,
} = require('./escalation');
const { getSettings } = require('./settings');
const { TOOLS, FUNCTION_MAP, validateToolCall } = require('./functions');

/**
 * Devuelve las tools habilitadas para un bot (según settings.enabledFunctions).
 * Vacío/ausente = todas habilitadas.
 */
async function getToolsForBot(botId) {
  const settings = await getSettings(botId);
  const enabled = settings.enabledFunctions;
  if (!enabled || enabled.length === 0) return TOOLS;
  return TOOLS.filter((t) => enabled.includes(t.function.name));
}

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;
const KNOWLEDGE_SERVICE_URL = process.env.KNOWLEDGE_SERVICE_URL || 'http://localhost:8000';
const DEEPSEEK_API_URL = 'https://api.deepseek.com';

// Contraseña para comandos dev: (dev:context, …) — leída del .env
const ADMIN_DEV_PASSWORD = process.env.ADMIN_DEV_PASSWORD || '';

const { ALLOWED_MODELS } = require('./settings');

// System prompt default (fallback si el bot no tiene uno propio).
// Usa {context} como marcador donde se insertan los chunks de conocimiento.
const DEFAULT_SYSTEM_PROMPT = `Eres un asistente virtual profesional.

⚠️ REGLA DE ORO: PRIMERO entrega la información, DESPUÉS pregunta. Nunca al revés.
Cuando el cliente pida cualquier cosa ("planes", "info", "precios", "dame todo"),
su primera respuesta DEBE contener datos concretos de los DATOS DISPONIBLES.
Solo después de entregar la info, puedes hacer UNA pregunta puntual si falta algún dato.

ESTILO:
- Responde en el mismo idioma del usuario, con calidez.
- Si ya hay historial, NO saludes de nuevo.
- Solo di "no tengo información" si REALMENTE no hay nada en los DATOS DISPONIBLES.

FUNCIONES:
- Qué incluye → listar_caracteristicas
- Itinerario → obtener_cronograma
- Pagos → obtener_fechas_pago
- Precios → extrae las cifras de DATOS DISPONIBLES. Si el cliente dice "X personas"
  sin desglose, calcula con lo que tengas (precio por persona × total, o estima).
  Si necesitas adulto/menor para ser exacto, dalo por estimado y luego pregunta.
- Asesor → pide datos y usa comunicar_asesor.
- Correo → pide email y usa enviar_correo_informacion.
- Compra → pide datos y usa iniciar_cierre_venta.

DATOS DISPONIBLES:
{context}`;

const DEFAULT_SYSTEM_PROMPT_FALLBACK = `Eres un asistente virtual profesional, cálido y entusiasta.

Responde en el mismo idioma del usuario.
Si el usuario solo saluda, responde el saludo brevemente y pregunta en qué puedes ayudar.
SÉ BREVE: máximo 2-3 oraciones. No des explicaciones largas.
Si el usuario pide información que no tienes, dile honestamente que aún no tienes datos cargados y ofrece contactar a un asesor.`;

// Conversation history per user (in memory — max 6 messages)
const conversationHistory = new Map();

const DEEPSEEK_HEADERS = {
  Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
  'Content-Type': 'application/json',
};

/**
 * Consulta los modelos disponibles para la API key configurada.
 * Devuelve [{ id }] — fallback a la lista estática si no hay key o la API falla.
 */
async function listModels() {
  const fallback = () => ALLOWED_MODELS.map((id) => ({ id }));
  if (!DEEPSEEK_API_KEY) return fallback();
  try {
    const { data } = await axios.get(`${DEEPSEEK_API_URL}/models`, {
      headers: { Authorization: `Bearer ${DEEPSEEK_API_KEY}` },
      timeout: 10000,
    });
    const ids = (data.data || []).map((m) => m.id).filter(Boolean);
    if (ids.length === 0) return fallback();
    return ids.map((id) => ({ id }));
  } catch (err) {
    console.warn('No se pudieron consultar modelos DeepSeek:', err.response?.status || err.message);
    return fallback();
  }
}



// ─── Fallback de búsqueda directa en la DB ──────────────────────────────────
// Cuando el knowledge-service no responde, se leen los chunks directo de la
// misma base para que el bot no se quede sin contexto (replica el modo "none"
// del service: prioriza coincidencias por keywords, si no hay, los primeros).

const STOPWORDS_ES = new Set(
  'de la que el en y a los del se las por un para con no una su al lo como mas pero sus le ya o este si porque esta entre cuando muy sin sobre tambien me hasta hay donde quien desde todo nos durante todos uno les ni contra otros ese eso ante ellos e esto mi antes algunos que unos yo otro otras otra el tanto esa estos mucho quienes nada muchos cual poco ella estar estas algunas algo nosotros mis tu te ti tus ellas nosotras vosotras os mio mia mios mias tuyo tuya tuyos tuyas suyo suya suyos suyas nuestro nuestra nuestros nuestras vuestro vuestra vuestros vuestras esos esas aquel aquella aquellos aquellas estas estos dame quiero necesito hola buenas buenos saludos gracias porfa por favor'.split(/\s+/)
);

const normalizeText = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

function tokenizeQuery(text) {
  return normalizeText(text)
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS_ES.has(t));
}

async function searchKnowledgeDbFallback(query, botId, topK) {
  const { query: dbQuery } = require('./db');
  const { rows } = await dbQuery(
    `SELECT c.id::text AS chunk_id, c.content, c.chunk_index,
            d.id::text AS document_id, d.title AS document_title,
            s.title AS source_title
       FROM knowledge_chunks c
       JOIN knowledge_documents d ON d.id = c.document_id
       JOIN knowledge_sources s ON s.id = d.source_id
      WHERE s.bot_id IS NOT DISTINCT FROM $1 AND s.status = 'completed'
      ORDER BY c.chunk_index
      LIMIT $2`,
    [botId || null, 200]
  );
  if (rows.length === 0) return [];

  const terms = tokenizeQuery(query);
  const scored = rows.map((r) => {
    const content = normalizeText(r.content);
    const title = normalizeText(`${r.document_title} ${r.source_title || ''}`);
    let score = 0;
    for (const t of terms) {
      if (content.includes(t)) score += t.length >= 5 ? 2 : 1;
      if (title.includes(t)) score += 3;
    }
    return { r, score };
  });

  const matches = scored.filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  // Con coincidencias: topK mejores. Sin coincidencias: los primeros chunks del
  // documento (para bases pequeñas el modelo alcanza a ver el contenido general).
  const n = matches.length > 0 ? topK : Math.max(topK, 10);
  const selected = (matches.length > 0 ? matches : scored).slice(0, n);

  return selected.map(({ r }) => ({
    chunk_id: r.chunk_id,
    content: r.content,
    chunk_index: r.chunk_index,
    document_id: r.document_id,
    document_title: r.document_title,
    similarity: null,
  }));
}

/**
 * Search the knowledge base for relevant context.
 */
async function searchKnowledge(query, botId) {
  const { topK, useReranker, minConfidence } = await getSettings(botId);
  try {
    const { data } = await axios.post(
      `${KNOWLEDGE_SERVICE_URL}/search`,
      { query, top_k: topK, use_reranker: useReranker, min_similarity: minConfidence },
      { headers: { 'Content-Type': 'application/json' }, params: { bot_id: botId } }
    );
    return data.results || [];
  } catch (err) {
    const status = err.response?.status;
    const detail = err.response?.data?.detail ?? err.response?.data?.error ?? err.message;
    console.warn(`Knowledge search fallback (${status || 'network'}): ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`);
    // Último recurso: leer chunks directo de la DB (misma base) para que el bot
    // no se quede sin contexto cuando el knowledge-service no responde.
    try {
      const chunks = await searchKnowledgeDbFallback(query, botId, topK);
      if (chunks.length > 0) {
        console.log(`  🔁 Fallback DB: ${chunks.length} chunk(s) recuperados directo de la DB`);
      }
      return chunks; // [] = el bot realmente no tiene chunks (base vacía)
    } catch (dbErr) {
      console.warn('Fallback DB falló:', dbErr.message);
      return null; // ni el servicio ni la DB → estado desconocido
    }
  }
}

/**
 * Comparación en tiempo constante (evita timing attacks en la contraseña).
 */
function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Detecta comandos dev: y extrae la contraseña: "dev:context <contraseña>"
 * → { command: 'context', password: '...' } o null si no es comando dev:.
 */
function parseDevCommand(text) {
  if (typeof text !== 'string') return null;
  const m = text.trim().match(/^dev:([a-z_]+)(?:\s+(.+))?$/i);
  if (!m) return null;
  return { command: m[1].toLowerCase(), password: (m[2] || '').trim() };
}

/**
 * Comando dev:context — lista la base de conocimiento del bot (fuentes + preview).
 * Consulta la DB directamente (no depende del knowledge-service).
 */
async function buildContextDump(botId) {
  const { query } = require('./db');
  const { rows } = await query(
    `SELECT s.id, s.title, s.original_filename, s.source_type, s.status, s.error_message,
            count(c.id)::int AS chunks,
            (SELECT c2.content FROM knowledge_chunks c2
               JOIN knowledge_documents d2 ON d2.id = c2.document_id
              WHERE d2.source_id = s.id
              ORDER BY c2.chunk_index LIMIT 1) AS preview
       FROM knowledge_sources s
       LEFT JOIN knowledge_documents d ON d.source_id = s.id
       LEFT JOIN knowledge_chunks c ON c.document_id = d.id
      WHERE s.bot_id IS NOT DISTINCT FROM $1
      GROUP BY s.id, s.title, s.original_filename, s.source_type, s.status, s.error_message, s.created_at
      ORDER BY s.created_at DESC`,
    [botId || null]
  );

  if (rows.length === 0) {
    return '🧠 Este bot no tiene fuentes de conocimiento cargadas.\n\nSube documentos en el panel para que pueda responder con información real.';
  }

  const STATUS_ICON = { completed: '✅', failed: '❌', pending: '⏳', extracting: '🔄', chunking: '🔄', embedding: '🧠' };
  const MAX_TOTAL = 3800; // límite de WhatsApp es 4096
  const MAX_PREVIEW = 160;
  const MAX_SOURCES = 15;
  const plural = (n, s) => `${n} ${s}${n === 1 ? '' : 's'}`;

  const totalChunks = rows.reduce((a, r) => a + (r.chunks || 0), 0);
  const lines = [`🧠 Base de conocimiento del bot (${plural(rows.length, 'fuente')}, ${plural(totalChunks, 'chunk')}):`, ''];
  let included = 0;

  for (const r of rows) {
    if (included >= MAX_SOURCES) {
      lines.push(`… y ${rows.length - included} fuentes más (revisa el panel para el detalle).`);
      break;
    }
    const icon = STATUS_ICON[r.status] || '🟡';
    const name = r.title || r.original_filename || '(sin título)';
    const file = r.original_filename && r.original_filename !== name ? ` [${r.original_filename}]` : '';
    let block = `${icon} ${name}${file} — ${plural(r.chunks || 0, 'chunk')}`;
    if (r.status === 'failed' && r.error_message) block += ` (${r.error_message.slice(0, 80)})`;
    if (r.preview) block += `\n   "${String(r.preview).replace(/\s+/g, ' ').slice(0, MAX_PREVIEW)}…"`;
    const remaining = MAX_TOTAL - lines.join('\n').length;
    if (remaining < block.length) {
      lines.push(`… y ${rows.length - included} fuentes más (revisa el panel para el detalle).`);
      break;
    }
    lines.push(block, '');
    included++;
  }

  return lines.join('\n').trim();
}

/**
 * Call DeepSeek with optional function calling.
 * If the model returns tool_calls, execute them and call again with results.
 */
async function callDeepSeek(messages, tools = null, attempt = 1, botId, conversation = []) {
  const { temperature, maxTokens, model } = await getSettings(botId);
  // Escala: primer intento = maxTokens; 2º = x1.7; 3º = x2.5
  const tokens = Math.round(maxTokens * (attempt === 1 ? 1 : attempt === 2 ? 1.7 : 2.5));

  const body = {
    model,
    messages,
    temperature,
    max_tokens: tokens,
  };
  if (tools) body.tools = tools;

  let { data } = await axios.post('https://api.deepseek.com/chat/completions', body, { headers: DEEPSEEK_HEADERS });
  const msg = data.choices[0].message;
  const finishReason = data.choices[0].finish_reason;

  // If response was truncated, retry with more tokens
  if (finishReason === 'length' && attempt < 3 && msg.content && !msg.tool_calls) {
    console.log(`⚠️  Respuesta truncada (${msg.content.length} chars), reintentando con más tokens...`);
    return callDeepSeek(messages, tools, attempt + 1, botId, conversation);
  }

  // Handle function calling — multi-round: ejecuta tools y hace follow-up hasta
  // que el modelo responda sin tool_calls (ej. recopila info → luego envía correo)
  if (msg.tool_calls && msg.tool_calls.length > 0) {
    let currentMsg = msg;
    let currentMessages = messages;
    let escalate = null;
    let emailSent = false;
    const allToolResults = []; // para que el juez verifique contra datos de funciones

    while (currentMsg.tool_calls && currentMsg.tool_calls.length > 0) {
      console.log(`Function call: ${currentMsg.tool_calls.map(t => t.function.name).join(', ')}`);

      // Execute functions and collect results
      const toolResults = [];
      for (const toolCall of currentMsg.tool_calls) {
        const fn = FUNCTION_MAP[toolCall.function.name];

        // Parseo seguro: el modelo puede emitir JSON inválido en "arguments"
        let args = {};
        try {
          args = JSON.parse(toolCall.function.arguments || '{}');
        } catch (e) {
          args = { _parseError: true };
        }

        if (!fn) {
          // Función desconocida: devolver error al modelo en vez de ignorarla
          const toolContent = JSON.stringify({ ok: false, mensaje: `La función "${toolCall.function.name}" no está disponible para este bot.` });
          toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: toolContent });
          allToolResults.push({ name: toolCall.function.name, content: toolContent });
          continue;
        }

        // ═══ Validación de coherencia con la conversación ═══
        // Antes de ejecutar (sobre todo acciones con efectos secundarios:
        // correo, asesor, cierre de venta) se verifica que la solicitud tenga
        // respaldo en lo que el cliente dijo. Si no lo tiene, NO se ejecuta:
        // el modelo recibe un mensaje para pedir confirmación o datos faltantes.
        const validation = validateToolCall(toolCall.function.name, args, conversation);
        if (!validation.ok) {
          console.log(`  ⛔ [${toolCall.function.name}] bloqueada: ${validation.reason}`);
          const toolContent = JSON.stringify({ ok: false, mensaje: validation.message });
          toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: toolContent });
          allToolResults.push({ name: toolCall.function.name, content: toolContent });
          continue;
        }

        const result = await fn(args, botId);
        console.log(`  → ${toolCall.function.name}(${JSON.stringify(args)}) = ${JSON.stringify(result).substring(0, 120)}`);
        if (toolCall.function.name === 'enviar_correo_informacion' && result?.ok) emailSent = true;
        if (result?._escalate && !escalate) escalate = result.lead || {};
        const toolContent = JSON.stringify(result ?? {
          ok: false,
          mensaje: 'Datos no configurados. Extrae la información del contexto disponible.',
        });
        toolResults.push({ role: 'tool', tool_call_id: toolCall.id, content: toolContent });
        allToolResults.push({ name: toolCall.function.name, content: toolContent });
      }

      // Send results back for the model to continue
      const followUp = [
        ...currentMessages,
        { role: 'assistant', content: null, tool_calls: currentMsg.tool_calls },
        ...toolResults,
      ];

      const { model, maxTokens } = await getSettings(botId);
      const retry = await axios.post(
        'https://api.deepseek.com/chat/completions',
        { model, messages: followUp, temperature: 0.7, max_tokens: Math.max(2500, maxTokens) },
        { headers: DEEPSEEK_HEADERS }
      );

      currentMsg = retry.data.choices[0].message;
      currentMessages = followUp;
    }

    if (escalate) {
      currentMsg._escalate = true;
      currentMsg._escalateData = escalate;
    }
    if (emailSent) currentMsg._emailSent = true;
    if (allToolResults.length > 0) currentMsg._toolResults = allToolResults;
    return currentMsg;
  }

  return msg;
}

/**
 * Verifica si la respuesta contiene datos inventados no respaldados por los chunks.
 * Usa DeepSeek como juez (LLM-as-judge): evalúa el SIGNIFICADO, no las palabras
 * exactas, así que funciona con respuesta en español y chunks en inglés.
 *
 * toolResults: resultados de funciones del sistema (p.ej. calcular_presupuesto).
 * Los datos devueltos por las funciones se consideran verificados por el sistema,
 * así que el juez no los marca como inventados (ej. totales calculados).
 *
 * Fallback: si la llamada falla, usa una verificación exacta de precios/números.
 *
 * @returns {Promise<boolean>} true si hay datos no respaldados (bloquear respuesta).
 */
async function hasUnsupportedData(content, chunks, toolResults = []) {
  if (!content || !chunks || chunks.length === 0) return false;

  try {
    const context = chunks
      .map((c, i) => `[${i + 1}] ${(c.content || '').substring(0, 400).replace(/\n/g, ' ')}`)
      .join('\n---\n');

    // Datos verificados por el sistema (salida de funciones como calcular_presupuesto)
    const verifiedData = toolResults
      .filter((t) => t && t.content && !t.content.includes('"ok":false'))
      .map((t, i) => `[Herramienta ${i + 1} (${t.name})]: ${String(t.content).substring(0, 600).replace(/\n/g, ' ')}`)
      .join('\n---\n');

    const prompt = `Eres un verificador de hechos riguroso. Determina si la respuesta del asistente contiene DATOS CONCRETOS inventados (precios, fechas, números, condiciones, nombres, características) que NO estén respaldados por los fragmentos de conocimiento NI por los datos verificados del sistema.

IMPORTANTE:
- Los fragmentos pueden estar en INGLÉS y la respuesta en ESPAÑOL. Evalúa el SIGNIFICADO, no las palabras exactas ni el idioma.
- Los datos provenientes de las herramientas del sistema (cálculos de presupuesto, cronogramas, etc.) se consideran VERIFICADOS y válidos.
- Los totales calculados a partir de precios base (por ejemplo, total = precio por persona × personas) son válidos.

RESPUESTA DEL ASISTENTE:
"""${content.substring(0, 3000)}"""

FRAGMENTOS DE CONOCIMIENTO:
${context}

${verifiedData ? `\nDATOS VERIFICADOS DEL SISTEMA (de funciones):\n${verifiedData}` : ''}

Responde ÚNICAMENTE con una palabra: "SI" si la respuesta inventa datos concretos no respaldados, o "NO" si toda la información está respaldada por los fragmentos o los datos verificados.`;

    const { data } = await axios.post(
      'https://api.deepseek.com/chat/completions',
      {
        model: 'deepseek-chat',
        messages: [
          { role: 'system', content: 'Eres un verificador de hechos. Responde únicamente SI o NO.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0,
        max_tokens: 10,
      },
      { headers: DEEPSEEK_HEADERS, timeout: 20000 }
    );

    const answer = (data.choices[0].message.content || '').trim().toUpperCase();
    console.log(`  🔍 LLM cross-ref: respuesta del juez = ${answer}`);
    return answer.includes('SI');
  } catch (err) {
    // Fallback: verificación exacta de precios/números (independiente del idioma)
    console.warn('  🔍 LLM cross-ref fallback a precios/números:', err.message);
    const allChunksText = chunks.map(c => (c.content || '')).join(' ').toLowerCase().replace(/,/g, '');
    const dataPoints = [];
    (content.match(/\$[\d,.]+/g) || []).forEach(d => dataPoints.push(d));
    (content.match(/\b\d{3,}\b/g) || []).forEach(d => {
      if (!/^(20[2-9]\d|1[0-9]{3}|\d{4})$/.test(d)) dataPoints.push(d);
    });
    let missing = 0;
    for (const dp of dataPoints) {
      if (!allChunksText.includes(dp.toLowerCase().replace(/,/g, ''))) missing++;
    }
    return dataPoints.length >= 2 && missing / dataPoints.length > 0.3;
  }
}

/**
 * Send a message to DeepSeek V4 Flash with function calling and RAG.
 * @returns {Promise<{ answer: string, chunks: Array, escalated: boolean }>}
 */
async function chatWithDeepSeek(userMessage, userName = 'Usuario', userId = 'unknown', botId) {
  let relevantChunks = [];

  // ── Comandos dev: (dev:context, …) — requieren contraseña de admin ──
  const devCmd = parseDevCommand(userMessage);
  if (devCmd) {
    if (!ADMIN_DEV_PASSWORD) {
      return {
        answer: '⚠️ Los comandos dev: están deshabilitados (falta ADMIN_DEV_PASSWORD en el .env).',
        chunks: [], escalated: false,
      };
    }
    if (!safeEqual(devCmd.password, ADMIN_DEV_PASSWORD)) {
      return {
        answer: '🔒 Comando dev: requiere la contraseña de administrador. Formato: dev:<comando> <contraseña>',
        chunks: [], escalated: false,
      };
    }
    if (devCmd.command === 'context') {
      try {
        const answer = await buildContextDump(botId);
        return { answer, chunks: [], escalated: false };
      } catch (err) {
        console.error('dev:context falló:', err.message);
        return {
          answer: '⚠️ No pude leer la base de conocimiento: ' + err.message,
          chunks: [], escalated: false,
        };
      }
    }
    return {
      answer: `❓ Comando dev:${devCmd.command} desconocido. Disponibles: dev:context`,
      chunks: [], escalated: false,
    };
  }

  // ── Conversation memory (per bot) ─────────────────────────────────
  const convKey = `${botId || 'global'}::${userId}`;
  if (!conversationHistory.has(convKey)) conversationHistory.set(convKey, []);
  const history = conversationHistory.get(convKey);

  // Snapshot de la conversación (incluye el mensaje actual) para el correo al asesor
  const historySnapshot = [...history, { role: 'user', text: userMessage }];

  // ── Escalation: only when user explicitly asks ───────────────────
  const pendingCheck = checkPendingEscalation(userId, userMessage);
  if (pendingCheck.pending && pendingCheck.confirm) {
    const emailResult = await sendEscalationEmail({ ...pendingCheck.escalationData, botId });
    return {
      answer: emailResult.ok
        ? '¡Listo! Ya notifiqué a nuestro equipo. Te contactarán pronto. ¿Necesitas algo más mientras tanto? 😊'
        : `Lo siento, hubo un problema al notificar a nuestro equipo: ${emailResult.error || 'error desconocido'}. 😕`,
      chunks: [], escalated: emailResult.ok,
    };
  }

  // 1. Retrieve relevant knowledge
  // null = el knowledge-service no respondió; no debe tratarse como “base vacía”
  let knowledgeUnavailable = false;
  try {
    relevantChunks = await searchKnowledge(userMessage, botId);
    if (relevantChunks === null) {
      relevantChunks = [];
      knowledgeUnavailable = true;
    }
  } catch (err) {
    console.error('Search error:', err.message);
    knowledgeUnavailable = true;
  }

  // ── Negative-response tracking (offers an advisor after N unclear answers) ──
  const { maxNegativeResponses } = await getSettings(botId);
  if (wasAnswerClear(relevantChunks)) {
    resetNegative(userId);
  } else if (maxNegativeResponses > 0) {
    const count = trackNegative(userId);
    if (count >= maxNegativeResponses) {
      resetNegative(userId);
      setPendingEscalation(userId, {
        userId, userName, query: userMessage,
        reason: `Varios intentos sin respuesta clara (${count})`,
        history: historySnapshot,
      });
      return {
        answer: 'Parece que no estoy logrando ayudarte con eso... 😅 ¿Quieres que le notifique a un asesor para que te contacte personalmente? Responde "sí" y le avisamos.',
        chunks: relevantChunks, escalated: false,
      };
    }
  }

  // ── Check if user explicitly asks for an advisor (auto-send, no confirmation) ──
  if (shouldEscalate(userId, userMessage, relevantChunks).escalate) {
    const emailResult = await sendEscalationEmail({
      userId, userName, query: userMessage,
      reason: 'Cliente solicitó asesor',
      history: historySnapshot,
      botId,
    });
    return {
      answer: emailResult.ok
        ? '¡Listo! Ya notifiqué a nuestro equipo. Te contactarán pronto. ¿Necesitas algo más mientras tanto? 😊'
        : `Lo siento, hubo un problema al notificar a nuestro equipo: ${emailResult.error || 'error desconocido'}. 😕`,
      chunks: relevantChunks, escalated: emailResult.ok,
    };
  }

  // 2. Build messages with RAG context
  const messages = [];
  const settings = await getSettings(botId);
  let systemPrompt = settings.systemPrompt?.trim();
  let contextInjected = false;

  if (!systemPrompt) {
    // Fallback: usar el prompt duro por defecto
    if (relevantChunks.length > 0) {
      const context = relevantChunks.map((c, i) => `[Fuente ${i + 1}]:\n${c.content}`).join('\n\n---\n\n');
      systemPrompt = DEFAULT_SYSTEM_PROMPT.replace('{context}', context);
      contextInjected = true;
    } else {
      systemPrompt = DEFAULT_SYSTEM_PROMPT_FALLBACK;
    }
  } else if (systemPrompt.includes('{context}')) {
    // Reemplazar {context} siempre: con los chunks si hay, o un texto neutral si no
    const context = relevantChunks.length > 0
      ? relevantChunks.map((c, i) => `[Fuente ${i + 1}]:\n${c.content}`).join('\n\n---\n\n')
      : '(No hay información adicional disponible en este momento.)';
    systemPrompt = systemPrompt.replace('{context}', context);
    contextInjected = true;
  }

  messages.push({ role: 'system', content: systemPrompt });

  // Prompt personalizado SIN {context}: inyectar igualmente el contexto RAG
  // como mensaje de sistema adicional, para que el modelo SIEMPRE vea el
  // conocimiento recuperado (antes se descartaba silenciosamente).
  if (!contextInjected && relevantChunks.length > 0) {
    const context = relevantChunks.map((c, i) => `[Fuente ${i + 1}]:\n${c.content}`).join('\n\n---\n\n');
    messages.push({
      role: 'system',
      content: 'DATOS DISPONIBLES (base de conocimiento de la empresa — úsalos para responder con datos reales):\n' + context,
    });
  }

  // ═══ Dynamic function list: solo las habilitadas aparecen en el prompt ═══
  const enabledTools = await getToolsForBot(botId);
  const enabledNames = enabledTools.map((t) => t.function.name);
  const allNames = TOOLS.map((t) => t.function.name);
  const restricted = !(!settings.enabledFunctions || settings.enabledFunctions.length === 0);
  const disabled = allNames.filter((n) => !enabledNames.includes(n));
  if (restricted && disabled.length > 0) {
    // Reemplazar la sección FUNCIONES del prompt dinámicamente
    const funcNames = {
      listar_caracteristicas: 'Listar características',
      obtener_cronograma: 'Cronograma / Itinerario',
      obtener_fechas_pago: 'Fechas de pago',
      calcular_presupuesto: 'Calcular presupuesto',
      comunicar_asesor: 'Comunicar con asesor',
      enviar_correo_informacion: 'Enviar info por correo',
      iniciar_cierre_venta: 'Cierre de venta',
    };
    const habilitadas = enabledNames.map((n) => `✅ ${funcNames[n] || n}`).join('\n');
    const noHabilitadas = disabled.map((n) => `❌ ${funcNames[n] || n}`).join('\n');
    const dynamicFuncs = `\nFUNCIONES HABILITADAS:\n${habilitadas}\n\nFUNCIONES NO DISPONIBLES:\n${noHabilitadas}\n\n⚠️ Si el cliente pide una función NO DISPONIBLE, dile amablemente que esa acción no está configurada para este bot y ofrécele las que sí lo están.`;
    messages[messages.length - 1].content += dynamicFuncs;
  }

  // ═══ Validation layer: avisar si la base de conocimiento está vacía ═══
  // (solo cuando el knowledge-service respondió: si está caído, no es “base vacía”)
  if (relevantChunks.length === 0 && !knowledgeUnavailable) {
    messages[messages.length - 1].content +=
      '\n\n⚠️ AVISO IMPORTANTE: La base de conocimiento está VACÍA (no se ha cargado ningún documento).\n' +
      'Responde ÚNICAMENTE usando los resultados de las funciones habilitadas.\n' +
      'Para cualquier consulta que no esté cubierta por las funciones, di:\n' +
      '"No tengo esa información en mi base de conocimiento. ¿Quieres que contacte a un asesor?"\n' +
      'NO improvises ni uses tu entrenamiento general para responder preguntas de conocimiento.';
  }

  // Historial previo como turnos reales de mensajes (contexto para el modelo)
  const { maxHistoryMessages } = await getSettings(botId);
  for (const m of history.slice(-maxHistoryMessages)) {
    messages.push({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text });
  }

  messages.push({ role: 'user', content: userMessage });

  // 3. Call DeepSeek with function calling
  let content;
  let escalated = false;
  let emailSent = false;
  try {
    const msg = await callDeepSeek(messages, await getToolsForBot(botId), 1, botId, historySnapshot);
    content = (msg.content || '')
      // Limpiar cualquier XML de function-call filtrado en el texto de respuesta
      .replace(/<function_calls>[\s\S]*?<\/function_calls>/gi, '')
      .replace(/<\?xml[\s\S]*?\?>/gi, '')
      .replace(/<invoke[\s\S]*?<\/invoke>/gi, '')
      .trim();

    // ═══ HARD validation: si no hay chunks en la BD, el modelo NO puede
    //      responder con información que no venga de una función ═══
    //      Excepción: si ya hubo tool calls exitosos (p.ej. calcular_presupuesto),
    //      los datos vienen del sistema y NO son inventados.
    const dataPreviouslyVerified = msg._emailSent || (msg._toolResults && msg._toolResults.filter(t => t.content && !t.content.includes('"ok":false')).length > 0);
    // El bloqueo solo aplica si el knowledge-service respondió y confirmó que no hay chunks
    if (relevantChunks.length === 0 && !knowledgeUnavailable && content && !escalated && !emailSent && !dataPreviouslyVerified) {
      const looksLikeKnowledge = (
        /\$[\d,]+/.test(content) ||           // menciona precios
        /\d{1,2}\s*(de|th|rd)\s/.test(content) ||  // menciona fechas
        /incluye|incluyen|ofrece|contiene/i.test(content)  // describe características
      );
      if (looksLikeKnowledge) {
        console.log('  🛑 Response blocked: no chunks in DB but model generated knowledge claims');
        content = 'No tengo esa información en mi base de conocimiento. ¿Quieres que contacte a un asesor?';
      }
    }

    // ═══ Cross-reference: verificar que la respuesta no invente datos ═══
    // Usa DeepSeek como juez (LLM-as-judge): entiende español e inglés, así que
    // detecta alucinaciones sin fallar por diferencia de idioma entre la respuesta
    // y los chunks (p.ej. "20 de marzo" vs "MARCH 20").
    if (relevantChunks.length > 0 && content && !escalated) {
      const fabricated = await hasUnsupportedData(content, relevantChunks, msg._toolResults || []);
      if (fabricated) {
        console.log('  🛑 Cross-ref BLOCKED: respuesta con datos no respaldados');
        content = 'Lo siento, no encontré suficiente información para responder con precisión. ¿Quieres que contacte a un asesor?';
      }
    }
    emailSent = msg._emailSent === true;
    if (msg._escalate) {
      escalated = true;
      const lead = msg._escalateData;
      const reason = [
        'Cierre de venta',
        lead.nombre ? `— ${lead.nombre}` : '',
        lead.telefono ? `📞 ${lead.telefono}` : '',
        lead.email ? `✉️ ${lead.email}` : '',
        lead.num_personas ? `👥 ${lead.num_personas} personas` : '',
        lead.tipo ? `🛏️ ${lead.tipo}` : '',
        lead.notas ? `📝 ${lead.notas}` : '',
        lead.motivo ? `💬 ${lead.motivo}` : '',
      ].filter(Boolean).join(' | ');
      sendEscalationEmail({
        userId, userName, query: userMessage,
        reason,
        history: historySnapshot,
        type: 'sales',
        botId,
      });
    }
  } catch (err) {
    console.error('DeepSeek error:', err.message);
    return { answer: 'Lo siento, tuve un problema técnico. ¿Puedes intentarlo de nuevo? 🙏', chunks: [], escalated: false };
  }

  if (!content || content.trim().length === 0) {
    setPendingEscalation(userId, {
      userId, userName, query: userMessage,
      reason: 'Cliente listo para cerrar venta',
      history: historySnapshot,
    });
    return { answer: '¡Gracias por tu interés! 😊 ¿Quieres que un asesor te contacte para ayudarte con la reserva? Responde "sí" y te conectamos.', chunks: [], escalated: false };
  }

  // Fallback determinista: si el usuario pidió un correo y el modelo NO llamó
  // enviar_correo_informacion (o falló), enviarlo automáticamente con la respuesta.
  // Si no dio su email, el modelo debió pedirlo; si no lo pidió, se lo recordamos.
  const wantsEmail = /correo|email|e-mail|e mail|mail/i.test(userMessage);
  const emailMatch = userMessage.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (!emailSent && wantsEmail) {
    if (emailMatch) {
      const emailResult = await sendClientEmail({
        to: emailMatch[0],
        subject: 'Información solicitada',
        body: content.substring(0, 5000),
        botId,
      });
      if (emailResult.ok) {
        emailSent = true;
        content += `\n\n📧 Listo — también te envié esta información por correo a ${emailMatch[0]}. Revisa spam si no aparece.`;
      } else {
        console.error('Envío de correo automático falló:', emailResult.error);
      }
    } else {
      // El usuario quiere un correo pero no dio su email — si el modelo no lo pidió, recordárselo
      if (content && !/[Cc]orreo|[Ee]mail/.test(content)) {
        content += '\n\n📧 Si quieres que te envíe la información por correo, dime tu dirección de email. 😊';
      }
    }
  }

  // Si el modelo respondió sin fragmentos de la base de conocimiento, activa
  // la escalación por si el usuario confirma (el propio modelo ya sugirió
  // contactar al asesor en el idioma del usuario según su prompt).
  if (!escalated && content && (!relevantChunks || relevantChunks.length === 0)) {
    setPendingEscalation(userId, {
      userId, userName, query: userMessage,
      reason: 'Información no encontrada en la base de conocimiento',
      history: historySnapshot,
    });
  }

  // Save to history (depth y truncado para acotar tokens; profundidad configurable)
  history.push({ role: 'user', text: userMessage.substring(0, 500) });
  history.push({ role: 'assistant', text: content.substring(0, 800) });
  if (history.length > maxHistoryMessages) history.splice(0, history.length - maxHistoryMessages);

  return { answer: content, chunks: relevantChunks, escalated };
}

module.exports = { chatWithDeepSeek, searchKnowledge, listModels, getToolsForBot };
