const { execSync, spawnSync } = require('child_process');
const readline = require('readline');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPO_URL = 'https://github.com/DyermanDN/Pasega';

function git(args, opts = {}) {
  const res = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: opts.inherit ? 'inherit' : 'pipe'
  });
  if (res.status !== 0) {
    const err = (res.stderr || res.stdout || '').trim();
    throw new Error(`git ${args.join(' ')} falló: ${err}`);
  }
  return (res.stdout || '').trim();
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 35) || 'mejora';
}

async function main() {
  console.log('=== Enviar cambios para revisión (Pull Request) · PASEGA ===\n');

  // 1. Verificar si hay cambios pendientes
  const status = git(['status', '--porcelain']);
  if (!status) {
    console.log('No hay cambios pendientes para enviar.');
    return;
  }

  console.log('Archivos modificados:');
  console.log(status);
  console.log('');

  // 2. Ejecutar validaciones antes de subir nada
  console.log('Ejecutando validaciones (npm test)...');
  const testRes = spawnSync(process.execPath, [path.join(ROOT, 'scripts/validate.js')], {
    cwd: ROOT,
    stdio: 'inherit'
  });
  if (testRes.status !== 0) {
    console.error('\nSe encontraron errores. Corrige los problemas antes de enviar el cambio.');
    process.exit(1);
  }

  // 3. Pedir descripción corta en español
  const desc = await ask('\nDescribe brevemente qué cambiaste (ej. "Ajuste color tabla ventas"): ');
  if (!desc) {
    console.error('Debes escribir una descripción breve para continuar.');
    process.exit(1);
  }

  // 4. Si está en main, crear automáticamente una rama segura sin perder cambios
  let branch = git(['branch', '--show-current']);
  if (!branch || branch === 'main') {
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    branch = `cambio/${stamp}-${slugify(desc)}-${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`;
    console.log(`\nCreando rama segura: ${branch}`);
    git(['checkout', '-b', branch], { inherit: true });
  } else {
    console.log(`\nUsando rama actual: ${branch}`);
  }

  // 5. Commit y push de la rama (NUNCA a main)
  if (branch === 'main') {
    throw new Error('Bloqueado: no se permite subir directamente a main.');
  }
  git(['add', '.'], { inherit: true });
  git(['commit', '-m', desc], { inherit: true });
  console.log('\nSubiendo rama a GitHub...');
  git(['push', '-u', 'origin', branch], { inherit: true });

  const prUrl = `${REPO_URL}/compare/main...${encodeURIComponent(branch)}?expand=1`;
  console.log('\n¡Listo! Tus cambios se subieron a una rama segura (sin tocar producción).');
  console.log('Abre este enlace y haz clic en "Create pull request" para que el dueño lo revise:');
  console.log(`\n  ${prUrl}\n`);

  // Abrir en el navegador en Windows
  if (process.platform === 'win32') {
    try {
      execSync(`start "" "${prUrl}"`, { stdio: 'ignore' });
    } catch {}
  }
}

main().catch((err) => {
  console.error('\nERROR:', err.message);
  process.exit(1);
});
