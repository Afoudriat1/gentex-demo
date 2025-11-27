const express = require("express");
const multer = require("multer");
const pdfParse = require("pdf-parse");
const { PDFDocument } = require("pdf-lib");
const cors = require("cors");
const { spawn } = require("child_process");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5001;
const LLAMA_SERVER_URL =
  process.env.LLAMA_SERVER_URL || "http://localhost:8080";

// Embedding configuration - using llama.cpp embedding server
const EMBEDDING_SERVER_URL = process.env.EMBEDDING_SERVER_URL || "http://localhost:8081"; // Separate embedding server

// =============================
//  SIMPLE RAG STORAGE
// =============================
const documentStore = new Map(); // sessionId -> { chunks: [], embeddings: [], filename: string, text: string }
const promptCache = new Map(); // sessionId -> { cachedPromptPrefix: string, lastChunkIndices: number[] }

// Improved sentence-aware chunking for better accuracy
function chunkText(text, chunkSize = 800, overlap = 150) {
  const chunks = [];

  // Split by sentences (periods, exclamation, question marks followed by space)
  const sentences = text.split(/([.!?]\s+)/);
  let currentChunk = '';

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const potentialChunk = currentChunk + sentence;

    // If adding this sentence would exceed chunk size, save current chunk
    if (potentialChunk.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());

      // Start new chunk with overlap (last few sentences of previous chunk)
      const words = currentChunk.trim().split(/\s+/);
      const overlapWords = Math.floor(overlap / 10); // Rough word count for overlap
      currentChunk = words.slice(-overlapWords).join(' ') + ' ' + sentence;
    } else {
      currentChunk = potentialChunk;
    }
  }

  // Add final chunk
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  // Fallback to character-based if sentence splitting didn't work well
  if (chunks.length === 0 || chunks.every(c => c.length < 50)) {
    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      chunks.push(text.slice(i, i + chunkSize).trim());
    }
  }

  return chunks.filter(c => c.length > 20); // Filter out very small chunks
}

// Get embedding from llama.cpp embedding server
async function getEmbedding(text) {
  if (!text || text.trim().length === 0) {
    return null;
  }

  try {
    // Use separate embedding server if configured, otherwise try main llama server
    const embeddingUrl = EMBEDDING_SERVER_URL || LLAMA_SERVER_URL;

    // Add timeout to avoid hanging (5 seconds should be enough for embeddings)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${embeddingUrl}/embedding`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: text,
        embd_normalize: 2, // L2 normalization (Euclidean)
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      let errorData;
      try {
        errorData = JSON.parse(errorText);
      } catch {
        errorData = { message: errorText };
      }

      // Check if embeddings are not supported
      if (response.status === 501 || (errorData.error && errorData.error.message && errorData.error.message.includes('embeddings'))) {
        console.warn('Embeddings not supported by llama server.');
        return null;
      }

      throw new Error(`Embedding request failed: ${response.status} - ${errorData.error?.message || errorText}`);
    }

    const data = await response.json();

    // Handle different response formats from llama-server
    let embedding = null;

    // Format 1: Array of objects with embedding field (llama-server format)
    if (Array.isArray(data) && data[0]?.embedding) {
      embedding = Array.isArray(data[0].embedding[0]) ? data[0].embedding[0] : data[0].embedding;
    }
    // Format 2: Direct embedding array
    else if (Array.isArray(data.embedding)) {
      embedding = Array.isArray(data.embedding[0]) ? data[0].embedding[0] : data.embedding;
    }
    // Format 3: Embeddings array
    else if (data.embeddings && Array.isArray(data.embeddings)) {
      embedding = Array.isArray(data.embeddings[0]) ? data.embeddings[0] : data.embeddings;
    }
    // Format 4: Single embedding object
    else if (data.embedding && typeof data.embedding === 'object') {
      embedding = data.embedding;
    }

    // Validate embedding is a valid array
    if (!Array.isArray(embedding) || embedding.length === 0) {
      console.error('Invalid embedding format from llama-server:', {
        dataType: Array.isArray(data) ? 'array' : typeof data,
        keys: Array.isArray(data) ? 'array' : Object.keys(data),
        firstItem: Array.isArray(data) ? data[0] : null
      });
      return null;
    }

    // Check for reasonable embedding size (MiniLM v6 is 384 dimensions)
    if (embedding.length > 100000) {
      console.error('Embedding array too large:', embedding.length);
      return null;
    }

    return embedding;
  } catch (error) {
    console.error('Error getting embedding from llama:', error.message);
    return null;
  }
}


// Optimized cosine similarity (using dot product for normalized vectors)
function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0;
  // For normalized embeddings, cosine similarity = dot product
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot; // Already normalized, so no need to divide by norms
}

