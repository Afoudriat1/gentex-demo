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
function buildPrompt(question, pdfText = "") {
  const systemMessage = "Use the following document to answer the question provided. Assume no knowledge outside the document. Do NOT make inferences not supported by the document.";

  let userMessage = "";

  if (pdfText.trim().length > 0) {
    userMessage = `<begin_document>\n\n${pdfText}\n\n<end_document>\n\nQuestion:\n${question}`;
  } else {
    userMessage = question;
  }

  return (
    `<|im_start|>system\n` +
    `\n${systemMessage}\n` +
    `<|im_end|>\n` +
    `<|im_start|>user\n` +
    `\n${userMessage}\n` +
    `<|im_end|>\n` +
    `<|im_start|>assistant\n`
  );
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

  if (stream) args.push("--no-buffer");
  return args;
}

// =============================
//  SSE PARSER (for llama.cpp stream)
// =============================
function parseSSE(chunk, callback) {
  const lines = chunk.toString().split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      try {
        const json = JSON.parse(line.substring(6));
        if (json.content) callback(json.content);
      } catch { }
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

    res.json({
      success: true,
      text,
      pages,
      filename: req.file.originalname,
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

    const { question, pdfText } = req.body;
    if (!question) return res.status(400).json({ error: "Question required" });

    console.log("\n===== RECEIVED REQUEST =====");
    console.log("Question:", question);
    console.log("PDF text type:", typeof pdfText);
    console.log("PDF text is undefined?", pdfText === undefined);
    console.log("PDF text is null?", pdfText === null);
    console.log("PDF text length:", pdfText ? pdfText.length : 0);
    console.log("PDF text is empty?", !pdfText || pdfText.trim().length === 0);
    if (pdfText && pdfText.length > 0) {
      console.log("PDF text preview (first 500 chars):", pdfText.substring(0, 500));
      console.log("PDF text preview (last 200 chars):", pdfText.substring(Math.max(0, pdfText.length - 200)));
    } else {
      console.log("WARNING: NO PDF TEXT RECEIVED!");
    }
    console.log("===== END REQUEST =====\n");

    const prompt = buildPrompt(question, pdfText || "");

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

    const curlArgs = buildCurlArgs(prompt, true);
    const child = spawn("curl", curlArgs, { stdio: ['pipe', 'pipe', 'pipe'] });

    child.stdout.on("data", (chunk) => {
      parseSSE(chunk, (token) => res.write(token));
    });

    child.on("close", () => res.end());
    child.on("error", () => res.end("ERROR: failed to stream"));

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
});
