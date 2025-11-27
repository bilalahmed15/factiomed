import React from 'react';
import ChatWidget from './components/ChatWidget';
import './App.css';

function App() {
  return (
    <div className="App">
      <header className="App-header">
        <h1>Functiomed.ch</h1>
        <p>Your Health & Wellness Partner</p>
      </header>
      <main>
        <div className="welcome-section">
          <h2>Welcome</h2>
          <p>Ask me anything about our services, book an appointment, or reserve parking.</p>
        </div>
      </main>
      <ChatWidget />
    </div>
  );
}

export default App;

