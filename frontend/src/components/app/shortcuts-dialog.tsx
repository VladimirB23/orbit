import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const GROUPS: [string, [string[], string][]][] = [
  [
    'Перемещение',
    [
      [['Ctrl', 'K'], 'Найти или открыть что угодно'],
      [['↑', '↓'], 'По строкам'],
      [['→', '←'], 'Развернуть и свернуть'],
      [['Enter'], 'Открыть панель'],
      [['Esc'], 'Закрыть панель'],
      [['/'], 'Поиск'],
      [['G'], 'Дерево или таймлайн'],
    ],
  ],
  [
    'Правка строки',
    [
      [['Пробел'], 'Отметить готовым'],
      [['S'], 'Статус'],
      [['D'], 'Срок'],
      [['C'], 'Комментарий'],
      [['F2'], 'Переименовать'],
      [['Del'], 'Удалить'],
    ],
  ],
  [
    'Таймлайн',
    [
      [['Shift', '→'], 'Сдвинуть на день (и Shift ←)'],
      [[']'], 'Срок на день позже ([ раньше)'],
      [['T'], 'К сегодняшнему дню'],
      [['+', '−'], 'Масштаб (и Ctrl + колесо)'],
      [['Esc'], 'Отменить перетаскивание'],
    ],
  ],
  [
    'Проект строки',
    [
      [['O'], 'Открыть папку в VS Code'],
      [['Shift', 'O'], 'Открыть заметку в Obsidian'],
    ],
  ],
  [
    'Добавление',
    [
      [['N'], 'Задача внутри строки'],
      [['Shift', 'N'], 'Этап в проекте'],
      [['P'], 'Новый проект'],
    ],
  ],
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutsDialog({ open, onOpenChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Горячие клавиши</DialogTitle>
          <DialogDescription>
            Работают в любой раскладке, действуют на выделенную строку.
          </DialogDescription>
        </DialogHeader>
        {GROUPS.map(([title, keys]) => (
          <section key={title}>
            <h3 className="mb-1.5 font-semibold text-sm">{title}</h3>
            <dl>
              {keys.map(([combo, text]) => (
                <div key={text} className="flex items-center justify-between py-1 text-sm">
                  <dt className="text-muted-foreground">{text}</dt>
                  <dd className="flex gap-1">
                    {combo.map((key) => (
                      <kbd
                        key={key}
                        className="min-w-6 rounded border border-border bg-raised px-1.5 text-center font-sans text-xs leading-5"
                      >
                        {key}
                      </kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </DialogContent>
    </Dialog>
  );
}
