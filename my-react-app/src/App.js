import React, { useState } from 'react';
import './App.css';

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [history, setHistory] = useState([]); // newest first
  const [pdfText, setPdfText] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState(null);

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
        const response = await fetch('http://localhost:5001/api/upload', {
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
      setAnswer('');
      console.log('question', question);
      
      try {
        const response = await fetch('http://localhost:5001/api/ask', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            question: question,
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
          setAnswer(streamingAnswer);
        }

        // Add to history when complete
        setHistory((prev) => [
          { id: Date.now(), question, answer: streamingAnswer },
          ...prev,
        ]);
        setQuestion('');
        
      } catch (error) {
        console.error('Question error:', error);
        setAnswer('Sorry, there was an error processing your question.');
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
          
          {answer && (
            <div className="answer-container">
              <h3 className="answer-title">Answer:</h3>
              <p className="answer-text">{answer}</p>
            </div>
          )}

          {history.length > 0 && (
            <div className="answer-container" style={{ marginTop: '2rem', width: '100%' }}>
              <h3 className="answer-title">History</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {history.map((item) => (
                  <div key={item.id} style={{ background: '#0b0b0b', border: '1px solid #222', borderRadius: 8, padding: '1rem' }}>
                    <div style={{ color: '#aaa', marginBottom: 6 }}>Question</div>
                    <div style={{ color: '#fff', marginBottom: 10 }}>{item.question}</div>
                    <div style={{ color: '#aaa', marginBottom: 6 }}>Answer</div>
                    <div style={{ color: '#ccc' }}>{item.answer}</div>
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
