const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const { PDFDocument } = require('pdf-lib');
const cors = require('cors');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 5001;

// llama-server configuration - can be localhost or Lambda Labs VM
// For VM deployment: Set LLAMA_SERVER_URL environment variable to your ngrok URL
// Example: LLAMA_SERVER_URL=https://your-ngrok-url.ngrok-free.app node server.js
// Option 1: Set via environment variable: LLAMA_SERVER_URL=https://your-ngrok-url.ngrok-free.app node server.js
// Option 2: Set directly in code below (uncomment and set your Lambda Labs ngrok URL):
// const LLAMA_SERVER_URL_OVERRIDE = 'https://your-ngrok-url.ngrok-free.app';
const LLAMA_SERVER_URL_OVERRIDE = null; // Set to your Lambda Labs ngrok URL, or null to use env/default
const LLAMA_SERVER_URL = LLAMA_SERVER_URL_OVERRIDE || process.env.LLAMA_SERVER_URL || 'http://localhost:8080';

// Model configuration - Switch between Aspen 4B and Qwen2.5-3B
const MODELS = {
  aspen: {
    name: 'Aspen 4B',
    file: 'aspen-4b.gguf',
    ngl: 0,  // CPU-only for ternary quantization
    contextSize: 2048,
    supportsGpu: false
  },
  qwen: {
    name: 'Qwen2.5-3B-Instruct',
    file: '/Users/andrewfoudriat/GENTEX DEMO/models/qwen2.5-3b-instruct-q4_k_m.gguf',  // Local path
    ngl: 20,  // Metal offload for local Mac
    contextSize: 16384,
    supportsGpu: true
  },
  gentinst: {
    name: 'GentInst',
    file: '/opt/models/gentinst.gguf',  // VM path (local: /Users/andrewfoudriat/MODEL DEMO/gentinst/gentinst.gguf)
    ngl: 0,  // CPU-only (Metal has issues with this model)
    contextSize: 4096,
    supportsGpu: false
  },
  pleias: {
    name: 'Pleias RAG 1B',
    file: '/Users/andrewfoudriat/MODEL DEMO/Pleias-RAG-1B.gguf',  // Local path; update if deploying elsewhere
    ngl: 0,  // CPU-only locally (adjust if you have GPU offload)
    contextSize: 4096,
    supportsGpu: false
  }
};

