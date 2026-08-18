import { useState, useRef } from 'react';
import { Send, Mic, Paperclip, X } from 'lucide-react';

const EXAMPLE_CHIPS = [
  '120 chai and samosa',
  'uber 450 to college',
  'netflix 199 subscription',
  'paid 2000 rent',
  'groceries 680 bigbasket',
  'movie tickets pvr 600',
];

export default function ChatInput({ onSubmit, loading, onReceiptClick }) {
  const [value, setValue] = useState('');
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!value.trim() || loading) return;
    onSubmit(value.trim());
    setValue('');
  };

  const handleChip = (chip) => {
    setValue(chip);
  };

  const handleVoice = () => {
    if (!('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      alert('Voice input not supported in this browser. Try Chrome.');
      return;
    }
    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognitionRef.current = recognition;
    recognition.lang = 'en-IN';
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (e) => {
      const transcript = e.results[0][0].transcript;
      setValue(transcript);
      setListening(false);
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognition.start();
    setListening(true);
  };

  return (
    <div className="w-full space-y-3">
      {/* Example chips */}
      <div className="flex flex-wrap gap-2">
        {EXAMPLE_CHIPS.map((chip) => (
          <button
            key={chip}
            onClick={() => handleChip(chip)}
            className="px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-200
              bg-white/5 border border-white/10 text-indigo-300 hover:bg-indigo-500/20
              hover:border-indigo-500/50 hover:text-indigo-200 active:scale-95"
          >
            {chip}
          </button>
        ))}
      </div>

      {/* Main input */}
      <form onSubmit={handleSubmit} className="relative">
        <div className="flex items-center gap-2 glass rounded-2xl p-2 border border-white/10
          focus-within:border-indigo-500/60 focus-within:shadow-[0_0_0_3px_rgba(99,102,241,0.15)]
          transition-all duration-300">
          {/* Receipt upload */}
          <button
            type="button"
            onClick={onReceiptClick}
            className="p-2.5 rounded-xl text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10
              transition-all duration-200 flex-shrink-0"
            title="Upload receipt"
          >
            <Paperclip size={18} />
          </button>

          {/* Text input */}
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder='Type an expense... "120 chai and samosa"'
            disabled={loading}
            className="flex-1 bg-transparent text-white placeholder-slate-500 text-sm
              outline-none py-2 px-1"
            autoFocus
          />

          {/* Voice */}
          <button
            type="button"
            onClick={handleVoice}
            className={`p-2.5 rounded-xl transition-all duration-200 flex-shrink-0
              ${listening
                ? 'text-red-400 bg-red-500/20 animate-pulse'
                : 'text-slate-400 hover:text-indigo-400 hover:bg-indigo-500/10'
              }`}
            title={listening ? 'Stop listening' : 'Voice input'}
          >
            <Mic size={18} />
          </button>

          {/* Clear */}
          {value && (
            <button
              type="button"
              onClick={() => setValue('')}
              className="p-2.5 rounded-xl text-slate-500 hover:text-slate-300 transition-all flex-shrink-0"
            >
              <X size={16} />
            </button>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={!value.trim() || loading}
            className="btn-primary p-2.5 rounded-xl flex-shrink-0 relative
              disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none"
          >
            {loading ? (
              <div className="w-[18px] h-[18px] border-2 border-white/30 border-t-white
                rounded-full animate-spin" />
            ) : (
              <Send size={18} className="relative z-10" />
            )}
          </button>
        </div>
      </form>

      {listening && (
        <p className="text-center text-xs text-red-400 animate-pulse">
          🎤 Listening... speak your expense
        </p>
      )}
    </div>
  );
}
