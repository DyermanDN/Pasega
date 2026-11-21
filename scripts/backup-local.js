const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.backup');
const BACKUP_DIR = path.join(ROOT, 'backups');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(
      `No encontré "${path.basename(filePath)}". Copia ".env.backup.example" a ".env.backup" y completa tus datos.`
    );
  }
  const env = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function sqlLit(str) {
  return "'" + String(str).replace(/\u0000/g, '').replace(/'/g, "''") + "'";
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function stampFile() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}_${pad2(d.getHours())}-${pad2(d.getMinutes())}`;
}

function buildSqlDump(rows, exportedAt) {
  const lines = [
    '-- ============================================================================',
    `-- PASEGA · Respaldo automático de base de datos (${exportedAt})`,
    `-- Registros: ${rows.length}`,
    '-- ============================================================================',
    '',
    'BEGIN;',
    'SET standard_conforming_strings = on;',
    '',
    'CREATE TABLE IF NOT EXISTS public.pasega_docs (',
    '  collection text NOT NULL,',
    '  doc_id text NOT NULL,',
    "  data jsonb NOT NULL DEFAULT '{}'::jsonb,",
    '  updated_at timestamptz NOT NULL DEFAULT now(),',
    '  updated_by uuid,',
    '  PRIMARY KEY (collection, doc_id)',
    ');',
    ''
  ];
  for (const r of rows) {
    const jsonStr = JSON.stringify(r.data ?? {});
    const ts = r.updated_at ? sqlLit(r.updated_at) + '::timestamptz' : 'now()';
    lines.push(
      `INSERT INTO public.pasega_docs (collection, doc_id, data, updated_at) VALUES (${sqlLit(r.collection)}, ${sqlLit(r.doc_id)}, ${sqlLit(jsonStr)}::jsonb, ${ts}) ON CONFLICT (collection, doc_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;`
    );
  }
  lines.push('', 'COMMIT;', '');
  return lines.join('\n');
}

async function fetchFromSupabase(cfg) {
  const baseUrl = cfg.SUPABASE_URL.replace(/\/+$/, '');
  const anonKey = cfg.SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) throw new Error('Faltan SUPABASE_URL o SUPABASE_ANON_KEY en .env.backup');
  if (!cfg.PASEGA_EMAIL || !cfg.PASEGA_PASSWORD) {
    throw new Error('Faltan PASEGA_EMAIL o PASEGA_PASSWORD en .env.backup');
  }

  // 1. Iniciar sesión con el usuario de Pasega (mantiene activo Supabase Auth y RLS)
  const loginRes = await fetch(`${baseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cfg.PASEGA_EMAIL, password: cfg.PASEGA_PASSWORD })
  });
  const loginJson = await loginRes.json();
  if (!loginRes.ok || !loginJson.access_token) {
    throw new Error('No se pudo autenticar en Supabase: ' + (loginJson.error_description || loginJson.msg || loginRes.status));
  }
  const jwt = loginJson.access_token;

  // 2. Descargar todos los registros paginando de 1000 en 1000
  const rows = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const url = `${baseUrl}/rest/v1/pasega_docs?select=collection,doc_id,data,updated_at,updated_by&order=collection.asc,doc_id.asc`;
    const res = await fetch(url, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${jwt}`,
        Range: `${from}-${from + pageSize - 1}`
      }
    });
    if (!res.ok) {
      throw new Error(`Error al leer pasega_docs (${res.status}): ` + (await res.text()));
    }
    const batch = await res.json();
    for (const r of batch) rows.push(r);
    if (batch.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

function pruneOldBackups(dir, keepCount) {
  if (!keepCount || keepCount <= 0) return;
  for (const ext of ['.sql', '.json']) {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.startsWith('pasega-backup-') && f.endsWith(ext))
      .sort()
      .reverse();
    for (const old of files.slice(keepCount)) {
      try { fs.unlinkSync(path.join(dir, old)); } catch {}
    }
  }
}

async function syncToLocalPostgres(cfg, rows) {
  let pg;
  try {
    pg = require('pg');
  } catch (e) {
    throw new Error('Falta instalar el módulo "pg" localmente. Ejecuta: npm install --no-save pg');
  }
  const { Client } = pg;
  const host = cfg.LOCAL_PG_HOST || 'localhost';
  const port = Number(cfg.LOCAL_PG_PORT || 5432);
  const user = cfg.LOCAL_PG_USER || 'postgres';
  const password = cfg.LOCAL_PG_PASSWORD || '';
  const database = cfg.LOCAL_PG_DATABASE || 'pasega_backup';

  if (!/^[a-zA-Z0-9_]+$/.test(database)) {
    throw new Error('LOCAL_PG_DATABASE solo puede contener letras, números y guion bajo.');
  }

  // 1. Verificar / crear la base de datos local si todavía no existe
  const adminClient = new Client({ host, port, user, password, database: 'postgres' });
  await adminClient.connect();
  try {
    const check = await adminClient.query('SELECT 1 FROM pg_database WHERE datname = $1', [database]);
    if (check.rowCount === 0) {
      await adminClient.query(`CREATE DATABASE "${database}"`);
      console.log(`Base de datos local "${database}" creada en PostgreSQL.`);
    }
  } finally {
    await adminClient.end();
  }

  // 2. Sincronizar pasega_docs y vistas útiles para pgAdmin 4
  const client = new Client({ host, port, user, password, database });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.pasega_docs (
        collection text NOT NULL,
        doc_id text NOT NULL,
        data jsonb NOT NULL DEFAULT '{}'::jsonb,
        updated_at timestamptz NOT NULL DEFAULT now(),
        updated_by uuid,
        PRIMARY KEY (collection, doc_id)
      );
      CREATE TABLE IF NOT EXISTS public.pasega_backup_log (
        id serial PRIMARY KEY,
        synced_at timestamptz NOT NULL DEFAULT now(),
        total_rows integer NOT NULL,
        summary jsonb NOT NULL DEFAULT '{}'::jsonb
      );
    `);

    // Espejo exacto dentro de la transacción (si falla algo, hace ROLLBACK y no borra nada)
    await client.query('TRUNCATE TABLE public.pasega_docs');
    for (const r of rows) {
      await client.query(
        `INSERT INTO public.pasega_docs (collection, doc_id, data, updated_at, updated_by)
         VALUES ($1, $2, $3::jsonb, COALESCE($4::timestamptz, now()), $5::uuid)`,
        [r.collection, r.doc_id, JSON.stringify(r.data ?? {}), r.updated_at || null, r.updated_by || null]
      );
    }

    // Vistas listas para consultar cómodamente en pgAdmin 4
    await client.query(`
      CREATE OR REPLACE VIEW public.v_resumen_colecciones AS
      SELECT collection, count(*) AS registros, max(updated_at) AS ultima_actualizacion
      FROM public.pasega_docs
      GROUP BY collection
      ORDER BY collection;

      CREATE OR REPLACE VIEW public.v_ventas AS
      SELECT
        doc_id AS comprobante,
        data->>'tipo' AS tipo,
        data->>'fecha' AS fecha,
        data->>'cliente' AS cliente,
        data->>'ruc' AS ruc,
        data->>'vendedor' AS vendedor,
        data->>'moneda' AS moneda,
        (data->>'subtotal')::numeric AS subtotal,
        (data->>'igv')::numeric AS igv,
        (data->>'total')::numeric AS total,
        updated_at
      FROM public.pasega_docs
      WHERE collection = 'ventas';
    `);

    const summary = {};
    for (const r of rows) summary[r.collection] = (summary[r.collection] || 0) + 1;
    await client.query(
      'INSERT INTO public.pasega_backup_log (total_rows, summary) VALUES ($1, $2::jsonb)',
      [rows.length, JSON.stringify(summary)]
    );

    await client.query('COMMIT');
    console.log(`PostgreSQL local (${host}:${port}/${database}) actualizado: ${rows.length} registros.`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    await client.end();
  }
}

