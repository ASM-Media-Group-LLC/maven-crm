import { useState, useRef, useCallback, type ReactNode } from "react";
import { GripVertical } from "lucide-react";

interface DraggableGridProps<T extends { id: string }> {
  items: T[];
  renderItem: (item: T, isDragging: boolean) => ReactNode;
  onReorder: (reorderedIds: string[]) => void;
  className?: string;
}

const DraggableGrid = <T extends { id: string }>({
  items,
  renderItem,
  onReorder,
  className = "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4",
}: DraggableGridProps<T>) => {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const draggedIndex = useRef<number>(-1);
  const wasDragged = useRef(false);

  const handleDragStart = (id: string, index: number) => {
    setDraggedId(id);
    draggedIndex.current = index;
    wasDragged.current = true;
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (id !== draggedId) {
      setOverId(id);
    }
  };

  const handleDrop = (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex.current === -1 || draggedIndex.current === targetIndex) {
      setDraggedId(null);
      setOverId(null);
      return;
    }

    const newItems = [...items];
    const [moved] = newItems.splice(draggedIndex.current, 1);
    newItems.splice(targetIndex, 0, moved);

    onReorder(newItems.map((item) => item.id));
    setDraggedId(null);
    setOverId(null);
    draggedIndex.current = -1;
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setOverId(null);
    draggedIndex.current = -1;
    // Reset wasDragged after a tick so the click handler can read it
    setTimeout(() => { wasDragged.current = false; }, 0);
  };

  const handleClickCapture = useCallback((e: React.MouseEvent) => {
    if (wasDragged.current) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);

  return (
    <div className={className}>
      {items.map((item, index) => (
        <div
          key={item.id}
          draggable
          onDragStart={() => handleDragStart(item.id, index)}
          onDragOver={(e) => handleDragOver(e, item.id)}
          onDrop={(e) => handleDrop(e, index)}
          onDragEnd={handleDragEnd}
          onClickCapture={handleClickCapture}
          className={`relative transition-all duration-150 group/drag ${
            draggedId === item.id ? "opacity-40 scale-95" : ""
          } ${
            overId === item.id ? "ring-2 ring-primary ring-offset-2 ring-offset-background rounded-lg" : ""
          }`}
        >
          {/* Grip handle */}
          <div className="absolute top-2 left-2 z-10 opacity-0 group-hover/drag:opacity-100 transition-opacity cursor-grab active:cursor-grabbing">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
          </div>
          {renderItem(item, draggedId === item.id)}
        </div>
      ))}
    </div>
  );
};

export default DraggableGrid;
