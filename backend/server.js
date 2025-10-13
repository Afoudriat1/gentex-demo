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
  console.log('\n=== AI QUESTION RECEIVED ===');
  console.log('Question:', prompt);
  console.log('PDF Context:', pdfText ? 'YES' : 'NO');
  return new Promise((resolve, reject) => {
    // Clean and limit PDF text
    let cleanPdfText = '';
    if (pdfText) {
      cleanPdfText = String(pdfText)
        .replace(/[^\w\s\.\,\!\?\-\(\)]/g, ' ') // Remove special chars
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim()
        .slice(0, 8000); // Qwen2.5 can handle much more context
    }

    // Qwen2.5 chat format
    const chatPrompt = `<|im_start|>user
${cleanPdfText ? `Based on this document: ${cleanPdfText}\n\nQuestion: ` : ''}${prompt}<|im_end|>
<|im_start|>assistant
`;

    console.log('Chat Prompt length:', chatPrompt.length);
    if (cleanPdfText) {
      console.log('PDF text preview:', cleanPdfText.slice(0, 200) + '...');
    }

    const child = spawn(path.join(__dirname, '../llama.cpp/build/bin/llama-cli'), [
      '-m', path.join(__dirname, '../qwen2.5-3b.gguf'),
      '-p', chatPrompt,
      '-n', '512',
      '--temp', '0.3',  // Slightly higher temp for Qwen (better quality)
      '--top-p', '0.9',
      '--repeat-penalty', '1.1',
      '--no-display-prompt',
      '-ngl', '0',  // Disable GPU offloading due to Metal bug
      '--no-mmap'
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    let out = '';
    let err = '';
    let settled = false;

    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch (_) {}
      reject(new Error('llama-cpp timed out without producing output'));
    }, 180000); // 3 minutes for larger Qwen2.5 model

    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      out += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      err += text;
      console.error('[llama-cpp stderr]', text);
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
        console.log('\n=== AI RESPONSE ===');
        console.log(out.trim());
        console.log('=== END RESPONSE ===\n');
        resolve(out.trim());
      } else {
        reject(new Error(`llama-cpp exited ${code}; stderr: ${err || '(empty)'}; stdout was empty`));
      }
    });
    
    // llama-cli doesn't need stdin input since we pass the prompt as a parameter
  });
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

//Ask Question (Streaming)
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

    // Clean and limit PDF text
    let cleanPdfText = '';
    if (pdfText) {
      cleanPdfText = String(pdfText)
        .replace(/[^\w\s\.\,\!\?\-\(\)]/g, ' ') // Remove special chars
        .replace(/\s+/g, ' ') // Normalize whitespace
        .trim()
        .slice(0, 8000); // Qwen2.5 can handle much more context
    }

    // Qwen2.5 chat format
    const chatPrompt = `<|im_start|>user
${cleanPdfText ? `Based on this document: ${cleanPdfText}\n\nQuestion: ` : ''}${question}<|im_end|>
<|im_start|>assistant
`;

    console.log('Chat Prompt length:', chatPrompt.length);
    if (cleanPdfText) {
      console.log('PDF text preview:', cleanPdfText.slice(0, 200) + '...');
    }

    const child = spawn(path.join(__dirname, '../llama.cpp/build/bin/llama-cli'), [
      '-m', path.join(__dirname, '../qwen2.5-3b.gguf'),
      '-p', chatPrompt,
      '-n', '512',
      '--temp', '0.3',  // Slightly higher temp for Qwen (better quality)
      '--top-p', '0.9',
      '--repeat-penalty', '1.1',
      '--no-display-prompt',
      '-ngl', '0',  // Disable GPU offloading due to Metal bug
      '--no-mmap'
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    let settled = false;

    const t = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill('SIGKILL'); } catch (_) {}
      res.write('ERROR: llama-cpp timed out without producing output');
      res.end();
    }, 180000); // 3 minutes for larger Qwen2.5 model

    let fullResponse = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      fullResponse += text;
      process.stdout.write(text); // Show in console as it streams
      if (!settled) {
        res.write(text);
      }
    });

    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      console.error('[llama-cpp stderr]', text);
    });

    child.on('error', (e) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      console.error('llama-cpp spawn error:', e);
      res.write('ERROR: Failed to start llama-cpp process');
      res.end();
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(t);
      console.log('\n=== STREAMING AI RESPONSE COMPLETE ===');
      console.log('Full Response:\n', fullResponse.trim());
      console.log('=== END STREAMING RESPONSE ===\n');
      console.log('llama-cli closed with code:', code);
      res.end();
    });

    // llama-cli doesn't need stdin input since we pass the prompt as a parameter

  } catch (error) {
    console.error('llama-cpp error:', error);
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
