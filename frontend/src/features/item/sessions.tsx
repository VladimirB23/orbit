/** Claude sessions of a project: what was done lately and how to continue. */
import { useState } from 'react';
import { useSessions } from '@/api/queries';
import type { WorkSession } from '@/api/types';
import { CopyButton } from '@/components/copy-button';
import { Button } from '@/components/ui/button';
import { period, plural } from '@/lib/dates';
import { resumeCommand } from '@/lib/links';

const FIRST = 3;

function volume({ prompts, files, commits }: WorkSession): string {
  return [
    `${prompts} ${plural(prompts, 'реплика', 'реплики', 'реплик')}`,
    files > 0 && `${files} ${plural(files, 'файл', 'файла', 'файлов')}`,
    commits > 0 && `${commits} ${plural(commits, 'коммит', 'коммита', 'коммитов')}`,
  ]
    .filter(Boolean)
    .join(', ');
}

export function Sessions({ slug }: { slug: string }) {
  const { data, isError } = useSessions(slug);
  const [all, setAll] = useState(false);
  if (isError) {
    return <p className="text-muted-foreground text-sm">Не удалось загрузить сессии</p>;
  }
  if (!data || data.length === 0) return null;
  const shown = all ? data : data.slice(0, FIRST);

  return (
    <section aria-label="Сессии Claude" className="border-line border-t pt-4">
      <h2 className="mb-2 font-semibold text-sm">Сессии Claude</h2>
      <ul className="space-y-2">
        {shown.map((session) => (
          <li key={session.id} className="flex items-start gap-2 text-sm">
            <div className="min-w-0 flex-1 py-0.5">
              <p className="[overflow-wrap:anywhere]">{session.title}</p>
              <p className="text-muted-foreground text-xs">
                <time dateTime={session.started_at}>
                  {period(session.started_at, session.ended_at)}
                </time>
                {' · '}
                {volume(session)}
              </p>
            </div>
            <CopyButton
              text={resumeCommand(session.folder, session.external_id)}
              label={`Скопировать команду, чтобы продолжить: ${session.title}`}
            />
          </li>
        ))}
      </ul>
      {data.length > shown.length && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2 font-normal text-muted-foreground"
          onClick={() => setAll(true)}
        >
          Показать все ({data.length})
        </Button>
      )}
    </section>
  );
}