async function main() {
  const cfg = loadEnvFile(ENV_FILE);
  console.log('Conectando a Supabase...');
  const rows = await fetchFromSupabase(cfg);
  const exportedAt = new Date().toISOString();
  const stamp = stampFile();

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const sqlFile = path.join(BACKUP_DIR, `pasega-backup-${stamp}.sql`);
  const jsonFile = path.join(BACKUP_DIR, `pasega-backup-${stamp}.json`);

  const collections = {};
  for (const r of rows) collections[r.collection] = (collections[r.collection] || 0) + 1;

  fs.writeFileSync(sqlFile, buildSqlDump(rows, exportedAt), 'utf8');
  fs.writeFileSync(
    jsonFile,
    JSON.stringify({ format: 'pasega-backup-v1', exportedAt, totalRows: rows.length, collections, rows }, null, 2),
    'utf8'
  );
  pruneOldBackups(BACKUP_DIR, Number(cfg.BACKUP_KEEP_FILES || 30));

  console.log(`Archivos guardados (${rows.length} registros):`);
  console.log('  SQL :', sqlFile);
  console.log('  JSON:', jsonFile);

  const pgEnabled = String(cfg.LOCAL_PG_ENABLED || 'true').toLowerCase() !== 'false';
  if (pgEnabled && cfg.LOCAL_PG_PASSWORD && cfg.LOCAL_PG_PASSWORD !== 'TU_CONTRASEÑA_DE_PGADMIN') {
    await syncToLocalPostgres(cfg, rows);
  } else if (pgEnabled) {
    console.log('Aviso: Completa LOCAL_PG_PASSWORD en .env.backup para sincronizar automáticamente con pgAdmin 4.');
  }

  console.log('Respaldo completado con éxito.');
}

main().catch((err) => {
  console.error('ERROR EN RESPALDO:', err.message);
  process.exit(1);
});
