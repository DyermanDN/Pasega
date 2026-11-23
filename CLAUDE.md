# Instrucciones obligatorias para Claude / Asistentes de IA en PASEGA

Este repositorio contiene el panel en producción de **PASEGA · Finanzas y Cobranzas** (`https://pasega.vercel.app`), conectado a **Supabase**.
La persona que trabaja en local puede estar aprendiendo Git, por lo que **tú (el asistente) debes encargarte de seguir este flujo seguro automáticamente en cada sesión**.

## 1. Reglas obligatorias de Git (siempre sobre la rama fija `desarrollo`)
1. **NUNCA hagas commits ni `git push` directo a la rama `main`.**
2. Trabaja **siempre en la rama fija `desarrollo`** (el usuario no necesita crear ramas nuevas):
   - Si estás en `main`, cambia a `desarrollo` antes de editar (`git checkout desarrollo` o `git checkout -b desarrollo`).
3. **NUNCA hagas `merge` a `main`, `push --force`, ni despliegues a producción por tu cuenta.** Todo cambio pasa por el Pull Request automático `desarrollo → main` aprobado por `@DyermanDN`.

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
   - Asegúrate de estar en la rama `desarrollo`.
   - Haz `git add` solo de los archivos modificados, `git commit -m "..."` en español, y `git push -u origin desarrollo` (o indícale hacer doble clic en `ENVIAR_CAMBIOS.bat`).
   - GitHub creará o actualizará el **Pull Request** `desarrollo → main` automáticamente; solo recuérdale avisar a `@DyermanDN` para revisarlo y aprobarlo.
   - **Solo después de que `@DyermanDN` apruebe y haga Merge**, puede entrar a **GitHub → Actions → Deploy Producción (Pasega) → Run workflow** para publicar en producción.
