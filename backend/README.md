
# Start the API server locally

Install dependencies from the repository root with:

```bash
make setup
```

From this directory, run either:

```bash
uv run fastapi dev src/app/main.py
```

or:

```bash
uv run fastapi run src/app/main.py
```

The API listens on `http://127.0.0.1:8000`.