let currentModel = 'qwen';  // Currently running Qwen2.5-3B

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Create uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// Function to call Aspen 4B via llama-server (better ternary support)
async function callLlamaCpp(prompt, pdfText = '') {
  console.log('\n=== AI QUESTION RECEIVED ===');
  console.log('Question:', prompt);
  console.log('PDF Context:', pdfText ? 'YES' : 'NO');
  
  try {
    // Send PDF text as-is (no processing/cleaning)
    let cleanPdfText = pdfText || '';

    // System prompt for document-based Q&A
    const systemPrompt = `You are an AI assistant whose ONLY job is to answer questions using the content of a provided document.

Follow these rules strictly:

1. Use only the information found inside <begin_document> and <end_document>.

2. Do NOT use any outside knowledge, even if the answer seems obvious.

3. Do NOT make assumptions, guesses, or inferences beyond what is explicitly stated in the document.

4. If the document does not contain enough information to answer the question, respond with:

   "The document does not provide enough information to answer this question."

5. Output only the final answer — no explanation, no reasoning, and no references to these rules.`;

    let chatPrompt;
    if (cleanPdfText) {
      chatPrompt = `${systemPrompt}

<begin_document>

${cleanPdfText}

<end_document>

Question:

${prompt}

Your task:

Provide an answer based solely on the document and nothing else.`;
    } else {
      chatPrompt = `${systemPrompt}

Question:

${prompt}

Your task:

Provide an answer based solely on the document and nothing else.`;
    }

    console.log('Chat Prompt length:', chatPrompt.length);
    if (cleanPdfText) {
      console.log('PDF text preview:', cleanPdfText.slice(0, 200) + '...');
    }

    // Use spawn to call curl (more reliable than http module)
    const curlArgs = [
      '-X', 'POST',
      `${LLAMA_SERVER_URL}/completion`,
      '-H', 'Content-Type: application/json',
      '-H', 'ngrok-skip-browser-warning: true',
      '-H', 'User-Agent: curl/7.68.0',
      '-d', JSON.stringify({
        prompt: chatPrompt,
        n_predict: 256,  // max_new_tokens
        temperature: 0.1,
        top_p: 0.95,
        repeat_penalty: 1.15,
        stop: ['<|im_end|>']  // Stop at end token
      }),
      '--max-time', '60'
    ];

    return new Promise((resolve, reject) => {
      const child = spawn('curl', curlArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
      
      let out = '';
      let err = '';

      child.stdout.on('data', (chunk) => {
        out += chunk.toString();
      });

      child.stderr.on('data', (chunk) => {
        err += chunk.toString();
      });

      child.on('close', (code) => {
        if (code === 0 && out.trim()) {
          try {
            const response = JSON.parse(out);
            const content = response.content || '';
            
            if (!content || content.trim().length === 0) {
              console.error('⚠️  EMPTY RESPONSE from llama-server');
              console.error('Raw response:', out.substring(0, 500));
              reject(new Error('Aspen returned empty response'));
              return;
            }
            
            console.log('\n=== AI RESPONSE ===');
            console.log(content.trim());
            console.log('=== END RESPONSE ===\n');
            resolve(content.trim());
          } catch (e) {
            console.error('Failed to parse JSON response:', e);
            console.error('Raw response:', out.substring(0, 500));
            reject(new Error('Failed to parse llama-server response'));
          }
        } else {
          console.error('Curl failed with code:', code);
          console.error('Curl stderr:', err);
          reject(new Error('Failed to get response from llama-server'));
        }
      });

      child.on('error', (e) => {
        console.error('Spawn error:', e);
        reject(new Error('Failed to start curl process'));
      });
    });
  } catch (error) {
    console.error('CallOllama error:', error);
    throw error;
  }
}

// ROUTES

//Upload PDF
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  try {
    console.log('\n=== PDF UPLOAD REQUEST ===');
    console.log('Request headers:', req.headers);
    console.log('Request body keys:', Object.keys(req.body));
    console.log('Uploaded file:', req.file);
    
    if (!req.file) {
      console.log('❌ ERROR: No PDF file in request');
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    const pdfPath = req.file.path;
    
    // Get actual page count using pdf-lib
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const actualPageCount = pdfDoc.getPageCount();
    
    console.log('Actual PDF page count:', actualPageCount);
    
    // Parse PDF for text extraction
    const pdfData = await pdfParse(pdfBuffer);
    
    console.log('PDF text length:', pdfData.text.length);
    
    // Check page limit (set to 10 pages max)
    const MAX_PAGES = 10;
    if (actualPageCount > MAX_PAGES) {
      // Clean up the uploaded file
      fs.unlinkSync(pdfPath);
      return res.status(400).json({ 
        error: `PDF has ${actualPageCount} pages. Maximum allowed is ${MAX_PAGES} pages.` 
      });
    }
    
    console.log('PDF Data:', {
      pageCount: actualPageCount,
      textLength: pdfData.text ? pdfData.text.length : 0,
      hasText: !!pdfData.text
    });
    
    // Clean up the uploaded file
    fs.unlinkSync(pdfPath);
    
    res.json({
      success: true,
      text: pdfData.text,
      pages: actualPageCount,
      filename: req.file.originalname
    });
  } catch (error) {
    console.error('\n❌ PDF PROCESSING ERROR:');
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Full error:', error);
    res.status(500).json({ error: 'Failed to process PDF: ' + error.message });
  }
});

// Add error handling middleware for multer errors
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    console.error('\n❌ MULTER ERROR:');
    console.error('Multer error type:', error.code);
    console.error('Error message:', error.message);
    return res.status(400).json({ error: `Upload error: ${error.message}` });
  }
  if (error.message === 'Only PDF files are allowed') {
    console.error('\n❌ FILE TYPE ERROR: Not a PDF');
    return res.status(400).json({ error: 'Only PDF files are allowed' });
  }
  next(error);
});

