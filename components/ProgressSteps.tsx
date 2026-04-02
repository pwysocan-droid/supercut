import { ProcessingStep } from '@/lib/types';

const STEPS: { key: ProcessingStep; label: string }[] = [
  { key: 'uploading', label: 'Uploading' },
  { key: 'analyzing', label: 'Gemini analysis' },
  { key: 'selecting', label: 'Selecting segments' },
  { key: 'rendering', label: 'FFmpeg render' },
  { key: 'complete', label: 'Export' },
];

const STEP_ORDER: ProcessingStep[] = ['uploading', 'analyzing', 'selecting', 'rendering', 'complete'];

interface Props {
  step: ProcessingStep;
  progress: number;
  message?: string;
}

export default function ProgressSteps({ step, progress, message }: Props) {
  const currentIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="progress-steps">
      {STEPS.map((s, i) => {
        const isActive = s.key === step;
        const isDone = i < currentIndex;
        return (
          <div
            key={s.key}
            className={[
              'progress-step',
              isActive ? 'progress-step--active' : '',
              isDone ? 'progress-step--done' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span
              className={[
                'progress-dot',
                isActive ? 'progress-dot--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            />
            <span className="label">{s.label}</span>
            {isActive && step !== 'complete' && (
              <span className="progress-pct label">{message || `${progress}%`}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
