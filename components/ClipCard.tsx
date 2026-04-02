import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Clip, ClipResult } from '@/lib/types';
import { formatSize, formatDuration } from '@/lib/utils';

interface Props {
  clip: Clip;
  index: number;
  result?: ClipResult;
  onRemove: (id: string) => void;
}

export default function ClipCard({ clip, index, result, onRemove }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: clip.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    position: 'relative' as const,
    zIndex: isDragging ? 1 : 'auto',
  };

  const num = String(index + 1).padStart(2, '0');

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`clip-card${result ? (result.selected ? ' clip-card--selected' : ' clip-card--skipped') : ''}`}
      {...attributes}
      {...listeners}
    >
      <span className={`clip-card-num label${result?.selected ? ' clip-card-num--selected' : ''}`}>{num}</span>
      <div className="clip-card-thumb">
        {clip.thumbnail ? (
          <img src={clip.thumbnail} alt={clip.filename} />
        ) : (
          <div className="clip-card-thumb-placeholder" />
        )}
      </div>
      <div className="clip-card-info">
        <span className="clip-card-name">{clip.filename}</span>
        {result ? (
          <>
            <span className="clip-card-score label">
              <span className="clip-card-score-value" style={{ color: result.selected ? 'var(--accent)' : undefined }}>
                {result.score}/10
              </span>
              {result.momentCount > 1 && (
                <span style={{ color: 'rgba(10,10,8,0.4)' }}> · {result.momentCount} moments</span>
              )}
              {!result.selected && <span style={{ color: 'rgba(10,10,8,0.4)' }}> · skipped</span>}
            </span>
            <span className="clip-card-reason label">{result.reason}</span>
          </>
        ) : (
          <span className="clip-card-meta label">
            {formatSize(clip.size)}
            {clip.duration !== null ? ` — ${formatDuration(clip.duration)}` : ''}
          </span>
        )}
      </div>
      <button
        className="clip-card-remove"
        onClick={(e) => { e.stopPropagation(); onRemove(clip.id); }}
        aria-label="Remove clip"
      >
        ×
      </button>
    </div>
  );
}
