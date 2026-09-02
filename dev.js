#!/usr/bin/env node
/**
 * dev.js — Orquestador de desarrollo (monta en background + terminal de logs).
 *
 * Monta los tres servicios en segundo plano (sobreviven al cierre de esta
 * terminal) y abre una terminal por servicio con sus logs en vivo
 * (backend, chat-web, knowledge-service y el contenedor de la db):
 *   backend            → Node/Express          → http://localhost:3000
 *   chat-web           → Vite dev server       → http://localhost:5173
 *   knowledge-service  → FastAPI/uvicorn       → http://localhost:8000
 *
 * Uso:
 *   node dev.js                  monta los servicios y abre una terminal de logs por servicio
 *   node dev.js --stop           detiene los servicios (mata lo que ocupe sus puertos)
 *   node dev.js --pull-db        trae TODOS los datos de producción (Supabase) a la base local
 *   node dev.js --pull-logs      baja logs de producción a logs-prod/ (Render + Supabase; requiere RENDER_API_KEY, opcional SUPABASE_ACCESS_TOKEN)
 *   node dev.js --ks-docker      knowledge-service ya corre en Docker (no lo monta en el host)
 *   node dev.js --no-reload      desactiva hot-reload de los 3 servicios
 *   node dev.js --external       fuerza ventanas de terminal del sistema aunque estés en Zed
 *
 * Antes de montar valida las dependencias:
 *   - backend y chat-web: si falta algo en node_modules, ejecuta `npm install`
 *     automáticamente en ese servicio.
 *   - knowledge-service: crea/usa su .venv (detalle abajo).
 *
 * Si se ejecuta dentro del terminal integrado de Zed, no abre ventanas
 * (Zed no permite abrir paneles de terminal desde un script) y en su lugar
 * imprime los comandos de logs listos para pegar en paneles de terminal de
 * Zed (Ctrl+` panel, Ctrl+~ / Ctrl+N para más, Ctrl+Shift+5 divide).
 *
 * Puertos configurables: BACKEND_PORT, WEB_PORT, KNOWLEDGE_PORT, POSTGRES_PORT.
 * Logs: logs/*.log — backend, chat-web, knowledge-service y el contenedor de
 * la DB (un `docker logs -f` en background escribe logs/db.log; --stop lo
 * detiene junto con los servicios).
 *
 * Si alguno de los puertos ya está ocupado, el script mata el/los procesos
 * que lo usan (SIGTERM y, si no responden, SIGKILL — también al padre tipo
 * "reloader" de uvicorn/nodemon) y monta igualmente.
 *
 * El .venv de knowledge-service se crea automáticamente si no existe
 * (instala requirements.txt la primera vez); si existe pero está roto
 * (sin uvicorn/fastapi), se borra y se recrea solo. Si una instalación
 * quedó incompleta, la completa sin borrar el venv.
 *
 * El pip install usa un TMPDIR propio dentro del proyecto para no
 * depender de una partición /tmp pequeña.
 *
 * Nota: la base de datos (Postgres + pgvector) no se levanta aquí;
 * hazlo aparte con:  cd db && docker compose up -d
 */

const { spawn, execFileSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const http = require('node:http');
const os = require('node:os');

const ROOT = __dirname;
const LOG_DIR = path.join(ROOT, 'logs');
const PID_FILE = path.join(LOG_DIR, '.dev.pid'); // pids montados, para --stop

// ─── Colores de salida ────────────────────────────────────────────────────
const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const COLORS = {
  backend: '\x1b[36m', // cyan
  'chat-web': '\x1b[35m', // magenta
  'knowledge-service': '\x1b[33m', // amarillo
};

const reload = !process.argv.includes('--no-reload');
const stop = process.argv.includes('--stop');
const forceExternal = process.argv.includes('--external');
const pullDb = process.argv.includes('--pull-db');
const ksDocker = process.argv.includes('--ks-docker');
const pullLogs = process.argv.includes('--pull-logs');
const prodUrlArg = process.argv.includes('--prod-url') ? process.argv[process.argv.indexOf('--prod-url') + 1] : undefined;
const serviceIdsArg = process.argv.includes('--service')
  ? (process.argv[process.argv.indexOf('--service') + 1] || '').split(',').map((s) => s.trim()).filter(Boolean)
  : [];

// ¿Ejecutamos dentro del terminal integrado de Zed? (un script no puede
// abrir paneles de terminal ahí, así que en ese caso imprimimos comandos
// para pegar en lugar de lanzar ventanas del sistema).
const IN_ZED =
  process.env.TERM_PROGRAM === 'zed' ||
  process.env.ZED_TERM === 'true' ||
  /zed/i.test(process.env.ZED_ENVIRONMENT || '');

// ─── Definición de servicios ──────────────────────────────────────────────
const services = [
  {
    name: 'backend',
    cwd: path.join(ROOT, 'backend'),
    command: 'npm',
    args: ['run', reload ? 'dev' : 'start'],
    env: { PORT: process.env.BACKEND_PORT || '3000' },
    port: Number(process.env.BACKEND_PORT || 3000),
  },
  {
    name: 'chat-web',
    cwd: path.join(ROOT, 'chat-web'),
    command: 'npm',
    args: ['run', 'dev', '--', '--port', process.env.WEB_PORT || '5173', '--strictPort'],
    env: {},
    port: Number(process.env.WEB_PORT || 5173),
  },
  {
    name: 'knowledge-service',
    cwd: path.join(ROOT, 'knowledge-service'),
    command: '',
    args: [],
    env: {},
    port: Number(process.env.KNOWLEDGE_PORT || 8000),
  },
];

// ─── Puertos: liberar puertos ocupados ────────────────────────────────────
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── Health check HTTP ─────────────────────────────────────────────────────
/** Hace un GET simple y devuelve true si el servidor respondió (HTTP < 500). */
function httpReady(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (ok) => {
      if (!settled) { settled = true; resolve(ok); }
    };
    const req = http.get(url, (res) => {
      res.resume();
      done(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on('error', () => done(false));
    req.setTimeout(timeoutMs, () => { req.destroy(); done(false); });
  });
}

/** Espera a que una URL responda; true si lo logra antes del timeout. */
async function waitForHttp(url, { timeoutMs = 60000, retryMs = 500 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await httpReady(url)) return true;
    await sleep(retryMs);
  }
  return false;
}

/** Hace un GET y devuelve el JSON parseado (http o https). */
function httpGetJson(url, opts = {}) {
  const { timeoutMs = 15000, headers = {} } = opts || {};
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('node:https') : require('node:http');
    let settled = false;
    const done = (err, val) => {
      if (!settled) { settled = true; err ? reject(err) : resolve(val); }
    };
    const req = lib.get(url, { headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) done(null, parsed);
          else done(new Error(`HTTP ${res.statusCode}`));
        } catch {
          done(new Error(`respuesta no JSON (HTTP ${res.statusCode})`));
        }
      });
    });
    req.on('error', (e) => done(e));
    req.setTimeout(timeoutMs, () => { req.destroy(); done(new Error('timeout')); });
  });
}

