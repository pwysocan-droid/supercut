export type ProcessingStep =
  | 'idle'
  | 'uploading'
  | 'analyzing'
  | 'selecting'
  | 'rendering'
  | 'complete'
  | 'error';

export interface Clip {
  id: string;
  file: File;
  filename: string; // without extension
  size: number; // bytes
  duration: number | null; // seconds
  thumbnail: string | null; // data URL
}

export interface JobStatus {
  step: ProcessingStep;
  progress: number; // 0–100
  message?: string; // e.g. "Analyzing 3/7"
  error?: string;
  outputSize?: number;
  clipResults?: Record<string, ClipResult>; // keyed by original filename
}

export interface ClipResult {
  score: number;
  reason: string;
  momentCount: number; // how many moments Gemini found
  selected: boolean;   // was any moment from this clip used
}
