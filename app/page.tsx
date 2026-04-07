'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import DropZone from '@/components/DropZone';
import ClipList from '@/components/ClipList';
import Sidebar from '@/components/Sidebar';
import { Clip, JobStatus } from '@/lib/types';
import { processVideoFile, formatSize } from '@/lib/utils';

export default function Page() {
  const [clips, setClips] = useState<Clip[]>([]);
  const [intent, setIntent] = useState('');
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [intensity, setIntensity] = useState(5);
  const [duration, setDuration] = useState(30);
  const [durationUnit, setDurationUnit] = useState<'seconds' | 'minutes'>('seconds');
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const addFiles = useCallback(async (files: File[]) => {
    const videos = files.filter((f) => f.type.startsWith('video/'));
    for (const file of videos) {
      const id = crypto.randomUUID();
      // Add immediately with placeholders, then fill in once processed
      setClips((prev) => [
        ...prev,
        { id, file, filename: file.name.replace(/\.[^/.]+$/, ''), size: file.size, duration: null, thumbnail: null },
      ]);
      processVideoFile(file)
        .then(({ duration, thumbnail }) =>
          setClips((prev) => prev.map((c) => (c.id === id ? { ...c, duration, thumbnail } : c)))
        )
        .catch(() => {});
    }
  }, []);

  const removeClip = useCallback((id: string) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const reorderClips = useCallback((next: Clip[]) => setClips(next), []);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  useEffect(() => () => stopPolling(), []);

  const startPolling = (id: string) => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/status/${id}`);
        const data: JobStatus = await res.json();
        setStatus(data);
        if (data.step === 'complete' || data.step === 'error') stopPolling();
      } catch {}
    }, 2000);
  };

  const handleGenerate = async () => {
    if (clips.length === 0) return;

    const durationSeconds = durationUnit === 'minutes' ? duration * 60 : duration;
    setStatus({ step: 'uploading', progress: 0 });
    setJobId(null);
    stopPolling();

    try {
      const formData = new FormData();
      for (const clip of clips) formData.append('files', clip.file);
      if (referenceFile) formData.append('reference', referenceFile);
      formData.append('intent', intent);
      formData.append('duration', String(durationSeconds));
      formData.append('intensity', String(intensity));

      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');

      const { jobId: id } = await res.json();
      setJobId(id);
      startPolling(id);
    } catch {
      setStatus({ step: 'error', progress: 0, error: 'Upload failed — check Railway connection' });
    }
  };

  const isGenerating =
    status !== null && status.step !== 'complete' && status.step !== 'error';

  const totalSize = clips.reduce((sum, c) => sum + c.size, 0);

  return (
    <div className="app-shell">
      <header className="topbar">
        <span className="label">Supercut</span>
        <span className="label" style={{ color: 'rgba(10,10,8,0.45)' }}>
          {clips.length} clip{clips.length !== 1 ? 's' : ''}
          {totalSize > 0 ? ` — ${formatSize(totalSize)}` : ''}
        </span>
      </header>

      <div className="main-layout">
        <div className="clip-panel">
          <DropZone onAddFiles={addFiles} />
          <ClipList clips={clips} clipResults={status?.clipResults ?? {}} onRemove={removeClip} onReorder={reorderClips} />
        </div>
        <Sidebar
          intent={intent}
          onIntentChange={setIntent}
          referenceFile={referenceFile}
          onReferenceChange={setReferenceFile}
          intensity={intensity}
          onIntensityChange={setIntensity}
          duration={duration}
          onDurationChange={setDuration}
          durationUnit={durationUnit}
          onDurationUnitChange={setDurationUnit}
          status={status}
          jobId={jobId}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
        />
      </div>
    </div>
  );
}
