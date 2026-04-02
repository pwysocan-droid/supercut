'use client';

import { useCallback, useState } from 'react';

interface Props {
  onAddFiles: (files: File[]) => void;
}

export default function DropZone({ onAddFiles }: Props) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      onAddFiles(Array.from(e.dataTransfer.files));
    },
    [onAddFiles]
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    input.multiple = true;
    input.onchange = () => {
      if (input.files) onAddFiles(Array.from(input.files));
    };
    input.click();
  };

  return (
    <div className="dropzone-wrapper">
      <div
        className={`dropzone${isDragging ? ' dropzone--active' : ''}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={() => setIsDragging(false)}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === 'Enter' && handleClick()}
      >
        <svg
          className="dropzone-icon"
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        <span className="label">Drop video files or click to upload</span>
      </div>
    </div>
  );
}
