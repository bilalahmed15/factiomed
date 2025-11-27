import React, { useMemo } from 'react';
import './MessageList.css';

// Simple Calendar Component for Date Selection
function DateCalendar({ availableDates, onDateSelect }) {
  if (!availableDates || availableDates.length === 0) return null;
  
  // Show up to 14 dates in the calendar
  const calendarDates = availableDates.slice(0, 14).map(dateStr => new Date(dateStr));
  
  return (
    <div className="date-calendar">
      <div className="calendar-grid">
        {calendarDates.map((date, idx) => {
          const dateStr = date.toISOString().split('T')[0];
          const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
          const dayNum = date.getDate();
          const monthName = date.toLocaleDateString('en-US', { month: 'short' });
          
          return (
            <button
              key={idx}
              className="calendar-date-btn"
              onClick={() => onDateSelect(dateStr)}
              title={date.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            >
              <div className="calendar-day">{dayName}</div>
              <div className="calendar-number">{dayNum}</div>
              <div className="calendar-month">{monthName}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Component to process and render message text with HTML conversion
function MessageText({ text }) {
  const processedText = useMemo(() => {
    if (!text) return '';
    
    // Convert markdown to HTML
    let processed = text;
    
    // Convert **text** to <strong>
    processed = processed.replace(/\*\*([^*]+?)\*\*/g, '<strong>$1</strong>');
    
    // Convert # Heading to <strong>Heading</strong>
    processed = processed.replace(/^#{1,6}\s*(.+)$/gm, '<strong style="font-weight: 600; font-size: 1.1em; display: block; margin: 0.75em 0 0.5em 0;">$1</strong>');
    
    // Remove all remaining markdown symbols
    processed = processed.replace(/#/g, '');
    processed = processed.replace(/\*\*/g, '');
    processed = processed.replace(/\*/g, '');
    
    return processed;
  }, [text]);
  
  return (
    <div 
      className="message-text" 
      style={{whiteSpace: 'pre-line'}}
      dangerouslySetInnerHTML={{__html: processedText}}
    />
  );
}

function TypingIndicator() {
  return (
    <div className="message bot">
      <div className="message-content typing-indicator">
        <div className="typing-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
      </div>
    </div>
  );
}

function MessageList({ messages, isTyping = false, onQuickReply = null, bookingStep = null, availableDates = null }) {
  const handleDateSelect = (dateStr) => {
    // Format the date for sending (e.g., "Nov 4")
    const date = new Date(dateStr);
    const formatted = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    if (onQuickReply) {
      onQuickReply(formatted);
    }
  };
  
  return (
    <div className="message-list">
      {messages.map((message) => (
        <div key={message.id} className={`message ${message.type}`}>
          <div className="message-content">
            <MessageText text={message.text} />
            {message.sources && message.sources.length > 0 && (
              <div className="message-sources">
                <span className="sources-label">Learn more:</span>
                {message.sources.slice(0, 3).map((source, idx) => (
                  <a
                    key={idx}
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="source-link"
                  >
                    {source.title || source.url}
                  </a>
                ))}
              </div>
            )}
            {/* Show calendar if this is a date selection step and we have available dates */}
            {bookingStep === 'date' && message.availableDates && message.availableDates.length > 0 && (
              <DateCalendar 
                availableDates={message.availableDates} 
                onDateSelect={handleDateSelect}
              />
            )}
            {message.quickReplies && message.quickReplies.length > 0 && onQuickReply && (
              <div className="message-quick-replies">
                {message.quickReplies.map((reply, idx) => (
                  <button
                    key={idx}
                    className="message-quick-reply-btn"
                    onClick={() => onQuickReply(reply)}
                  >
                    {reply}
                  </button>
                ))}
              </div>
            )}
          </div>
          <span className="message-time">
            {new Date(message.timestamp).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit'
            })}
          </span>
        </div>
      ))}
      {isTyping && <TypingIndicator />}
    </div>
  );
}

export default MessageList;

