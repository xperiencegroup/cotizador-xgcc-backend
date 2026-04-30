# Xperience Cotizador — API

Backend Express + Prisma + PostgreSQL para el Cotizador Xperience.

## Stack

- **Runtime**: Node.js 18+
- **Framework**: Express
- **ORM**: Prisma
- **BD**: PostgreSQL 14+
- **Auth**: Google OAuth 2.0 + JWT propio
- **Deploy**: Vercel (serverless)

## Setup local

### 1. Instalar dependencias

```bash
npm install
```

### 2. Variables de entorno

```bash
cp .env.example .env
# Edita .env con tus valores reales
```

Variables requeridas:

| Variable | Descripción |
|---|---|
| `DATABASE_URL` | Connection string de PostgreSQL |
| `GOOGLE_CLIENT_ID` | Client ID de Google Cloud Console |
| `JWT_SECRET` | Secret para firmar JWT (mínimo 32 chars) |
| `ALLOWED_ORIGINS` | Orígenes CORS permitidos (separados por coma) |

Generar JWT_SECRET seguro:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### 3. Base de datos

Tienes dos opciones:

**Opción A — BD ya creada con schema.sql (recomendado)**
```bash
# Asegúrate de que el schema.sql ya fue ejecutado en PostgreSQL
npm run db:generate   # genera el cliente Prisma
```

**Opción B — Prisma crea la BD desde cero**
```bash
npm run db:push       # aplica el schema de Prisma a la BD
```

### 4. Correr en desarrollo

```bash
npm run dev
```

La API corre en `http://localhost:3000`.

Verificar: `curl http://localhost:3000/health`

---

## Deploy en Vercel

### 1. Instalar Vercel CLI

```bash
npm i -g vercel
```

### 2. Vincular proyecto

```bash
vercel link
```

### 3. Agregar variables de entorno en Vercel

En el dashboard de Vercel → tu proyecto → Settings → Environment Variables:

- `DATABASE_URL` — usar Neon, Supabase o Railway para PostgreSQL en la nube
- `GOOGLE_CLIENT_ID`
- `JWT_SECRET`
- `ALLOWED_ORIGINS` → `https://cotizador.xperience.group`
- `NODE_ENV` → `production`

### 4. Deploy

```bash
vercel --prod
```

---

## Endpoints

### Auth
| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/auth/google` | Login con Google idToken |
| GET | `/api/auth/me` | Usuario actual (requiere JWT) |

### Cotizaciones (requieren JWT)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/quotes` | Listar todas |
| POST | `/api/quotes` | Crear |
| GET | `/api/quotes/:id` | Detalle |
| PUT | `/api/quotes/:id` | Actualizar |
| DELETE | `/api/quotes/:id` | Soft delete |
| POST | `/api/quotes/next-folio` | Generar folio XP-XXXX |
| POST | `/api/quotes/:id/send` | Marcar como enviada + generar public_token |

### Códigos de descuento (requieren JWT)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/discount-codes` | Listar activos |
| PUT | `/api/discount-codes` | Reemplazar lista completa |

### Público (sin JWT)
| Método | Ruta | Descripción |
|---|---|---|
| GET | `/api/public/quotes/:token` | Vista pública de propuesta para cliente |

---

## Conectar el frontend

En `AuthContext.jsx` del frontend, descomentar el bloque **Opción B**:

```js
// Reemplazar el bloque A completo por:
const response = await http.post('/auth/google', { idToken });
const { token, user: safeUser } = response;
localStorage.setItem(STORAGE_KEY_TOKEN, token); // ahora es JWT propio, no el de Google
```

Cambiar `VITE_STORAGE_MODE=api` en el `.env` del frontend.

Cambiar `VITE_API_BASE_URL=https://tu-api.vercel.app/api` en el `.env` del frontend.

---

## Base de datos en la nube (recomendado: Neon)

1. Crear cuenta en [neon.tech](https://neon.tech) (free tier suficiente para empezar)
2. Crear proyecto → copiar la connection string
3. Ejecutar el `schema.sql` en Neon (via SQL Editor en el dashboard)
4. Pegar la connection string en `DATABASE_URL`

Alternativas: Supabase, Railway, o cualquier PostgreSQL 14+.
