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

const EMBEDDING_SERVER_URL = process.env.EMBEDDING_SERVER_URL || "http://localhost:8081";
const MAX_PDF_PAGES = parseInt(process.env.MAX_PDF_PAGES || "50", 10);

const documentStore = new Map();
const promptCache = new Map();

function chunkText(text, chunkSize = 400, overlap = 80) {
  const chunks = [];
  const sentences = text.split(/([.!?]\s+)/);
  let currentChunk = '';

  for (let i = 0; i < sentences.length; i++) {
    const sentence = sentences[i];
    const potentialChunk = currentChunk + sentence;

    if (potentialChunk.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      const words = currentChunk.trim().split(/\s+/);
      const overlapWords = Math.floor(overlap / 10);
      currentChunk = words.slice(-overlapWords).join(' ') + ' ' + sentence;
    } else {
      currentChunk = potentialChunk;
    }
  }

  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }

  if (chunks.length === 0 || chunks.every(c => c.length < 50)) {
    for (let i = 0; i < text.length; i += chunkSize - overlap) {
      chunks.push(text.slice(i, i + chunkSize).trim());
    }
  }

  return chunks.filter(c => c.length > 20);
}

async function getEmbedding(text) {
  if (!text || text.trim().length === 0) {
    return null;
  }

  try {
    const embeddingUrl = EMBEDDING_SERVER_URL || LLAMA_SERVER_URL;
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


function cosineSimilarity(a, b) {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
  }
  return dot;
}

function findRelevantChunks(queryEmbedding, documentData, topK = 3, minSimilarity = 0.25, queryKeywords = []) {
  if (!queryEmbedding || !documentData?.embeddings?.length) return [];

  const similarities = documentData.chunks.map((chunk, i) => {
    let similarity = cosineSimilarity(queryEmbedding, documentData.embeddings[i]);

    if (queryKeywords.length > 0) {
      const chunkLower = chunk.toLowerCase();
      const keywordMatches = queryKeywords.filter(kw => chunkLower.includes(kw.toLowerCase())).length;
      if (keywordMatches > 0) {
        similarity += keywordMatches * 0.1;
      }
    }

    return {
      chunk,
      similarity: Math.min(similarity, 1.0),
      index: i
    };
  });

  return similarities
    .filter(item => item.similarity >= minSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

app.use(cors());
app.use(express.json({ limit: '50mb' }));

app.use((req, res, next) => {
  console.log(`\n[${new Date().toISOString()}] ${req.method} ${req.path}`);
  if (req.method === 'POST') {
    console.log('Content-Type:', req.headers['content-type']);
    console.log('Content-Length:', req.headers['content-length']);
  }
  next();
});
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

function buildPrompt(question, pdfText = "", sessionId = null, chunkIndices = []) {
  const systemMessage = "Use the following document to answer the question provided. Be concise and direct - provide only the essential information needed to answer the question. Avoid unnecessary elaboration, background explanations, or verbose descriptions. Assume no knowledge outside the document. Do NOT make inferences not supported by the document.";

  // With RAG, pdfText is already just the relevant chunks (typically 2 chunks of ~300 chars each)
  // This keeps us well under the 2048 token limit (~150 tokens for chunks + ~200 for system/question)

  let promptPrefix = null;
  if (sessionId && chunkIndices && chunkIndices.length > 0 && promptCache.has(sessionId)) {
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

    if (sessionId && chunkIndices && chunkIndices.length > 0 && !promptPrefix) {
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
      : `${documentPart}\n\nQuestion:\n${question}`;
  } else {
    userMessage = question;
  }

  const prompt = promptPrefix && pdfText
    ? `${promptPrefix}${question}<|im_end|>\n<|im_start|>assistant\n`
    : (
      `<|im_start|>system\n` +
      `\n${systemMessage}\n` +
      `<|im_end|>\n` +
      `<|im_start|>user\n` +
      `\n${userMessage}\n` +
      `<|im_end|>\n` +
      `<|im_start|>assistant\n`
    );

  const estimatedTokens = Math.ceil(prompt.length / 4);
  console.log(`Prompt size: ${prompt.length} characters (~${estimatedTokens} tokens)`);

  if (estimatedTokens > 1800) {
    console.warn(`⚠️ WARNING: Prompt approaching context limit (~${estimatedTokens} tokens, limit: 2048). Consider reducing RAG chunks.`);
  }

  return prompt;
}

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
    args.push("--no-buffer", "--max-time", "300");
  }
  return args;
}

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
    if (pages > MAX_PDF_PAGES) {
      fs.unlinkSync(pdfPath);
      return res.status(400).json({
        error: `PDF has ${pages} pages. Max allowed is ${MAX_PDF_PAGES}.`,
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

    let sessionId = null;
    let chunksCount = 0;

    if (text.length > 0) {
      const testChunk = text.substring(0, Math.min(100, text.length));
      const testEmbedding = await getEmbedding(testChunk);

      if (testEmbedding && Array.isArray(testEmbedding) && testEmbedding.length > 0) {
        const chunks = chunkText(text, 400, 80);
        chunksCount = chunks.length;

        const startTime = Date.now();
        const batchSize = 20;
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

    let relevantText = "";
    let chunkIndices = [];
    let ragChunks = []; // Store actual chunks for frontend display

    if (sessionId && documentStore.has(sessionId)) {
      const doc = documentStore.get(sessionId);
      console.log(`\n🔎 RAG: Looking up session ${sessionId} (${doc.chunks?.length || 0} chunks available)`);

      const embeddingStartTime = Date.now();
      const queryEmbedding = await getEmbedding(question);
      const embeddingElapsed = ((Date.now() - embeddingStartTime) / 1000).toFixed(2);
      console.log(`⚡ Query embedding generated in ${embeddingElapsed}s`);

      if (queryEmbedding?.length > 0 && doc.embeddings?.length > 0) {
        const retrievalStartTime = Date.now();
        const queryWords = question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        const topChunks = findRelevantChunks(queryEmbedding, doc, 3, 0.25, queryWords);
        const retrievalElapsed = ((Date.now() - retrievalStartTime) / 1000).toFixed(3);

        if (topChunks.length > 0) {
          const sortedChunks = topChunks.sort((a, b) => a.index - b.index);
          relevantText = sortedChunks.map(c => c.chunk).join("\n\n---\n\n");
          chunkIndices = sortedChunks.map(c => c.index);
          ragChunks = sortedChunks.map(c => ({
            index: c.index,
            text: c.chunk,
            similarity: c.similarity
          }));

          console.log(`✅ RAG: Selected ${topChunks.length} chunks in ${retrievalElapsed}s`);
          console.log(`   Similarities: ${topChunks.map(c => c.similarity.toFixed(3)).join(', ')}`);
          console.log(`   Context: ${relevantText.length} chars (~${Math.ceil(relevantText.length / 4)} tokens)`);
        } else {
          const fallbackChunks = findRelevantChunks(queryEmbedding, doc, 3, 0.15, queryWords);
          if (fallbackChunks.length > 0) {
            relevantText = fallbackChunks.map(c => c.chunk).join("\n\n---\n\n");
            chunkIndices = fallbackChunks.map(c => c.index);
            ragChunks = fallbackChunks.map(c => ({
              index: c.index,
              text: c.chunk,
              similarity: c.similarity
            }));
            console.log(`RAG: Using ${fallbackChunks.length} chunks (lower threshold)`);
          } else {
            const maxFallbackLength = 4000;
            relevantText = (doc.text || pdfText || "").substring(0, maxFallbackLength);
            console.log(`RAG: No chunks found, using first ${maxFallbackLength} chars`);
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

    // Send RAG chunk metadata as first message (if available)
    if (ragChunks.length > 0 || relevantText) {
      const metadata = JSON.stringify({
        type: "rag_metadata",
        chunks: ragChunks,
        query: question,
        formattedContext: relevantText || ""
      });
      try {
        console.log(`📤 Sending RAG metadata with ${ragChunks.length} chunks`);
        res.write(`data: ${metadata}\n\n`);
      } catch (e) {
        console.error("Error writing RAG metadata:", e);
      }
    } else {
      console.log("⚠️ No RAG chunks to send (ragChunks.length =", ragChunks.length, ")");
    }

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

    let lastDataTime = Date.now();
    const STALL_TIMEOUT = 120000;

    const stallCheck = setInterval(() => {
      const timeSinceLastData = Date.now() - lastDataTime;
      if (timeSinceLastData > STALL_TIMEOUT && hasWrittenData && !errorOccurred) {
        console.warn(`Stream appears stalled - no data for ${Math.round(timeSinceLastData / 1000)}s`);
      }
    }, 30000);

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

        let messageEnd;
        while ((messageEnd = sseBuffer.indexOf("\n\n")) !== -1) {
          const message = sseBuffer.substring(0, messageEnd + 2);
          sseBuffer = sseBuffer.substring(messageEnd + 2);

          parseSSE(message, (token) => {
            if (token && token.length > 0) {
              foundContent = true;
              hasWrittenData = true;
              console.log("Parsed token:", token.substring(0, 100));
              res.write(token);
            }
          });
        }

        const lines = sseBuffer.split("\n");
        if (lines.length > 1) {
          let processedLines = "";
          let remainingLines = [];
          for (let i = 0; i < lines.length - 1; i++) {
            processedLines += lines[i] + "\n";
          }
          remainingLines.push(lines[lines.length - 1]);

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

      const hasError = chunkStr.includes("curl:") || chunkStr.includes("Failed to") ||
        chunkStr.match(/\([0-9]+\)/);

      if (hasError) {
        if (!errorOccurred && !hasWrittenData) {
          clearTimeout(timeout);
          const errorMatch = stderrBuffer.match(/curl:\s*\([0-9]+\)\s*(.+?)(?:\n|$)/);
          let errorMsg = "Connection to model server failed";
          if (errorMatch) {
            errorMsg = errorMatch[1].trim();
          } else {
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
      clearInterval(stallCheck);
      console.log(`Curl process closed with code ${code}, hasWrittenData: ${hasWrittenData}, errorOccurred: ${errorOccurred}`);
      console.log("Total stdout buffer length:", stdoutBuffer.length);
      console.log("Remaining SSE buffer length:", sseBuffer.length);

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

      if (stdoutBuffer.length > 0) {
        if (stdoutBuffer.length < 2000) {
          console.log("=== FULL STDOUT BUFFER ===");
          console.log(stdoutBuffer);
          console.log("=== END STDOUT BUFFER ===");
        } else {
          console.log("Stdout buffer preview (first 1000):", stdoutBuffer.substring(0, 1000));
          console.log("Stdout buffer preview (last 1000):", stdoutBuffer.substring(Math.max(0, stdoutBuffer.length - 1000)));
        }

        if (!hasWrittenData && stdoutBuffer.trim().startsWith("{")) {
          try {
            const json = JSON.parse(stdoutBuffer.trim());

            if (json.error) {
              const errorMsg = json.error.message || "Model server error";
              const errorCode = json.error.code || "unknown";
              const errorType = json.error.type || "unknown";
              console.error(`Model server error: ${errorCode} - ${errorType} - ${errorMsg}`);

              if (errorType === "exceed_context_size_error" || errorMsg.includes("context size")) {
                const nPrompt = json.error.n_prompt_tokens || "unknown";
                const nCtx = json.error.n_ctx || "unknown";
                const helpfulMsg = `Context window exceeded. Prompt: ${nPrompt} tokens, Limit: ${nCtx} tokens. Try reducing the number of RAG chunks or increase context size.`;
                if (writeError(`ERROR: ${helpfulMsg}`)) {
                  return;
                }
              } else {
                if (writeError(`ERROR: ${errorMsg}`)) {
                  return;
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
        let errorMsg = "No response received from model server";

        if (code !== 0) {
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
              const responsePreview = stdoutBuffer.length < 1000
                ? stdoutBuffer
                : stdoutBuffer.substring(0, 1000) + "...";
              errorMsg = `Model server returned response but no content was parsed. Response length: ${stdoutBuffer.length}. First 1000 chars: ${responsePreview}`;
              console.error("=== FULL RESPONSE THAT COULDN'T BE PARSED ===");
              console.error(stdoutBuffer);
              console.error("=== END RESPONSE ===");
            } else {
              return;
            }
          } else {
            errorMsg = "Model server returned empty response";
          }
        }

        console.error("Sending error on close:", errorMsg);
        writeError(`ERROR: ${errorMsg}`);
      }

      try {
        if (!res.writableEnded && res.writable) {
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
