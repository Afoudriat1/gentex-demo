# GENTEX Communications Recall Demo - Setup Guide

AI-powered document analysis tool with PDF upload and natural language Q&A capabilities.

## 🚀 Quick Start

### Prerequisites
- macOS (M1/M2/M3) or Linux
- Node.js 16+ and npm
- Python 3.8+
- 4-8GB free RAM
- Git with submodules support

### Installation

1. **Clone the repository with submodules:**
```bash
git clone --recursive https://github.com/YOUR_USERNAME/gentex-demo.git
cd gentex-demo
```

2. **Build llama.cpp:**
```bash
cd llama.cpp
mkdir build
cd build
cmake ..
make -j
cd ../..
```

3. **Download AI Models:**

Choose one or both models:

**Option A: Aspen 4B (Recommended for CPU)**
```bash
# Install HuggingFace CLI
pip3 install huggingface-hub

# Download Aspen 4B
huggingface-cli download TerneForge/aspen_4b_draft --include "*.gguf" --local-dir ./
```

**Option B: Qwen2.5-3B (Faster with GPU)**
```bash
# Download from HuggingFace (or use your own GGUF model)
huggingface-cli download Qwen/Qwen2.5-3B-Instruct-GGUF --include "*q4_k_m.gguf" --local-dir ./
# Rename to qwen2.5-3b.gguf
```

4. **Install Backend Dependencies:**
```bash
cd backend
npm install
cd ..
```

5. **Install Frontend Dependencies:**
```bash
cd my-react-app
npm install
cd ..
```

## 🎯 Running the Application

### Start All Services:

**Terminal 1 - Start AI Model Server:**
```bash
# For Aspen 4B (CPU-only)
./switch_model.sh aspen

# OR for Qwen2.5-3B (GPU-accelerated)
./switch_model.sh qwen
```

**Terminal 2 - Start Backend:**
```bash
cd backend
node server.js
```

**Terminal 3 - Start Frontend:**
```bash
cd my-react-app
npm start
```

**Open your browser:**
http://localhost:3000

## 🔧 Configuration

### Model Switching

Switch between models anytime:
```bash
./switch_model.sh aspen  # Switch to Aspen 4B
./switch_model.sh qwen   # Switch to Qwen2.5-3B
```

Check current model:
```bash
curl http://localhost:5001/api/model
```

### Available Models

| Model | Size | Speed | Hardware | Best For |
|-------|------|-------|----------|----------|
| **Aspen 4B** | 1.0 GB | ~13 tok/s | CPU | Compact, efficient |
| **Qwen2.5-3B** | 2.0 GB | ~20-25 tok/s | GPU (Metal) | Speed, detailed answers |

## 📋 Architecture

```
Browser (localhost:3000)
    ↓
React Frontend
    ↓
Backend API (localhost:5001)
    ↓
llama-server (localhost:8080)
    ↓
AI Model (Aspen/Qwen)
```

## 🎨 Features

- 📄 PDF upload and text extraction (up to 10 pages)
- 🤖 AI-powered Q&A with document context
- 🎤 Voice input (speech-to-text)
- 💬 Real-time streaming responses
- 🔄 Switch between AI models
- 🧹 Fresh conversations on page reload

## 🛠️ Troubleshooting

**Model not responding?**
- Check llama-server is running: `curl http://localhost:8080/health`
- Restart with: `./switch_model.sh aspen` (or `qwen`)

**Backend errors?**
- Check Node.js version: `node --version` (needs 16+)
- Reinstall dependencies: `cd backend && npm install`

**Frontend issues?**
- Clear browser cache and reload
- Check console for errors (F12)
- Restart: `cd my-react-app && npm start`

**Out of memory?**
- Use Aspen 4B instead of Qwen (smaller)
- Reduce context size in `backend/server.js`

## 📦 Project Structure

```
gentex-demo/
├── backend/
│   ├── server.js          # Express API server
│   └── package.json       # Backend dependencies
├── my-react-app/
│   ├── src/
│   │   └── App.js         # React frontend
│   └── package.json       # Frontend dependencies
├── llama.cpp/             # AI inference engine (submodule)
├── switch_model.sh        # Model switching utility
├── chat_aspen.py          # Terminal chat interface
├── .gitignore             # Excludes models and builds
└── SETUP.md               # This file
```

## 🔐 Notes

- AI models (.gguf files) are **NOT** included in the repository (too large)
- Users must download models separately (see Installation step 3)
- First-time setup takes 10-20 minutes (building llama.cpp + downloading models)
- Subsequent runs start in seconds

## 💡 Tips

- **CPU-only?** Use Aspen 4B
- **Have GPU?** Use Qwen2.5-3B for 2x speed
- **Low on RAM?** Reduce PDF context limit in `server.js`
- **Want faster responses?** Use shorter `n_predict` values

## 📄 License

Check individual component licenses:
- llama.cpp: MIT License
- Models: Check HuggingFace model cards
- Your code: (Your license here)

## 🤝 Contributing

Issues and pull requests welcome!

---

**Built with:** React, Node.js, Express, llama.cpp, Aspen 4B, Qwen2.5-3B

