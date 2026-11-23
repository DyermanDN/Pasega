(function () {
  'use strict';

  const TABLE = 'pasega_docs';
  const USERS_TABLE = 'pasega_users';

  function clone(v) {
    return v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  }

  function domReady() {
    if (document.readyState !== 'loading') return Promise.resolve();
    return new Promise((resolve) => document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  }

  function injectStyles() {
    if (document.getElementById('psg-auth-styles')) return;
    const style = document.createElement('style');
    style.id = 'psg-auth-styles';
    style.textContent = `
      .psg-overlay{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;background:rgba(10,20,38,.72);backdrop-filter:blur(6px);font-family:"IBM Plex Sans",system-ui,sans-serif}
      .psg-card{width:100%;max-width:400px;background:var(--surface-1,#fcfcfb);color:var(--text-primary,#14171c);border:1px solid var(--line-strong,#cfccc1);border-radius:14px;padding:26px 24px;box-shadow:0 24px 60px rgba(0,0,0,.32)}
      .psg-head{display:flex;align-items:center;gap:12px;margin-bottom:18px}
      .psg-badge{width:40px;height:40px;border-radius:10px;background:#e8870e;color:#fff;display:grid;place-items:center;font-weight:700;font-size:20px;flex:none}
      .psg-head h2{margin:0;font-size:17px;font-weight:700;color:var(--text-primary,#14171c)}
      .psg-head p{margin:2px 0 0;font-size:12.5px;color:var(--text-secondary,#52514e)}
      .psg-field{display:flex;flex-direction:column;gap:5px;margin-bottom:13px;font-size:12.5px;font-weight:500;color:var(--text-secondary,#52514e)}
      .psg-field input{width:100%;padding:9px 11px;border-radius:8px;border:1px solid var(--line-strong,#cfccc1);background:var(--surface-1,#fff);color:var(--text-primary,#14171c);font:inherit;font-size:14px}
      .psg-field input:focus{outline:2px solid #2a78d6;outline-offset:1px}
      .psg-btn{width:100%;padding:10px 14px;border-radius:9px;border:0;background:#0f2f57;color:#fff;font-weight:600;font-size:14px;cursor:pointer;margin-top:4px}
      .psg-btn:hover{filter:brightness(1.08)}
      .psg-btn:disabled{opacity:.6;cursor:not-allowed}
      .psg-btn.sec{background:transparent;color:var(--text-secondary,#52514e);border:1px solid var(--line-strong,#cfccc1);margin-top:10px}
      .psg-err{display:none;margin:10px 0 6px;padding:9px 11px;border-radius:8px;background:var(--bad-bg,#fde8e6);color:var(--bad,#b42318);font-size:12.5px;line-height:1.4}
      .psg-err.show{display:block}
      .psg-info{font-size:12.5px;line-height:1.5;color:var(--text-secondary,#52514e);margin:0 0 14px}
      .psg-code{font-family:"IBM Plex Mono",ui-monospace,monospace;font-size:12px;background:var(--surface-2,#f0efea);padding:10px 12px;border-radius:8px;margin:10px 0 14px;overflow:auto;color:var(--text-primary,#14171c)}
      .psg-userbar{display:flex;flex-direction:column;gap:6px;padding:8px 8px 2px;border-top:1px solid rgba(255,255,255,.14);font-size:11.5px;color:rgba(255,255,255,.85)}
      .psg-userbar .psg-email{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.9}
      .psg-userbar .psg-role{font-size:10.5px;opacity:.65}
      .psg-logout{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.22);border-radius:7px;padding:6px 9px;font-size:12px;font-weight:500;cursor:pointer;text-align:center}
      .psg-logout:hover{background:rgba(255,255,255,.22)}
      @media (max-width:820px){.psg-userbar{border-top:0;padding:0;flex-direction:row;align-items:center}.psg-userbar .psg-email,.psg-userbar .psg-role{display:none}.psg-logout{padding:7px 9px;white-space:nowrap}}
    `;
    document.head.appendChild(style);
  }

  function translateAuthError(err) {
    const msg = String((err && err.message) || err || '');
    if (/invalid login credentials/i.test(msg)) return 'Correo o contraseña incorrectos.';
    if (/email not confirmed/i.test(msg)) return 'Este usuario aún no tiene el correo confirmado en Supabase.';
    if (/too many requests|rate limit/i.test(msg)) return 'Demasiados intentos. Espera un momento y vuelve a intentar.';
    if (/failed to fetch|network/i.test(msg)) return 'No se pudo conectar con Supabase. Revisa tu conexión a internet.';
    return msg || 'No se pudo iniciar sesión.';
  }

  function translateDbError(err) {
    const msg = String((err && err.message) || err || '');
    const code = err && err.code;
    if (code === '42P01' || code === 'PGRST205' || /pasega_docs/i.test(msg)) {
      return new Error('Falta crear las tablas en Supabase: ejecuta el archivo supabase/schema.sql en el SQL Editor.');
    }
    if (code === '42501' || /row-level security/i.test(msg)) {
      return new Error('No tienes permiso para realizar esta acción.');
    }
    return err instanceof Error ? err : new Error(msg || 'Error de base de datos');
  }

  async function loadConfig() {
    if (window.__PASEGA_CONFIG__ && window.__PASEGA_CONFIG__.url && window.__PASEGA_CONFIG__.anonKey) {
      return {
        url: String(window.__PASEGA_CONFIG__.url).trim(),
        anonKey: String(window.__PASEGA_CONFIG__.anonKey).trim(),
        configured: true
      };
    }
    try {
      const resp = await fetch('/api/config', { cache: 'no-store' });
      if (resp.ok) {
        const cfg = await resp.json();
        if (cfg && cfg.url && cfg.anonKey) {
          return { url: cfg.url, anonKey: cfg.anonKey, configured: true };
        }
      }
    } catch (e) {
      // Sin backend /api/config (ej. archivo local)
    }
    return { url: '', anonKey: '', configured: false };
  }

  function showSetupModal(reason) {
    injectStyles();
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'psg-overlay';
      el.innerHTML = `
        <div class="psg-card" role="dialog" aria-modal="true" aria-label="Configurar Supabase">
          <div class="psg-head">
            <div class="psg-badge">P</div>
            <div>
              <h2>PASEGA · Configurar nube</h2>
              <p>Conecta tu proyecto de Supabase</p>
            </div>
          </div>
          <p class="psg-info" id="psg-setup-reason"></p>
          <div class="psg-code">SUPABASE_URL=https://tu-proyecto.supabase.co<br>SUPABASE_ANON_KEY=tu-clave-anon</div>
          <p class="psg-info">1. Ejecuta <b>supabase/schema.sql</b> en tu proyecto de Supabase.<br>2. Agrega esas variables en <b>Vercel → Settings → Environment Variables</b> y redespliega.<br>3. Crea tu usuario en <b>Supabase → Authentication → Users</b>.</p>
          <button type="button" class="psg-btn" id="psg-reload">Ya lo configuré · Recargar</button>
          <button type="button" class="psg-btn sec" id="psg-local">Continuar sin nube (solo vista local)</button>
        </div>
      `;
      el.querySelector('#psg-setup-reason').textContent =
        reason || 'Aún no se detectaron las variables de entorno de Supabase en este servidor.';
      document.body.appendChild(el);
      el.querySelector('#psg-reload').addEventListener('click', () => window.location.reload());
      el.querySelector('#psg-local').addEventListener('click', () => {
        el.remove();
        resolve({ db: null, user: null });
      });
    });
  }

  function showLoginModal(client) {
    injectStyles();
    return new Promise((resolve) => {
      const el = document.createElement('div');
      el.className = 'psg-overlay';
      el.innerHTML = `
        <div class="psg-card" role="dialog" aria-modal="true" aria-label="Iniciar sesión en PASEGA">
          <div class="psg-head">
            <div class="psg-badge">P</div>
            <div>
              <h2>PASEGA · Finanzas y Cobranzas</h2>
              <p>Inicia sesión con tu cuenta autorizada</p>
            </div>
          </div>
          <form id="psg-login-form">
            <label class="psg-field">
              Correo electrónico
              <input type="email" id="psg-email" autocomplete="username" required placeholder="usuario@pasega.com">
            </label>
            <label class="psg-field">
              Contraseña
              <input type="password" id="psg-pass" autocomplete="current-password" required placeholder="••••••••">
            </label>
            <div class="psg-err" id="psg-err"></div>
            <button type="submit" class="psg-btn" id="psg-submit">Ingresar</button>
          </form>
        </div>
      `;
      document.body.appendChild(el);

      const form = el.querySelector('#psg-login-form');
      const emailInput = el.querySelector('#psg-email');
      const passInput = el.querySelector('#psg-pass');
      const errBox = el.querySelector('#psg-err');
      const submitBtn = el.querySelector('#psg-submit');

      setTimeout(() => emailInput.focus(), 50);

      form.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        errBox.classList.remove('show');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Verificando…';
        try {
          const { data, error } = await client.auth.signInWithPassword({
            email: emailInput.value.trim(),
            password: passInput.value
          });
          if (error) throw error;
          if (!data || !data.session) throw new Error('No se recibió sesión activa.');
          el.remove();
          resolve(data.session);
        } catch (err) {
          errBox.textContent = translateAuthError(err);
          errBox.classList.add('show');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Ingresar';
        }
      });
    });
  }

  function mountUserBar(client, email, role) {
    injectStyles();
    const bottom = document.querySelector('.sn-bottom');
    if (!bottom || document.getElementById('psg-userbar')) return;

    const roleLabel =
      role === 'owner' ? 'Administrador' :
      role === 'viewer' ? 'Solo lectura' :
      role === 'blocked' ? 'Sin acceso' : 'Editor';

    const bar = document.createElement('div');
    bar.id = 'psg-userbar';
    bar.className = 'psg-userbar';
    const emailEl = document.createElement('div');
    emailEl.className = 'psg-email';
    emailEl.title = String(email || '');
    emailEl.textContent = String(email || '');
    const roleEl = document.createElement('div');
    roleEl.className = 'psg-role';
    roleEl.textContent = `${roleLabel} · Supabase`;
    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'psg-logout';
    logoutBtn.id = 'psg-logout-btn';
    logoutBtn.textContent = 'Cerrar sesión';
    bar.append(emailEl, roleEl, logoutBtn);
    bottom.appendChild(bar);

    bar.querySelector('#psg-logout-btn').addEventListener('click', async () => {
      try {
        ['cob_rep', 'cob_gest', 'cob_aj', 'cob_hist'].forEach((k) => {
          try { localStorage.removeItem(k); } catch (e) {}
        });
        await client.auth.signOut();
      } finally {
        window.location.reload();
      }
    });
  }

  async function resolveUserRole(client, user) {
    try {
      const { data, error } = await client
        .from(USERS_TABLE)
        .select('role')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!error && data && data.role) return data.role;
    } catch (e) {
      // Si la tabla aún no existe o no hay fila, se usa el rol por defecto
    }
    return 'editor';
  }

  function markDirty() {
    try {
      const n = Number(localStorage.getItem('pasega_dirty_count') || '0') + 1;
      localStorage.setItem('pasega_dirty_count', String(n));
      if (!localStorage.getItem('pasega_dirty_since')) {
        localStorage.setItem('pasega_dirty_since', new Date().toISOString());
      }
    } catch (e) {}
  }

  function markBackupDone(count, type) {
    try {
      localStorage.setItem(
        'pasega_last_backup',
        JSON.stringify({ at: new Date().toISOString(), count, type })
      );
      localStorage.removeItem('pasega_dirty_count');
      localStorage.removeItem('pasega_dirty_since');
    } catch (e) {}
  }

  function getBackupStatus() {
    let lastBackup = null;
    let dirtyCount = 0;
    let dirtySince = null;
    try {
      const raw = localStorage.getItem('pasega_last_backup');
      if (raw) lastBackup = JSON.parse(raw);
      dirtyCount = Number(localStorage.getItem('pasega_dirty_count') || '0') || 0;
      dirtySince = localStorage.getItem('pasega_dirty_since') || null;
    } catch (e) {}
    return { lastBackup, dirtyCount, dirtySince };
  }

  function sqlLit(str) {
    return "'" + String(str).replace(/\u0000/g, '').replace(/'/g, "''") + "'";
  }

  function triggerDownload(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 1000);
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
      `-- PASEGA · Respaldo completo de base de datos (${exportedAt})`,
      `-- Registros: ${rows.length}`,
      '-- Para cargar en pgAdmin 4: Query Tool -> abrir este archivo -> Execute (F5)',
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
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const jsonStr = JSON.stringify(r.data ?? {});
      const ts = r.updated_at ? sqlLit(r.updated_at) + '::timestamptz' : 'now()';
      lines.push(
        `INSERT INTO public.pasega_docs (collection, doc_id, data, updated_at) VALUES (${sqlLit(r.collection)}, ${sqlLit(r.doc_id)}, ${sqlLit(jsonStr)}::jsonb, ${ts}) ON CONFLICT (collection, doc_id) DO UPDATE SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at;`
      );
    }
    lines.push('', 'COMMIT;', '');
    return lines.join('\n');
  }

  let activeClient = null;
  let activeUser = null;
  let activeRole = 'viewer';

  async function fetchAllDocs(client) {
    const rows = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await client
        .from(TABLE)
        .select('collection, doc_id, data, updated_at')
        .order('collection', { ascending: true })
        .order('doc_id', { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw translateDbError(error);
      const batch = data || [];
      for (let i = 0; i < batch.length; i++) rows.push(batch[i]);
      if (batch.length < pageSize) break;
      from += pageSize;
    }
    return rows;
  }

  window.PASEGA_BACKUP = {
    getStatus: getBackupStatus,
    async exportAll() {
      if (!activeClient) throw new Error('Inicia sesión con Supabase para respaldar la base de datos.');
      const rows = await fetchAllDocs(activeClient);
      const collections = {};
      rows.forEach((r) => {
        collections[r.collection] = (collections[r.collection] || 0) + 1;
      });
      return {
        format: 'pasega-backup-v1',
        exportedAt: new Date().toISOString(),
        totalRows: rows.length,
        collections,
        rows
      };
    },
    async downloadSQL() {
      const dump = await this.exportAll();
      const sql = buildSqlDump(dump.rows, dump.exportedAt);
      const filename = `pasega-backup-${stampFile()}.sql`;
      triggerDownload(filename, sql, 'application/sql;charset=utf-8');
      markBackupDone(dump.totalRows, 'sql');
      return { filename, totalRows: dump.totalRows, collections: dump.collections };
    },
    async downloadJSON() {
      const dump = await this.exportAll();
      const filename = `pasega-backup-${stampFile()}.json`;
      triggerDownload(filename, JSON.stringify(dump, null, 2), 'application/json;charset=utf-8');
      markBackupDone(dump.totalRows, 'json');
      return { filename, totalRows: dump.totalRows, collections: dump.collections };
    },
    async restoreJSON(file, onProgress) {
      if (!activeClient) throw new Error('Inicia sesión con Supabase para restaurar.');
      if (activeRole !== 'owner' && activeRole !== 'editor') {
        throw new Error('Tu usuario es de solo lectura y no puede restaurar respaldos.');
      }
      const text = await file.text();
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch (e) {
        throw new Error('El archivo no es un JSON válido.');
      }
      const rows = Array.isArray(parsed && parsed.rows) ? parsed.rows : null;
      if (!rows || !rows.length) {
        throw new Error('El respaldo no contiene registros válidos (falta el arreglo "rows").');
      }
      const valid = rows
        .filter((r) => r && typeof r.collection === 'string' && typeof r.doc_id === 'string' && r.data !== undefined)
        .map((r) => ({
          collection: r.collection,
          doc_id: r.doc_id,
          data: r.data,
          updated_at: r.updated_at || new Date().toISOString(),
          updated_by: activeUser ? activeUser.id : null
        }));
      if (!valid.length) throw new Error('No se encontraron registros compatibles en el archivo.');

      const chunk = 100;
      for (let i = 0; i < valid.length; i += chunk) {
        const part = valid.slice(i, i + chunk);
        const { error } = await activeClient
          .from(TABLE)
          .upsert(part, { onConflict: 'collection,doc_id' });
        if (error) throw translateDbError(error);
        if (onProgress) onProgress(Math.min(i + part.length, valid.length), valid.length);
      }
      markBackupDone(valid.length, 'restore');
      return { restored: valid.length };
    }
  };

  function createSupabaseDbAdapter(client, user) {
    const store = Object.create(null); // store[collection][docId] = data
    const colListeners = Object.create(null); // colListeners[collection] = Set<fn>
    const docListeners = Object.create(null); // docListeners["col/id"] = Set<fn>
    const pendingTimers = Object.create(null);

    function ensureCol(col) {
      if (!store[col]) store[col] = Object.create(null);
      return store[col];
    }

    function splitPath(path) {
      const idx = path.indexOf('/');
      if (idx < 1 || idx === path.length - 1) {
        throw new Error('Ruta de documento inválida: ' + path);
      }
      return [path.slice(0, idx), path.slice(idx + 1)];
    }

    function emitDoc(col, id) {
      const key = col + '/' + id;
      const set = docListeners[key];
      if (!set || !set.size) return;
      const map = ensureCol(col);
      const exists = Object.prototype.hasOwnProperty.call(map, id);
      const val = exists ? map[id] : undefined;
      const snap = {
        exists,
        id,
        data: () => (exists ? clone(val) : undefined),
        metadata: { fromCache: false }
      };
      set.forEach((cb) => {
        try { cb(snap); } catch (e) { console.error(e); }
      });
    }

    function emitCol(col) {
      const set = colListeners[col];
      if (!set || !set.size) return;
      const map = ensureCol(col);
      const docs = Object.keys(map).map((docId) => ({
        id: docId,
        data: () => clone(map[docId])
      }));
      const snap = {
        docs,
        metadata: { fromCache: false }
      };
      set.forEach((cb) => {
        try { cb(snap); } catch (e) { console.error(e); }
      });
    }

    function scheduleEmit(col, id) {
      if (id) emitDoc(col, id);
      if (pendingTimers[col]) return;
      pendingTimers[col] = setTimeout(() => {
        delete pendingTimers[col];
        emitCol(col);
      }, 100);
    }

    async function fetchSingle(col, id) {
      const { data, error } = await client
        .from(TABLE)
        .select('doc_id, data')
        .eq('collection', col)
        .eq('doc_id', id)
        .maybeSingle();
      if (error) throw translateDbError(error);
      const map = ensureCol(col);
      if (data) map[id] = data.data;
      else delete map[id];
      return data;
    }

    async function fetchCollection(col) {
      const map = Object.create(null);
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data, error } = await client
          .from(TABLE)
          .select('doc_id, data')
          .eq('collection', col)
          .order('doc_id', { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw translateDbError(error);
        const rows = data || [];
        for (let i = 0; i < rows.length; i++) {
          map[rows[i].doc_id] = rows[i].data;
        }
        if (rows.length < pageSize) break;
        from += pageSize;
      }
      store[col] = map;
      return map;
    }

    // Suscripción en tiempo real a todos los cambios de pasega_docs
    client
      .channel('pasega-docs-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: TABLE },
        async (payload) => {
          try {
            if (payload.eventType === 'DELETE') {
              const oldRow = payload.old || {};
              if (oldRow.collection && oldRow.doc_id) {
                const map = ensureCol(oldRow.collection);
                delete map[oldRow.doc_id];
                scheduleEmit(oldRow.collection, oldRow.doc_id);
              }
              return;
            }
            const row = payload.new || {};
            if (!row.collection || !row.doc_id) return;
            if (row.data === undefined) {
              await fetchSingle(row.collection, row.doc_id);
            } else {
              const map = ensureCol(row.collection);
              map[row.doc_id] = row.data;
            }
            scheduleEmit(row.collection, row.doc_id);
          } catch (e) {
            console.warn('Error al sincronizar evento Realtime:', e);
          }
        }
      )
      .subscribe();

    function docHandle(col, id) {
      const key = col + '/' + id;
      return {
        async set(data) {
          const payload = clone(data);
          const { error } = await client.from(TABLE).upsert(
            {
              collection: col,
              doc_id: id,
              data: payload,
              updated_at: new Date().toISOString(),
              updated_by: user ? user.id : null
            },
            { onConflict: 'collection,doc_id' }
          );
          if (error) throw translateDbError(error);
          markDirty();
          const map = ensureCol(col);
          map[id] = payload;
          scheduleEmit(col, id);
        },
        async delete() {
          const { error } = await client
            .from(TABLE)
            .delete()
            .eq('collection', col)
            .eq('doc_id', id);
          if (error) throw translateDbError(error);
          markDirty();
          const map = ensureCol(col);
          delete map[id];
          scheduleEmit(col, id);
        },
        onSnapshot(cb, errCb) {
          if (!docListeners[key]) docListeners[key] = new Set();
          docListeners[key].add(cb);
          fetchSingle(col, id)
            .then((row) => {
              if (!docListeners[key] || !docListeners[key].has(cb)) return;
              cb({
                exists: Boolean(row),
                id,
                data: () => (row ? clone(row.data) : undefined),
                metadata: { fromCache: false }
              });
            })
            .catch((err) => {
              if (errCb) errCb(err);
              else console.error(err);
            });
          return () => {
            if (docListeners[key]) docListeners[key].delete(cb);
          };
        }
      };
    }

    return {
      doc(path) {
        const [col, id] = splitPath(path);
        return docHandle(col, id);
      },
      collection(col) {
        return {
          doc(id) {
            return docHandle(col, id);
          },
          onSnapshot(cb, errCb) {
            if (!colListeners[col]) colListeners[col] = new Set();
            colListeners[col].add(cb);
            fetchCollection(col)
              .then((map) => {
                if (!colListeners[col] || !colListeners[col].has(cb)) return;
                cb({
                  docs: Object.keys(map).map((docId) => ({
                    id: docId,
                    data: () => clone(map[docId])
                  })),
                  metadata: { fromCache: false }
                });
              })
              .catch((err) => {
                if (errCb) errCb(err);
                else console.error(err);
              });
            return () => {
              if (colListeners[col]) colListeners[col].delete(cb);
            };
          }
        };
      }
    };
  }

  let readyPromise = null;

  function boot() {
    if (readyPromise) return readyPromise;
    readyPromise = (async () => {
      await domReady();

      if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        return showSetupModal('No se pudo cargar la librería de Supabase (@supabase/supabase-js). Verifica tu conexión a internet.');
      }

      const cfg = await loadConfig();
      if (!cfg.configured) {
        return showSetupModal();
      }

      const client = window.supabase.createClient(cfg.url, cfg.anonKey, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        }
      });

      const { data: sessionData } = await client.auth.getSession();
      let session = sessionData && sessionData.session;
      if (!session) {
        session = await showLoginModal(client);
      }

      const user = session.user;
      const role = await resolveUserRole(client, user);
      activeClient = client;
      activeUser = user;
      activeRole = role;
      mountUserBar(client, user.email || 'Usuario', role);

      const db = role === 'blocked' ? null : createSupabaseDbAdapter(client, user);
      const userAdapter = {
        id: user.id,
        email: user.email,
        role,
        async can(permission) {
          if (permission === 'data.write') return role === 'owner' || role === 'editor';
          return role !== 'blocked';
        },
        async canEdit() {
          return role !== 'blocked';
        }
      };

      return { db, user: userAdapter };
    })();
    return readyPromise;
  }

  // Expone la interfaz compatible esperada por Finanzas y Cobranzas
  window.claude = {
    async use(capability) {
      if (capability === 'downloads') return null; // Usa descargas nativas del navegador
      const ctx = await boot();
      if (capability === 'db') return ctx.db;
      if (capability === 'user') return ctx.user;
      return null;
    }
  };
})();
