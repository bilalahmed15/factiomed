import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import MessageList from './MessageList';
import MessageInput from './MessageInput';
import TranscriptUpload from './TranscriptUpload';
import QuickReplies from './QuickReplies';
import { API_BASE } from '../config';
import './ChatWidget.css';

function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  // Detect browser language for welcome message
  const getBrowserLanguage = () => {
    const lang = navigator.language || navigator.userLanguage || 'en';
    if (lang.startsWith('de')) return 'de';
    if (lang.startsWith('fr')) return 'fr';
    return 'en';
  };

  const browserLang = getBrowserLanguage();
  const welcomeMessages = {
    en: "Hi there! 👋 I'm FIONA, your friendly assistant at Functiomed. I'm here to help you with anything you need - whether it's finding information about our services, doctors, or answering your questions. What can I help you with today?",
    de: "Hallo! 👋 Ich bin FIONA, Ihre freundliche Assistentin bei Functiomed. Ich bin hier, um Ihnen bei allem zu helfen, was Sie brauchen - ob es darum geht, Informationen über unsere Dienstleistungen, Ärzte zu finden oder Ihre Fragen zu beantworten. Womit kann ich Ihnen heute helfen?",
    fr: "Bonjour ! 👋 Je suis FIONA, votre assistante amicale chez Functiomed. Je suis là pour vous aider avec tout ce dont vous avez besoin - que ce soit pour trouver des informations sur nos services, nos médecins ou répondre à vos questions. En quoi puis-je vous aider aujourd'hui ?"
  };

  // Language selector state - must be declared before messages state
  const [selectedLanguage, setSelectedLanguage] = useState(browserLang);

  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      type: 'bot',
      text: welcomeMessages[selectedLanguage] || welcomeMessages.en,
      timestamp: new Date()
    }
  ]);

  const [sessionId, setSessionId] = useState(null);
  const [showTranscriptUpload, setShowTranscriptUpload] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true); // Voice enabled by default
  const [hasPendingAudio, setHasPendingAudio] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false); // Track if bot is currently speaking
  const [userInteracted, setUserInteracted] = useState(false);

  // Update welcome message when language changes
  useEffect(() => {
    setMessages(prevMessages => {
      const welcomeMsg = prevMessages.find(m => m.id === 'welcome');
      if (welcomeMsg && welcomeMsg.text !== welcomeMessages[selectedLanguage]) {
        return prevMessages.map(m => 
          m.id === 'welcome' 
            ? { ...m, text: welcomeMessages[selectedLanguage] || welcomeMessages.en }
            : m
        );
      }
      return prevMessages;
    });
  }, [selectedLanguage]);
  const messagesEndRef = useRef(null);
  const audioRef = useRef(null);
  const pendingAudioRef = useRef(null); // Track pending audio that couldn't play due to autoplay
  const isVoiceEnabledRef = useRef(true); // Track voice state with ref for immediate access - enabled by default
  const ttsCancelledRef = useRef(false); // Track if TTS should be cancelled
  const pendingTimeoutsRef = useRef([]); // Track pending timeouts to cancel them
  const welcomeSpokenRef = useRef(false); // Track if welcome message has been spoken
  const welcomeAudioUrlRef = useRef(null); // Pre-loaded welcome audio URL

  useEffect(() => {
    // Initialize session
    if (!sessionId) {
      setSessionId(`session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
    }
  }, [sessionId]);

  // Sync ref with state to ensure consistency
  useEffect(() => {
    isVoiceEnabledRef.current = isVoiceEnabled;
  }, [isVoiceEnabled]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  // Pre-load welcome message audio when component mounts
  useEffect(() => {
    const welcomeMessage = messages.find(m => m.id === 'welcome') || messages[0];
    if (welcomeMessage && welcomeMessage.text && !welcomeAudioUrlRef.current) {
      console.log('📥 Pre-loading welcome message audio...');
      
      // Pre-load the audio in the background
      fetch(`${API_BASE}/text-to-speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text: welcomeMessage.text, language: selectedLanguage })
      })
        .then(response => {
          if (!response.ok) {
            throw new Error(`TTS API error: ${response.status}`);
          }
          return response.blob();
        })
        .then(blob => {
          const audioUrl = URL.createObjectURL(blob);
          welcomeAudioUrlRef.current = audioUrl;
          console.log('✅ Welcome message audio pre-loaded and ready');
        })
        .catch(error => {
          console.error('Error pre-loading welcome audio:', error);
        });
    }
    
    // Cleanup on unmount
    return () => {
      if (welcomeAudioUrlRef.current) {
        URL.revokeObjectURL(welcomeAudioUrlRef.current);
        welcomeAudioUrlRef.current = null;
      }
    };
  }, [messages]);

  // Auto-speak welcome message when chatbot opens and voice is enabled
  useEffect(() => {
    if (isOpen && isVoiceEnabled && !welcomeSpokenRef.current) {
      // Unlock audio context when chatbot opens (opening counts as user interaction)
      const unlockAudio = () => {
        const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
        silentAudio.volume = 0.01;
        silentAudio.play().then(() => {
          console.log('🔓 Audio context unlocked on chatbot open');
          silentAudio.pause();
          silentAudio.remove();
          setUserInteracted(true);
        }).catch(() => {
          console.log('Audio context unlock attempted');
          setUserInteracted(true);
        });
      };
      
      unlockAudio();
      
      // Use pre-loaded audio if available, otherwise fall back to TTS API
      if (welcomeAudioUrlRef.current) {
        welcomeSpokenRef.current = true;
        console.log('🎤 Playing pre-loaded welcome message instantly...');
        
        // Create a new audio instance from the pre-loaded blob URL
        const audio = new Audio(welcomeAudioUrlRef.current);
        audio.volume = 1.0;
        audioRef.current = audio;
        
        audio.onplay = () => {
          setIsSpeaking(true);
        };
        
        audio.onended = () => {
          console.log('Welcome audio playback ended');
          setIsSpeaking(false);
          audioRef.current = null;
        };
        
        audio.onpause = () => {
          setIsSpeaking(false);
        };
        
        audio.onerror = (error) => {
          console.error('Welcome audio error:', error);
          setIsSpeaking(false);
          audioRef.current = null;
        };
        
        // Play immediately (no delay needed for pre-loaded audio)
        audio.play()
          .then(() => {
            console.log('✅ Pre-loaded welcome audio started playing instantly');
          })
          .catch(err => {
            console.error('Could not play pre-loaded audio:', err);
            // Fallback to TTS API if pre-loaded audio fails
            const welcomeMessage = messages.find(m => m.id === 'welcome') || messages[0];
            if (welcomeMessage && welcomeMessage.text) {
              playTextToSpeech(welcomeMessage.text).catch(error => {
                console.error('Error speaking welcome message:', error);
              });
            }
          });
      } else {
        // Fallback: use TTS API if pre-loaded audio not ready
        const welcomeMessage = messages.find(m => m.id === 'welcome') || messages[0];
        if (welcomeMessage && welcomeMessage.text) {
          welcomeSpokenRef.current = true;
          console.log('🎤 Pre-loaded audio not ready, using TTS API...');
          setTimeout(() => {
            playTextToSpeech(welcomeMessage.text).catch(err => {
              console.error('Error speaking welcome message:', err);
            });
          }, 300);
        }
      }
    }
    
    // Reset welcome spoken flag when chat closes
    if (!isOpen) {
      welcomeSpokenRef.current = false;
    }
  }, [isOpen, isVoiceEnabled, messages]);

  // Track user interaction for audio autoplay
  useEffect(() => {
    // When voice is enabled, mark user interaction and try to play pending audio
    if (isVoiceEnabled && pendingAudioRef.current) {
      const { audio, audioUrl } = pendingAudioRef.current;
      audioRef.current = audio;
      pendingAudioRef.current = null;
      
      // User has interacted (enabled voice), so play should work
      audio.play()
        .then(() => {
          console.log('✅ Playing pending audio after enabling voice');
          setHasPendingAudio(false);
        })
        .catch(err => {
          console.error('❌ Could not play pending audio:', err);
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          setHasPendingAudio(false);
        });
    }
  }, [isVoiceEnabled]);

  // Cleanup audio when component unmounts
  useEffect(() => {
    return () => {
      // Cancel all pending timeouts
      pendingTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
      pendingTimeoutsRef.current = [];
      
      // Stop audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      
      // Clean up pending audio
      if (pendingAudioRef.current) {
        URL.revokeObjectURL(pendingAudioRef.current.audioUrl);
        pendingAudioRef.current = null;
      }
    };
  }, []);

  // Stop audio when voice is disabled
  useEffect(() => {
    if (!isVoiceEnabled && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
      setIsSpeaking(false);
    }
  }, [isVoiceEnabled]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const addMessage = (text, type = 'user', sources = null, quickReplies = null, bookingStep = null, availableDates = null) => {
    const newMessage = {
      id: Date.now().toString(),
      type,
      text,
      sources,
      quickReplies,
      bookingStep,
      availableDates,
      timestamp: new Date()
    };
    setMessages(prev => [...prev, newMessage]);
    
    // Note: TTS is now handled in handleSendMessage to start immediately
  };

  const playTextToSpeech = async (text) => {
    // Check if voice is still enabled before starting
    if (!isVoiceEnabledRef.current) {
      console.log('🔇 Voice disabled, cancelling TTS');
      return;
    }

    try {
      console.log('🎤 Starting TTS for text:', text.substring(0, 50) + '...');
      
      // Stop any currently playing audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }

      // Clear cancellation flag
      ttsCancelledRef.current = false;

      console.log('📡 Calling TTS API (streaming)...');
      
      // Use fetch with streaming for faster playback
      const response = await fetch(`${API_BASE}/text-to-speech`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, language: selectedLanguage })
      });

      // Check again if voice was disabled during API call
      if (!isVoiceEnabledRef.current || ttsCancelledRef.current) {
        console.log('🔇 Voice disabled during TTS, aborting');
        return;
      }

      if (!response.ok) {
        throw new Error(`TTS API error: ${response.status}`);
      }

      // Read ALL chunks first to ensure complete audio before playing
      // This prevents audio from stopping mid-sentence
      const reader = response.body.getReader();
      const chunks = [];
      let totalLength = 0;

      console.log('📥 Reading audio stream...');
      while (true) {
        const { done, value } = await reader.read();
        
        if (done) {
          break;
        }

        // Check cancellation
        if (!isVoiceEnabledRef.current || ttsCancelledRef.current) {
          console.log('🔇 Voice disabled, cancelling stream');
          reader.cancel();
          return;
        }

        chunks.push(value);
        totalLength += value.length;
      }

      console.log('✅ All chunks received, total size:', totalLength, 'bytes');

      // Check cancellation after all chunks received
      if (!isVoiceEnabledRef.current || ttsCancelledRef.current) {
        console.log('🔇 Voice disabled, aborting');
        return;
      }

      // Create complete blob from all chunks
      // FishSpeech returns WAV format, not MP3
      const blob = new Blob(chunks, { type: 'audio/wav' });
      
      if (blob.size === 0) {
        console.error('Empty audio response');
        return;
      }
      
      const audioUrl = URL.createObjectURL(blob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.volume = 1.0;
      
      // Set up event handlers
      audio.onplay = () => {
        console.log('Audio playback started');
        setIsSpeaking(true);
      };

      audio.onended = () => {
        console.log('Audio playback ended');
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        pendingAudioRef.current = null;
        setHasPendingAudio(false);
      };

      audio.onpause = () => {
        console.log('Audio playback paused');
        setIsSpeaking(false);
      };

      audio.onerror = (error) => {
        console.error('Audio playback error:', error);
        setIsSpeaking(false);
        URL.revokeObjectURL(audioUrl);
        audioRef.current = null;
        pendingAudioRef.current = null;
        setHasPendingAudio(false);
      };
      
      // Try to play complete audio
      const attemptPlay = async () => {
        if (!isVoiceEnabledRef.current || ttsCancelledRef.current) {
          audio.pause();
          URL.revokeObjectURL(audioUrl);
          audioRef.current = null;
          return;
        }

        try {
          await audio.play();
          console.log('✅ Audio playback started (complete audio)');
          setIsSpeaking(true);
          pendingAudioRef.current = null;
          setHasPendingAudio(false);
        } catch (playError) {
          console.error('Audio play() failed:', playError);
          
          if (isVoiceEnabledRef.current && !ttsCancelledRef.current && 
              (playError.name === 'NotAllowedError' || playError.name === 'NotSupportedError')) {
            pendingAudioRef.current = { audio, audioUrl };
            setHasPendingAudio(true);
          } else {
            URL.revokeObjectURL(audioUrl);
            audioRef.current = null;
          }
        }
      };

      audio.load();
      if (audio.readyState >= 2) {
        attemptPlay();
      } else {
        const timeoutId = setTimeout(() => {
          const index = pendingTimeoutsRef.current.indexOf(timeoutId);
          if (index > -1) {
            pendingTimeoutsRef.current.splice(index, 1);
          }
          attemptPlay();
        }, 100);
        pendingTimeoutsRef.current.push(timeoutId);
        
        audio.addEventListener('canplay', () => {
          clearTimeout(timeoutId);
          const index = pendingTimeoutsRef.current.indexOf(timeoutId);
          if (index > -1) {
            pendingTimeoutsRef.current.splice(index, 1);
          }
          attemptPlay();
        }, { once: true });
      }

      console.log('✅ TTS streaming completed, total size:', totalLength, 'bytes');
    } catch (error) {
      console.error('Text-to-speech error:', error);
      
      if (error.message?.includes('API key') || error.message?.includes('token')) {
        alert('TTS API not configured. Please add REPLICATE_API_TOKEN to your backend .env file.');
      }
    }
  };

  const toggleVoice = () => {
    const newState = !isVoiceEnabled;
    setIsVoiceEnabled(newState);
    isVoiceEnabledRef.current = newState; // Update ref immediately
    setUserInteracted(true); // Mark that user has interacted
    
    console.log('🔊 Voice toggled:', newState);
    
    // Stop audio if disabling
    if (!newState) {
      // Set cancellation flag
      ttsCancelledRef.current = true;
      
      // Cancel all pending timeouts
      pendingTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
      pendingTimeoutsRef.current = [];
      
      // Stop and clean up current audio
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
        setIsSpeaking(false);
      }
      
      // Clean up pending audio
      if (pendingAudioRef.current) {
        URL.revokeObjectURL(pendingAudioRef.current.audioUrl);
        pendingAudioRef.current = null;
        setHasPendingAudio(false);
      }
    } else {
      // Clear cancellation flag when enabling
      ttsCancelledRef.current = false;
      // User clicked to enable voice - unlock audio context
      // Create a silent audio and play it to unlock the audio context
      const unlockAudio = () => {
        const silentAudio = new Audio('data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=');
        silentAudio.volume = 0.01;
        silentAudio.play().then(() => {
          console.log('🔓 Audio context unlocked');
          silentAudio.pause();
          silentAudio.remove();
        }).catch(() => {
          console.log('Audio context unlock attempted');
        });
      };
      
      unlockAudio();
      
      // Try to play any pending audio that was blocked by autoplay
      if (pendingAudioRef.current) {
        const { audio, audioUrl } = pendingAudioRef.current;
        audioRef.current = audio;
        pendingAudioRef.current = null;
        
        // Since user just clicked, this should work now
        setTimeout(() => {
          audio.play()
            .then(() => {
              console.log('✅ Pending audio started playing after user interaction');
              setHasPendingAudio(false);
            })
            .catch(err => {
              console.error('❌ Could not play pending audio:', err);
              URL.revokeObjectURL(audioUrl);
              audioRef.current = null;
              setHasPendingAudio(false);
            });
        }, 100);
      } else if (audioRef.current && audioRef.current.paused) {
        // Try to play current audio if it's paused
        setTimeout(() => {
          if (isVoiceEnabledRef.current && !ttsCancelledRef.current) {
            audioRef.current?.play().catch(err => {
              console.error('Could not play current audio:', err);
            });
          }
        }, 100);
      }
      // Removed: Don't auto-speak last message when enabling voice
      // This was causing the issue where voice would speak after being disabled
    }
  };

  const handleSendMessage = async (text) => {
    if (!text.trim()) return;

    addMessage(text, 'user');

    // Check for transcript intent
    if (text.toLowerCase().includes('transcript') || text.toLowerCase().includes('audio')) {
      setShowTranscriptUpload(true);
      return;
    }

    // Regular chat
    setIsTyping(true);
    try {
      const response = await axios.post(`${API_BASE}/chat`, {
        message: text,
        sessionId,
        preferredLanguage: selectedLanguage
      });
      
      addMessage(response.data.response, 'bot', response.data.sources, response.data.quickReplies);
      setSessionId(response.data.sessionId);
      
      // Start TTS immediately after response (non-blocking)
      // IMPORTANT: Use ref to check voice state immediately (not closure value)
      if (response.data.response && isVoiceEnabledRef.current) {
        console.log('🎤 Voice enabled, starting TTS...', {
          isVoiceEnabled: isVoiceEnabledRef.current,
          responseLength: response.data.response.length,
          hasResponse: !!response.data.response
        });
        // Fire and forget - don't wait for TTS
        playTextToSpeech(response.data.response).catch(err => {
          console.error('TTS error in handleSendMessage:', err);
        });
      } else if (response.data.response) {
        console.log('🔇 Voice not enabled, skipping TTS:', { 
          isVoiceEnabled: isVoiceEnabledRef.current, 
          hasResponse: !!response.data.response
        });
      }
    } catch (error) {
      console.error('Chat error:', error);
      addMessage("I'm sorry, I encountered an error. Please try again.", 'bot');
    } finally {
      setIsTyping(false);
    }
  };

  const handleTranscriptComplete = (result) => {
    setShowTranscriptUpload(false);
    const summary = `📄 Transcript processed!\n\nSummary: ${result.summary}\n\nAttendees: ${result.attendees?.map(a => `${a.name} (${a.role})`).join(', ') || 'None'}\n\n${result.requiresReview ? '⚠️ This transcript requires clinician review.' : ''}`;
    addMessage(summary, 'bot');
  };

  return (
    <>
      {!isOpen && (
        <button className="chat-toggle" onClick={() => setIsOpen(true)}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
          </svg>
        </button>
      )}

      {isOpen && (
        <div className="chat-widget">
          <div className="chat-header">
            <div className="chat-header-content">
              <h3>FIONA</h3>
              <span className="status-indicator">● Online</span>
            </div>
            <div className="chat-header-actions">
              <div className="language-selector">
                <select 
                  value={selectedLanguage} 
                  onChange={(e) => setSelectedLanguage(e.target.value)}
                  className="language-select"
                  title="Select language"
                >
                  <option value="en">🇬🇧 English</option>
                  <option value="de">🇩🇪 Deutsch</option>
                  <option value="fr">🇫🇷 Français</option>
                </select>
              </div>
              <button 
                className={`voice-toggle ${isVoiceEnabled ? 'active' : ''} ${hasPendingAudio ? 'has-pending' : ''} ${isSpeaking ? 'speaking' : ''}`}
                onClick={toggleVoice}
                title={hasPendingAudio ? 'Click to play pending audio' : isVoiceEnabled ? 'Disable AI Voice' : 'Enable AI Voice'}
              >
                {isVoiceEnabled ? (
                  <>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M11 5L6 9H2v6h4l5 4V5z" />
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </svg>
                    {isSpeaking && (
                      <div className="pitch-animation">
                        <span className="wave-bar"></span>
                        <span className="wave-bar"></span>
                        <span className="wave-bar"></span>
                        <span className="wave-bar"></span>
                      </div>
                    )}
                  </>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.6">
                    <path d="M11 5L6 9H2v6h4l5 4V5z" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                )}
                {hasPendingAudio && (
                  <span className="pending-indicator" title="Audio ready - click to play">
                    ●
                  </span>
                )}
              </button>
              <button className="chat-close" onClick={() => setIsOpen(false)}>
                ×
              </button>
            </div>
          </div>

          <div className="chat-body">
            {showTranscriptUpload && (
              <TranscriptUpload
                onComplete={handleTranscriptComplete}
                onCancel={() => setShowTranscriptUpload(false)}
              />
            )}

            {!showTranscriptUpload && (
              <>
                <MessageList 
                  messages={messages} 
                  isTyping={isTyping}
                  onQuickReply={handleSendMessage}
                />
                <div ref={messagesEndRef} />
              </>
            )}

            {!showTranscriptUpload && (
              <>
                <QuickReplies onSelect={handleSendMessage} />
                <MessageInput onSend={handleSendMessage} />
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default ChatWidget;

