/** A calendar day: quick choices first, the calendar below. */
import { ru } from 'react-day-picker/locale';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { addDays, type Day, formatDate, toDate, toDay } from '@/lib/dates';

interface Props {
  label: string;
  value: Day | null;
  today: Day;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (day: Day | null) => void;
  onCloseAutoFocus?: (event: Event) => void;
  children: React.ReactNode;
}

export function DateField(props: Props) {
  const { label, value, today, open, onOpenChange, onChange, onCloseAutoFocus, children } = props;
  const choose = (day: Day | null) => {
    onOpenChange(false);
    if (day !== value) onChange(day);
  };
  const quick: [string, Day][] = [
    ['Сегодня', today],
    ['Завтра', addDays(today, 1)],
    ['Через неделю', addDays(today, 7)],
  ];
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto p-2"
        aria-label={label}
        onCloseAutoFocus={onCloseAutoFocus}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <div className="flex gap-1">
          {quick.map(([text, day]) => (
            <Button
              key={text}
              variant={day === value ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 px-2.5 font-normal"
              onClick={() => choose(day)}
            >
              {text}
            </Button>
          ))}
        </div>
        <Calendar
          mode="single"
          locale={ru}
          selected={value ? toDate(value) : undefined}
          defaultMonth={toDate(value ?? today)}
          today={toDate(today)}
          onSelect={(date) => choose(date ? toDay(date) : null)}
          className="w-full p-1 [--cell-size:--spacing(9)]"
        />
        {value && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-full font-normal text-muted-foreground"
            onClick={() => choose(null)}
          >
            Убрать дату ({formatDate(value)})
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