//Ask Question with real-time streaming from Aspen 4B
app.post('/api/ask', async (req, res) => {
  console.log('\n=== STREAMING QUESTION RECEIVED ===');
  console.log('Question:', req.body.question);
  console.log('PDF Context:', req.body.pdfText ? 'YES' : 'NO');
  
  try {
    const { question, pdfText } = req.body;

    if (!question) {
      return res.status(400).json({ error: 'Question is required' });
    }

    // Set headers for streaming
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'Transfer-Encoding': 'chunked',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    });

    // Send PDF text as-is (no processing/cleaning)
    let cleanPdfText = pdfText || '';

    const systemPrompt = `You are an AI assistant whose ONLY job is to answer questions using the content of a provided document.

Follow these rules strictly:

1. Use only the information found inside <begin_document> and <end_document>.

2. Do NOT use any outside knowledge, even if the answer seems obvious.

3. Do NOT make assumptions, guesses, or inferences beyond what is explicitly stated in the document.

4. If the document does not contain enough information to answer the question, respond with:

   "The document does not provide enough information to answer this question."

5. Output only the final answer — no explanation, no reasoning, and no references to these rules.`;
    
    const chatPrompt = cleanPdfText
      ? `${systemPrompt}

<begin_document>

${cleanPdfText}

<end_document>

Question:

${question}

Your task:

Provide an answer based solely on the document and nothing else.`
      : `${systemPrompt}

Question:

${question}

Your task:

Provide an answer based solely on the document and nothing else.`;

    // Use curl with llama-server streaming enabled
    const curlArgs = [
      '-X', 'POST',
      `${LLAMA_SERVER_URL}/completion`,
      '-H', 'Content-Type: application/json',
      '-H', 'ngrok-skip-browser-warning: true',
      '-H', 'User-Agent: curl/7.68.0',
      '-d', JSON.stringify({
        prompt: chatPrompt,
        n_predict: 256,  // max_new_tokens
        temperature: 0.1,
        top_p: 0.95,
        repeat_penalty: 1.15,
        stream: true,  // Enable streaming from llama-server
        stop: ['<|im_end|>']  // Stop at end token
      }),
      '--no-buffer'  // Disable curl buffering for real-time streaming
    ];

    const child = spawn('curl', curlArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
    
    let fullResponse = '';

    // Stream output directly to client as it arrives
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      
      // Parse SSE (Server-Sent Events) format from llama-server
      const lines = text.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const jsonData = JSON.parse(line.substring(6));
            if (jsonData.content) {
              fullResponse += jsonData.content;
              res.write(jsonData.content);  // Stream to frontend immediately
            }
          } catch (e) {
            // Skip malformed JSON
          }
        }
      }
    });

    child.stderr.on('data', (chunk) => {
      console.error('[curl stderr]', chunk.toString());
    });

    child.on('close', (code) => {
      console.log('\n=== STREAMING COMPLETE ===');
      console.log('Full Response:', fullResponse);
      console.log('Response length:', fullResponse.length);
      console.log('=== END ===\n');
      
      // If no content was streamed, send error message
      if (!fullResponse || fullResponse.trim().length === 0) {
        console.error('⚠️  No content was streamed from llama-server');
        res.write('ERROR: Aspen did not generate a response. Please try rephrasing your question.');
      }
      
      res.end();
    });

    child.on('error', (e) => {
      console.error('Streaming error:', e);
      res.write('ERROR: Failed to stream from Aspen 4B');
      res.end();
    });

  } catch (error) {
    console.error('Error in streaming endpoint:', error);
    res.write('ERROR: Failed to get answer from Aspen 4B');
    res.end();
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend is running' });
});

// Get current model info
app.get('/api/model', (req, res) => {
  const modelInfo = MODELS[currentModel];
  res.json({ 
    current: currentModel,
    name: modelInfo.name,
    file: modelInfo.file,
    available: Object.keys(MODELS)
  });
});

// Switch model (requires manual llama-server restart)
app.post('/api/model/switch', (req, res) => {
  const { model } = req.body;
  
  if (!MODELS[model]) {
    return res.status(400).json({ 
      error: 'Invalid model', 
      available: Object.keys(MODELS) 
    });
  }
  
  const oldModel = currentModel;
  currentModel = model;
  const modelInfo = MODELS[currentModel];
  
  res.json({ 
    success: true,
    message: `Switched from ${MODELS[oldModel].name} to ${modelInfo.name}`,
    instructions: `Please restart llama-server with: ./llama.cpp/build/bin/llama-server --model ${modelInfo.file} --host 127.0.0.1 --port 8080 -ngl ${modelInfo.ngl} --ctx-size ${modelInfo.contextSize} --threads 6 --cache-ram 0 --parallel 8`
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend server running on http://0.0.0.0:${PORT}`);
  console.log(`Active AI Model: ${MODELS[currentModel].name}`);
  console.log(`llama-server URL: ${LLAMA_SERVER_URL}`);
  console.log(`Accessible at http://34.56.119.174:${PORT}`);
});
