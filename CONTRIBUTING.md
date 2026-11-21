# Guía de trabajo y despliegue (CI/CD) · PASEGA

Esta guía explica el flujo obligatorio para hacer cambios sin afectar producción.

## Flujo de trabajo

```text
Tu rama local (feature/...) ──▶ Pull Request ──▶ CI automático (verde) ──▶ Aprobación del dueño + Merge a main ──▶ Job manual de Deploy
```

### 1. Clonar y preparar tu rama (nunca trabajes directo en `main`)
```bash
git clone https://github.com/DyermanDN/Pasega.git
cd Pasega
git checkout main
git pull origin main
git checkout -b feature/nombre-del-cambio
```

### 2. Hacer cambios y probar localmente
Antes de subir cualquier cambio, ejecuta siempre la validación automática:
```bash
npm test
```
Si todo sale en `[OK]`, sube tu rama:
```bash
git add .
git commit -m "Descripción clara del cambio"
git push -u origin feature/nombre-del-cambio
```

### 3. Abrir un Pull Request (PR) en GitHub
1. Entra al repositorio en GitHub y haz clic en **Compare & pull request** hacia `main`.
2. Completa la plantilla del PR.
3. Espera a que el check automático **CI · Validar Pasega** salga en verde ✅ (y opcionalmente revisa la **Preview URL** que genera Vercel).
4. Espera a que el administrador revise, **apruebe (Approve)** y haga **Merge** a `main`.

> **Importante:** Al hacer Merge a `main`, **producción todavía NO cambia** hasta ejecutar el Job de despliegue.

### 4. Lanzar el Job de despliegue a producción

#### Opción A · Desde GitHub Actions (recomendado, sin servidor)
1. En GitHub, ve a la pestaña **Actions**.
2. Selecciona **Deploy Producción (Pasega)** en el menú izquierdo.
3. Pulsa **Run workflow**, deja la rama en `main`, escribe el motivo (ej. `PR #4 - ajuste en cobranzas`) y pulsa **Run workflow**.
4. El Job validará el código, desplegará a https://pasega.vercel.app y verificará que la web responda `200 OK`.

#### Opción B · Desde Jenkins (si usan un servidor Jenkins)
1. En Jenkins, crea un Job tipo **Pipeline** conectado a `https://github.com/DyermanDN/Pasega.git` (rama `*/main`, Script Path: `Jenkinsfile`).
2. Agrega en **Manage Jenkins → Credentials** tres *Secret text*:
   - `vercel-token`
   - `vercel-org-id`
   - `vercel-project-id`
3. Después de que el PR sea aprobado y mergeado a `main`, pulsa **Build Now** en el Job de Jenkins.
