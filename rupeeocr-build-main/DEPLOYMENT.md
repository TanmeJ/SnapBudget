# Deployment

## Frontend: Vercel

Deploy the repository root as a Next.js app.

Set this environment variable in Vercel:

```env
BACKEND_URL=https://your-railway-backend-domain
```

The frontend uses `/api/*` rewrites in [next.config.js](./next.config.js), so the browser still talks to the frontend domain while Next proxies requests to Railway.

## Backend: Railway

Deploy the `backend/` directory as a Railway service.

Use the `backend/Dockerfile` already in the repo.

Set these Railway variables:

```env
DATABASE_URL=your_railway_postgres_url
SECRET_KEY=your_long_random_secret
ALGORITHM=HS256
FRONTEND_URL=https://your-vercel-frontend-domain
UPLOAD_DIR=/app/uploads
```

## Files and storage

The backend saves uploaded receipts to `UPLOAD_DIR`.

For production, mount a Railway volume at that path so uploaded receipts survive redeploys.

## Notes

If you want the receipt files to persist across deployments, the Railway volume is required. Without it, the database records will stay, but file uploads can disappear when the service is redeployed.
