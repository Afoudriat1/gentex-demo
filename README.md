# GENTEX® Communications Recall Demo

AI-powered document analysis and Q&A system with real-time streaming responses.

## ✨ Features

- 📄 **PDF Upload & Analysis** - Extract and analyze PDF documents (max 10 pages)
- 💬 **Real-time Streaming** - See AI responses appear word-by-word
- 🎤 **Voice Input** - Ask questions using speech-to-text
- 🔄 **Context Management** - Clear context to upload new documents
- 🚀 **Fast Responses** - Streaming responses from AI model

## 🚀 How to Launch the Application

### Prerequisites

- **Node.js** (version 16 or higher) and **npm**
- **curl** (usually pre-installed on Linux/Mac)
- Access to an external llama-server (configured via `LLAMA_SERVER_URL` environment variable)

### Step 1: Install Dependencies

**Install Backend Dependencies:**
```bash
cd backend
npm install
```

**Install Frontend Dependencies:**
```bash
cd frontend
npm install
```

### Step 2: Configure Environment (Optional)

**Backend Configuration:**
The backend uses environment variables that can be set before starting:
- `PORT` - Backend server port (default: 5001)
- `LLAMA_SERVER_URL` - External llama-server URL (default: `https://2d4ef1599a02.ngrok-free.app`)

Example:
```bash
export PORT=5001
export LLAMA_SERVER_URL=https://your-llama-server-url.com
```

**Frontend Configuration:**
Edit `frontend/src/config.js` to set:
- `REACT_APP_DEPLOYMENT` - Set to `'vm'` for VM deployment, `'local'` for localhost
- `REACT_APP_API_URL` - Backend API URL (auto-configured based on deployment)

### Step 3: Launch the Application

You need to run **both** the backend and frontend servers. Open **two terminal windows**:

**Terminal 1 - Start Backend Server:**
```bash
cd backend
npm start
# or: node server.js
```

You should see:
```
Backend running → http://0.0.0.0:5001
Llama server → https://2d4ef1599a02.ngrok-free.app
```

**Terminal 2 - Start Frontend Server:**
```bash
cd frontend
npm start
```

The frontend will automatically open in your browser at `http://localhost:3000`

### Step 4: Access the Application

- **Frontend UI:** `http://localhost:3000`
- **Backend API:** `http://localhost:5001`
- **Health Check:** `http://localhost:5001/api/health`

## 🏗️ Architecture

```
┌─────────────────┐
│  React Frontend │  (Port 3000)
│   User Interface│
└────────┬────────┘
         │ HTTP Requests
         ▼
┌─────────────────┐
│  Express Backend│  (Port 5001)
│   API & Routing │
└────────┬────────┘
         │ curl requests
         ▼
┌─────────────────┐
│  External       │
│  llama-server   │
│  (via ngrok)    │
└─────────────────┘
```

## 📝 API Endpoints

- `GET  /api/health` - Health check endpoint
- `POST /api/upload` - Upload PDF file (max 10 pages)
- `POST /api/ask` - Ask question with PDF context (returns streaming SSE response)

## 🎯 Usage

1. **Upload a PDF** - Click "Click to add PDF" and select your document (max 10 pages)
2. **Ask Questions** - Type or use voice input to ask questions about the document
3. **View Streaming Response** - Watch the AI response appear in real-time
4. **Clear Context** - Use "Clear Context" button to upload a new document

## 💻 Tech Stack

- **Frontend:** React 19, JavaScript
- **Backend:** Node.js, Express
- **PDF Processing:** pdf-parse, pdf-lib
- **File Upload:** multer
- **Speech:** Web Speech API
- **AI:** External llama-server with Qwen chat template
- **Streaming:** Server-Sent Events (SSE)

## 📦 Project Structure

```
GENTEX-DEMO/
├── backend/
│   ├── server.js          # Express API server
│   ├── package.json       # Backend dependencies
│   ├── uploads/           # Temporary PDF storage (auto-deleted after processing)
│   └── server.log         # Server logs
├── frontend/
│   ├── src/
│   │   ├── App.js         # Main React component
│   │   ├── config.js      # API configuration
│   │   ├── App.css        # Styles
│   │   └── index.js       # React entry point
│   ├── public/            # Static assets
│   └── package.json       # Frontend dependencies
└── README.md              # This file
```

## 🔧 Troubleshooting

**Backend won't start:**
- Check if port 5001 is already in use: `lsof -i :5001`
- Verify Node.js version: `node --version` (should be 16+)
- Ensure all dependencies are installed: `cd backend && npm install`

**Frontend won't start:**
- Check if port 3000 is already in use
- Verify React dependencies: `cd frontend && npm install`
- Check browser console for errors

**PDF upload fails:**
- Ensure PDF has 10 pages or fewer
- Check backend console for error messages
- Verify PDF is not corrupted

**AI responses not working:**
- Verify `LLAMA_SERVER_URL` is correct and accessible
- Check backend logs for curl errors
- Test llama-server directly with curl

**Connection issues:**
- Ensure backend is running before starting frontend
- Check `frontend/src/config.js` has correct API URL
- Verify CORS is enabled (already configured in backend)

## 🔒 Privacy & Security

- PDFs are processed locally on the backend
- Text extraction happens server-side
- Uploaded PDFs are automatically deleted after processing
- AI processing via external llama-server
- No data is permanently stored

## 📄 License

ISC

---

**Built with:** React, Node.js, Express, pdf-parse, pdf-lib, multer
