import React, { useState } from 'react';
import axios from 'axios';
import './TranscriptUpload.css';

const API_BASE = '/api';

function TranscriptUpload({ onComplete, onCancel }) {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  const handleFileSelect = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      // Validate file type
      const validTypes = ['audio/mpeg', 'audio/wav', 'audio/mp4', 'audio/x-m4a'];
      if (!validTypes.includes(selectedFile.type)) {
        setError('Please upload a valid audio file (mp3, wav, m4a)');
        return;
      }
      // Validate file size (100MB max)
      if (selectedFile.size > 100 * 1024 * 1024) {
        setError('File size must be less than 100MB');
        return;
      }
      setFile(selectedFile);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('audio', file);

      // Simulate progress (actual progress would come from axios upload progress)
      const progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 500);

      const response = await axios.post(`${API_BASE}/transcribe`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });

      clearInterval(progressInterval);
      setProgress(100);
      onComplete(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to process audio file');
      setUploading(false);
    }
  };

  return (
    <div className="transcript-upload">
      <div className="upload-header">
        <h3>Upload Audio Transcript</h3>
        <button className="close-btn" onClick={onCancel}>×</button>
      </div>
      <div className="upload-content">
        <div className="upload-area">
          <input
            type="file"
            id="audio-file"
            accept="audio/*"
            onChange={handleFileSelect}
            disabled={uploading}
            style={{ display: 'none' }}
          />
          <label htmlFor="audio-file" className="file-label">
            {file ? (
              <div className="file-info">
                <span className="file-icon">📄</span>
                <span className="file-name">{file.name}</span>
                <span className="file-size">
                  {(file.size / (1024 * 1024)).toFixed(2)} MB
                </span>
              </div>
            ) : (
              <div className="upload-prompt">
                <span className="upload-icon">📤</span>
                <p>Click to select audio file</p>
                <p className="upload-hint">MP3, WAV, M4A up to 100MB</p>
              </div>
            )}
          </label>
        </div>

        {error && <div className="error-message">{error}</div>}

        {uploading && (
          <div className="upload-progress">
            <div className="progress-bar">
              <div
                className="progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="progress-text">
              {progress < 90 ? 'Processing...' : 'Almost done...'}
            </p>
          </div>
        )}

        <div className="upload-actions">
          <button
            onClick={onCancel}
            className="btn-secondary"
            disabled={uploading}
          >
            Cancel
          </button>
          <button
            onClick={handleUpload}
            className="btn-primary"
            disabled={!file || uploading}
          >
            {uploading ? 'Processing...' : 'Upload & Process'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default TranscriptUpload;