/** POST JSON y devuelve el JSON parseado (para APIs tipo Supabase/Logflare). */
function httpPostJson(url, body, opts = {}) {
  const { timeoutMs = 20000, headers = {} } = opts || {};
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? require('node:https') : require('node:http');
    let settled = false;
    const done = (err, val) => {
      if (!settled) { settled = true; err ? reject(err) : resolve(val); }
    };
    const payload = JSON.stringify(body ?? {});
    const req = lib.request(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...headers },
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (c) => (data += c));
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (res.statusCode >= 200 && res.statusCode < 300) done(null, parsed);
            else done(new Error(`HTTP ${res.statusCode}: ${typeof parsed.message === 'string' ? parsed.message : JSON.stringify(parsed).slice(0, 200)}`));
          } catch {
            done(new Error(`respuesta no JSON (HTTP ${res.statusCode})`));
          }
        });
      }
    );
    req.on('error', (e) => done(e));
    req.setTimeout(timeoutMs, () => { req.destroy(); done(new Error('timeout')); });
    req.write(payload);
    req.end();
  });
}

// ¿Hay algo escuchando en `port`? Prueba IPv4 e IPv6 (Vite escucha solo en ::1).
function isPortInUse(port) {
  return new Promise((resolve) => {
    const hosts = ['127.0.0.1', '::1'];
    let remaining = hosts.length;
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      resolve(value);
    };

    for (const host of hosts) {
      const socket = new net.Socket();
      socket.setTimeout(1000);
      socket.once('connect', () => {
        socket.destroy();
        finish(true);
      });
      socket.once('error', () => {
        socket.destroy();
        if (--remaining === 0) finish(false);
      });
      socket.once('timeout', () => {
        socket.destroy();
        if (--remaining === 0) finish(false);
      });
      socket.connect(port, host);
    }
  });
}