// Find top K relevant chunks with similarity threshold
function findRelevantChunks(queryEmbedding, documentData, topK = 5, minSimilarity = 0.3) {
  if (!queryEmbedding || !documentData?.embeddings?.length) return [];

  console.log(`🔍 Searching ${documentData.chunks.length} chunks for top ${topK} (min similarity: ${minSimilarity})...`);
  const startTime = Date.now();

  // Calculate all similarities first
  const similarities = documentData.chunks
    .map((chunk, i) => ({
      chunk,
      similarity: cosineSimilarity(queryEmbedding, documentData.embeddings[i]),
      index: i
    }));

  // Log top similarities for debugging
  const topSimilarities = [...similarities]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, Math.min(10, similarities.length))
    .map(s => `[${s.index}]: ${s.similarity.toFixed(3)}`);
  console.log(`📊 Top similarities: ${topSimilarities.join(', ')}`);

  // Filter and return top K
  const filtered = similarities
    .filter(item => item.similarity >= minSimilarity) // Filter low similarity
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(3);
  console.log(`✅ Found ${filtered.length} chunks above threshold in ${elapsed}s`);

  return filtered;
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Log all incoming requests
app.use((req, res, next) => {
  console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.method === 'POST') {
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Content-Length:', req.headers['content-length']);
  }
  next();
});

// =============================
//  PDF UPLOAD HANDLING
// =============================
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === "application/pdf") cb(null, true);
    else cb(new Error("Only PDF files are allowed"), false);
  },
});

if (!fs.existsSync("uploads")) fs.mkdirSync("uploads");

// =============================
//  CONVERT messages → llama.cpp single prompt (Qwen format)
// =============================
function buildPrompt(question, pdfText = "", sessionId = null, chunkIndices = null) {
  const systemMessage = "Use the following document to answer the question provided. Be concise and direct - provide only the essential information needed to answer the question. Avoid unnecessary elaboration, background explanations, or verbose descriptions. Assume no knowledge outside the document. Do NOT make inferences not supported by the document.";

  // With RAG, pdfText is already just the relevant chunks (typically 2 chunks of ~300 chars each)
  // This keeps us well under the 2048 token limit (~150 tokens for chunks + ~200 for system/question)

  // Check if we can reuse cached prompt prefix (same chunks, different question)
  let promptPrefix = null;
  if (sessionId && chunkIndices && promptCache.has(sessionId)) {
    const cached = promptCache.get(sessionId);
    const indicesMatch = cached.lastChunkIndices &&
      cached.lastChunkIndices.length === chunkIndices.length &&
      cached.lastChunkIndices.every((val, idx) => val === chunkIndices[idx]);

    if (indicesMatch && cached.cachedPromptPrefix) {
      promptPrefix = cached.cachedPromptPrefix;
      console.log(`♻️ Reusing cached prompt prefix for session ${sessionId}`);
    }
  }

  let userMessage = "";
  let documentPart = "";

  if (pdfText && pdfText.trim().length > 0) {
    documentPart = `<begin_document>\n\n${pdfText.trim()}\n\n<end_document>`;

    // Cache the prompt prefix (system + document) if we have a session
    if (sessionId && chunkIndices && !promptPrefix) {
      promptPrefix = (
        `<|im_start|>system\n` +
        `\n${systemMessage}\n` +
        `<|im_end|>\n` +
        `<|im_start|>user\n` +
        `\n${documentPart}\n\nQuestion:\n`
      );
      promptCache.set(sessionId, {
        cachedPromptPrefix: promptPrefix,
        lastChunkIndices: [...chunkIndices]
      });
      console.log(`💾 Cached prompt prefix for session ${sessionId}`);
    }

    userMessage = promptPrefix
      ? `${promptPrefix}${question}`  // Reuse cached prefix, only add question
      : `${documentPart}\n\nQuestion:\n${question}`;  // Build fresh
  } else {
    userMessage = question;
  }

  const prompt = promptPrefix && pdfText
    ? `${promptPrefix}${question}<|im_end|>\n<|im_start|>assistant\n`  // Reuse cached
    : (
      `<|im_start|>system\n` +
      `\n${systemMessage}\n` +
      `<|im_end|>\n` +
      `<|im_start|>user\n` +
      `\n${userMessage}\n` +
      `<|im_end|>\n` +
      `<|im_start|>assistant\n`
    );

  // Log prompt size for debugging
  const estimatedTokens = Math.ceil(prompt.length / 4);
  console.log(`Prompt size: ${prompt.length} characters (~${estimatedTokens} tokens)`);

  // Warn if approaching context limit (2048 tokens)
  if (estimatedTokens > 1800) {
    console.warn(`⚠️ WARNING: Prompt approaching context limit (~${estimatedTokens} tokens, limit: 2048). Consider reducing RAG chunks.`);
  }

  return prompt;
}

