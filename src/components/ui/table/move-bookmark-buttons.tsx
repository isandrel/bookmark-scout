import { ChevronDown, ChevronsDown, ChevronsUp, ChevronUp, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface MoveBookmarkButtonsProps {
  onMove: (direction: 'up' | 'down' | 'top' | 'bottom') => void;
}

type MoveButtonConfig = {
  direction: 'up' | 'down' | 'top' | 'bottom';
  icon: LucideIcon;
};

const moveButtons: MoveButtonConfig[] = [
  { direction: 'top', icon: ChevronsUp },
  { direction: 'up', icon: ChevronUp },
  { direction: 'down', icon: ChevronDown },
  { direction: 'bottom', icon: ChevronsDown },
];

export function MoveBookmarkButtons({ onMove }: MoveBookmarkButtonsProps) {
  return (
    <div className="flex items-center space-x-1">
      {moveButtons.map(({ direction, icon: Icon }) => (
        <Button
          key={direction}
          variant="outline"
          size="icon"
          className="h-8 w-8 p-0"
          onClick={(e) => {
            e.stopPropagation();
            onMove(direction);
          }}
        >
          <Icon className="h-4 w-4" />
        </Button>
      ))}
    </div>
  );
}
