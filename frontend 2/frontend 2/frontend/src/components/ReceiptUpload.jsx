import { useRef } from 'react';
import { Upload, X, Image, FileText } from 'lucide-react';

export default function ReceiptUpload({ onFile, onCancel }) {
  const inputRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onFile(file);
  };

  const handleChange = (e) => {
    const file = e.target.files[0];
    if (file) onFile(file);
  };

  return (
    <div className="glass rounded-2xl p-5 border border-indigo-500/30 animate-fade-in space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-white">Upload Receipt</h3>
          <p className="text-xs text-slate-400 mt-0.5">JPG, PNG, or WebP • Max 20MB</p>
        </div>
        <button onClick={onCancel} className="text-slate-500 hover:text-slate-300 transition-colors">
          <X size={16} />
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center cursor-pointer
          hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all duration-300 group"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="w-14 h-14 rounded-2xl bg-indigo-500/10 flex items-center justify-center
            group-hover:bg-indigo-500/20 transition-colors">
            <Upload size={24} className="text-indigo-400 group-hover:scale-110 transition-transform" />
          </div>
          <div>
            <p className="text-sm font-medium text-slate-300">
              Drop your receipt here
            </p>
            <p className="text-xs text-slate-500 mt-1">or click to browse</p>
          </div>
        </div>
      </div>

      {/* Supported formats */}
      <div className="flex items-center justify-center gap-4">
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Image size={12} />
          <span>JPG / PNG / WebP</span>
        </div>
        <div className="w-1 h-1 rounded-full bg-slate-600" />
        <p className="text-xs text-slate-500">AI will extract amount, merchant & date</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        onChange={handleChange}
        className="hidden"
      />
    </div>
  );
}