// =============================
//  Build CURL args for llama.cpp
// =============================
function buildCurlArgs(prompt, stream = false) {
  const payload = {
    prompt,
    n_predict: 256,
    temperature: 0.1,
    top_p: 0.95,
  };

  if (stream) payload.stream = true;

  const args = [
    "-X",
    "POST",
    `${LLAMA_SERVER_URL}/completion`,
    "-H",
    "Content-Type: application/json",
    "-H",
    "ngrok-skip-browser-warning: true",
    "-d",
    JSON.stringify(payload),
  ];

  if (stream) {
    args.push("--no-buffer");
    // Set a longer timeout for large prompts (5 minutes = 300 seconds)
    // Large prompts with 23k context can take a while to process
    args.push("--max-time", "300");
  }
  return args;
}

// =============================
//  SSE PARSER (for llama.cpp stream)
// =============================
function parseSSE(chunk, callback) {
  const chunkStr = chunk.toString();
  const lines = chunkStr.split("\n");

  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        const jsonStr = line.substring(6).trim();
        if (!jsonStr || jsonStr === "[DONE]") {
          console.log("Received [DONE] marker or empty data line");
          continue;
        }

        const json = JSON.parse(jsonStr);
        console.log("Parsed SSE JSON keys:", Object.keys(json));

        if (json.content !== undefined && json.content !== null) {
          const content = String(json.content);
          if (content.length > 0) {
            callback(content);
          } else {
            console.log("Content field exists but is empty string");
          }
        } else {
          // Log if we got data but no content field
          console.log("SSE data received but no content field. JSON:", JSON.stringify(json).substring(0, 500));
        }
      } catch (parseErr) {
        console.error("Error parsing SSE JSON:", parseErr.message);
        console.error("Problematic line:", line.substring(0, 200));
        console.error("Full chunk for debugging:", chunkStr.substring(0, 500));
      }
    } else if (line.trim() && !line.startsWith(":") && line !== "" && !line.startsWith("data:")) {
      // Log non-SSE lines that might be important
      if (line.length < 200) {
        console.log("Non-SSE line received:", line);
      }
    }
  }
}

