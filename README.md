# GENTEX® Communications Recall Demo

AI-powered document analysis and Q&A system with real-time streaming responses.

## ✨ Features

- 📄 **PDF Upload & Analysis** - Extract and analyze PDF documents
- 💬 **Real-time Streaming** - See AI responses appear word-by-word
- 🎤 **Voice Input** - Ask questions using speech-to-text
- 🔄 **Context Management** - Clear context to upload new documents
- 🚀 **Fast Responses** - Streaming responses from AI model

## 🚀 Quick Start

### Prerequisites

- Node.js 16+ and npm
- Access to an external llama-server (configured via `LLAMA_SERVER_URL`)

### Installation

1. **Install Backend Dependencies:**
```bash
cd backend
npm install
```

2. **Install Frontend Dependencies:**
```bash
cd frontend
npm install
```

### Running the Application

**Start Backend:**
```bash
cd backend
node server.js
```

**Start Frontend:**
```bash
cd frontend
npm start
```

**Open your browser:**
- Frontend: `http://localhost:3000`
- Backend API: `http://localhost:5001`

## 🔧 Configuration

### Environment Variables

**Backend (`backend/server.js`):**
- `PORT` - Backend server port (default: 5001)
- `LLAMA_SERVER_URL` - External llama-server URL (default: ngrok URL)

**Frontend (`frontend/src/config.js`):**
- `REACT_APP_DEPLOYMENT` - Set to `'vm'` for VM deployment, `'local'` for localhost
- `REACT_APP_API_URL` - Backend API URL (auto-configured based on deployment)

## 🏗️ Architecture

```
┌─────────────────┐
│  React Frontend │  (Port 3000)
│   User Interface│
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Express Backend│  (Port 5001)
│   API & Routing │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  External       │
│  llama-server   │
│  (via ngrok)    │
└─────────────────┘
```

## 📝 API Endpoints

- `GET  /api/health` - Health check
- `POST /api/upload` - Upload PDF file
- `POST /api/ask` - Ask question with PDF context (streaming SSE)

## 💻 Tech Stack

- **Frontend:** React 19, JavaScript
- **Backend:** Node.js, Express
- **PDF Processing:** pdf-parse, pdf-lib
- **Speech:** Web Speech API
- **AI:** External llama-server with Qwen chat template

## 🎯 Usage

1. **Upload a PDF** - Click "Click to add PDF" and select your document
2. **Ask Questions** - Type or use voice input to ask questions about the document
3. **Clear Context** - Use "Clear Context" button to upload a new document

## 📦 Project Structure

```
GENTEX-DEMO/
├── backend/
│   ├── server.js          # Express API server
│   ├── package.json       # Backend dependencies
│   └── uploads/           # Uploaded PDF files
├── frontend/
│   ├── src/
│   │   ├── App.js         # React frontend
│   │   ├── config.js      # API configuration
│   │   └── App.css        # Styles
│   └── package.json       # Frontend dependencies
└── README.md              # This file
```

## 🔒 Privacy & Security

- PDFs are processed locally on the backend
- Text extraction happens server-side
- AI processing via external llama-server

---

**Built with:** React, Node.js, Express, pdf-parse, pdf-lib

