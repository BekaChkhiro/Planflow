# Database Setup (Neon PostgreSQL)

This guide walks you through setting up the PostgreSQL database using Neon.

## Prerequisites

- A Neon account (free tier available at [neon.tech](https://neon.tech))

## Setup Steps

### 1. Create Neon Account & Project

1. Go to [console.neon.tech](https://console.neon.tech)
2. Sign up or log in
3. Create a new project:
   - **Project name**: `planflow` (or your preferred name)
   - **Region**: Choose the closest to your users (e.g., `us-east-2`)
   - **Postgres version**: Latest (16+)

### 2. Get Connection Strings

After creating the project, Neon will show you the connection details.

You'll need two connection strings:

1. **Direct connection** (`DATABASE_URL`):

   ```
   postgresql://[user]:[password]@[endpoint].neon.tech/[database]?sslmode=require
   ```

2. **Pooled connection** (`DATABASE_URL_POOLED`):

   ```
   postgresql://[user]:[password]@[endpoint]-pooler.neon.tech/[database]?sslmode=require
   ```

   > The pooled connection uses connection pooling, which is recommended for serverless environments.

### 3. Configure Environment Variables

1. Copy the example environment file:

   ```bash
   cp apps/api/.env.example apps/api/.env
   ```

2. Edit `apps/api/.env` and replace the placeholder values:
   ```env
   DATABASE_URL=postgresql://[your-user]:[your-password]@[your-endpoint].neon.tech/planflow?sslmode=require
   DATABASE_URL_POOLED=postgresql://[your-user]:[your-password]@[your-endpoint]-pooler.neon.tech/planflow?sslmode=require
   ```

### 4. Verify Connection

Start the API server:

```bash
pnpm dev --filter @planflow/api
```

Then check the database health endpoint:

```bash
curl http://localhost:3001/health/db
```

You should see a response like:

```json
{
  "status": "healthy",
  "database": {
    "connected": true,
    "latency": 45,
    "version": "PostgreSQL 16.x ...",
    "currentDatabase": "planflow",
    "serverTime": "2026-01-28 12:00:00"
  },
  "timestamp": "2026-01-28T12:00:00.000Z"
}
```

## Environment Variables Reference

| Variable              | Description                                 | Required |
| --------------------- | ------------------------------------------- | -------- |
| `DATABASE_URL`        | Direct Neon connection string               | Yes\*    |
| `DATABASE_URL_POOLED` | Pooled Neon connection string (recommended) | Yes\*    |

\*At least one is required. `DATABASE_URL_POOLED` takes precedence if both are set.

## Troubleshooting

### Connection refused

- Verify your connection string is correct
- Check that your IP is not blocked (Neon allows all IPs by default)
- Ensure `sslmode=require` is in the connection string

### Authentication failed

- Double-check your password (no special characters issues)
- Verify the database name exists
- Check the username is correct

### Timeout errors

- Try the pooled connection string instead
- Check your network connectivity
- Verify Neon service status at [neonstatus.com](https://neonstatus.com)
