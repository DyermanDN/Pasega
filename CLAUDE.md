# Instrucciones obligatorias para Claude / Asistentes de IA en PASEGA

Este repositorio contiene el panel en producción de **PASEGA · Finanzas y Cobranzas** (`https://pasega.vercel.app`), conectado a **Supabase**.
La persona que trabaja en local puede estar aprendiendo Git, por lo que **tú (el asistente) debes encargarte de seguir este flujo seguro automáticamente en cada sesión**.

## 1. Reglas obligatorias de Git (NUNCA trabajar en `main`)
1. **NUNCA hagas commits ni `git push` directo a la rama `main`.**
2. Antes de editar cualquier archivo, revisa en qué rama estás (`git branch --show-current`).
   - Si estás en `main`, crea inmediatamente una rama nueva desde `origin/main`:
     ```bash
     git fetch origin main
     git checkout -b cambio/<descripcion-corta-sin-espacios> origin/main
     ```
3. **NUNCA hagas `merge` a `main`, `push --force`, ni despliegues a producción por tu cuenta.** Todo cambio debe pasar por un **Pull Request** aprobado por `@DyermanDN`.

## 2. Protección de la base de datos y archivos críticos
1. **NO modifiques** estos archivos salvo que `@DyermanDN` lo pida explícitamente:
   - `supabase/schema.sql`
   - `public/supabase-bridge.js`
   - `api/config.js`
   - `vercel.json`
   - `.github/workflows/*`
   - `scripts/validate.js`
   - `scripts/backup-local.js`
2. La gran mayoría de cambios visuales, filtros, cálculos o reportes viven en `public/index.html`.
3. **NUNCA renombres ni elimines las colecciones/documentos de Supabase** usados por el panel:
   - Finanzas: `ventas`, `compras`, `sistema/reporte`, `config/ajustes`, `config/confirmados`, `catalogo`, `inventario/stock`
   - Cobranzas: `cobranza/reporte`, `cobranza/ajustes`, `cobGestiones`, `cobHistorial`
4. **NUNCA guardes contraseñas, tokens ni claves reales** en ningún archivo del repositorio.

## 3. Validación y envío de cambios (Pull Request)
1. Después de hacer cualquier cambio, ejecuta siempre:
   ```bash
   npm test
   ```
   No subas nada si `npm test` falla.
2. Cuando el usuario pida subir o enviar sus cambios para revisión:
   - Haz `git add` solo de los archivos modificados (verifica `git status`).
   - Haz `git commit -m "..."` con un mensaje claro en español.
   - Haz `git push -u origin <nombre-de-la-rama>`.
   - Entrega al usuario el enlace directo para abrir el Pull Request en GitHub:
     `https://github.com/DyermanDN/Pasega/compare/main...<nombre-de-la-rama>?expand=1`
   - Indícale en lenguaje sencillo que haga clic en **Create pull request** y avise a `@DyermanDN` para revisarlo y aprobarlo.
   - Recuérdale que **solo después de que `@DyermanDN` apruebe y haga Merge**, puede entrar a **GitHub → Actions → Deploy Producción (Pasega) → Run workflow** para publicar en producción.
