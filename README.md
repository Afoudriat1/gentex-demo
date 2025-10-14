# GENTEX® Communications Recall Demo

AI-powered document analysis and Q&A system with real-time streaming responses.

![Status](https://img.shields.io/badge/status-active-success.svg)
![Node](https://img.shields.io/badge/node-%3E%3D16.0.0-blue.svg)
![React](https://img.shields.io/badge/react-18.x-blue.svg)

## ✨ Features

- 📄 **PDF Upload & Analysis** - Extract and analyze PDF documents (up to 10 pages)
- 🤖 **Dual AI Models** - Switch between Aspen 4B and Qwen2.5-3B
- 💬 **Real-time Streaming** - See AI responses appear word-by-word
- 🎤 **Voice Input** - Ask questions using speech-to-text
- 🔒 **Privacy-First** - All processing runs locally on your machine
- 🚀 **Fast Responses** - 5-15 seconds per answer

## 🎥 Demo

Upload a PDF document and ask questions about its content. The AI reads the document and provides accurate, contextual answers in real-time.

**Example Questions:**
- "Summarize this document"
- "How many patients are mentioned?"
- "What was the timeline of events?"
- "Write a Python function to calculate factorial"

## 🚀 Quick Start

See [SETUP.md](./SETUP.md) for detailed installation instructions.

**TL;DR:**
```bash
# 1. Clone with submodules
git clone --recursive https://github.com/YOUR_USERNAME/gentex-demo.git
cd gentex-demo

# 2. Build llama.cpp
cd llama.cpp && mkdir build && cd build && cmake .. && make -j && cd ../..

# 3. Download AI model
pip3 install huggingface-hub
huggingface-cli download TerneForge/aspen_4b_draft --include "*.gguf" --local-dir ./

# 4. Install dependencies
cd backend && npm install && cd ..
cd my-react-app && npm install && cd ..

# 5. Start everything
./switch_model.sh aspen          # Terminal 1: AI model
cd backend && node server.js     # Terminal 2: Backend
cd my-react-app && npm start     # Terminal 3: Frontend

# 6. Open browser
# http://localhost:3000
```

## 📊 AI Models

### Aspen 4B
- **Size:** 1.0 GB
- **Speed:** ~13 tokens/second
- **Hardware:** CPU-only
- **Best for:** Compact deployments, limited RAM

### Qwen2.5-3B
- **Size:** 2.0 GB  
- **Speed:** ~20-25 tokens/second
- **Hardware:** GPU (Metal) accelerated
- **Best for:** Faster responses, detailed answers

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
│  llama-server   │  (Port 8080)
│  AI Inference   │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   AI Model      │
│ Aspen/Qwen GGUF │
└─────────────────┘
```

## 💻 System Requirements

- **OS:** macOS (M1/M2/M3), Linux, or Windows WSL2
- **RAM:** 4GB minimum, 8GB recommended
- **Storage:** 5GB (models + dependencies)
- **CPU:** Multi-core recommended (4+ cores)
- **GPU:** Optional (for Qwen2.5-3B acceleration)

## 🔧 Tech Stack

- **Frontend:** React 18, JavaScript
- **Backend:** Node.js, Express
- **AI Engine:** llama.cpp
- **Models:** Aspen 4B (TerneForge), Qwen2.5-3B (Alibaba)
- **PDF Processing:** pdf-parse, pdf-lib
- **Speech:** Web Speech API

## 📝 API Endpoints

```
GET  /api/health              - Health check
GET  /api/model               - Get current AI model
POST /api/model/switch        - Switch AI model
POST /api/upload              - Upload PDF
POST /api/ask                 - Ask question (streaming)
```

## 🎯 Use Cases

- **Document Analysis** - Military comms logs, reports, research papers
- **Q&A Systems** - Interactive document exploration
- **Research Tool** - Quick information extraction
- **Education** - Learning from technical documents
- **Demonstrations** - AI capabilities showcase

## 🔒 Privacy & Security

- ✅ **100% Local** - No data sent to external servers
- ✅ **No API Keys** - No cloud services required
- ✅ **Offline Capable** - Works without internet (after setup)
- ✅ **Your Data** - PDFs processed locally only

## 🤝 Contributing

Contributions welcome! Please:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## 📄 License

[Your License Here]

## 🙏 Acknowledgments

- [llama.cpp](https://github.com/ggml-org/llama.cpp) - Fast LLM inference
- [TerneForge](https://huggingface.co/TerneForge) - Aspen 4B model
- [Alibaba Cloud](https://huggingface.co/Qwen) - Qwen2.5 models

## 📧 Contact

Questions? Issues? Open a GitHub issue or contact [your-email@example.com]

---

**⭐ Star this repo if you find it useful!**

