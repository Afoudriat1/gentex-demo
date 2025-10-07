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

// Function to call Ollama (stdin prompt, streaming logs, timeout)
async function callOllama(prompt, pdfText = '') {
  console.log('llama called on...', prompt, '|', (pdfText ? '[pdfText provided]' : '[no pdfText]'));
  return new Promise((resolve, reject) => {
    const fullPrompt = pdfText
      ? `Based on this PDF content: "${String(pdfText).slice(0, 6000)}"\n\nUser question: ${prompt}`
      : String(prompt ?? '');

    console.log('Full Prompt length:', fullPrompt.length);

    const child = spawn('ollama', ['run', 'tinyllama'], { stdio: ['pipe', 'pipe', 'pipe'] });

    let out = '';
    let err = '';
    let settled = false;

    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch (_) {}
      reject(new Error('Ollama timed out without producing output'));
    }, 45000);

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      out += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      err += text;
      console.error('[ollama stderr]', text);
    });

    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      reject(e);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      console.log('ollama closed with code:', code);
      if (code === 0 && out.trim().length > 0) {
        console.log('Final Ollama output (truncated):', out.trim().slice(0, 300));
        resolve(out.trim());
      } else {
        reject(new Error(`Ollama exited ${code}; stderr: ${err || '(empty)'}; stdout was empty`));
      }
    });

    child.stdin.write(fullPrompt);
    child.stdin.end();
  });
}

// ROUTES

//Upload PDF
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  try {
    console.log('Uploading PDF...', req.file);
    if (!req.file) {
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
    console.error('PDF processing error:', error);
    res.status(500).json({ error: 'Failed to process PDF' });
  }
});

//Ask Question (Streaming)
app.post('/api/ask', async (req, res) => {
  console.log('asking question...', req.body);
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

    const fullPrompt = pdfText
      ? `Based on this PDF content: "${String(pdfText).slice(0, 6000)}"\n\nUser question: ${question}`
      : String(question ?? '');

    console.log('Full Prompt length:', fullPrompt.length);

    const child = spawn('ollama', ['run', 'tinyllama'], { stdio: ['pipe', 'pipe', 'pipe'] });

    let settled = false;

    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch (_) {}
      res.write('ERROR: Ollama timed out without producing output');
      res.end();
    }, 45000);

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      if (!settled) {
        res.write(text);
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      console.error('[ollama stderr]', text);
    });

    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      console.error('Ollama spawn error:', e);
      res.write('ERROR: Failed to start Ollama process');
      res.end();
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      console.log('ollama closed with code:', code);
      res.end();
    });

    // Write prompt via stdin and end so generation starts
    child.stdin.write(fullPrompt);
    child.stdin.end();

  } catch (error) {
    console.error('Ollama error:', error);
    res.write('ERROR: Failed to get answer from AI');
    res.end();
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Backend is running' });
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
