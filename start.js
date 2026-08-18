#!/usr/bin/env node
/**
 * start.js — Orquestador de desarrollo (monta en background + terminal de logs).
 *
 * Monta los tres servicios en segundo plano (sobreviven al cierre de esta
 * terminal) y abre una terminal por servicio con sus logs en vivo
 * (backend, chat-web, knowledge-service y el contenedor de la db):
 *   backend            → Node/Express          → http://localhost:3000
 *   chat-web           → Vite dev server       → http://localhost:5173
 *   knowledge-service  → FastAPI/uvicorn       → http://localhost:8000
 *
 * Uso:
 *   node start.js                 monta los servicios y abre una terminal de logs por servicio
 *   node start.js --stop          detiene los servicios (mata lo que ocupe sus puertos)
 *   node start.js --no-reload     desactiva hot-reload de los 3 servicios
 *   node start.js --external      fuerza ventanas de terminal del sistema aunque estés en Zed
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

const ROOT = __dirname;
const LOG_DIR = path.join(ROOT, 'logs');
const PID_FILE = path.join(LOG_DIR, '.start.pid'); // pids montados, para --stop

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
      warn('start', `No pude enviar ${signal} al PID ${pid}: ${err.message}`);
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
  child.unref(); // start.js puede terminar; los servicios siguen corriendo
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
    { title: 'knowledge-service', cmd: tailLog('knowledge-service.log') },
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
    warn('start', 'No encontré un emulador de terminal para abrir los logs. Ábrelos tú mismo con los comandos de arriba.');
  }
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

  console.log(
    `${BOLD}${GREEN}Montando servicios${RESET} ${DIM}(${reload ? 'hot-reload ON' : 'hot-reload OFF'})${RESET}\n`,
  );

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

  // ── Preflight ──
  for (const s of services) {
    if (s.name === 'knowledge-service') continue;
    if (!fs.existsSync(path.join(s.cwd, 'node_modules'))) {
      warn(s.name, `Faltan dependencias: ejecuta "npm install" en ${path.relative(ROOT, s.cwd)}`);
    }
  }
  if (!fs.existsSync(path.join(ROOT, 'backend', '.env'))) {
    warn('backend', 'No hay .env en backend/ (se usan defaults; revisa backend/.env.example)');
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
    await freePort(service.port, service.name);
    mounted.push({ service, ...mount(service) });
  }
  mountDbLogs();

  // ── Terminales de logs ──
  openLogsTerminals();

  const logsHint =
    IN_ZED && !forceExternal
      ? 'Logs → pega en paneles de Zed los comandos de arriba (o tail -n 100 -f logs/*.log)'
      : 'Logs → se abrieron 4 terminales; también queda todo en logs/*.log';

  const pidOf = (name) => mounted.find((m) => m.service.name === name).pid;
  console.log(`
${BOLD}Servicios montados en background:${RESET}
  ${GREEN}backend${RESET}            → ${BOLD}http://localhost:${process.env.BACKEND_PORT || '3000'}${RESET}  ${DIM}(PID ${pidOf('backend')})${RESET}
  ${GREEN}chat-web${RESET}           → ${BOLD}http://localhost:${process.env.WEB_PORT || '5173'}${RESET}  ${DIM}(PID ${pidOf('chat-web')})${RESET}
  ${GREEN}knowledge-service${RESET}  → ${BOLD}http://localhost:${process.env.KNOWLEDGE_PORT || '8000'}${RESET}  ${DIM}(PID ${pidOf('knowledge-service')})${RESET}
  ${DIM}db (contenedor)     → logs/db.log  (docker logs -f en background)${RESET}
  ${DIM}DB (si hace falta) → cd db && docker compose up -d${RESET}

${DIM}${logsHint}${RESET}
${DIM}Detener todo → node start.js --stop${RESET}
`);
}

main().catch((err) => {
  error('start', err.message);
  process.exit(1);
});

// ─── Helpers ──────────────────────────────────────────────────────────────
function warn(service, message) {
  console.log(`${YELLOW}⚠  [${service}]${RESET} ${message}`);
}
function error(service, message) {
  console.log(`${RED}✖ [${service}]${RESET} ${message}`);
}
