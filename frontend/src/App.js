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
          setUploadStatus(`Successfully uploaded: ${data.filename} (${data.pages} pages, ${textLength} chars)`);
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
      if (pdfTextToSend.length === 0) {
        const savedText = localStorage.getItem('pdfText');
        if (savedText && savedText.length > 0) {
          console.log('Recovering PDF text from localStorage, length:', savedText.length);
          setPdfText(savedText);
          pdfTextToSend = savedText;
        }
      }

      console.log('=== SENDING QUESTION ===');
      console.log('Question:', currentQuestion);
      console.log('PDF text from state length:', pdfText.length);
      console.log('PDF text from localStorage length:', localStorage.getItem('pdfText')?.length || 0);
      console.log('PDF text to send length:', pdfTextToSend.length);
      console.log('PDF text preview (first 300 chars):', pdfTextToSend.substring(0, 300));
      console.log('PDF text is empty?', pdfTextToSend.length === 0);

      if (pdfTextToSend.length === 0) {
        console.error('WARNING: PDF text is empty! Make sure you uploaded a PDF first.');
      }
      console.log('=== END SENDING QUESTION ===');

      const response = await fetch(`${API_BASE_URL}/api/ask`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: currentQuestion,
          pdfText: pdfTextToSend
        }),
      });

      if (!response.ok) {
        throw new Error('Network response was not ok');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let streamingAnswer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        streamingAnswer += decoder.decode(value);
        updateHistoryItem(newItem.id, { answer: streamingAnswer });
      }

      updateHistoryItem(newItem.id, { isStreaming: false });

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
            <h2 className="upload-title">Add Document</h2>
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
                            <span className="status-indicator complete">✅ Complete</span>
                          ) : null}
                        </div>
                        <div className="conversation-content">
                          {item.answer || (item.isStreaming ? '...' : 'No response')}
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