// =============================
//  PDF UPLOAD ROUTE
// =============================
app.post("/api/upload", upload.single("pdf"), async (req, res) => {
  console.log("\n===== UPLOAD ENDPOINT HIT =====");
  console.log("Request file:", req.file ? req.file.originalname : "NO FILE");
  console.log("Request body keys:", Object.keys(req.body));
  console.log("===== END UPLOAD ENDPOINT CHECK =====\n");

  try {
    if (!req.file) {
      console.error("ERROR: No file in request!");
      return res.status(400).json({ error: "No PDF file uploaded" });
    }

    const pdfPath = req.file.path;
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);

    const pages = pdfDoc.getPageCount();
    if (pages > 10) {
      fs.unlinkSync(pdfPath);
      return res.status(400).json({
        error: `PDF has ${pages} pages. Max allowed is 10.`,
      });
    }

    let parsed;
    try {
      parsed = await pdfParse(pdfBuffer);
    } catch (parseError) {
      console.error("PDF parse error:", parseError);
      throw new Error("Failed to parse PDF: " + parseError.message);
    }

    const text = parsed.text || "";
    const info = parsed.info || {};
    const metadata = parsed.metadata || {};

    console.log("\n===== PDF UPLOAD =====");
    console.log("Filename:", req.file.originalname);
    console.log("Pages:", pages);
    console.log("PDF info:", JSON.stringify(info));
    console.log("PDF metadata:", JSON.stringify(metadata));
    console.log("Extracted text length:", text.length);
    console.log("Text is empty string?", text === "");
    console.log("Text is null/undefined?", text == null);
    if (text.length > 0) {
      console.log("Text preview (first 500 chars):", text.substring(0, 500));
      console.log("Text preview (last 200 chars):", text.substring(Math.max(0, text.length - 200)));
    } else {
      console.log("WARNING: NO TEXT EXTRACTED FROM PDF!");
      console.log("This might be a scanned/image-based PDF without extractable text.");
      console.log("Parsed object keys:", Object.keys(parsed));
      console.log("Parsed text type:", typeof parsed.text);
    }
    console.log("===== END PDF UPLOAD =====\n");

    fs.unlinkSync(pdfPath);

    // Try to generate embeddings for RAG if text is available
    // If embeddings aren't supported, we'll just use full text mode
    let sessionId = null;
    let chunksCount = 0;

    if (text.length > 0) {
      console.log(`\n===== ATTEMPTING TO GENERATE EMBEDDINGS FOR RAG =====`);

      // Test if embeddings are supported by trying one small chunk first
      const testChunk = text.substring(0, Math.min(100, text.length));
      console.log(`Testing embedding generation with llama embedding server...`);
      const testEmbedding = await getEmbedding(testChunk);

      if (testEmbedding && Array.isArray(testEmbedding) && testEmbedding.length > 0) {
        console.log("✓ Embeddings are supported, generating for all chunks...");
        // Smaller chunks (300 chars) for faster processing and less context
        // With 2 chunks × 300 chars = ~600 chars = ~150 tokens (very fast)
        const chunks = chunkText(text, 300, 75); // 300 char chunks with 75 char overlap
        console.log(`Created ${chunks.length} chunks from PDF text`);
        chunksCount = chunks.length;

        // Generate embeddings in parallel batches (much faster!)
        console.log(`Generating embeddings for ${chunks.length} chunks in parallel...`);
        const startTime = Date.now();

        // Process in larger batches for speed (embedding server can handle it)
        const batchSize = 20; // Increased from 10 for faster processing
        const validChunks = [];
        const validEmbeddings = [];

        for (let i = 0; i < chunks.length; i += batchSize) {
          const batch = chunks.slice(i, i + batchSize);
          const batchNum = Math.floor(i / batchSize) + 1;
          const totalBatches = Math.ceil(chunks.length / batchSize);
          const batchStartTime = Date.now();

          console.log(`Processing batch ${batchNum}/${totalBatches} (chunks ${i + 1}-${Math.min(i + batchSize, chunks.length)})...`);

          const batchEmbeddings = await Promise.allSettled(
            batch.map(chunk => getEmbedding(chunk))
          );

          let batchValid = 0;
          batchEmbeddings.forEach((result, idx) => {
            if (result.status === 'fulfilled' && result.value && Array.isArray(result.value) && result.value.length > 0) {
              validChunks.push(batch[idx]);
              validEmbeddings.push(result.value);
              batchValid++;
            } else if (result.status === 'rejected') {
              console.warn(`  ⚠️ Chunk ${i + idx + 1} embedding failed: ${result.reason?.message || 'unknown error'}`);
            }
          });

          const batchElapsed = ((Date.now() - batchStartTime) / 1000).toFixed(2);
          console.log(`  ✓ Batch ${batchNum} complete: ${batchValid}/${batch.length} valid (${batchElapsed}s)`);
        }

        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
        console.log(`✓ Generated ${validEmbeddings.length} embeddings in ${elapsed}s`);

        if (validChunks.length > 0) {
          sessionId = req.file.originalname.replace(/[^a-zA-Z0-9]/g, '_') + '_' + Date.now();
          documentStore.set(sessionId, {
            chunks: validChunks,
            embeddings: validEmbeddings,
            filename: req.file.originalname,
            text: text, // Keep full text as fallback
          });

          console.log(`✓ Stored ${validChunks.length} valid chunks with embeddings (session: ${sessionId})`);
        } else {
          console.warn("⚠️ No valid embeddings were generated. Using full text mode.");
        }
      } else {
        console.log("⚠️ Embeddings not supported by llama server. Using full text mode.");
        console.log("   To enable RAG, restart llama server with --embeddings flag");
      }

      console.log("===== END EMBEDDING GENERATION =====\n");
    }

    res.json({
      success: true,
      text,
      pages,
      filename: req.file.originalname,
      sessionId: sessionId,
      chunksCount: chunksCount,
    });
  } catch (e) {
    if (req.file) {
      try { fs.unlinkSync(req.file.path); } catch { }
    }
    res.status(500).json({ error: "Failed to process PDF: " + e.message });
  }
});

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${error.message}` });
  }
  if (error.message === "Only PDF files are allowed") {
    return res.status(400).json({ error: "Only PDF files are allowed" });
  }
  next(error);
});

// =============================
//  Q&A WITH STREAMING
// =============================
app.post("/api/ask", async (req, res) => {
  try {
    console.log("\n===== RAW REQUEST BODY =====");
    console.log("Body keys:", Object.keys(req.body));
    console.log("Body type:", typeof req.body);
    console.log("Body stringified length:", JSON.stringify(req.body).length);
    console.log("===== END RAW BODY =====\n");

    const { question, pdfText, sessionId } = req.body;
    if (!question) return res.status(400).json({ error: "Question required" });

    console.log("\n===== RECEIVED REQUEST =====");
    console.log("Question:", question);
    console.log("PDF text type:", typeof pdfText);
    console.log("PDF text length:", pdfText ? pdfText.length : 0);
    console.log("Session ID:", sessionId);
    console.log("===== END REQUEST =====\n");

    // Try to use RAG if we have embeddings, otherwise fall back to full text
    let relevantText = "";
    let chunkIndices = null; // Track which chunks are used for caching

    // Use RAG if available, otherwise fall back to full text
    if (sessionId && documentStore.has(sessionId)) {
      const doc = documentStore.get(sessionId);
      console.log(`\n🔎 RAG: Looking up session ${sessionId} (${doc.chunks?.length || 0} chunks available)`);

      const embeddingStartTime = Date.now();
      const queryEmbedding = await getEmbedding(question);
      const embeddingElapsed = ((Date.now() - embeddingStartTime) / 1000).toFixed(2);
      console.log(`⚡ Query embedding generated in ${embeddingElapsed}s`);

      if (queryEmbedding?.length > 0 && doc.embeddings?.length > 0) {
        // Retrieve only 2 most relevant chunks for speed
        // 2 chunks × 300 chars = ~600 chars = ~150 tokens (very fast, well under 2048 limit)
        const retrievalStartTime = Date.now();
        const topChunks = findRelevantChunks(queryEmbedding, doc, 2, 0.3); // Higher threshold for better quality
        const retrievalElapsed = ((Date.now() - retrievalStartTime) / 1000).toFixed(3);

        if (topChunks.length > 0) {
          // Sort by position in document to maintain context flow
          const sortedChunks = topChunks.sort((a, b) => a.index - b.index);
          relevantText = sortedChunks.map(c => c.chunk).join("\n\n---\n\n");
          const chunkIndices = sortedChunks.map(c => c.index);

          console.log(`✅ RAG: Selected ${topChunks.length} chunks in ${retrievalElapsed}s`);
          console.log(`   Similarities: ${topChunks.map(c => c.similarity.toFixed(3)).join(', ')}`);
          console.log(`   Chunk indices: ${chunkIndices.join(', ')}`);
          console.log(`   Context size: ${relevantText.length} chars (from ${doc.text.length} total)`);

          // Show preview of selected chunks
          topChunks.forEach((c, i) => {
            const preview = c.chunk.substring(0, 100).replace(/\n/g, ' ');
            console.log(`   Chunk ${i + 1} [${c.index}]: "${preview}..." (sim: ${c.similarity.toFixed(3)})`);
          });
        } else {
          // No chunks above threshold - try lower threshold with fewer chunks
          const fallbackChunks = findRelevantChunks(queryEmbedding, doc, 2, 0.15); // Lower threshold, 2 chunks max
          if (fallbackChunks.length > 0) {
            relevantText = fallbackChunks.map(c => c.chunk).join("\n\n---\n\n");
            console.log(`RAG: Using ${fallbackChunks.length} chunks with lower threshold (min: 0.15)`);
          } else {
            // Last resort: use first part of document (not full text to avoid context overflow)
            const maxFallbackLength = 5000; // ~1250 tokens
            relevantText = (doc.text || pdfText || "").substring(0, maxFallbackLength);
            console.log(`RAG: No chunks found, using first ${maxFallbackLength} chars of document`);
          }
        }
      } else {
        // Embeddings unavailable - use limited subset instead of full text
        const maxFallbackLength = 5000; // ~1250 tokens
        relevantText = (doc.text || pdfText || "").substring(0, maxFallbackLength);
        console.log(`RAG: Using first ${maxFallbackLength} chars (embeddings unavailable)`);
      }
    } else {
      // No sessionId or document not in store - limit pdfText to avoid context overflow
      const maxFallbackLength = 5000; // ~1250 tokens
      relevantText = pdfText ? pdfText.substring(0, maxFallbackLength) : "";
      console.log(`No RAG session found, using first ${maxFallbackLength} chars of pdfText`);
    }

    const prompt = buildPrompt(question, relevantText, sessionId, chunkIndices);

    console.log("\n===== PROMPT SENT TO LLAMA =====");
    console.log("Full prompt length:", prompt.length);
    console.log("Prompt preview (first 1000 chars):", prompt.substring(0, 1000));
    if (prompt.length > 1000) {
      console.log("Prompt preview (last 500 chars):", prompt.substring(Math.max(0, prompt.length - 500)));
    }
    console.log("Contains <begin_document>?", prompt.includes("<begin_document>"));
    console.log("===== END PROMPT =====\n");

    // Begin streaming response
    res.writeHead(200, {
      "Content-Type": "text/plain",
      "Transfer-Encoding": "chunked",
      "Access-Control-Allow-Origin": "*",
    });

    // Initialize state variables
    let hasWrittenData = false;
    let errorOccurred = false;
    let stderrBuffer = "";

    // Helper function to safely write error messages
    const writeError = (message) => {
      if (errorOccurred) return false; // Already sent an error
      try {
        if (!res.writableEnded && res.writable) {
          res.write(message);
          errorOccurred = true; // Mark that we've sent an error
          return true;
        }
      } catch (e) {
        console.error("Error writing error message:", e);
      }
      return false;
    };

    const curlArgs = buildCurlArgs(prompt, true);
    console.log("Executing curl with args:", curlArgs.join(" "));
    console.log("Target URL:", LLAMA_SERVER_URL);
    console.log("Prompt length:", prompt.length);
    const child = spawn("curl", curlArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

    // Set a timeout to detect if curl hangs
    // For large prompts, allow more time (5 minutes = 300 seconds)
    // Calculate timeout based on prompt size - larger prompts need more time
    const estimatedTokens = Math.ceil(prompt.length / 4);
    const timeoutDuration = estimatedTokens > 10000 ? 300000 : // 5 minutes for very large prompts
      estimatedTokens > 5000 ? 180000 :  // 3 minutes for large prompts
        120000; // 2 minutes for normal prompts

    console.log(`Setting timeout to ${timeoutDuration / 1000} seconds for prompt with ~${estimatedTokens} tokens`);

    const timeout = setTimeout(() => {
      if (!hasWrittenData && !errorOccurred) {
        console.error(`Curl request timed out after ${timeoutDuration / 1000} seconds`);
        errorOccurred = true;
        if (writeError(`ERROR: Request to model server timed out after ${timeoutDuration / 1000} seconds. Large documents may take longer to process.`)) {
          try {
            res.end();
          } catch (e) {
            console.error("Error ending response after timeout:", e);
          }
        }
        child.kill();
      }
    }, timeoutDuration);

    let stdoutBuffer = "";
    let sseBuffer = ""; // Buffer for accumulating SSE messages

    // Track last data time to detect stalled streams
    let lastDataTime = Date.now();
    const STALL_TIMEOUT = 120000; // 2 minutes without data = stalled
    
    const stallCheck = setInterval(() => {
      const timeSinceLastData = Date.now() - lastDataTime;
      if (timeSinceLastData > STALL_TIMEOUT && hasWrittenData && !errorOccurred) {
        console.warn(`Stream appears stalled - no data for ${Math.round(timeSinceLastData / 1000)}s`);
        // Don't kill it, just log - might be processing a large response
      }
    }, 30000); // Check every 30 seconds

    child.stdout.on("data", (chunk) => {
      if (errorOccurred) return;
      clearTimeout(timeout); // Reset timeout on data
      lastDataTime = Date.now(); // Update last data time

      const chunkStr = chunk.toString();
      stdoutBuffer += chunkStr;
      sseBuffer += chunkStr;

      console.log("Received stdout chunk (length:", chunkStr.length, "):", chunkStr.substring(0, 200));

      try {
        let foundContent = false;

        // Process complete SSE messages
        // SSE messages can end with \n\n or just be individual data: lines
        // First, try to process messages ending with \n\n
        let messageEnd;
        while ((messageEnd = sseBuffer.indexOf("\n\n")) !== -1) {
          const message = sseBuffer.substring(0, messageEnd + 2);
          sseBuffer = sseBuffer.substring(messageEnd + 2); // Remove processed message

          // Parse this complete message
          parseSSE(message, (token) => {
            if (token && token.length > 0) {
              foundContent = true;
              hasWrittenData = true;
              console.log("Parsed token:", token.substring(0, 100));
              res.write(token);
            }
          });
        }

        // Also process any complete data: lines (ending with single \n)
        // This handles the case where messages come one per line
        const lines = sseBuffer.split("\n");
        if (lines.length > 1) {
          // We have at least one complete line, process all complete lines
          let processedLines = "";
          let remainingLines = [];
          for (let i = 0; i < lines.length - 1; i++) {
            processedLines += lines[i] + "\n";
          }
          remainingLines.push(lines[lines.length - 1]); // Keep the last (possibly incomplete) line

          if (processedLines.length > 0) {
            sseBuffer = remainingLines.join("\n");
            parseSSE(processedLines, (token) => {
              if (token && token.length > 0) {
                foundContent = true;
                hasWrittenData = true;
                console.log("Parsed token from line-by-line:", token.substring(0, 100));
                res.write(token);
              }
            });
          }
        }

        // Also try parsing any remaining partial data (in case format is different)
        if (!foundContent && sseBuffer.length > 0) {
          parseSSE(sseBuffer, (token) => {
            if (token && token.length > 0) {
              foundContent = true;
              hasWrittenData = true;
              console.log("Parsed token from partial buffer:", token.substring(0, 100));
              res.write(token);
            }
          });
        }

        if (!foundContent && chunkStr.length > 0) {
          console.log("Warning: Received data but parseSSE found no content. Raw chunk preview:", chunkStr.substring(0, 500));
          console.log("Current SSE buffer length:", sseBuffer.length);
        }
      } catch (parseError) {
        console.error("Error parsing SSE:", parseError);
        console.error("Chunk that caused error:", chunkStr.substring(0, 500));
        if (!errorOccurred) {
          errorOccurred = true;
          clearTimeout(timeout);
          if (writeError("ERROR: Failed to parse response from model server")) {
            try {
              res.end();
            } catch (e) {
              console.error("Error ending response after parse error:", e);
            }
          }
        }
      }
    });

    child.stderr.on("data", (chunk) => {
      const chunkStr = chunk.toString();
      stderrBuffer += chunkStr;
      console.error("Curl stderr chunk:", chunkStr);

      // Filter out curl progress messages - look for actual errors
      // Curl errors typically contain "curl:" or "Failed to" or error codes
      const hasError = chunkStr.includes("curl:") || chunkStr.includes("Failed to") ||
        chunkStr.match(/\([0-9]+\)/);

      if (hasError) {
        // This looks like an actual error, not just progress
        if (!errorOccurred && !hasWrittenData) {
          clearTimeout(timeout);
          // Extract just the error message, not progress info
          const errorMatch = stderrBuffer.match(/curl:\s*\([0-9]+\)\s*(.+?)(?:\n|$)/);
          let errorMsg = "Connection to model server failed";
          if (errorMatch) {
            errorMsg = errorMatch[1].trim();
          } else {
            // Try to find error line in buffer
            const errorLine = stderrBuffer.split('\n').find(line =>
              line.includes("curl:") || line.includes("Failed to")
            );
            if (errorLine) {
              const match = errorLine.match(/curl:\s*\([0-9]+\)\s*(.+)/);
              errorMsg = match ? match[1].trim() : errorLine.replace(/curl:\s*\([0-9]+\)\s*/, "").trim();
            }
          }
          console.error("Sending error to client:", errorMsg);
          if (writeError(`ERROR: ${errorMsg}`)) {
            try {
              res.end();
            } catch (e) {
              console.error("Error ending response after stderr error:", e);
            }
          }
        }
      }
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      clearInterval(stallCheck); // Clear stall check interval
      console.log(`Curl process closed with code ${code}, hasWrittenData: ${hasWrittenData}, errorOccurred: ${errorOccurred}`);
      console.log("Total stdout buffer length:", stdoutBuffer.length);
      console.log("Remaining SSE buffer length:", sseBuffer.length);
      
      // If curl exited with non-zero code and we haven't written data, it's an error
      if (code !== 0 && !hasWrittenData && !errorOccurred) {
        console.error(`Curl exited with error code ${code}`);
        const errorMsg = stderrBuffer || `Process exited with code ${code}`;
        if (writeError(`ERROR: Model server connection failed: ${errorMsg}`)) {
          try {
            res.end();
          } catch (e) {
            console.error("Error ending response after curl error:", e);
          }
          return;
        }
      }

      // Process any remaining data in the SSE buffer
      if (sseBuffer.length > 0 && !errorOccurred) {
        console.log("Processing remaining SSE buffer (full content):", sseBuffer);
        try {
          parseSSE(sseBuffer, (token) => {
            if (token && token.length > 0) {
              hasWrittenData = true;
              console.log("Parsed final token:", token.substring(0, 100));
              res.write(token);
            }
          });
        } catch (e) {
          console.error("Error parsing final SSE buffer:", e);
        }
      }

      // Log full response if it's small enough, or show preview if large
      if (stdoutBuffer.length > 0) {
        if (stdoutBuffer.length < 2000) {
          console.log("=== FULL STDOUT BUFFER ===");
          console.log(stdoutBuffer);
          console.log("=== END STDOUT BUFFER ===");
        } else {
          console.log("Stdout buffer preview (first 1000):", stdoutBuffer.substring(0, 1000));
          console.log("Stdout buffer preview (last 1000):", stdoutBuffer.substring(Math.max(0, stdoutBuffer.length - 1000)));
        }

        // Try to parse as regular JSON if it's not SSE format
        if (!hasWrittenData && stdoutBuffer.trim().startsWith("{")) {
          console.log("Attempting to parse as regular JSON (non-SSE format)");
          try {
            const json = JSON.parse(stdoutBuffer.trim());
            console.log("Parsed as JSON, keys:", Object.keys(json));

            // Check if it's an error response
            if (json.error) {
              const errorMsg = json.error.message || "Model server error";
              const errorCode = json.error.code || "unknown";
              const errorType = json.error.type || "unknown";
              console.error(`Model server error: ${errorCode} - ${errorType} - ${errorMsg}`);

              // Provide helpful message for context size errors
              if (errorType === "exceed_context_size_error" || errorMsg.includes("context size")) {
                const nPrompt = json.error.n_prompt_tokens || "unknown";
                const nCtx = json.error.n_ctx || "unknown";
                const helpfulMsg = `Context window exceeded. Prompt: ${nPrompt} tokens, Limit: ${nCtx} tokens. Try reducing the number of RAG chunks or increase context size.`;
                if (writeError(`ERROR: ${helpfulMsg}`)) {
                  return; // Error sent, don't continue
                }
              } else {
                if (writeError(`ERROR: ${errorMsg}`)) {
                  return; // Error sent, don't continue
                }
              }
            } else if (json.content) {
              hasWrittenData = true;
              res.write(String(json.content));
            }
          } catch (e) {
            console.log("Not valid JSON:", e.message);
          }
        }
      }

      if (!errorOccurred && !hasWrittenData) {
        // No data was written and no error was sent - we need to send an error
        let errorMsg = "No response received from model server";

        if (code !== 0) {
          // Curl exited with error - try to extract error from stderr
          if (stderrBuffer) {
            const errorMatch = stderrBuffer.match(/curl:\s*\([0-9]+\)\s*(.+?)(?:\n|$)/);
            if (errorMatch) {
              errorMsg = errorMatch[1].trim();
            } else {
              // Look for any error line
              const errorLine = stderrBuffer.split('\n').find(line =>
                line.includes("curl:") || line.includes("Failed to")
              );
              if (errorLine) {
                const match = errorLine.match(/curl:\s*\([0-9]+\)\s*(.+)/);
                errorMsg = match ? match[1].trim() : errorLine.replace(/curl:\s*\([0-9]+\)\s*/, "").trim();
              } else if (stderrBuffer.trim()) {
                errorMsg = stderrBuffer.trim().split('\n').pop() || stderrBuffer.trim();
              }
            }
          }
          errorMsg = `Connection failed: ${errorMsg}`;
        } else if (code === 0) {
          if (stdoutBuffer.length > 0) {
            // Try one more time to parse the entire buffer as SSE
            console.log("Final attempt to parse entire stdout buffer as SSE");
            let finalParseFoundContent = false;
            parseSSE(stdoutBuffer, (token) => {
              if (token && token.length > 0) {
                finalParseFoundContent = true;
                hasWrittenData = true;
                console.log("Found content in final parse:", token.substring(0, 100));
                res.write(token);
              }
            });

            if (!finalParseFoundContent) {
              // Include the actual response in the error for debugging
              const responsePreview = stdoutBuffer.length < 1000
                ? stdoutBuffer
                : stdoutBuffer.substring(0, 1000) + "...";
              errorMsg = `Model server returned response but no content was parsed. Response length: ${stdoutBuffer.length}. First 1000 chars: ${responsePreview}`;
              console.error("=== FULL RESPONSE THAT COULDN'T BE PARSED ===");
              console.error(stdoutBuffer);
              console.error("=== END RESPONSE ===");
            } else {
              // We found content, so don't send error
              return;
            }
          } else {
            errorMsg = "Model server returned empty response";
          }
        }

        console.error("Sending error on close:", errorMsg);
        if (writeError(`ERROR: ${errorMsg}`)) {
          // Error was written successfully
        } else {
          console.error("Could not write error - response may already be closed");
        }
      }

      // Always try to end the response
      try {
        if (!res.writableEnded && res.writable) {
          // If we wrote data but stream ended unexpectedly, log it
          if (hasWrittenData && code !== 0) {
            console.warn(`Stream ended unexpectedly (code ${code}) but data was written`);
          }
          res.end();
        }
      } catch (e) {
        console.error("Error ending response:", e);
      }
    });

    child.on("error", (err) => {
      clearTimeout(timeout);
      console.error("Curl spawn error:", err);
      if (!errorOccurred) {
        errorOccurred = true;
        if (writeError(`ERROR: Failed to start request: ${err.message}`)) {
          try {
            res.end();
          } catch (e) {
            console.error("Error ending response after spawn error:", e);
          }
        }
      }
    });

  } catch (e) {
    res.status(500).send("ERROR: " + e.message);
  }
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend running → http://0.0.0.0:${PORT}`);
  console.log(`Llama server → ${LLAMA_SERVER_URL}`);
  console.log(`Embedding server → ${EMBEDDING_SERVER_URL}`);
  console.log(`  (Use GGUF embedding model like Mungert/all-MiniLM-L6-v2-GGUF)`);
});
