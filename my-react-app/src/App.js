import React, { useState } from 'react';
import './App.css';

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadStatus, setUploadStatus] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [history, setHistory] = useState([]); // newest first
  const [pdfText, setPdfText] = useState('');

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
          setUploadStatus('Upload failed');
        }
      } catch (error) {
        console.error('Upload error:', error);
        setUploadStatus('Upload failed');
      }
    }
  };

  const handleQuestionSubmit = async (e) => {
    e.preventDefault();
    if (question.trim()) {
      setAnswer('Processing question...');
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
        
        const data = await response.json();
        
        if (data.success) {
          setAnswer(data.answer);
          setHistory((prev) => [
            { id: Date.now(), question, answer: data.answer },
            ...prev,
          ]);
          setQuestion('');
        } else {
          setAnswer('Sorry, I could not process your question.');
        }
      } catch (error) {
        console.error('Question error:', error);
        setAnswer('Sorry, there was an error processing your question.');
      }
    }
  };

  return (
    <div className="App">
      <div className="home-container">
        <h1 className="title">GENTEX DEMO APP</h1>
        <div className="upload-section">
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
              <p>Click to select PDF or drag and drop</p>
              <p className="file-types">PDF files only</p>
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
            <p className="upload-status">{uploadStatus}</p>
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
            <button type="submit" className="ask-button" disabled={!question.trim()}>
              Ask Question
            </button>
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
  );
}

export default App;
