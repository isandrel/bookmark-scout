import { ChevronLeft, ChevronRight } from 'lucide-react';
import type * as React from 'react';
import { DayPicker, getDefaultClassNames } from 'react-day-picker';
import { type DayPickerLocale, enUS, ja, ko } from 'react-day-picker/locale';

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

const calendarLocales: Record<'en' | 'ja' | 'ko', DayPickerLocale> = { en: enUS, ja, ko };

/** date-fns locale matching the extension language, for calendars and date labels. */
export function getCalendarLocale(): DayPickerLocale {
  return calendarLocales[getResolvedLanguage()];
}

function CalendarChevron({
  className,
  orientation,
}: {
  className?: string;
  orientation?: 'up' | 'down' | 'left' | 'right';
}) {
  const Icon = orientation === 'left' ? ChevronLeft : ChevronRight;
  return <Icon className={cn('h-4 w-4', className)} />;
}

/** react-day-picker v10 calendar styled for the extension (shadcn/ui layout). */
function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const defaults = getDefaultClassNames();

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      locale={getCalendarLocale()}
      className={cn('p-3', className)}
      classNames={{
        root: cn(defaults.root, 'w-fit'),
        months: 'relative flex flex-col gap-4 sm:flex-row',
        month: 'flex w-full flex-col gap-4',
        nav: 'absolute inset-x-0 top-0 flex w-full items-center justify-between gap-1',
        button_previous: cn(
          buttonVariants({ variant: 'outline' }),
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 aria-disabled:opacity-30',
        ),
        button_next: cn(
          buttonVariants({ variant: 'outline' }),
          'h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100 aria-disabled:opacity-30',
        ),
        month_caption: 'flex h-7 w-full items-center justify-center px-8',
        caption_label: 'text-sm font-medium',
        month_grid: 'w-full border-collapse',
        weekdays: 'flex',
        weekday: 'w-8 flex-1 select-none text-[0.8rem] font-normal text-muted-foreground',
        week: 'mt-2 flex w-full',
        day: 'relative h-8 w-8 p-0 text-center text-sm focus-within:relative focus-within:z-20',
        day_button: cn(
          buttonVariants({ variant: 'ghost' }),
          'h-8 w-8 p-0 font-normal aria-selected:opacity-100',
        ),
        selected:
          '[&>button]:bg-primary [&>button]:text-primary-foreground [&>button]:hover:bg-primary [&>button]:hover:text-primary-foreground [&>button]:focus:bg-primary [&>button]:focus:text-primary-foreground',
        range_start: 'rounded-l-md bg-accent',
        range_middle:
          'bg-accent [&>button]:bg-transparent! [&>button]:text-accent-foreground! [&>button]:rounded-none',
        range_end: 'rounded-r-md bg-accent',
        today: '[&>button]:bg-accent [&>button]:text-accent-foreground',
        outside: 'text-muted-foreground opacity-50 aria-selected:opacity-100',
        disabled: 'text-muted-foreground opacity-50',
        hidden: 'invisible',
        ...classNames,
      }}
      components={{ Chevron: CalendarChevron }}
      {...props}
    />
  );
}
Calendar.displayName = 'Calendar';

export { Calendar };
