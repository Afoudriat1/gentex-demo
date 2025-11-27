import React, { useState, useEffect } from 'react';
import './App.css';
import API_BASE_URL from './config';

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState([]);
  const [pdfText, setPdfText] = useState(() => {
    // Load PDF text from localStorage on mount
    const saved = localStorage.getItem('pdfText');
    return saved || '';
  });
  const [sessionId, setSessionId] = useState(() => {
    // Load sessionId from localStorage on mount
    const saved = localStorage.getItem('sessionId');
    return saved || null;
  });
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState(null);

  useEffect(() => {
    localStorage.removeItem('chatHistory');
  }, []);

  // Persist PDF text to localStorage whenever it changes
  useEffect(() => {
    if (pdfText) {
      localStorage.setItem('pdfText', pdfText);
    } else {
      localStorage.removeItem('pdfText');
    }
  }, [pdfText]);

  useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();

      recognitionInstance.continuous = false;
      recognitionInstance.interimResults = false;
      recognitionInstance.lang = 'en-US';

      recognitionInstance.onstart = () => setIsListening(true);
      recognitionInstance.onresult = (event) => {
        setQuestion(event.results[0][0].transcript);
        setIsListening(false);
      };
      recognitionInstance.onerror = () => setIsListening(false);
      recognitionInstance.onend = () => setIsListening(false);

      setRecognition(recognitionInstance);
    }
  }, []);

  const startListening = () => {
    if (recognition && !isListening) {
      recognition.start();
    }
  };

  const stopListening = () => {
    if (recognition && isListening) {
      recognition.stop();
    }
  };

  const clearHistory = () => {
    setHistory([]);
  };

  // Parse answer text to extract thinking sections and main content
  const parseAnswer = (text) => {
    if (!text) return { mainContent: '', thinkingSections: [] };

    const thinkingSections = [];
    let mainContent = text;

    // Match various thinking tag formats
    // Handles: <think>...</think>, <think>...</think>, <think>...</think>, etc.
    const thinkingPatterns = [
      /<think>(.*?)<\/think>/gis,
      /<think>(.*?)<\/redacted_reasoning>/gis,
      /<think>(.*?)<\/redacted_reasoning>/gis,
      /<reasoning>(.*?)<\/reasoning>/gis,
      /<thinking>(.*?)<\/thinking>/gis,
    ];

    thinkingPatterns.forEach((pattern, index) => {
      const matches = [...text.matchAll(pattern)];
      matches.forEach((match, matchIndex) => {
        const fullMatch = match[0];
        const content = match[1];
        const id = `thinking-${index}-${matchIndex}`;

        thinkingSections.push({
          id,
          content: content.trim(),
          fullMatch,
        });

        // Remove the thinking section from main content
        mainContent = mainContent.replace(fullMatch, `[THINKING_${id}]`);
      });
    });

    // Clean up any remaining placeholders
    thinkingSections.forEach((section) => {
      mainContent = mainContent.replace(`[THINKING_${section.id}]`, '');
    });

    return {
      mainContent: mainContent.trim(),
      thinkingSections,
    };
  };


  const clearDocument = () => {
    setPdfText('');
    setSessionId(null);
    setSelectedFile(null);
    setUploadStatus('');
    localStorage.removeItem('pdfText');
    localStorage.removeItem('sessionId');
    console.log('Document cleared from state and localStorage');
  };

  const handleFileChange = async (event) => {
    console.log('handleFileChange called!');
    console.log('Event:', event);
    console.log('Files:', event.target.files);

    const file = event.target.files[0];
    console.log('Selected file:', file);

    if (file) {
      console.log('File type:', file.type);
      console.log('File name:', file.name);
      console.log('File size:', file.size);
    }

    if (file && file.type === 'application/pdf') {
      console.log('PDF file selected, setting selectedFile state');
      setSelectedFile(file);
      setUploadStatus(`Selected: ${file.name}`);
      // Automatically trigger upload when PDF is selected
      // We'll call handleUpload after setting the state
      setTimeout(async () => {
        await handleUploadForFile(file);
      }, 0);
    } else {
      console.log('Invalid file type or no file selected');
      setUploadStatus('Please select a PDF file');
    }
  };

  const handleUploadForFile = async (fileToUpload) => {
    console.log('handleUploadForFile called!');
    console.log('fileToUpload:', fileToUpload);

    if (!fileToUpload) {
      console.error('No file provided');
      setUploadStatus('Please select a file first');
      return;
    }

    console.log('=== STARTING UPLOAD ===');
    console.log('File:', fileToUpload.name, 'Size:', fileToUpload.size);
    console.log('API_BASE_URL:', API_BASE_URL);
    console.log('Upload URL:', `${API_BASE_URL}/api/upload`);

    setUploadStatus('Uploading...');
    const formData = new FormData();
    formData.append('pdf', fileToUpload);

    try {
      console.log('Sending upload request...');
      const response = await fetch(`${API_BASE_URL}/api/upload`, {
        method: 'POST',
        body: formData,
      });

      console.log('Upload response status:', response.status, response.statusText);
      console.log('Upload response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload failed, response body:', errorText);
        throw new Error(`Upload failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json();
      console.log('Upload response:', { success: data.success, hasText: !!data.text, textLength: data.text?.length });

      if (data.success) {
        const textLength = data.text ? data.text.length : 0;
        console.log('PDF uploaded successfully, text length:', textLength);
        console.log('PDF text preview (first 300 chars):', data.text ? data.text.substring(0, 300) : 'NO TEXT');

        if (!data.text) {
          console.error('ERROR: Response missing text field!', data);
          setUploadStatus(`Upload failed: No text in response`);
          return;
        }

        if (textLength === 0) {
          console.error('WARNING: PDF uploaded but no text extracted!');
          setUploadStatus(`Uploaded but no text extracted from PDF: ${data.filename}`);
          setPdfText(''); // Clear any old text
        } else {
          const textToStore = String(data.text); // Ensure it's a string
          console.log('Storing PDF text, length:', textToStore.length);
          setPdfText(textToStore);

          // Store sessionId if available (for RAG)
          if (data.sessionId) {
            setSessionId(data.sessionId);
            localStorage.setItem('sessionId', data.sessionId);
            console.log('Session ID stored:', data.sessionId, `(${data.chunksCount} chunks with embeddings)`);
            setUploadStatus(`Successfully uploaded: ${data.filename} (${data.pages} pages, ${textLength} chars, ${data.chunksCount} chunks for RAG)`);
          } else {
            setUploadStatus(`Successfully uploaded: ${data.filename} (${data.pages} pages, ${textLength} chars)`);
          }

          console.log('PDF text stored in state and localStorage');
        }
      } else {
        setUploadStatus(data.error || 'Upload failed');
        setPdfText(''); // Clear on failure
      }
    } catch (error) {
      console.error('Upload error:', error);
      console.error('Error details:', error.message, error.stack);
      setUploadStatus(`Upload failed: ${error.message}`);
    }
    console.log('=== END UPLOAD ===');
  };

  const updateHistoryItem = (id, updates) => {
    setHistory((prev) => prev.map(item =>
      item.id === id ? { ...item, ...updates } : item
    ));
  };

  const handleQuestionSubmit = async (e) => {
    e.preventDefault();
    if (!question.trim()) return;

    const currentQuestion = question;
    const newItem = {
      id: Date.now(),
      question: currentQuestion,
      answer: '',
      timestamp: new Date().toLocaleString(),
      isStreaming: true
    };
    setHistory((prev) => [newItem, ...prev]);
    setQuestion('');

    try {
      // Get current PDF text from state, fallback to localStorage
      let pdfTextToSend = pdfText || '';
      let pdfTextSource = 'state';
      if (pdfTextToSend.length === 0) {
        const savedText = localStorage.getItem('pdfText');
        if (savedText && savedText.length > 0) {
          console.log('⚠️ WARNING: PDF text recovered from localStorage (from previous session), length:', savedText.length);
          setPdfText(savedText);
          pdfTextToSend = savedText;
          pdfTextSource = 'localStorage (previous session)';
        }
      }

      console.log('=== SENDING QUESTION ===');
      console.log('Question:', currentQuestion);
      console.log('PDF text source:', pdfTextSource);
      console.log('PDF text from state length:', pdfText.length);
      console.log('PDF text from localStorage length:', localStorage.getItem('pdfText')?.length || 0);
      console.log('PDF text to send length:', pdfTextToSend.length);
      if (pdfTextToSend.length > 0) {
        console.log('PDF text preview (first 300 chars):', pdfTextToSend.substring(0, 300));
        console.warn('⚠️ PDF text will be sent with question (from ' + pdfTextSource + ')');
      } else {
        console.log('PDF text is empty - question will be sent without document context');
      }
      console.log('=== END SENDING QUESTION ===');

      // Get sessionId from state or localStorage
      let sessionIdToSend = sessionId || localStorage.getItem('sessionId') || null;

      const requestBody = {
        question: currentQuestion,
        pdfText: pdfTextToSend, // Keep as fallback
        sessionId: sessionIdToSend // Send sessionId for RAG
      };

      if (sessionIdToSend) {
        console.log('Using RAG with sessionId:', sessionIdToSend);
      } else {
        console.log('No sessionId available, using full PDF text');
      }

      console.log('\n=== REQUEST TO BACKEND ===');
      console.log('URL:', `${API_BASE_URL}/api/ask`);
      console.log('Method: POST');
      console.log('Headers:', {
        'Content-Type': 'application/json',
      });
      console.log('Body:', JSON.stringify(requestBody, null, 2));
      console.log('Body (parsed):', requestBody);
      console.log('Question length:', currentQuestion.length);
      console.log('PDF text length:', pdfTextToSend.length);
      console.log('=== END REQUEST TO BACKEND ===\n');
      console.log('🔍 API_BASE_URL from config:', API_BASE_URL);
      console.log('🔍 Full request URL will be:', `${API_BASE_URL}/api/ask`);

      const response = await fetch(`${API_BASE_URL}/api/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Network response was not ok: ${response.status} ${response.statusText} - ${errorText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8', { fatal: false });
      let streamingAnswer = '';
      let hasReceivedData = false;
      let lastDataTime = Date.now();
      const STREAM_TIMEOUT = 300000; // 5 minutes max timeout
      const DATA_TIMEOUT = 60000; // 1 minute without data = connection issue

      // Set up timeout to detect if streaming stops
      const streamTimeout = setTimeout(() => {
        console.error('Stream timeout - no data received for too long');
        reader.cancel().catch(() => { });
        updateHistoryItem(newItem.id, {
          answer: streamingAnswer + '\n\n⚠️ Stream stopped unexpectedly. The response may be incomplete.',
          isStreaming: false
        });
      }, STREAM_TIMEOUT);

      // Set up data timeout to detect if connection is dead
      let dataTimeout;
      const resetDataTimeout = () => {
        clearTimeout(dataTimeout);
        dataTimeout = setTimeout(() => {
          if (Date.now() - lastDataTime > DATA_TIMEOUT) {
            console.error('Data timeout - connection appears dead');
            reader.cancel().catch(() => { });
            updateHistoryItem(newItem.id, {
              answer: streamingAnswer + '\n\n⚠️ Connection lost. The response may be incomplete.',
              isStreaming: false
            });
          }
        }, DATA_TIMEOUT);
      };
      resetDataTimeout();

      try {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            clearTimeout(streamTimeout);
            clearTimeout(dataTimeout);
            // Flush any remaining buffered data
            const remaining = decoder.decode();
            if (remaining) {
              streamingAnswer += remaining;
              updateHistoryItem(newItem.id, { answer: streamingAnswer });
            }
            break;
          }

          if (value && value.length > 0) {
            hasReceivedData = true;
            lastDataTime = Date.now();
            resetDataTimeout(); // Reset timeout on data received

            const decoded = decoder.decode(value, { stream: true });
            streamingAnswer += decoded;
            updateHistoryItem(newItem.id, { answer: streamingAnswer });
          }
        }

        if (!hasReceivedData && streamingAnswer.length === 0) {
          throw new Error('No data received from server');
        }

        updateHistoryItem(newItem.id, { isStreaming: false });
      } catch (streamError) {
        clearTimeout(streamTimeout);
        clearTimeout(dataTimeout);
        console.error('Streaming error:', streamError);

        // Check if we have partial data
        if (streamingAnswer.length > 0) {
          updateHistoryItem(newItem.id, {
            answer: streamingAnswer + '\n\n⚠️ Stream interrupted: ' + streamError.message,
            isStreaming: false
          });
        } else {
          try {
            await reader.cancel();
          } catch (cancelError) {
            // Ignore cancel errors
          }
          throw streamError;
        }
      }

    } catch (error) {
      console.error('Question error:', error);
      updateHistoryItem(newItem.id, {
        answer: `Sorry, there was an error processing your question: ${error.message}`,
        isStreaming: false
      });
    }
  };

  return (
    <div className="App">
      <div className="home-container">
        <div className="logo-container">
          <h1 className="logo">GENTEX<sup>®</sup></h1>
          <h2 className="logo-subtitle">CORPORATION</h2>
        </div>
        <h1 className="title">Communications Recall Demo</h1>

        <div className="main-content">
          <div className="upload-section">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h2 className="upload-title">Add Document</h2>
              {pdfText && pdfText.length > 0 && (
                <button
                  onClick={clearDocument}
                  className="clear-button"
                  style={{ fontSize: '12px', padding: '5px 10px' }}
                  title="Clear loaded document"
                >
                  Clear Document
                </button>
              )}
            </div>
            <div className="upload-area">
              <input
                type="file"
                id="pdf-upload"
                accept=".pdf"
                onChange={handleFileChange}
                className="file-input"
              />
              <label htmlFor="pdf-upload" className="upload-label">
                <div className="upload-icon">📄</div>
                <p>Click to add PDF</p>
              </label>
            </div>

            {selectedFile && (
              <div className="file-info">
                <p className="file-name">{selectedFile.name}</p>
                <p className="file-size">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            )}

            {pdfText && pdfText.length > 0 && !selectedFile && (
              <div className="file-info" style={{ backgroundColor: '#fff3cd', padding: '10px', borderRadius: '5px', marginTop: '10px' }}>
                <p style={{ margin: 0, fontSize: '14px', color: '#856404' }}>
                  ⚠️ Document loaded from previous session ({Math.round(pdfText.length / 1024)} KB)
                </p>
              </div>
            )}

            {uploadStatus && (
              <p className={`upload-status ${uploadStatus.includes('Maximum allowed') ? 'error' : ''}`}>
                {uploadStatus}
              </p>
            )}
          </div>

          <div className="question-section">
            <h2 className="question-title">Ask a Question</h2>
            <form onSubmit={handleQuestionSubmit} className="question-form">
              <textarea
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                placeholder="Ask a question about your uploaded PDF..."
                className="question-input"
                rows="3"
              />
              <div className="button-container">
                <button
                  type="button"
                  onClick={isListening ? stopListening : startListening}
                  className={`mic-button ${isListening ? 'listening' : ''}`}
                  disabled={!recognition}
                  title={isListening ? 'Stop listening' : 'Start voice input'}
                >
                  {isListening ? '🔴 Stop Listening' : '🎤 Voice Input'}
                </button>
                <button type="submit" className="ask-button" disabled={!question.trim()}>
                  Ask Question
                </button>
              </div>
            </form>

            {history.length > 0 && (
              <div className="answer-container conversation-container">
                <div className="conversation-header">
                  <h3 className="answer-title">Conversation ({history.length})</h3>
                  <button onClick={clearHistory} className="clear-button">
                    Clear Chat
                  </button>
                </div>
                <div className="conversation-list">
                  {history.map((item) => (
                    <div key={item.id} className="conversation-item">
                      <div className="conversation-timestamp">
                        {item.timestamp || 'No timestamp'}
                      </div>
                      <div className="conversation-question">
                        <div className="conversation-label question-label">You asked:</div>
                        <div className="conversation-content">{item.question}</div>
                      </div>
                      <div className="conversation-answer">
                        <div className="conversation-label answer-label">
                          AI Response:
                          {item.isStreaming ? (
                            <span className="status-indicator typing">● Typing...</span>
                          ) : item.answer ? (
                            item.answer.includes('⚠️') || item.answer.includes('incomplete') ? (
                              <span className="status-indicator warning">⚠️ Incomplete</span>
                            ) : (
                              <span className="status-indicator complete">✅ Complete</span>
                            )
                          ) : null}
                        </div>
                        <div className="conversation-content">
                          {(() => {
                            const { mainContent, thinkingSections } = parseAnswer(item.answer || '');
                            return (
                              <>
                                <div className="main-answer-content">
                                  {mainContent || (item.isStreaming ? '...' : 'No response')}
                                </div>
                                {thinkingSections.length > 0 && (
                                  <details className="thinking-dropdown">
                                    <summary className="thinking-summary">
                                      <span className="thinking-icon">▶</span>
                                      <span className="thinking-label">Thinking trace ({thinkingSections.length})</span>
                                    </summary>
                                    <div className="thinking-content-wrapper">
                                      {thinkingSections.map((section, idx) => (
                                        <div key={section.id} className="thinking-section">
                                          {thinkingSections.length > 1 && (
                                            <div className="thinking-section-number">Trace {idx + 1}</div>
                                          )}
                                          <div className="thinking-content">
                                            {section.content}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </details>
                                )}
                              </>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
