const { execSync, spawnSync } = require('child_process');
const readline = require('readline');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const REPO_URL = 'https://github.com/DyermanDN/Pasega';
const DEV_BRANCH = 'desarrollo';

function git(args, opts = {}) {
  const res = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: opts.inherit ? 'inherit' : 'pipe'
  });
  if (res.status !== 0 && !opts.allowFail) {
    const err = (res.stderr || res.stdout || '').trim();
    throw new Error(`git ${args.join(' ')} falló: ${err}`);
  }
  return { status: res.status, out: (res.stdout || '').trim(), err: (res.stderr || '').trim() };
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

async function main() {
  console.log('=======================================================');
  console.log('   PASEGA · Enviar cambios para revisión (Pull Request)');
  console.log('=======================================================\n');

  // 1. Verificar si hay cambios pendientes
  const status = git(['status', '--porcelain']).out;
  if (!status) {
    console.log('No hay cambios nuevos para enviar.');
    return;
  }

  console.log('Archivos modificados:');
  console.log(status);
  console.log('');

  // 2. Ejecutar validaciones automáticas antes de subir nada
  console.log('Revisando que todo funcione bien (npm test)...');
  const testRes = spawnSync(process.execPath, [path.join(ROOT, 'scripts/validate.js')], {
    cwd: ROOT,
    stdio: 'inherit'
  });
  if (testRes.status !== 0) {
    console.error('\nSe encontraron errores. Pídele a Claude que los corrija y vuelve a ejecutar este botón.');
    process.exit(1);
  }

  // 3. Pedir descripción corta en español
  const desc = await ask('\n¿Qué cambiaste? (escribe una frase corta): ');
  if (!desc) {
    console.error('Debes escribir una descripción breve para continuar.');
    process.exit(1);
  }

  // 4. Asegurar que SIEMPRE trabaje en la rama fija "desarrollo" (nunca en main)
  const current = git(['branch', '--show-current']).out;
  if (current !== DEV_BRANCH) {
    const exists = git(['show-ref', '--verify', '--quiet', `refs/heads/${DEV_BRANCH}`], { allowFail: true }).status === 0;
    if (exists) {
      git(['checkout', DEV_BRANCH], { inherit: true });
    } else {
      git(['checkout', '-b', DEV_BRANCH], { inherit: true });
    }
  }

  // 5. Guardar cambios (commit)
  git(['add', '.'], { inherit: true });
  git(['commit', '-m', desc], { inherit: true });

  // 6. Traer últimos cambios de producción (main) para evitar conflictos
  git(['fetch', 'origin', 'main'], { allowFail: true });
  const mergeRes = git(['merge', '--no-edit', 'origin/main'], { allowFail: true });
  if (mergeRes.status !== 0) {
    git(['merge', '--abort'], { allowFail: true });
    console.log('\nAviso: hubo un cruce con main, se enviará el PR igual para que el dueño lo revise.');
  }

  // 7. Subir a la rama fija "desarrollo" (NUNCA a main)
  console.log('\nSubiendo cambios a GitHub (rama desarrollo)...');
  git(['push', '-u', 'origin', DEV_BRANCH], { inherit: true });

  const prUrl = `${REPO_URL}/compare/main...${DEV_BRANCH}?expand=1`;
  const pullsUrl = `${REPO_URL}/pulls`;
  console.log('\n=======================================================');
  console.log('¡LISTO! Tus cambios se enviaron para revisión.');
  console.log('El Pull Request se crea automáticamente en GitHub.');
  console.log('Solo avísale al dueño para que revise y apruebe aquí:');
  console.log(`  ${pullsUrl}`);
  console.log(`(Si no aparece en 15 segundos, créalo con 1 clic en: ${prUrl})`);
  console.log('=======================================================\n');

  if (process.platform === 'win32') {
    try {
      execSync(`start "" "${pullsUrl}"`, { stdio: 'ignore' });
    } catch {}
  }
}

main().catch((err) => {
  console.error('\nERROR:', err.message);
  process.exit(1);
});
