# Setup Guide

## Prerequisites

- Node.js 16+ and npm
- curl (usually pre-installed)

Check versions:
```bash
node --version
npm --version
```

## Install Dependencies

**Backend:**
```bash
cd backend
npm install
```

**Frontend:**
```bash
cd frontend
npm install
```

## Configuration

Defaults work for local development. To change:

**Backend:** Set environment variables or edit `backend/server.js`
- `PORT` (default: 5001)
- `LLAMA_SERVER_URL` (default: http://localhost:8080)

**Frontend:** Edit `frontend/src/config.js` if needed
- Defaults to `http://localhost:5001` for local

## Start Backend

```bash
cd backend
node server.js
```

You should see:
```
Backend running → http://0.0.0.0:5001
```

Keep this terminal open. Test with:
```bash
curl http://localhost:5001/api/health
```

## Start Frontend

Open a new terminal:
```bash
cd frontend
npm start
```

Browser should open to `http://localhost:3000`. Keep this terminal open.

## Quick Start

**Terminal 1:**
```bash
cd backend && node server.js
```

**Terminal 2:**
```bash
cd frontend && npm start
```

Access: http://localhost:3000

## Stop Servers

Press `Ctrl+C` in each terminal, or:
```bash
./stop_servers.sh
```

## Troubleshooting

**Port in use:**
```bash
lsof -i :5001  # backend
lsof -i :3000  # frontend
kill -9 <PID>
```

**Dependencies:**
```bash
cd backend && rm -rf node_modules && npm install
cd frontend && rm -rf node_modules && npm install
```

**Backend not responding:**
- Check backend terminal for errors
- Verify: `curl http://localhost:5001/api/health`

**Frontend can't connect:**
- Make sure backend is running first
- Check `frontend/src/config.js` has correct URL

**PDF upload fails:**
- Max 10 pages, 50MB
- Check backend terminal for errors

**AI not working:**
- Test llama server: `curl http://localhost:8080/health`
- Check `LLAMA_SERVER_URL` in backend

## Environment Variables

**Backend:**
- `PORT` - Server port (default: 5001)
- `LLAMA_SERVER_URL` - Llama server (default: http://localhost:8080)
- `EMBEDDING_SERVER_URL` - Embedding server (default: http://localhost:8081)

**Frontend:**
- `REACT_APP_DEPLOYMENT` - 'local' or 'vm'
- `REACT_APP_API_URL` - Backend URL (auto-set)