// PIDs que ESCUCHAN en `port` (no clientes conectados):
//   1) lsof (Linux/macOS) filtrando solo sockets en estado LISTEN;
//   2) ss (Linux) como fallback si lsof no está instalado.
// Nota: `-t` debe ir como flag separado; `-ti` empaquetado hace que lsof
// ignore el filtro de puerto y liste todos los listeners.
function pidsOnPort(port) {
  try {
    const out = execFileSync('lsof', ['-t', '-iTCP:' + port, '-sTCP:LISTEN'], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    if (out) return out.split('\n').filter(Boolean).map(Number);
  } catch {
    // lsof no instalado o sin coincidencias: probamos con ss.
  }
  try {
    const out = execFileSync('ss', ['-tlnp'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
    const re = new RegExp(`:${port}(\\s|$)`);
    const pids = new Set();
    for (const line of out.split('\n')) {
      if (!line.includes('LISTEN') || !re.test(line)) continue;
      const m = line.match(/pid=(\d+)/);
      if (m) pids.add(Number(m[1]));
    }
    return [...pids];
  } catch {
    return [];
  }
}

function parentPidOf(pid) {
  try {
    const out = execFileSync('ps', ['-o', 'ppid=', '-p', String(pid)], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    const n = Number(out);
    return Number.isInteger(n) && n > 1 ? n : null;
  } catch {
    return null;
  }
}

function safeKill(pid, signal) {
  try {
    process.kill(pid, signal);
  } catch (err) {
    if (err.code !== 'ESRCH') {
      warn('dev', `No pude enviar ${signal} al PID ${pid}: ${err.message}`);
    }
  }
}

// Si el puerto está ocupado, mata a quien lo esté usando: primero SIGTERM y
// si en ~3s no cede, SIGKILL (incluyendo al padre "reloader" de uvicorn /
// nodemon, que re-lanzaría al hijo que escucha).
async function freePort(port, label) {
  if (!(await isPortInUse(port))) return;

  let pids = pidsOnPort(port);
  if (!pids.length) {
    warn(label, `El puerto ${port} está ocupado pero no pude identificar el proceso que lo usa.`);
    return;
  }

  console.log(
    `${YELLOW}⚠ [${label}]${RESET} Puerto ${port} ocupado por PID(s) ${pids.join(', ')}. Enviando SIGTERM…`,
  );
  for (const pid of pids) safeKill(pid, 'SIGTERM');

  for (let i = 0; i < 30; i++) {
    await sleep(100);
    if (!(await isPortInUse(port))) {
      console.log(`${GREEN}✔ [${label}]${RESET} Puerto ${port} liberado.`);
      return;
    }
  }

  // Siguen vivos: matar a los que queden y a su proceso padre.
  pids = pidsOnPort(port);
  const tree = new Set(pids);
  for (const pid of pids) {
    const parent = parentPidOf(pid);
    if (parent) tree.add(parent);
  }
  console.log(
    `${YELLOW}⚠ [${label}]${RESET} PID(s) ${[...tree].join(', ')} no ceden. Enviando SIGKILL…`,
  );
  for (const pid of tree) safeKill(pid, 'SIGKILL');
  await sleep(500);

  if (await isPortInUse(port)) {
    warn(label, `No pude liberar el puerto ${port}.`);
  } else {
    console.log(`${GREEN}✔ [${label}]${RESET} Puerto ${port} liberado.`);
  }
}

// ─── Montar un servicio en background ─────────────────────────────────────
// Registra el PID de un proceso montado para poder detenerlo con --stop.
function rememberPid(name, pid) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.appendFileSync(PID_FILE, `${name}\t${pid}\n`);
}

function commandExists(cmd) {
  if (cmd.includes('/')) return fs.existsSync(cmd);
  try {
    execFileSync('which', [cmd], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

// Arranca el servicio desacoplado de esta terminal (detached: nueva sesión,
// sobrevive aunque cierres la terminal) y vuelca su salida a
// logs/<servicio>.log (truncado en cada arranque).
function mount(service) {
  if (!commandExists(service.command)) {
    error(service.name, `No se encontró "${service.command}". Revisa que esté instalado y en el PATH.`);
    process.exit(1);
  }
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logPath = path.join(LOG_DIR, `${service.name}.log`);
  const fd = fs.openSync(logPath, 'w'); // log fresco por arranque
  let child;
  try {
    child = spawn(service.command, service.args, {
      cwd: service.cwd,
      env: { ...process.env, ...service.env },
      stdio: ['ignore', fd, fd],
      detached: true,
    });
  } catch (err) {
    fs.closeSync(fd);
    error(service.name, `No se pudo iniciar: ${err.message}. Log: ${logPath}`);
    process.exit(1);
  }
  fs.closeSync(fd);
  child.unref(); // dev.js puede terminar; los servicios siguen corriendo
  child.on('error', (err) => {
    error(service.name, `No se pudo iniciar: ${err.message}. Log: ${logPath}`);
  });
  rememberPid(service.name, child.pid);
  console.log(
    `${COLORS[service.name]}[${service.name}]${RESET} montado ${DIM}(PID ${child.pid} → ${path.relative(ROOT, logPath)})${RESET}`,
  );
  return { pid: child.pid, logPath };
}

// Sigue en background los logs del contenedor de la DB hacia logs/db.log
// (mismo estilo que los servicios: detached + truncado en cada arranque).
function mountDbLogs() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  // DB gestionada (Supabase/Neon): no hay contenedor local que seguir; los
  // logs de la base están en el dashboard del proveedor.
  const dbEnvPath = path.join(ROOT, 'backend', '.env');
  const usesManagedDb =
    (process.env.DATABASE_URL || '').includes('supabase.co') ||
    (fs.existsSync(dbEnvPath) && fs.readFileSync(dbEnvPath, 'utf8').includes('supabase.co'));
  if (usesManagedDb) {
    fs.writeFileSync(
      path.join(LOG_DIR, 'db.log'),
      'DB en Supabase — los logs de la base están en el dashboard:\n' +
        'https://supabase.com/dashboard/project/idiypzqlbjeqgphjlabz\n',
    );
    console.log(`${GREEN}✔${RESET} [db] DB en Supabase: logs en el dashboard de Supabase.`);
    return;
  }
  const logPath = path.join(LOG_DIR, 'db.log');
  const target = dbContainer();
  if (!target) {
    fs.writeFileSync(
      logPath,
      'No se encontró el contenedor de la DB. Lánzalo con: cd db && docker compose up -d\n',
    );
    warn('db', 'No se encontró el contenedor de la DB; la nota está en logs/db.log');
    return;
  }
  const fd = fs.openSync(logPath, 'w');
  let child;
  try {
    child = spawn('docker', ['logs', '-f', '--tail', '100', target], {
      stdio: ['ignore', fd, fd],
      detached: true,
    });
  } catch (err) {
    fs.closeSync(fd);
    warn('db', `No se pudo seguir los logs del contenedor: ${err.message}`);
    return;
  }
  fs.closeSync(fd);
  child.unref();
  child.on('error', (err) => {
    warn('db', `No se pudo seguir los logs del contenedor: ${err.message}`);
  });
  rememberPid('db', child.pid);
  console.log(
    `${GREEN}✔${RESET} [db] siguiendo logs de ${target} ${DIM}(PID ${child.pid} → logs/db.log)${RESET}`,
  );
}

// ─── Terminales de logs ───────────────────────────────────────────────────
function shQuote(s) {
  return `'${String(s).replace(/'/g, `'\''`)}'`;
}

// Nombre/ID del contenedor de la DB: el `knowledge-db` del compose de db/
// (container_name fijo); si no está arriba, cualquier contenedor que
// publique el puerto de la DB (POSTGRES_PORT, por defecto 5432).
// Devuelve null si no hay contenedor.
function dbContainer() {
  // 1) El contenedor de este proyecto (nombre fijo en docker-compose.yml).
  //    Ojo: NO usar `docker compose ps` para buscar — el nombre de proyecto
  //    es "db" (el de la carpeta) y colisiona con otros proyectos que
  //    también tengan una carpeta db/ (resolvía al contenedor equivocado).
  try {
    const out = execFileSync(
      'docker',
      ['ps', '--filter', 'name=^/knowledge-db$', '--format', '{{.Names}}'],
      { stdio: ['ignore', 'pipe', 'ignore'] },
    )
      .toString()
      .trim();
    if (out) return out.split('\n')[0].trim();
  } catch {}
  // 2) Fallback: cualquier contenedor que publique el puerto de la DB.
  const port = process.env.POSTGRES_PORT || '5432';
  try {
    const out = execFileSync('docker', ['ps', '-q', '--filter', `publish=${port}`], {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
    if (out) return out.split('\n')[0].trim();
  } catch {}
  return null;
}

// Abre una terminal por fuente de logs: backend, chat-web, knowledge-service
// y db (los tres primeros leen logs/*.log; db lee logs/db.log, que escribe
// el follower de `docker logs` en background). Cada ventana hace `tail -f`.
// Dentro de Zed no se pueden abrir paneles desde un script, así que en ese
// caso imprime los comandos listos para pegar en paneles de terminal de Zed.
function openLogsTerminals() {
  const tailLog = (file) => `tail -n 100 -f ${shQuote(path.join(LOG_DIR, file))}`;
  const sources = [
    { title: 'backend', cmd: tailLog('backend.log') },
    { title: 'chat-web', cmd: tailLog('chat-web.log') },
    ...(ksDocker ? [] : [{ title: 'knowledge-service', cmd: tailLog('knowledge-service.log') }]),
    { title: 'db', cmd: tailLog('db.log') },
  ];

  if (IN_ZED && !forceExternal) {
    console.log(
      `${BOLD}Estás dentro de Zed: no puedo abrir paneles de terminal desde el script` +
        `${RESET} (el CLI de Zed solo abre archivos/workspaces).\n` +
        `Abre el panel de terminal (${DIM}Ctrl+\`${RESET}), crea más con ${DIM}Ctrl+~${RESET} ` +
        `(o ${DIM}Ctrl+N${RESET} estando en el panel; ${DIM}Ctrl+Shift+5${RESET} divide) ` +
        `y pega un comando en cada panel — el prefijo printf pone el título:`,
    );
    for (const src of sources) {
      console.log(
        `\n  ${GREEN}${src.title}${RESET}\n` +
          `  ${BOLD}printf '\\e]2;${src.title} · logs\\007'; ${src.cmd}${RESET}`,
      );
    }
    console.log('');
    return;
  }

  // Formato de invocación por emulador (todos lanzan `bash -c "<script>"`).
  const byTerm = {
    'x-terminal-emulator': (s) => ['-e', 'bash', '-c', s],
    'gnome-terminal': (s) => ['--', 'bash', '-c', s],
    konsole: (s) => ['-e', 'bash', '-c', s],
    'xfce4-terminal': (s) => ['-x', 'bash', '-c', s],
    'mate-terminal': (s) => ['--', 'bash', '-c', s],
    qterminal: (s) => ['-e', 'bash', '-c', s],
    kitty: (s) => ['bash', '-c', s],
    alacritty: (s) => ['-e', 'bash', '-c', s],
    tilix: (s) => ['-e', 'bash', '-c', s],
    terminator: (s) => ['-e', 'bash', '-c', s],
    lxterminal: (s) => ['-e', 'bash', '-c', s],
    xterm: (s) => ['-e', 'bash', '-c', s],
  };
  const order = [
    'x-terminal-emulator',
    'gnome-terminal',
    'konsole',
    'xfce4-terminal',
    'mate-terminal',
    'qterminal',
    'kitty',
    'alacritty',
    'tilix',
    'terminator',
    'lxterminal',
    'xterm',
  ];

  let term = null;
  for (const name of order) {
    try {
      execFileSync('which', [name], { stdio: 'ignore' });
      term = name;
      break;
    } catch {
      // seguir probando
    }
  }

  const shell = process.env.SHELL || 'bash';
  for (const src of sources) {
    if (!term) {
      console.log(`  ${DIM}[${src.title}]${RESET} ${src.cmd}`);
      continue;
    }
    // `printf` fija el título de la ventana; `exec $SHELL` al final deja la
    // ventana utilizable cuando cortas el log con Ctrl+C.
    const script =
      `printf '\\033]0;%s\\007' ${shQuote(`${src.title} · logs`)}; ${src.cmd}; ` +
      `echo; echo '[Logs terminados — esta terminal sigue abierta]'; exec ${shell}`;
    const child = spawn(term, byTerm[term](script), { detached: true, stdio: 'ignore' });
    child.unref();
    console.log(`${GREEN}✔${RESET} Logs de ${src.title} → terminal nueva (${term}).`);
  }

  if (!term) {
    warn('dev', 'No encontré un emulador de terminal para abrir los logs. Ábrelos tú mismo con los comandos de arriba.');
  }
}

// ─── Dependencias npm: validar / instalar ─────────────────────────────────
// Devuelve los paquetes (deps + devDeps) declarados en package.json que no
// están instalados en su node_modules (p. ej. tras un clonado sin npm install).
function missingNpmDeps(service) {
  let manifest = null;
  try {
    manifest = JSON.parse(fs.readFileSync(path.join(service.cwd, 'package.json'), 'utf8'));
  } catch {}
  if (!manifest) return ['(package.json ilegible o inexistente)'];
  const missing = [];
  for (const name of Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })) {
    if (!fs.existsSync(path.join(service.cwd, 'node_modules', name))) missing.push(name);
  }
  return missing;
}

// Comprueba que el node_modules de un servicio esté completo y, si no, ejecuta
// `npm install` en su directorio. Devuelve false si la instalación falla.
function ensureNpmDeps(service) {
  const missing = missingNpmDeps(service);
  if (missing.length === 0) {
    console.log(`${COLORS[service.name]}[${service.name}]${RESET} Dependencias OK (node_modules completo).`);
    return true;
  }
  console.log(
    `${COLORS[service.name]}[${service.name}]${RESET} Faltan dependencias (${missing.join(', ')}) — instalando…`,
  );
  try {
    execFileSync('npm', ['install'], { cwd: service.cwd, stdio: 'inherit' });
  } catch {
    error(service.name, 'Falló npm install. Revisa el error de arriba y reintenta.');
    return false;
  }
  console.log(`${COLORS[service.name]}[${service.name}]${RESET} Dependencias instaladas (node_modules).`);
  return true;
}

// ─── Principal ────────────────────────────────────────────────────────────
async function main() {
  if (stop) {
    console.log(`${BOLD}Deteniendo servicios…${RESET}`);
    // Pids de procesos montados (servicios y el follower de logs de la DB).
    if (fs.existsSync(PID_FILE)) {
      for (const line of fs.readFileSync(PID_FILE, 'utf8').split('\n')) {
        const m = line.trim().match(/^(\S+)\s+(\d+)$/);
        if (!m) continue;
        console.log(`${DIM}[${m[1]}]${RESET} PID ${m[2]} → SIGTERM`);
        safeKill(Number(m[2]), 'SIGTERM');
      }
      await sleep(800);
      fs.rmSync(PID_FILE, { force: true });
    }
    // Respaldo: matar lo que siga escuchando en los puertos.
    for (const s of services) await freePort(s.port, s.name);
    console.log(`${GREEN}✔${RESET} Servicios detenidos.`);
    return;
  }

  if (pullDb) {
    await pullProductionDb();
    return;
  }

  if (pullLogs) {
    await pullProductionLogs();
    return;
  }

  console.log(
    `${BOLD}${GREEN}Montando servicios${RESET} ${DIM}(${reload ? 'hot-reload ON' : 'hot-reload OFF'})${RESET}\n`,
  );

  // ── knowledge-service: en Docker (--ks-docker) o con .venv local ──
  if (ksDocker) {
    console.log(`${COLORS['knowledge-service']}[knowledge-service]${RESET} corriendo en Docker (--ks-docker): se omite el .venv y uvicorn local.`);
  } else {
  // ── knowledge-service: asegurar un .venv funcional ──
  //   - Si existe, tiene uvicorn/fastapi y el marcador .deps-ok → usarlo tal cual.
  //   - Si existe y tiene uvicorn/fastapi pero falta el marcador → la instalación
  //     anterior quedó incompleta: completar dependencias sin borrar.
  //   - Si existe pero está roto (sin uvicorn/fastapi) → borrarlo y recrearlo.
  //   - Si no existe → crearlo e instalar requirements.txt.
  const ks = services[2];
  const venvDir = path.join(ks.cwd, '.venv');
  const venvPython = path.join(venvDir, 'bin', 'python');
  const venvPip = path.join(venvDir, 'bin', 'pip');
  const depsMarker = path.join(venvDir, '.deps-ok');
  const ksColor = COLORS['knowledge-service'];

  function pythonHasDeps(pythonBin) {
    try {
      execFileSync(pythonBin, ['-c', 'import uvicorn, fastapi'], { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  // Instala requirements.txt usando un TMPDIR dentro del proyecto (evita
  // particiones /tmp pequeñas) y escribe el marcador .deps-ok al terminar.
  function installDeps(label) {
    console.log(`${ksColor}[knowledge-service]${RESET} ${label}`);
    const pipTmp = path.join(ks.cwd, '.pip-tmp');
    fs.mkdirSync(pipTmp, { recursive: true });
    let ok = false;
    try {
      execFileSync(venvPip, ['install', '-r', 'requirements.txt'], {
        cwd: ks.cwd,
        stdio: 'inherit',
        env: { ...process.env, TMPDIR: pipTmp },
      });
      ok = true;
    } catch {
      error('knowledge-service', 'Falló la instalación de dependencias. Revisa el error de pip arriba.');
    } finally {
      fs.rmSync(pipTmp, { recursive: true, force: true });
    }
    if (!ok) process.exit(1);
    fs.writeFileSync(depsMarker, new Date().toISOString() + '\n');
  }

  if (fs.existsSync(venvPython) && pythonHasDeps(venvPython)) {
    if (!fs.existsSync(depsMarker)) {
      installDeps('El .venv quedó incompleto (instalación anterior interrumpida). Completando dependencias…');
    }
  } else {
    if (fs.existsSync(venvDir)) {
      warn(
        'knowledge-service',
        '.venv existe pero no tiene uvicorn/fastapi. Lo borro y lo recreo.',
      );
      fs.rmSync(venvDir, { recursive: true, force: true });
    } else {
      console.log(`${ksColor}[knowledge-service]${RESET} No hay .venv — creándolo…`);
    }

    try {
      execFileSync('python3', ['-m', 'venv', '.venv'], { cwd: ks.cwd, stdio: 'inherit' });
    } catch (err) {
      if (err.code === 'ENOENT') {
        error('knowledge-service', 'python3 no está instalado o no está en el PATH.');
      } else {
        error(
          'knowledge-service',
          'No se pudo crear .venv (¿falta el soporte de venv?). En Debian/Ubuntu:\n' +
            '  sudo apt install python3.14-venv\n' +
            'y vuelve a ejecutar el script.',
        );
      }
      process.exit(1);
    }

    installDeps('Instalando dependencias (requirements.txt)…');

    if (!pythonHasDeps(venvPython)) {
      error('knowledge-service', 'El .venv se creó pero uvicorn/fastapi no quedaron disponibles.');
      process.exit(1);
    }
  }

  ks.command = venvPython;

  ks.args = ['-m', 'uvicorn', 'main:app', '--port', process.env.KNOWLEDGE_PORT || '8000'];
  if (reload) ks.args.splice(2, 0, '--reload');
  }

  // ── Preflight ──
  // Dependencias npm (backend y chat-web): si falta algo en node_modules se
  // instala automáticamente antes de montar los servicios.
  for (const s of services) {
    if (s.name === 'knowledge-service') continue;
    if (!ensureNpmDeps(s)) process.exit(1);
  }
  if (!fs.existsSync(path.join(ROOT, 'backend', '.env'))) {
    warn('backend', 'No hay .env en backend/ (se usan defaults; revisa backend/.env.example)');
  }
  if (!ksDocker && !commandExists('libreoffice') && !commandExists('soffice')) {
    warn('knowledge-service', 'LibreOffice no está instalado: los formatos raros (.doc, .ppt, .pages, .epub…) no se extraerán. Instálalo con: sudo apt install libreoffice, o corre el knowledge-service en Docker con --ks-docker');
  }
  if (!fs.existsSync(path.join(ROOT, 'knowledge-service', '.env'))) {
    warn('knowledge-service', 'No hay .env en knowledge-service/ (revisa knowledge-service/.env.example)');
  }

  // ── Liberar puertos y montar ──
  // Pids de una ejecución anterior (p. ej. el follower de logs de la DB,
  // que no ocupa puertos): pararlos antes de volver a montar.
  if (fs.existsSync(PID_FILE)) {
    for (const line of fs.readFileSync(PID_FILE, 'utf8').split('\n')) {
      const m = line.trim().match(/^(\S+)\s+(\d+)$/);
      if (m) safeKill(Number(m[2]), 'SIGTERM');
    }
  }
  fs.rmSync(PID_FILE, { force: true });
  const mounted = [];
  for (const service of services) {
    if (ksDocker && service.name === 'knowledge-service') continue;
    await freePort(service.port, service.name);
    mounted.push({ service, ...mount(service) });
  }
  mountDbLogs();

  // ── Terminales de logs ──
  openLogsTerminals();

  // ── Esperar a que los servicios estén listos antes de mostrar los puertos ──
  const BACKEND_PORT = process.env.BACKEND_PORT || '3000';
  const WEB_PORT = process.env.WEB_PORT || '5173';
  const KNOWLEDGE_PORT = process.env.KNOWLEDGE_PORT || '8000';
  const READY_TIMEOUT_MS = 60000;

  const checks = [
    { name: 'backend', url: `http://localhost:${BACKEND_PORT}/health` },
    { name: 'chat-web', url: `http://localhost:${WEB_PORT}/` },
    { name: 'knowledge-service', url: `http://localhost:${KNOWLEDGE_PORT}/health` },
  ];

  console.log(`${DIM}Verificando que los servicios estén listos…${RESET}`);
  const readyResults = await Promise.all(
    checks.map((c) => waitForHttp(c.url, { timeoutMs: READY_TIMEOUT_MS }).then((ok) => ({ ...c, ok }))),
  );

  const notReady = readyResults.filter((r) => !r.ok);
  if (notReady.length > 0) {
    for (const r of notReady) {
      warn(r.name, `no respondió en ${r.url} (revisa logs/${r.name}.log)`);
    }
    error('dev', 'Algunos servicios no quedaron listos; no se muestran los puertos.');
    console.log(`${DIM}Los procesos quedaron montados en background; revisa logs/*.log. Detener todo → node dev.js --stop${RESET}`);
    return;
  }

  const logsHint =
    IN_ZED && !forceExternal
      ? 'Logs → pega en paneles de Zed los comandos de arriba (o tail -n 100 -f logs/*.log)'
      : 'Logs → se abrieron 4 terminales; también queda todo en logs/*.log';

  const pidOf = (name) => mounted.find((m) => m.service.name === name)?.pid;
  console.log(`
${BOLD}Servicios montados en background:${RESET}
  ${GREEN}backend${RESET}            → ${BOLD}http://localhost:${BACKEND_PORT}${RESET}  ${DIM}(PID ${pidOf('backend')})${RESET}
  ${GREEN}chat-web${RESET}           → ${BOLD}http://localhost:${WEB_PORT}${RESET}  ${DIM}(PID ${pidOf('chat-web')})${RESET}
  ${GREEN}knowledge-service${RESET}  → ${BOLD}http://localhost:${KNOWLEDGE_PORT}${RESET}  ${DIM}${ksDocker ? '(Docker)' : `(PID ${pidOf('knowledge-service')})`}${RESET}
  ${DIM}db (contenedor)     → logs/db.log  (docker logs -f en background)${RESET}
  ${DIM}DB (si hace falta) → cd db && docker compose up -d${RESET}

${DIM}${logsHint}${RESET}
${DIM}Detener todo → node dev.js --stop${RESET}
`);
}

main().catch((err) => {
  error('dev', err.message);
  process.exit(1);
});

// ─── Helpers ──────────────────────────────────────────────────────────────
function warn(service, message) {
  console.log(`${YELLOW}⚠  [${service}]${RESET} ${message}`);
}
function error(service, message) {
  console.log(`${RED}✖ [${service}]${RESET} ${message}`);
}

// ─── Pull DB: producción → local ───────────────────────────────────────────
/** Lee un archivo .env simple (CLAVE=VALOR, sin interpolación). */
function readEnvFile(file) {
  if (!fs.existsSync(file)) return {};
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[m[1]] = val;
  }
  return out;
}

/** Oculta la contraseña de una URL para no imprimirla en consola. */
function maskUrl(url) {
  return url.replace(/\/\/([^:@/]+):[^@/]+@/, '//$1:***@');
}

/**
 * Trae TODOS los datos de producción (Supabase, PostgreSQL 17) a la base local.
 * - Vuelca producción con `pg_dump` 17 (imagen postgres:17-alpine de un solo uso),
 *   porque el Postgres local es 16 y no puede volcar un servidor 17.
 * - Vacía las tablas locales y restaura el volcado (solo datos, no esquema).
 */
async function pullProductionDb() {
  const backendEnv = readEnvFile(path.join(ROOT, 'backend', '.env'));
  const prodUrl = process.env.PROD_DATABASE_URL || backendEnv.DATABASE_URL;
  if (!prodUrl) {
    error('pull-db', 'No encontré la URL de producción. Define PROD_DATABASE_URL o DATABASE_URL en backend/.env.');
    process.exit(1);
  }

  const dbEnv = readEnvFile(path.join(ROOT, 'db', '.env'));
  const localUser = dbEnv.POSTGRES_USER || 'knowledge';
  const localPass = dbEnv.POSTGRES_PASSWORD || 'knowledge';
  const localDb = dbEnv.POSTGRES_DB || 'knowledge_db';
  const container = 'knowledge-db';

  // Verifica que el contenedor local esté corriendo.
  let running = false;
  try {
    running = execFileSync('docker', ['inspect', '-f', '{{.State.Running}}', container], { stdio: 'pipe' }).toString().trim() === 'true';
  } catch { /* contenedor inexistente */ }
  if (!running) {
    error('pull-db', `El contenedor "${container}" no está corriendo. Levántalo con: cd db && docker compose up -d`);
    process.exit(1);
  }

  const dumpUrl = prodUrl.includes('?') ? `${prodUrl}&sslmode=require` : `${prodUrl}?sslmode=require`;

  console.log(`${BOLD}Pull DB: producción → local${RESET}`);
  console.log(`${DIM}Origen:  ${maskUrl(prodUrl)}${RESET}`);
  console.log(`${DIM}Destino: postgresql://${localUser}@${container}/${localDb}${RESET}\n`);

  // 1) Volcar producción a un archivo temporal (antes de tocar local, así un
  //    fallo de red/pg_dump no deja la base local vacía).
  const tmp = path.join(os.tmpdir(), `chatbot-prod-dump-${Date.now()}.sql`);
  const fd = fs.openSync(tmp, 'w');
  console.log(`${DIM}1) Volcando datos de producción (pg_dump 17)…${RESET}`);
  try {
    execFileSync('docker', ['run', '--rm', 'postgres:17-alpine', 'pg_dump', dumpUrl, '--data-only', '--disable-triggers', '--no-owner'], { stdio: ['ignore', fd, 'inherit'] });
  } catch (err) {
    fs.closeSync(fd);
    fs.rmSync(tmp, { force: true });
    error('pull-db', `Falló pg_dump contra producción: ${err.message}`);
    process.exit(1);
  }
  fs.closeSync(fd);

  // 2) Vaciar las tablas locales (CASCADE para respetar las FK).
  const tables = [
    'knowledge_sources', 'knowledge_documents', 'knowledge_chunks',
    'knowledge_embeddings', 'knowledge_tags', 'knowledge_document_tags',
    'ingestion_jobs', 'conversations', 'bots', 'bot_settings',
  ];
  const truncateSql = `TRUNCATE ${tables.join(', ')} RESTART IDENTITY CASCADE;`;
  console.log(`${DIM}2) Vaciando tablas locales…${RESET}`);
  execFileSync('docker', ['exec', '-e', `PGPASSWORD=${localPass}`, container, 'psql', '-U', localUser, '-d', localDb, '-v', 'ON_ERROR_STOP=1', '-c', truncateSql], { stdio: 'inherit' });

  // 3) Restaurar en local.
  console.log(`${DIM}3) Restaurando en local…${RESET}`);
  try {
    // pg_dump 17 emite `SET transaction_timeout`, que el Postgres local (16) no
    // reconoce; lo quitamos del volcado antes de restaurarlo.
    const dump = fs.readFileSync(tmp, 'utf8').replace(/^SET transaction_timeout\s*=.*;$/gm, '');
    execFileSync('docker', ['exec', '-i', '-e', `PGPASSWORD=${localPass}`, container, 'psql', '-U', localUser, '-d', localDb, '-v', 'ON_ERROR_STOP=1'], { input: dump, stdio: ['pipe', 'inherit', 'inherit'] });
  } catch (err) {
    fs.rmSync(tmp, { force: true });
    error('pull-db', `Falló la restauración en local: ${err.message}`);
    process.exit(1);
  }
  fs.rmSync(tmp, { force: true });

  // 4) Verificación de conteos.
  const countsSql = "SELECT 'sources=' || count(*) FROM knowledge_sources UNION ALL SELECT 'documents=' || count(*) FROM knowledge_documents UNION ALL SELECT 'chunks=' || count(*) FROM knowledge_chunks UNION ALL SELECT 'embeddings=' || count(*) FROM knowledge_embeddings UNION ALL SELECT 'bots=' || count(*) FROM bots UNION ALL SELECT 'bot_settings=' || count(*) FROM bot_settings UNION ALL SELECT 'conversations=' || count(*) FROM conversations;";
  console.log(`${DIM}4) Conteos locales:${RESET}`);
  execFileSync('docker', ['exec', '-e', `PGPASSWORD=${localPass}`, container, 'psql', '-U', localUser, '-d', localDb, '-tA', '-c', countsSql], { stdio: 'inherit' });

  console.log(`\n${GREEN}✔${RESET} Pull DB completado.`);
}

// ─── Pull logs: producción → logs-prod/ ───────────────────────────────────
/**
 * Baja los logs del backend de producción vía GET /logs (los últimos 200 en
 * memoria del proceso) y los deja en logs-prod/backend.log (+ backend.json).
 *
 * La URL de producción se toma de: --prod-url <url> > PROD_URL env > default.
 * Nota: /logs solo expone el buffer en memoria del backend (últimos 200 desde
 * el último reinicio). Para logs completos de la plataforma (Render) hace
 * falta la dashboard o una RENDER_API_KEY (no implementado).
 */
async function pullProductionLogs() {
  const outDir = path.join(ROOT, 'logs-prod');
  fs.mkdirSync(outDir, { recursive: true });

  // Si hay RENDER_API_KEY, bajamos logs completos de la plataforma (Render).
  const renderKey = process.env.RENDER_API_KEY || readEnvFile(path.join(ROOT, '.env')).RENDER_API_KEY;
  if (renderKey) {
    await pullRenderLogs(renderKey, outDir);
  } else {
    // Fallback: endpoint /logs del backend (últimos 200 en memoria del proceso).
    const prodUrl = (prodUrlArg || process.env.PROD_URL || 'https://whatsapp-bot.onrender.com').replace(/\/+$/, '');
    console.log(`${BOLD}Pull logs: producción → logs-prod/${RESET}`);
    console.log(`${DIM}Origen: ${prodUrl}${RESET}\n`);

    try {
      const data = await httpGetJson(`${prodUrl}/logs?limit=200`);
      const entries = Array.isArray(data?.logs) ? data.logs : [];
      const lines = entries.map((e) => {
        const rest = { ...e };
        const ts = rest.timestamp ?? ''; delete rest.timestamp;
        const lvl = rest.level ?? 'info'; delete rest.level;
        const msg = rest.message ?? ''; delete rest.message;
        const extra = Object.keys(rest).length ? ' ' + JSON.stringify(rest) : '';
        return `[${ts}] [${String(lvl).toUpperCase()}] ${msg}${extra}`;
      });
      const text = lines.join('\n') + (lines.length ? '\n' : '');
      fs.writeFileSync(path.join(outDir, 'backend.log'), text);
      fs.writeFileSync(path.join(outDir, 'backend.json'), JSON.stringify(data, null, 2) + '\n');
      console.log(`${GREEN}✔${RESET} backend: ${entries.length} entradas → logs-prod/backend.log (+ backend.json)`);
    } catch (e) {
      error('pull-logs', `No se pudo obtener logs de ${prodUrl}/logs: ${e.message}`);
      console.log(`${DIM}  ¿URL de producción correcta? Pásala con: node dev.js --pull-logs --prod-url https://<tu-backend>.onrender.com${RESET}`);
      console.log(`${DIM}  Para logs completos de Render define RENDER_API_KEY (y opcional RENDER_OWNER_ID).${RESET}`);
      process.exitCode = 1;
    }
  }

  // Logs de la DB (Supabase) — complementario a los de Render.
  await pullSupabaseLogs(outDir);
}

/** Baja logs de PostgreSQL (Supabase) vía la Logs API — requiere SUPABASE_ACCESS_TOKEN. */
async function pullSupabaseLogs(outDir) {
  const rootEnv = readEnvFile(path.join(ROOT, '.env'));
  const backendEnv = readEnvFile(path.join(ROOT, 'backend', '.env'));
  const token = process.env.SUPABASE_ACCESS_TOKEN || rootEnv.SUPABASE_ACCESS_TOKEN || backendEnv.SUPABASE_ACCESS_TOKEN;
  const dbUrl = process.env.PROD_DATABASE_URL || backendEnv.DATABASE_URL || rootEnv.DATABASE_URL;
  const ref = process.env.SUPABASE_PROJECT_REF || rootEnv.SUPABASE_PROJECT_REF ||
    ((dbUrl && (dbUrl.match(/postgres\.([a-z0-9]+)(?:@|:)/) || dbUrl.match(/postgres\.([a-z0-9]+)\.(?:pooler\.)?supabase\.co/) || dbUrl.match(/db\.([a-z0-9]+)\.supabase\.co/))) || [])[1];

  if (!token) {
    console.log(`${DIM}Supabase logs: define SUPABASE_ACCESS_TOKEN en .env para bajar los logs de la DB (token en https://supabase.com/dashboard/account/tokens).${RESET}`);
    return;
  }
  if (!ref) {
    error('pull-logs', 'No pude determinar el project ref de Supabase. Definí SUPABASE_PROJECT_REF o una DATABASE_URL con *.supabase.co.');
    process.exitCode = 1;
    return;
  }

  const url = `https://api.supabase.com/v1/projects/${encodeURIComponent(ref)}/analytics/logs`;
  const rich = [
    'select cast(timestamp as datetime) as timestamp,',
    "coalesce(parsed.error_severity, 'LOG') as severity,",
    "coalesce(metadata->>'database_name', '') as database_name,",
    'event_message',
    'from postgres_logs',
    'order by timestamp desc',
    'limit 500',
  ].join(' ');
  const minimal = [
    'select cast(timestamp as datetime) as timestamp, event_message',
    'from postgres_logs',
    'order by timestamp desc',
    'limit 500',
  ].join(' ');

  console.log(`${BOLD}Pull logs: Supabase (${ref}) → logs-prod/${RESET}`);
  let data;
  try {
    data = await httpPostJson(url, { sql: rich }, { headers: { Authorization: `Bearer ${token}` } });
  } catch (e1) {
    // Si la query enriquecida falla (columnas de parsed/metadata), usar la mínima.
    try {
      data = await httpPostJson(url, { sql: minimal }, { headers: { Authorization: `Bearer ${token}` } });
    } catch (e2) {
      // La Logs API histórica requiere un JWT con permisos (service_role legacy eyJ...).
      console.warn(`${YELLOW}⚠${RESET} Logs API de Supabase no disponible con este token (${e2.message}).`);
      console.log(`${DIM}  Los logs históricos de la DB requieren el JWT legacy de service_role (eyJ...,
  no el formato sb_secret_ ni sbp_) desde Project Settings → API Keys,
  o exportarlos desde el Logs Explorer del dashboard. Mientras tanto,
  bajo un snapshot de actividad actual de la DB (misma DATABASE_URL).${RESET}`);
      await pullDbActivity(outDir);
      return;
    }
  }

  const rows = Array.isArray(data?.result) ? data.result : [];
  const lines = rows.map((r) => {
    const sev = r.severity || 'LOG';
    const db = r.database_name ? `(${r.database_name}) ` : '';
    return `[${r.timestamp ?? ''}] [${String(sev).toUpperCase()}] ${db}${r.event_message ?? ''}`;
  });
  const text = lines.join('\n') + (lines.length ? '\n' : '');
  fs.writeFileSync(path.join(outDir, 'supabase.log'), text);
  fs.writeFileSync(path.join(outDir, 'supabase.json'), JSON.stringify(data, null, 2) + '\n');
  console.log(`${GREEN}✔${RESET} supabase: ${rows.length} entradas → logs-prod/supabase.log (+ supabase.json)`);
}

/**
 * Snapshot de actividad actual de la DB (conexiones + queries más costosos),
 * usando la misma DATABASE_URL del backend. Se usa cuando la Logs API no está
 * disponible con el token configurado.
 */
async function pullDbActivity(outDir) {
  const backendEnv = readEnvFile(path.join(ROOT, 'backend', '.env'));
  const dbUrl = process.env.PROD_DATABASE_URL || backendEnv.DATABASE_URL;
  if (!dbUrl) {
    error('pull-logs', 'Sin DATABASE_URL para el snapshot de actividad.');
    process.exitCode = 1;
    return;
  }

  let Client;
  try {
    Client = require(path.join(ROOT, 'backend', 'node_modules', 'pg')).Client;
  } catch {
    error('pull-logs', 'pg no está disponible en backend/node_modules');
    process.exitCode = 1;
    return;
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: dbUrl.includes('supabase.co') ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 15000,
  });

  try {
    await client.connect();
    const act = await client.query(
      `SELECT pid, usename, state, wait_event_type,
              left(query, 120) AS query, (now() - query_start)::text AS age
         FROM pg_stat_activity
        WHERE pid <> pg_backend_pid()
        ORDER BY query_start DESC NULLS LAST
        LIMIT 30`
    );
    let stats = { rows: [] };
    try {
      stats = await client.query(
        `SELECT calls, total_exec_time::numeric(12,1) AS total_ms,
                mean_exec_time::numeric(10,1) AS mean_ms, rows,
                left(query, 100) AS query
           FROM pg_stat_statements
          ORDER BY total_exec_time DESC
          LIMIT 20`
      );
    } catch {
      /* pg_stat_statements no habilitado / sin permiso */
    }

    const lines = [
      '# Snapshot de actividad de la DB (la Logs API histórica no fue accesible con el token)',
      '# ' + new Date().toISOString(),
      '',
      '== CONEXIONES / QUERIES ACTIVOS ==',
      ...(act.rows.length
        ? act.rows.map((r) => `[${r.age}] [${r.usename || '?'}] [${r.state || '?'}] ${r.query}`)
        : ['(sin actividad)']),
      '',
      '== QUERIES MÁS COSTOSOS (pg_stat_statements) ==',
      ...(stats.rows.length
        ? stats.rows.map((r) => `[${r.calls} llamadas] [${r.total_ms} ms total] ${r.query}`)
        : ['(pg_stat_statements no habilitado)']),
    ];
    fs.writeFileSync(path.join(outDir, 'supabase.log'), lines.join('\n') + '\n');
    fs.writeFileSync(path.join(outDir, 'supabase.json'), JSON.stringify({ activity: act.rows, statements: stats.rows }, null, 2) + '\n');
    console.log(`${GREEN}✔${RESET} supabase: snapshot de actividad (${act.rows.length} conexiones, ${stats.rows.length} statements) → logs-prod/supabase.log`);
  } catch (e) {
    error('pull-logs', `No se pudo leer actividad de la DB: ${e.message}`);
    process.exitCode = 1;
  } finally {
    await client.end().catch(() => {});
  }
}

/** Normaliza una URL de repo de git para comparar (git@ / https:// / .git). */
function normalizeRepo(url) {
  if (!url) return '';
  return String(url)
    .replace(/^git@/, '')
    .replace(/^https?:\/\//, '')
    .replace(/^ssh:\/\//, '')
    .replace(/\.git$/, '')
    .replace(/\/$/, '')
    .trim();
}

/** URL del remote origin del repo local ('' si no hay git). */
function localRepoUrl() {
  try {
    return execFileSync('git', ['config', '--get', 'remote.origin.url'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

/** Baja logs completos vía la API de Render (requiere RENDER_API_KEY). */
async function pullRenderLogs(renderKey, outDir) {
  const base = 'https://api.render.com/v1';
  const headers = { Authorization: `Bearer ${renderKey}`, Accept: 'application/json' };
  const limit = 100;
  const maxPages = 5; // ~500 entradas por servicio

  console.log(`${BOLD}Pull logs: Render API → logs-prod/${RESET}`);

  // 1) Workspace (ownerId) — se puede forzar con RENDER_OWNER_ID.
  let ownerId = process.env.RENDER_OWNER_ID;
  if (!ownerId) {
    try {
      const owners = await httpGetJson(`${base}/owners`, { headers });
      // La API devuelve [{ cursor, owner: { id, ... } }]
      ownerId = Array.isArray(owners) ? owners[0]?.owner?.id : undefined;
    } catch { /* se informa abajo */ }
    if (!ownerId) {
      error('pull-logs', 'No pude determinar el ownerId. Definí RENDER_OWNER_ID (o RENDER_API_KEY con acceso al workspace).');
      process.exitCode = 1;
      return;
    }
  }

  // 2) Servicios: --service > RENDER_SERVICE_ID (.env) > auto-detección.
  //    La auto-detección prefiere los servicios cuyo repo coincide con el repo
  //    local de git; si no, por nombre conocido (chatbot-platform/whatsapp-bot).
  let targets = [];
  const renderEnv = readEnvFile(path.join(ROOT, '.env'));
  const svcIdEnv = process.env.RENDER_SERVICE_ID || renderEnv.RENDER_SERVICE_ID;

  const resolveName = async (id) => {
    try {
      const svc = await httpGetJson(`${base}/services/${encodeURIComponent(id)}`, { headers });
      const s = svc?.service || svc;
      return s?.name || id;
    } catch {
      return id;
    }
  };

  if (serviceIdsArg.length) {
    for (const id of serviceIdsArg) {
      targets.push({ id, name: await resolveName(id) });
    }
  } else if (svcIdEnv) {
    targets.push({ id: svcIdEnv, name: await resolveName(svcIdEnv) });
    console.log(`${DIM}Servicio: ${targets[0].name} (RENDER_SERVICE_ID)${RESET}`);
  } else {
    let services = [];
    try {
      const data = await httpGetJson(`${base}/services`, { headers });
      // La lista devuelve [{ cursor, service: { id, name, repo, ... } }]
      services = (Array.isArray(data) ? data : []).map((s) => s.service || s).filter(Boolean);
    } catch (e) {
      error('pull-logs', `No se pudo listar servicios de Render: ${e.message}`);
      process.exitCode = 1;
      return;
    }

    const localRepo = normalizeRepo(localRepoUrl());
    targets = localRepo ? services.filter((s) => normalizeRepo(s.repo) === localRepo) : [];
    if (targets.length === 0) {
      const wanted = new Set(['chatbot-platform', 'whatsapp-bot', 'knowledge-service']);
      targets = services.filter((s) => wanted.has(s.name));
    }
    if (targets.length > 0) {
      console.log(`${DIM}Servicios detectados: ${targets.map((s) => `${s.name} (${s.id})`).join(', ')}${RESET}`);
    }
  }
  if (targets.length === 0) {
    error('pull-logs', 'No encontré los servicios. Definí RENDER_SERVICE_ID en .env (p. ej. RENDER_SERVICE_ID=srv-d9obgg8ae00c73b4g8og) o pásalo con --service <id>.');
    process.exitCode = 1;
    return;
  }

  // 3) Logs con paginación (direction=backward → más recientes primero).
  const all = [];
  let startTime, endTime, hasMore = true;
  try {
    for (let page = 0; page < maxPages && hasMore; page++) {
      const q = [
        `ownerId=${encodeURIComponent(ownerId)}`,
        ...targets.map((s) => `resource=${encodeURIComponent(s.id)}`),
        'direction=backward',
        `limit=${limit}`,
        'type=app',
        startTime ? `startTime=${encodeURIComponent(startTime)}` : '',
        endTime ? `endTime=${encodeURIComponent(endTime)}` : '',
      ].filter(Boolean).join('&');
      const data = await httpGetJson(`${base}/logs?${q}`, { headers });
      const list = Array.isArray(data?.logs) ? data.logs : [];
      all.push(...list);
      hasMore = !!data?.hasMore;
      startTime = data?.nextStartTime;
      endTime = data?.nextEndTime;
      if (list.length === 0) break;
    }
  } catch (e) {
    error('pull-logs', `No se pudo obtener logs de la API de Render: ${e.message}`);
    process.exitCode = 1;
    return;
  }

  // 4) Guardar: agrupar por servicio (el resource viene en labels[]).
  const byId = new Map(targets.map((s) => [s.id, s.name]));
  const logLabel = (e, name) => {
    const lbl = (Array.isArray(e?.labels) ? e.labels : []).find((l) => l?.name === name);
    return lbl ? lbl.value : undefined;
  };
  const groups = new Map();
  for (const e of all) {
    const rid = logLabel(e, 'resource');
    const name = (rid && byId.get(rid)) || 'render';
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name).push(e);
  }
  if (groups.size === 0) groups.set('render', []);

  let total = 0;
  for (const [name, list] of groups) {
    const safe = name === 'whatsapp-bot' || name === 'chatbot-platform' ? 'backend' : name === 'knowledge-service' ? 'knowledge-service' : name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'render';
    const lines = list.map((e) => {
      const ts = e.timestamp ?? '';
      const lvl = logLabel(e, 'level') || 'info';
      const msg = typeof e.message === 'string' ? e.message : JSON.stringify(e);
      return `[${ts}] [${String(lvl).toUpperCase()}] ${msg}`;
    });
    const text = lines.join('\n') + (lines.length ? '\n' : '');
    fs.writeFileSync(path.join(outDir, `${safe}.log`), text);
    fs.writeFileSync(path.join(outDir, `${safe}.json`), JSON.stringify(list, null, 2) + '\n');
    total += list.length;
    console.log(`${GREEN}✔${RESET} ${name}: ${list.length} entradas → logs-prod/${safe}.log (+ ${safe}.json)`);
  }
  console.log(`${DIM}${hasMore ? `Hay más logs (hasMore) — bajé ${total} con paginación.` : `Total: ${total} entradas.`}${RESET}`);
}
