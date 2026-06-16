import { useRef, useState } from 'react';

const ACCEPT = '.csv,.tsv,.txt,text/csv,text/tab-separated-values';

interface Props {
  onFile: (file: File) => void;
  compact?: boolean;
}

/** Drag-and-drop + click-to-browse file picker (MVP feature #1). */
export function Dropzone({ onFile, compact = false }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  function take(files: FileList | null) {
    if (files && files.length > 0) onFile(files[0]);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="Upload a CSV or TSV file"
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        take(e.dataTransfer.files);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed text-center transition-colors ${
        dragging
          ? 'border-ink bg-surface-strong'
          : 'border-hairline bg-surface-soft hover:border-muted-soft'
      } ${compact ? 'px-6 py-8' : 'px-8 py-16'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => take(e.target.files)}
      />
      <div
        className={`flex items-center justify-center rounded-full bg-brand-peach text-ink ${
          compact ? 'h-10 w-10' : 'h-14 w-14'
        }`}
        aria-hidden="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width={compact ? 18 : 24}
          height={compact ? 18 : 24}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </div>
      <div>
        <p className={`font-semibold text-ink ${compact ? 'text-sm' : 'text-lg'}`}>
          {dragging ? 'Drop to upload' : 'Drag & drop your file'}
        </p>
        <p className="text-sm text-muted">
          or <span className="font-medium text-ink underline">browse files</span>
        </p>
      </div>
      {!compact && (
        <p className="text-xs text-muted-soft">CSV and TSV supported · XLSX coming soon</p>
      )}
    </div>
  );
}
