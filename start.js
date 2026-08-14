#!/usr/bin/env node
/**
 * start.js — Orquestador de desarrollo.
 *
 * Levanta los tres servicios del proyecto a la vez:
 *   backend            → Node/Express          → http://localhost:3000
 *   chat-web           → Vite dev server       → http://localhost:5173
 *   knowledge-service  → FastAPI/uvicorn       → http://localhost:8000
 *
 * Uso:
 *   node start.js
 *   npm run dev                 (equivalente)
 *   node start.js --no-reload   (desactiva hot-reload de los 3 servicios)
 *
 * Puertos configurables: BACKEND_PORT, WEB_PORT, KNOWLEDGE_PORT.
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

const ROOT = __dirname;

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

// ─── Definición de servicios ──────────────────────────────────────────────
const services = [
  {
    name: 'backend',
    cwd: path.join(ROOT, 'backend'),
    command: 'npm',
    args: ['run', reload ? 'dev' : 'start'],
    env: { PORT: process.env.BACKEND_PORT || '3000' },
  },
  {
    name: 'chat-web',
    cwd: path.join(ROOT, 'chat-web'),
    command: 'npm',
    args: ['run', 'dev', '--', '--port', process.env.WEB_PORT || '5173'],
    env: {},
  },
  {
    name: 'knowledge-service',
    cwd: path.join(ROOT, 'knowledge-service'),
    command: '',
    args: [],
    env: {},
  },
];

// knowledge-service: asegurar un .venv funcional.
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

// ─── Preflight ────────────────────────────────────────────────────────────
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

// ─── Lanzamiento ──────────────────────────────────────────────────────────
const children = [];

function start(service) {
  const child = spawn(service.command, service.args, {
    cwd: service.cwd,
    env: { ...process.env, ...service.env },
    stdio: ['inherit', 'pipe', 'pipe'],
  });
  children.push([child, service.name]);

  const prefix = `${COLORS[service.name]}[${service.name}]${RESET} `;
  let stdoutLeftover = '';
  let stderrLeftover = '';

  child.stdout.on('data', (buf) => {
    stdoutLeftover += buf.toString();
    const lines = stdoutLeftover.split('\n');
    stdoutLeftover = lines.pop();
    for (const line of lines) console.log(prefix + line);
  });
  child.stderr.on('data', (buf) => {
    stderrLeftover += buf.toString();
    const lines = stderrLeftover.split('\n');
    stderrLeftover = lines.pop();
    for (const line of lines) console.log(prefix + YELLOW + line + RESET);
  });

  child.on('error', (err) => {
    error(service.name, `No se pudo iniciar: ${err.message}`);
    shutdown(1);
  });

  child.on('exit', (code, signal) => {
    console.log(
      prefix + DIM + `proceso terminado (${code !== null ? `code=${code}` : `signal=${signal}`})` + RESET,
    );
    // Si un servicio murió solo con error, derribar el resto.
    if (code !== null && code !== 0) shutdown(code);
  });

  return child;
}

// ─── Apagado ──────────────────────────────────────────────────────────────
let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const [child, name] of children) {
    if (child.exitCode === null && !child.killed) {
      console.log(`${COLORS[name]}[${name}]${RESET} ${DIM}deteniendo…${RESET}`);
      child.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(code), 500);
}

process.on('SIGINT', () => {
  console.log(`\n${BOLD}Deteniendo servicios…${RESET}`);
  shutdown(0);
});
process.on('SIGTERM', () => shutdown(0));

// ─── Arranque ─────────────────────────────────────────────────────────────
console.log(
  `${BOLD}${GREEN}Levantando servicios${RESET} ${DIM}(${reload ? 'hot-reload ON' : 'hot-reload OFF'})${RESET}\n`,
);

for (const service of services) start(service);

console.log(`
${BOLD}Servicios:${RESET}
  ${GREEN}backend${RESET}            → ${BOLD}http://localhost:${process.env.BACKEND_PORT || '3000'}${RESET}
  ${GREEN}chat-web${RESET}           → ${BOLD}http://localhost:${process.env.WEB_PORT || '5173'}${RESET}
  ${GREEN}knowledge-service${RESET}  → ${BOLD}http://localhost:${process.env.KNOWLEDGE_PORT || '8000'}${RESET} (docs en /docs)
  ${DIM}DB (si hace falta) → cd db && docker compose up -d${RESET}

${DIM}Ctrl+C para detener todo.${RESET}
`);

// ─── Helpers ──────────────────────────────────────────────────────────────
function warn(service, message) {
  console.log(`${YELLOW}⚠  [${service}]${RESET} ${message}`);
}
function error(service, message) {
  console.log(`${RED}✖ [${service}]${RESET} ${message}`);
}
