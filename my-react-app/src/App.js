import React, { useState } from 'react';
import './App.css';
import API_BASE_URL from './config';

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [question, setQuestion] = useState('');
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [isAnswering, setIsAnswering] = useState(false);
  const [history, setHistory] = useState([]);  // Start fresh on every page load
  const [pdfText, setPdfText] = useState('');  // Fresh PDF context on every load
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState(null);

  // Clear localStorage on component mount to ensure fresh start
  React.useEffect(() => {
    localStorage.removeItem('chatHistory');
  }, []);

  // Initialize speech recognition
  React.useEffect(() => {
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognitionInstance = new SpeechRecognition();
      
      recognitionInstance.continuous = false;
      recognitionInstance.interimResults = false;
      recognitionInstance.lang = 'en-US';

      recognitionInstance.onstart = () => {
        setIsListening(true);
      };

      recognitionInstance.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setQuestion(transcript);
        setIsListening(false);
      };

      recognitionInstance.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognitionInstance.onend = () => {
        setIsListening(false);
      };

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

  const handleFileChange = (event) => {
    const file = event.target.files[0];
    if (file && file.type === 'application/pdf') {
      setSelectedFile(file);
      setUploadStatus(`Selected: ${file.name}`);
    } else {
      setUploadStatus('Please select a PDF file');
    }
  };

  const handleUpload = async () => {
    if (selectedFile) {
      setUploadStatus('Uploading...');
      
      const formData = new FormData();
      formData.append('pdf', selectedFile);
      console.log('selectedFile', selectedFile);
      try {
        const response = await fetch(`${API_BASE_URL}/api/upload`, {
          method: 'POST',
          body: formData,
        });
        
        const data = await response.json();
        
        if (data.success) {
          setPdfText(data.text);
          setUploadStatus(`Successfully uploaded: ${data.filename} (${data.pages} pages)`);
        } else {
          setUploadStatus(data.error || 'Upload failed');
        }
      } catch (error) {
        console.error('Upload error:', error);
        setUploadStatus(`Upload failed: ${error.message}`);
      }
    }
  };

  const handleQuestionSubmit = async (e) => {
    e.preventDefault();
    if (question.trim()) {
      const currentQuestion = question;
      setCurrentAnswer('');
      setIsAnswering(true);
      console.log('question', currentQuestion);
      
      // Add question to history immediately (with empty answer)
      const newItem = { 
        id: Date.now(), 
        question: currentQuestion, 
        answer: '',
        timestamp: new Date().toLocaleString(),
        isStreaming: true
      };
      setHistory((prev) => [newItem, ...prev]);
      setQuestion(''); // Clear input for next question
      
      try {
        const response = await fetch(`${API_BASE_URL}/api/ask`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            question: currentQuestion,
            pdfText: pdfText
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
          
          const chunk = decoder.decode(value);
          streamingAnswer += chunk;
          
          // Update the answer in real-time in the history
          setHistory((prev) => prev.map(item => 
            item.id === newItem.id 
              ? { ...item, answer: streamingAnswer }
              : item
          ));
        }

        // Mark as complete
        setHistory((prev) => prev.map(item => 
          item.id === newItem.id 
            ? { ...item, isStreaming: false }
            : item
        ));
        
        setIsAnswering(false);
        
      } catch (error) {
        console.error('Question error:', error);
        setHistory((prev) => prev.map(item => 
          item.id === newItem.id 
            ? { ...item, answer: 'Sorry, there was an error processing your question.', isStreaming: false }
            : item
        ));
        setIsAnswering(false);
      }
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
            
            <button
              onClick={handleUpload}
              disabled={!selectedFile}
              className="upload-button"
            >
              Upload PDF
            </button>
            
            {uploadStatus && (
              <p className={`upload-status ${uploadStatus.includes('pages') && uploadStatus.includes('Maximum allowed') ? 'error' : ''}`}>
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
          
          {/* Continuous Chat Conversation */}
          {history.length > 0 && (
            <div className="answer-container" style={{ marginTop: '2rem', width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 className="answer-title">Conversation ({history.length})</h3>
                <button 
                  onClick={clearHistory}
                  style={{
                    background: '#dc3545',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    padding: '0.5rem 1rem',
                    cursor: 'pointer',
                    fontSize: '0.9rem'
                  }}
                >
                  Clear Chat
                </button>
              </div>
              <div style={{ 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '1rem', 
                maxHeight: '600px', 
                overflowY: 'auto',
                border: '1px solid #333',
                borderRadius: '8px',
                padding: '1rem',
                backgroundColor: '#0a0a0a'
              }}>
                {history.map((item) => (
                  <div key={item.id} style={{ marginBottom: '1.5rem' }}>
                    {/* Timestamp */}
                    <div style={{ color: '#666', fontSize: '0.8rem', marginBottom: 8 }}>
                      {item.timestamp || 'No timestamp'}
                    </div>
                    
                    {/* Question */}
                    <div style={{ 
                      background: '#1a1a1a', 
                      border: '1px solid #333', 
                      borderRadius: '8px', 
                      padding: '0.75rem',
                      marginBottom: '0.5rem'
                    }}>
                      <div style={{ color: '#4CAF50', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: 4 }}>
                        You asked:
                      </div>
                      <div style={{ color: '#fff', lineHeight: '1.4' }}>{item.question}</div>
                    </div>
                    
                    {/* Answer */}
                    <div style={{ 
                      background: '#0f1419', 
                      border: '1px solid #2d3748', 
                      borderRadius: '8px', 
                      padding: '0.75rem'
                    }}>
                      <div style={{ color: '#2196F3', fontSize: '0.9rem', fontWeight: 'bold', marginBottom: 4 }}>
                        AI Response:
                        {item.isStreaming ? (
                          <span style={{ color: '#ff9800', marginLeft: '0.5rem' }}>● Typing...</span>
                        ) : item.answer ? (
                          <span style={{ color: '#4CAF50', marginLeft: '0.5rem' }}>✅ Complete</span>
                        ) : null}
                      </div>
                      <div style={{ color: '#e0e0e0', lineHeight: '1.5' }}>
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
