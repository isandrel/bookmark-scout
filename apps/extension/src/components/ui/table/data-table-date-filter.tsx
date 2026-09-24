import { format } from 'date-fns';
import { Calendar as CalendarIcon, X } from 'lucide-react';
import type { DateRange } from 'react-day-picker';

interface DataTableDateFilterProps {
  title: string;
  className?: string;
  value: DateRange | undefined;
  onChange: (value: DateRange | undefined) => void;
}

export function DataTableDateFilter({
  title,
  className,
  value,
  onChange,
}: DataTableDateFilterProps) {
  const locale = getCalendarLocale();
  // "PP" is the locale's medium date, e.g. "Sep 23, 2026" or "2026/09/23".
  const formatDay = (date: Date) => format(date, 'PP', { locale });
  const label = value?.from
    ? value.to && value.to.getTime() !== value.from.getTime()
      ? t('table_dateRange', [formatDay(value.from), formatDay(value.to)])
      : formatDay(value.from)
    : title;

  return (
    <div className="flex items-center">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            aria-label={value?.from ? `${title}: ${label}` : title}
            className={cn(
              'w-[300px] justify-start text-left font-normal',
              !value?.from && 'text-muted-foreground',
              className,
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            <span>{label}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            autoFocus
            mode="range"
            defaultMonth={value?.from}
            selected={value}
            onSelect={(range) => onChange(range?.from || range?.to ? range : undefined)}
            numberOfMonths={2}
          />
        </PopoverContent>
      </Popover>
      {value?.from && (
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          aria-label={t('table_clearDateFilter')}
          onClick={() => onChange(undefined)}
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
