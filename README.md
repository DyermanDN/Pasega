# PASEGA · Finanzas y Cobranzas

Panel web de **Finanzas (ventas, rentabilidad, compras, catálogo, stock y comisiones)** y **Cobranzas** para PASEGA Importaciones, listo para desplegar en **Vercel** con base de datos, tiempo real y autenticación en **Supabase**.

## Estructura del proyecto

- `public/index.html` — Aplicación principal de Finanzas y Cobranzas.
- `public/supabase-bridge.js` — Capa de autenticación (Supabase Auth) y sincronización en tiempo real con Postgres/Supabase.
- `api/config.js` — Función Serverless de Vercel que entrega `SUPABASE_URL` y `SUPABASE_ANON_KEY` desde variables de entorno.
- `supabase/schema.sql` — Script SQL para crear tablas, políticas RLS y Realtime en Supabase.
- `vercel.json` — Configuración de despliegue en Vercel.

## Despliegue paso a paso

### 1. Configurar Supabase
1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Ve a **SQL Editor → New query**, pega el contenido de [`supabase/schema.sql`](./supabase/schema.sql) y pulsa **Run**.
3. Ve a **Authentication → Users → Add user → Create new user** y crea el correo y contraseña con los que ingresarás al panel.
   - *(Recomendado)* En **Authentication → Providers → Email**, desactiva **Allow new users to sign up** si no deseas registros públicos.
4. Ve a **Project Settings → API** y copia:
   - **Project URL** (`SUPABASE_URL`)
   - **anon public key** (`SUPABASE_ANON_KEY`)

### 2. Desplegar en Vercel
1. Entra a [vercel.com](https://vercel.com) → **Add New… → Project** e importa este repositorio (`DyermanDN/Pasega`).
2. En **Framework Preset**, deja **Other**.
3. En **Environment Variables**, agrega:
   - `SUPABASE_URL` = tu Project URL de Supabase
   - `SUPABASE_ANON_KEY` = tu clave pública `anon` de Supabase
   *(También es compatible automáticamente si vinculas la integración oficial de Supabase desde Vercel).*
4. Haz clic en **Deploy**.

### 3. Permisos de equipo (opcional)
Por defecto, cualquier usuario creado en **Supabase → Authentication → Users** tiene permiso de edición (`editor`). Si deseas dar **solo lectura** a un vendedor o restringir acceso, inserta una fila en `public.pasega_users`:

```sql
insert into public.pasega_users (user_id, email, role)
values ('UUID-DEL-USUARIO', 'vendedor@pasega.com', 'viewer');
-- Roles disponibles: 'owner', 'editor', 'viewer', 'blocked'
```
