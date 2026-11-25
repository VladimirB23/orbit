/** Side panel: every field of the chosen row and its history. */
import { ExternalLink, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Meta, ProjectOut } from '@/api/types';
import { DateField } from '@/components/fields/date-field';
import { PriorityMenu, StatusMenu } from '@/components/fields/status-menu';
import { TextEditor } from '@/components/fields/text-editor';
import { OrbitGlyph } from '@/components/orbit-glyph';
import { PriorityMark } from '@/components/priority-mark';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ProgressBar } from '@/features/tree/signals';
import { type Day, dueHint, formatDate } from '@/lib/dates';
import { isClosed, PRIORITY_LABEL, STATUS_LABEL } from '@/lib/status';
import type { TreeItem } from '@/lib/tree';
import { cn } from '@/lib/utils';
import { History } from './history';
import { Places } from './places';
import { Sessions } from './sessions';
import { type Edit, noteField, titleField } from './use-edit';

const ENTITY_LABEL = { project: 'Проект', milestone: 'Этап', task: 'Задача' } as const;

interface Props {
  item: TreeItem;
  /** The project the item belongs to (itself for a project). */
  project: ProjectOut | null;
  path: TreeItem[];
  /** Milestones of the same project, to move a task between them. */
  milestones: TreeItem[];
  today: Day;
  limits: Meta['limits'];
  edit: Edit;
  onOpen: (item: TreeItem) => void;
  onClose: () => void;
}

const valueButton =
  'flex min-h-8 w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-accent data-[state=open]:bg-accent';

