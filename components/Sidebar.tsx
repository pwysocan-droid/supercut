'use client';

import { useRef } from 'react';
import ProgressSteps from './ProgressSteps';
import { JobStatus } from '@/lib/types';
import { formatSize } from '@/lib/utils';

const QUICK_TAGS = ['High energy', 'B-roll', 'On camera', 'Action', 'Ambient'];

interface Props {
  intent: string;
  onIntentChange: (v: string) => void;
  referenceFile: File | null;
  onReferenceChange: (f: File | null) => void;
  intensity: number;
  onIntensityChange: (v: number) => void;
  duration: number;
  onDurationChange: (v: number) => void;
  durationUnit: 'seconds' | 'minutes';
  onDurationUnitChange: (v: 'seconds' | 'minutes') => void;
  status: JobStatus | null;
  jobId: string | null;
  onGenerate: () => void;
  isGenerating: boolean;
}

export default function Sidebar({
  intent,
  onIntentChange,
  referenceFile,
  onReferenceChange,
  intensity,
  onIntensityChange,
  duration,
  onDurationChange,
  durationUnit,
  onDurationUnitChange,
  status,
  jobId,
  onGenerate,
  isGenerating,
}: Props) {
  const refInputRef = useRef<HTMLInputElement>(null);

  const handleTagClick = (tag: string) => {
    const sep = intent.trim() ? ', ' : '';
    onIntentChange(intent.trim() + sep + tag);
  };

  const handleRefClick = () => refInputRef.current?.click();

  const handleRefChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onReferenceChange(e.target.files?.[0] ?? null);
  };

  return (
    <aside className="sidebar">
      {/* 01 — Intent */}
      <section className="sidebar-section">
        <span className="sidebar-section-header label">01 — Intent</span>
        <textarea
          className="intent-input"
          placeholder="Describe what you want in the supercut…"
          value={intent}
          onChange={(e) => onIntentChange(e.target.value)}
          rows={4}
        />
        <div className="tag-pills">
          {QUICK_TAGS.map((tag) => (
            <button key={tag} className="tag-pill" onClick={() => handleTagClick(tag)}>
              {tag}
            </button>
          ))}
        </div>
      </section>

      <hr className="sidebar-divider" />

      {/* 01b — Reference */}
      <section className="sidebar-section">
        <span className="sidebar-section-header label">01b — Style Reference (optional)</span>
        <input
          ref={refInputRef}
          type="file"
          accept="video/*"
          style={{ display: 'none' }}
          onChange={handleRefChange}
        />
        {referenceFile ? (
          <div className="ref-file">
            <span className="ref-file-name">{referenceFile.name.replace(/\.[^/.]+$/, '')}</span>
            <span className="ref-file-meta label">{formatSize(referenceFile.size)}</span>
            <button className="ref-file-clear label" onClick={() => onReferenceChange(null)}>
              clear
            </button>
          </div>
        ) : (
          <button className="ref-upload-btn label" onClick={handleRefClick}>
            + Upload reference clip
          </button>
        )}
      </section>

      <hr className="sidebar-divider" />

      {/* 01c — Intensity */}
      <section className="sidebar-section">
        <div className="intensity-header">
          <span className="sidebar-section-header label">01c — Edit Intensity</span>
          <span className="intensity-value label">{intensity}</span>
        </div>
        <input
          type="range"
          className="intensity-slider"
          min={1}
          max={10}
          step={1}
          value={intensity}
          onChange={(e) => onIntensityChange(Number(e.target.value))}
        />
        <div className="intensity-labels label">
          <span>Slow</span>
          <span>Fast</span>
        </div>
      </section>

      <hr className="sidebar-divider" />

      {/* 02 — Duration */}
      <section className="sidebar-section">
        <span className="sidebar-section-header label">02 — Duration</span>
        <div className="duration-row">
          <input
            type="number"
            className="duration-input"
            value={duration}
            min={1}
            onChange={(e) => onDurationChange(Math.max(1, Number(e.target.value)))}
          />
          <select
            className="duration-unit"
            value={durationUnit}
            onChange={(e) => onDurationUnitChange(e.target.value as 'seconds' | 'minutes')}
          >
            <option value="seconds">Sec</option>
            <option value="minutes">Min</option>
          </select>
        </div>
      </section>

      <hr className="sidebar-divider" />

      {/* 03 — Processing */}
      {status && (
        <>
          <section className="sidebar-section">
            <span className="sidebar-section-header label">03 — Processing</span>
            {status.step === 'error' ? (
              <p className="error-msg label">{status.error ?? 'An error occurred'}</p>
            ) : (
              <ProgressSteps step={status.step} progress={status.progress} message={status.message} />
            )}
          </section>
          <hr className="sidebar-divider" />
        </>
      )}

      {/* Download */}
      {status?.step === 'complete' && jobId && (
        <>
          <section className="sidebar-section">
            <a className="btn" href={`/api/download/${jobId}`} download="supercut.mp4">
              <span>
                supercut.mp4
                {status.outputSize ? ` — ${formatSize(status.outputSize)}` : ''}
              </span>
              <span>↓</span>
            </a>
          </section>
          <hr className="sidebar-divider" />
        </>
      )}

      <div className="sidebar-footer">
        <button className="btn" onClick={onGenerate} disabled={isGenerating}>
          {isGenerating ? 'Processing…' : 'Generate Supercut →'}
        </button>
      </div>
    </aside>
  );
}
