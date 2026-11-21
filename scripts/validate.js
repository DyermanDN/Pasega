const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const errors = [];

function ok(msg) {
  console.log('  [OK]   ', msg);
}

function fail(msg) {
  console.error('  [ERROR]', msg);
  errors.push(msg);
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

console.log('=== Validación CI · PASEGA ===\n');

// 1. Validar JSON de configuración
for (const rel of ['vercel.json', 'package.json']) {
  try {
    JSON.parse(read(rel));
    ok(`${rel} es JSON válido`);
  } catch (e) {
    fail(`${rel} tiene JSON inválido: ${e.message}`);
  }
}

// 2. Validar sintaxis de archivos JS
for (const rel of [
  'api/config.js',
  'public/supabase-bridge.js',
  'scripts/backup-local.js',
  'scripts/enviar-cambio.js',
  'scripts/validate.js'
]) {
  try {
    const code = read(rel);
    new vm.Script(code, { filename: rel });
    ok(`Sintaxis JS válida: ${rel}`);
  } catch (e) {
    fail(`Error de sintaxis en ${rel}: ${e.message}`);
  }
}

// 3. Validar scripts embebidos en public/index.html y referencias requeridas
try {
  const html = read('public/index.html');
  if (!html.includes('/supabase-bridge.js')) {
    fail('public/index.html no carga /supabase-bridge.js');
  } else {
    ok('public/index.html incluye /supabase-bridge.js');
  }
  if (!html.includes('@supabase/supabase-js')) {
    fail('public/index.html no incluye @supabase/supabase-js');
  } else {
    ok('public/index.html incluye @supabase/supabase-js');
  }
  const requiredDbKeys = [
    "'ventas'",
    "'compras'",
    "'sistema/reporte'",
    "'config/ajustes'",
    "'config/confirmados'",
    "'catalogo'",
    "'inventario/stock'",
    "'cobranza/reporte'",
    "'cobranza/ajustes'",
    "'cobGestiones'",
    "'cobHistorial'"
  ];
  const missingKeys = requiredDbKeys.filter((k) => !html.includes(k));
  if (missingKeys.length) {
    fail(`Faltan rutas críticas de base de datos en public/index.html: ${missingKeys.join(', ')}`);
  } else {
    ok('Todas las colecciones/rutas de Supabase siguen intactas en public/index.html');
  }
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (scripts.length < 2) {
    fail(`Se esperaban al menos 2 bloques <script> en public/index.html y se encontraron ${scripts.length}`);
  }
  scripts.forEach((m, idx) => {
    try {
      new vm.Script(m[1], { filename: `public/index.html#script-${idx + 1}` });
      ok(`public/index.html bloque <script> #${idx + 1} válido (${m[1].length} chars)`);
    } catch (e) {
      fail(`Error de sintaxis en public/index.html bloque <script> #${idx + 1}: ${e.message}`);
    }
  });
} catch (e) {
  fail(`No se pudo leer public/index.html: ${e.message}`);
}

// 4. Prueba unitaria del endpoint api/config.js
try {
  const handler = require(path.join(ROOT, 'api/config.js'));
  const prev = {
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  };

  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  let code1 = 0;
  let body1 = null;
  handler({}, { setHeader() {}, status(c) { code1 = c; return this; }, json(j) { body1 = j; } });
  if (code1 !== 200 || !body1 || body1.configured !== false) {
    fail('api/config.js falló prueba sin variables de entorno');
  }

  process.env.SUPABASE_URL = 'https://ejemplo.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'anon-test-key';
  let code2 = 0;
  let body2 = null;
  handler({}, { setHeader() {}, status(c) { code2 = c; return this; }, json(j) { body2 = j; } });
  if (code2 !== 200 || !body2 || body2.configured !== true || body2.url !== 'https://ejemplo.supabase.co') {
    fail('api/config.js falló prueba con variables de entorno');
  } else {
    ok('api/config.js pasó pruebas unitarias');
  }

  for (const [k, v] of Object.entries(prev)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
} catch (e) {
  fail(`Error probando api/config.js: ${e.message}`);
}

// 5. Validar que supabase/schema.sql mantenga RLS habilitado
try {
  const sql = read('supabase/schema.sql');
  if (!/alter\s+table\s+public\.pasega_docs\s+enable\s+row\s+level\s+security/i.test(sql)) {
    fail('supabase/schema.sql debe mantener Row Level Security habilitado en pasega_docs');
  } else {
    ok('supabase/schema.sql mantiene RLS habilitado');
  }
} catch (e) {
  fail(`No se pudo leer supabase/schema.sql: ${e.message}`);
}

// 6. Escáner básico de secretos accidentales en archivos del repositorio
const SECRET_PATTERNS = [
  { name: 'Supabase Personal Access Token', re: /\bsbp_[a-f0-9]{20,}\b/i },
  { name: 'Supabase Secret Key', re: /\bsb_secret_[A-Za-z0-9_-]{12,}\b/ },
  { name: 'Vercel Token', re: /\bvcp_[A-Za-z0-9]{20,}\b/ },
  { name: 'Postgres URI con contraseña real', re: /postgresql:\/\/postgres:(?!\[YOUR-DATABASE-PASSWORD\])[^@\s]{6,}@/i }
];

const IGNORE_DIRS = new Set(['.git', 'node_modules', 'backups', '.vercel']);
const IGNORE_FILES = new Set(['.env', '.env.local', '.env.backup', 'Pasega · Finanzas y cobranzas.html']);

function scanDir(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORE_DIRS.has(entry.name)) scanDir(path.join(dir, entry.name));
      continue;
    }
    if (IGNORE_FILES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full);
    if (rel === path.join('scripts', 'validate.js')) continue;
    let content;
    try {
      content = fs.readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    for (const pat of SECRET_PATTERNS) {
      if (pat.re.test(content)) {
        fail(`Posible secreto detectado (${pat.name}) en ${rel}. Nunca subas claves ni tokens al repositorio.`);
      }
    }
  }
}

scanDir(ROOT);
if (!errors.some((e) => e.includes('Posible secreto'))) {
  ok('Escaneo de secretos limpio (sin tokens ni contraseñas expuestas)');
}

console.log('');
if (errors.length > 0) {
  console.error(`Validación FALLIDA con ${errors.length} error(es).`);
  process.exit(1);
}
console.log('Todas las validaciones pasaron correctamente.');
