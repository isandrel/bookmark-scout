import { ChevronDown, ChevronsDown, ChevronsUp, ChevronUp, type LucideIcon } from 'lucide-react';
import { createContext, useContext } from 'react';

type MoveDirection = 'up' | 'down' | 'top' | 'bottom';

interface MoveBookmarkButtonsProps {
  onMove: (direction: MoveDirection) => Promise<void>;
}

type MoveButtonConfig = {
  direction: MoveDirection;
  icon: LucideIcon;
  labelKey: string;
};

const moveButtons: MoveButtonConfig[] = [
  { direction: 'top', icon: ChevronsUp, labelKey: 'table_moveTop' },
  { direction: 'up', icon: ChevronUp, labelKey: 'table_moveUp' },
  { direction: 'down', icon: ChevronDown, labelKey: 'table_moveDown' },
  { direction: 'bottom', icon: ChevronsDown, labelKey: 'table_moveBottom' },
];

/**
 * Why reordering is unavailable for the current table view (for example, the rows are not in
 * browser order, so a move would have no visible effect), or null when moves are allowed.
 */
export const MoveDisabledReasonContext = createContext<string | null>(null);

export function MoveBookmarkButtons({ onMove }: MoveBookmarkButtonsProps) {
  const disabledReason = useContext(MoveDisabledReasonContext);
  const { toast } = useToast();

  return (
    // Disabled buttons receive no pointer events, so the explanation lives on the wrapper.
    // Clicks on disabled buttons land here and must not open the folder row.
    // biome-ignore lint/a11y/useKeyWithClickEvents: only swallows clicks; the buttons are the controls.
    // biome-ignore lint/a11y/noStaticElementInteractions: see above.
    <div
      className="flex items-center space-x-1"
      title={disabledReason ?? undefined}
      onClick={(event) => event.stopPropagation()}
    >
      {moveButtons.map(({ direction, icon: Icon, labelKey }) => (
        <Button
          key={direction}
          variant="outline"
          size="icon"
          className="h-8 w-8 p-0"
          disabled={disabledReason !== null}
          aria-label={t(labelKey)}
          aria-description={disabledReason ?? undefined}
          title={disabledReason ?? t(labelKey)}
          onClick={(e) => {
            e.stopPropagation();
            onMove(direction).catch((error: unknown) =>
              toast({
                title: `× ${t('toast_errorMovingItem')}`,
                description: error instanceof Error ? error.message : t('error_unknown'),
                variant: 'destructive',
              }),
            );
          }}
        >
          <Icon className="h-4 w-4" />
        </Button>
      ))}
    </div>
  );
}
