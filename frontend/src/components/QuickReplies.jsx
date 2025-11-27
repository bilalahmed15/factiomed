import React from 'react';
import './QuickReplies.css';

const QUICK_MESSAGES = [
  'What services do you offer?',
  'Tell me about physiotherapy',
  'Book an appointment',
  'Reserve parking',
  'What are your hours?',
  'How do I contact you?'
];

function QuickReplies({ onSelect }) {
  return (
    <div className="quick-replies">
      {QUICK_MESSAGES.map((message, idx) => (
        <button
          key={idx}
          className="quick-reply-btn"
          onClick={() => onSelect(message)}
        >
          {message}
        </button>
      ))}
    </div>
  );
}

export default QuickReplies;

