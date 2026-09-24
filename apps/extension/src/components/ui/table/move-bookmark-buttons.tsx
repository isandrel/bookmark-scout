import { ChevronDown, ChevronsDown, ChevronsUp, ChevronUp, type LucideIcon } from 'lucide-react';

interface MoveBookmarkButtonsProps {
  onMove: (direction: 'up' | 'down' | 'top' | 'bottom') => void;
}

type MoveButtonConfig = {
  direction: 'up' | 'down' | 'top' | 'bottom';
  icon: LucideIcon;
  labelKey: string;
};

const moveButtons: MoveButtonConfig[] = [
  { direction: 'top', icon: ChevronsUp, labelKey: 'table_moveTop' },
  { direction: 'up', icon: ChevronUp, labelKey: 'table_moveUp' },
  { direction: 'down', icon: ChevronDown, labelKey: 'table_moveDown' },
  { direction: 'bottom', icon: ChevronsDown, labelKey: 'table_moveBottom' },
];

export function MoveBookmarkButtons({ onMove }: MoveBookmarkButtonsProps) {
  return (
    <div className="flex items-center space-x-1">
      {moveButtons.map(({ direction, icon: Icon, labelKey }) => (
        <Button
          key={direction}
          variant="outline"
          size="icon"
          className="h-8 w-8 p-0"
          aria-label={t(labelKey)}
          title={t(labelKey)}
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
