# Setup Guide

## Prerequisites

- Node.js 16+ and npm
- Access to an external llama-server (configured via environment variable)

## Installation Steps

### 1. Install Backend Dependencies

```bash
cd backend
npm install
```

### 2. Install Frontend Dependencies

```bash
cd frontend
npm install
```

## Configuration

### Backend Configuration

Edit `backend/server.js` or set environment variables:

```bash
export PORT=5001
export LLAMA_SERVER_URL=https://your-llama-server-url.com
```

### Frontend Configuration

Edit `frontend/src/config.js` or set environment variables:

```bash
export REACT_APP_DEPLOYMENT=local  # or 'vm' for VM deployment
export REACT_APP_API_URL=http://localhost:5001  # Backend URL
```

## Running the Application

### Development Mode

**Terminal 1 - Start Backend:**
```bash
cd backend
node server.js
```

**Terminal 2 - Start Frontend:**
```bash
cd frontend
npm start
```

The frontend will automatically open at `http://localhost:3000`

### Production Mode

**Backend:**
```bash
cd backend
NODE_ENV=production node server.js
```

**Frontend:**
```bash
cd frontend
npm run build
# Serve the build folder with a static server
```

## Troubleshooting

### Backend won't start

- Check if port 5001 is available: `lsof -i :5001`
- Verify Node.js version: `node --version` (needs 16+)
- Check environment variables are set correctly

### Frontend can't connect to backend

- Verify backend is running: `curl http://localhost:5001/api/health`
- Check `config.js` has the correct API URL
- Check browser console for CORS errors

### PDF upload fails

- Check file size limits (default: 50MB)
- Verify `backend/uploads/` directory exists and is writable
- Check backend logs for errors

### AI responses not working

- Verify `LLAMA_SERVER_URL` is correct and accessible
- Test llama-server directly: `curl $LLAMA_SERVER_URL/health`
- Check backend logs for curl command errors

## File Structure

```
GENTEX-DEMO/
├── backend/
│   ├── server.js          # Main backend server
│   ├── package.json       # Backend dependencies
│   ├── uploads/           # PDF upload directory
│   └── server.log         # Server logs (if logging to file)
├── frontend/
│   ├── src/
│   │   ├── App.js         # Main React component
│   │   ├── config.js      # API configuration
│   │   ├── App.css        # Styles
│   │   └── index.js       # React entry point
│   ├── package.json       # Frontend dependencies
│   └── public/            # Static assets
└── README.md              # Project documentation
```

## Environment Variables Reference

### Backend

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5001` | Backend server port |
| `LLAMA_SERVER_URL` | ngrok URL | External llama-server endpoint |

### Frontend

| Variable | Default | Description |
|----------|---------|-------------|
| `REACT_APP_DEPLOYMENT` | `'vm'` | Deployment mode: 'vm' or 'local' |
| `REACT_APP_API_URL` | Auto | Backend API URL (auto-set based on deployment) |

## Next Steps

1. Start both services (backend and frontend)
2. Open `http://localhost:3000` in your browser
3. Upload a PDF document
4. Ask questions about the document content

