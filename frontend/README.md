# DomainAtlas frontend

React Router frontend for the local DomainAtlas field-learning assistant.

## Installation

Install dependencies from the repository root:

```bash
make setup
```

## Development

Start the frontend:

```bash
pnpm --dir frontend dev
```

The application is available at `http://localhost:5173` and sends requests to
the backend URL configured by `VITE_API_URL`. See `.env.example` for the local
default.

## Verification

```bash
pnpm --dir frontend typecheck
pnpm --dir frontend build
```

Production deployment is not part of the current project scope. The existing
Dockerfile is retained for future work but is not part of the local development
workflow.
