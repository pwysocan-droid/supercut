'use client';

import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import ClipCard from './ClipCard';
import { Clip, ClipResult } from '@/lib/types';

interface Props {
  clips: Clip[];
  clipResults: Record<string, ClipResult>;
  onRemove: (id: string) => void;
  onReorder: (clips: Clip[]) => void;
}

export default function ClipList({ clips, clipResults, onRemove, onReorder }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = clips.findIndex((c) => c.id === active.id);
      const newIndex = clips.findIndex((c) => c.id === over.id);
      onReorder(arrayMove(clips, oldIndex, newIndex));
    }
  };

  if (clips.length === 0) return null;

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={clips.map((c) => c.id)} strategy={verticalListSortingStrategy}>
        <div className="clip-list">
          {clips.map((clip, i) => (
            <ClipCard key={clip.id} clip={clip} index={i} result={clipResults[clip.file.name]} onRemove={onRemove} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
