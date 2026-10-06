# Equipment Maintenance Triage Assistant

A technician reports an equipment problem. The app runs deterministic threshold checks, retrieves manual sections, asks an AI for **possible** causes, follow-up questions, inspection steps, a priority and a draft work order, with a citation behind every suggestion. A human edits, approves or rejects the work order. The AI never controls equipment and never approves work.

## Run
```bash
cd backend && cp .env.example .env   # add ANTHROPIC_API_KEY
npm install && export $(cat .env | xargs) && npm start   # http://localhost:4000
cd frontend && npm install && npm run dev                # http://localhost:5173
cd backend && npm test
```

## Design
- `rules.js`: threshold checks in plain code. Handles missing, non-numeric and conflicting sensors (worst value used, conflict flagged). Rules set a priority floor the AI cannot lower.
- `retrieval.js`: keyword (TF-IDF style) search over `kb.json` manual sections.
- `ai.js`: model call, Zod schema validation, and rejection of any citation that is not a real source id (manual section, `event:N`, `rule:key`, `issue`).
- `server.js`: REST API, JSON file storage, audit log. Approve, reject, edit and confirm-finding all require a technician name; approval is never automatic.
- Observations, possible causes and confirmed findings are stored and shown separately.
- Failures (no API key, unreachable AI, bad output, bad citations, retrieval error, no manual hits) show a visible banner. Rules and retrieval results still display; the user can retry.

## Limits
JSON file storage (swap for SQLite/Postgres for production), no auth, small sample knowledge base, no live IoT.

## AI tool usage
Add a short note here on which AI tools you used and what you reviewed yourself.