export function ItemPanel(props: Props) {
  const { item, path, milestones, today, limits, edit, onOpen, onClose } = props;
  const { project } = item;
  const closed = isClosed(item.status);
  const save = (changes: Parameters<Edit['edit']>[1]) => edit.edit(item, changes);

  return (
    <aside
      aria-label={`${ENTITY_LABEL[item.entity]}: ${item.title}`}
      className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-border border-l bg-card shadow-xl sm:w-[27rem] lg:static lg:z-auto lg:shrink-0 lg:shadow-none"
    >
      <header className="flex min-h-12 items-center gap-1 border-line border-b pr-2 pl-5 text-muted-foreground text-sm">
        <nav aria-label="Путь" className="flex min-w-0 flex-1 items-center gap-1">
          {path.length === 0 && ENTITY_LABEL[item.entity]}
          {path.map((parent, index) => (
            <span key={parent.key} className="flex min-w-0 items-center gap-1">
              {index > 0 && <span aria-hidden="true">/</span>}
              <button
                type="button"
                onClick={() => onOpen(parent)}
                className="truncate rounded-sm hover:text-foreground hover:underline"
              >
                {parent.title}
              </button>
            </span>
          ))}
        </nav>
        <span className="shrink-0 text-faint">
          {item.entity === 'project' ? item.slug : `#${item.id}`}
        </span>
        <Button variant="ghost" size="icon" aria-label="Закрыть панель" onClick={onClose}>
          <X />
        </Button>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
        <Text
          key={`${item.key}-title`}
          label="Название"
          value={item.title}
          limit={item.entity === 'task' ? limits.title : limits.name}
          required
          className="-mx-2 w-[calc(100%+1rem)] font-semibold text-lg leading-snug"
          onSave={(text) => save({ [titleField(item)]: text })}
        />

        {item.future && (
          <p className="rounded-md bg-raised px-3 py-2 text-muted-foreground text-sm">
            Будущий проект: папки еще нет, только обсуждения. Укажи папку ниже или проведи в ней
            первую сессию, и проект станет обычным. История сохранится.
          </p>
        )}

        {props.project && <Places project={props.project} />}

        <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-y-0.5">
          <Field label="Статус">
            <StatusMenu value={item.status} onChange={(status) => void save({ status })}>
              <button type="button" className={valueButton}>
                <OrbitGlyph status={item.status} />
                {STATUS_LABEL[item.status]}
              </button>
            </StatusMenu>
          </Field>
          {item.progress !== null && (
            <Field label="Прогресс">
              <div className="flex min-h-8 items-center px-2">
                <ProgressBar value={item.progress} label="Прогресс" />
              </div>
            </Field>
          )}
          {item.priority !== null && (
            <Field label="Приоритет">
              <PriorityMenu value={item.priority} onChange={(priority) => void save({ priority })}>
                <button type="button" className={valueButton}>
                  <PriorityMark value={item.priority} />
                  {PRIORITY_LABEL[item.priority]}
                </button>
              </PriorityMenu>
            </Field>
          )}
          <Field label="Старт">
            <DateValue
              key={`${item.key}-start`}
              label="Дата старта"
              value={item.startDate}
              today={today}
              onChange={(day) => void save({ start_date: day })}
            />
          </Field>
          <Field label="Срок">
            <DateValue
              key={`${item.key}-due`}
              label="Срок"
              value={item.dueDate}
              today={today}
              hint={item.dueDate && !closed ? dueHint(item.dueDate, today) : undefined}
              tone={item.overdue ? 'text-danger' : item.upcoming ? 'text-sun-ink' : undefined}
              onChange={(day) => void save({ due_date: day })}
            />
          </Field>
          {item.entity === 'task' && item.parentId === null && milestones.length > 0 && (
            <Field label="Этап">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={valueButton}>
                    <span className="truncate">
                      {milestones.find((m) => m.id === item.milestoneId)?.title ?? 'Без этапа'}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="max-h-96 max-w-80 overflow-y-auto">
                  <DropdownMenuRadioGroup
                    value={String(item.milestoneId ?? '')}
                    onValueChange={(id) => void save({ milestone_id: id ? Number(id) : null })}
                  >
                    <DropdownMenuRadioItem value="">Без этапа</DropdownMenuRadioItem>
                    {milestones.map((m) => (
                      <DropdownMenuRadioItem key={m.id} value={String(m.id)}>
                        <span className="truncate">{m.title}</span>
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </Field>
          )}
        </dl>

        <section aria-label={item.entity === 'task' ? 'Комментарий' : 'Кратко'}>
          <Text
            key={`${item.key}-note`}
            label={item.entity === 'task' ? 'Комментарий' : 'Кратко'}
            value={item.note ?? ''}
            limit={item.entity === 'task' ? limits.comment : limits.summary}
            multiline
            placeholder={item.entity === 'task' ? 'Добавить комментарий' : 'Добавить описание'}
            className="-mx-2 w-[calc(100%+1rem)] leading-relaxed"
            onSave={(text) => save({ [noteField(item)]: text || null })}
          />
        </section>

        {project && (
          <dl className="grid grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-y-0.5 border-line border-t pt-4">
            <Field label="Заметка">
              <Text
                key={`${item.key}-obsidian`}
                label="Заметка Obsidian"
                value={project.obsidian_path ?? ''}
                limit={500}
                placeholder="Путь в Obsidian"
                className="text-sm"
                onSave={(text) => save({ obsidian_path: text || null })}
              />
            </Field>
            <Field label="Папка">
              <Text
                key={`${item.key}-repo`}
                label="Папка проекта"
                value={project.repo_path ?? ''}
                limit={500}
                placeholder="Путь к папке"
                className="text-sm"
                onSave={(text) => save({ repo_path: text || null })}
              />
            </Field>
            <Field label="GitHub">
              <span className="flex items-start">
                <Text
                  key={`${item.key}-github`}
                  label="Адрес на GitHub"
                  value={project.github_url ?? ''}
                  limit={500}
                  placeholder="Адрес репозитория"
                  className="text-sm"
                  onSave={(text) => save({ github_url: text || null })}
                />
                <SafeLink url={project.github_url} />
              </span>
            </Field>
          </dl>
        )}

        {project && <Sessions key={project.slug} project={project} />}

        <History entity={item.entity} id={item.id} />
      </div>

      <footer className="flex justify-end border-line border-t px-3 py-2">
        {project ? (
          <Button
            variant="ghost"
            size="sm"
            className="font-normal text-muted-foreground"
            onClick={() => void edit.setArchived(item, project.archived_at === null)}
          >
            {project.archived_at === null ? 'В архив' : 'Вернуть из архива'}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="font-normal text-danger hover:bg-danger-wash hover:text-danger"
            onClick={async () => (await edit.removeItem(item)) && onClose()}
          >
            Удалить
          </Button>
        )}
      </footer>
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="py-1.5 text-muted-foreground text-sm">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </>
  );
}

interface DateValueProps {
  label: string;
  value: Day | null;
  today: Day;
  hint?: string;
  tone?: string;
  onChange: (day: Day | null) => void;
}

function DateValue({ label, value, today, hint, tone, onChange }: DateValueProps) {
  const [open, setOpen] = useState(false);
  return (
    <DateField
      label={label}
      value={value}
      today={today}
      open={open}
      onOpenChange={setOpen}
      onChange={onChange}
    >
      <button type="button" className={cn(valueButton, tone, !value && 'text-faint')}>
        {value ? formatDate(value) : 'Не задан'}
        {hint && <span className="text-sm opacity-80">{hint}</span>}
      </button>
    </DateField>
  );
}

interface TextProps {
  label: string;
  value: string;
  limit: number;
  required?: boolean;
  multiline?: boolean;
  placeholder?: string;
  className?: string;
  onSave: (text: string) => Promise<boolean>;
}

/** Looks like text, becomes a field on click. */
function Text({ value, placeholder, className, ...editor }: TextProps) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <TextEditor
        {...editor}
        initial={value}
        placeholder={placeholder}
        className={cn('px-2', className)}
        onClose={() => setEditing(false)}
      />
    );
  }
  return (
    <button
      type="button"
      aria-label={`${editor.label}: ${value || placeholder}`}
      onClick={() => setEditing(true)}
      className={cn(
        'block min-h-8 w-full min-w-0 cursor-text whitespace-pre-wrap rounded-md px-2 py-1 text-left [overflow-wrap:anywhere] hover:bg-accent',
        className,
        !value && 'font-normal text-faint',
      )}
    >
      {value || placeholder}
    </button>
  );
}

/** Data may come from anywhere, so only web addresses become links. */
function SafeLink({ url }: { url: string | null }) {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Открыть на GitHub"
      className="grid size-8 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
    >
      <ExternalLink className="size-4" />
    </a>
  );
}

/** Escape closes the panel unless something inside it (a menu, an editor) has used the key. */
export function useEscape(active: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!active) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      if (
        event.target instanceof Element &&
        event.target.closest('[role="menu"],[role="dialog"],[role="alertdialog"]')
      )
        return;
      onEscape();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [active, onEscape]);
}
