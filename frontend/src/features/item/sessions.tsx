/** Claude sessions of a project: what was done lately, what it was about and how to continue. */
import { Tag } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { useSessions, useTopicMutation, useTree } from '@/api/queries';
import type { ProjectNode, ProjectOut, WorkSession } from '@/api/types';
import { CopyButton } from '@/components/copy-button';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { period, plural } from '@/lib/dates';
import { resumeCommand } from '@/lib/links';

const FIRST = 3;
const OWN = 'own';

function volume({ prompts, files, commits }: WorkSession): string {
  return [
    `${prompts} ${plural(prompts, 'реплика', 'реплики', 'реплик')}`,
    files > 0 && `${files} ${plural(files, 'файл', 'файла', 'файлов')}`,
    commits > 0 && `${commits} ${plural(commits, 'коммит', 'коммита', 'коммитов')}`,
  ]
    .filter(Boolean)
    .join(', ');
}

export function Sessions({ project }: { project: ProjectOut }) {
  const { data, isError } = useSessions(project.slug);
  const projects = useTree(false).data?.projects ?? [];
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
          <li key={session.id} className="flex items-start gap-1 text-sm">
            <div className="min-w-0 flex-1 py-0.5 pr-1">
              <p className="[overflow-wrap:anywhere]">{session.title}</p>
              <p className="text-muted-foreground text-xs">
                <time dateTime={session.started_at}>
                  {period(session.started_at, session.ended_at)}
                </time>
                {' · '}
                {volume(session)}
              </p>
              <Elsewhere session={session} here={project.id} projects={projects} />
            </div>
            <TopicMenu session={session} projects={projects} />
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

/** A session that ran in one project and was about another names the other one. */
function Elsewhere(props: { session: WorkSession; here: number; projects: ProjectNode[] }) {
  const { session, here, projects } = props;
  if (session.topic_id === null) return null;
  const from = session.topic_id === here;
  const other = projects.find(
    ({ project }) => project.id === (from ? session.project_id : session.topic_id),
  );
  const name = other?.project.name ?? 'другой проект';
  const about = other?.future ? 'будущий проект' : 'проект';
  return (
    <p className="mt-0.5 inline-block rounded-md bg-raised px-1.5 text-muted-foreground text-xs leading-5 [overflow-wrap:anywhere]">
      {from ? `обсуждали здесь: ${name}` : `${about}: ${name}`}
    </p>
  );
}

function TopicMenu({ session, projects }: { session: WorkSession; projects: ProjectNode[] }) {
  const topic = useTopicMutation();
  const home = projects.find(({ project }) => project.id === session.project_id);
  const others = projects.filter((node) => node !== home);
  const current = projects.find(({ project }) => project.id === session.topic_id);
  const groups = [
    { label: 'Будущие проекты', nodes: others.filter((node) => node.future) },
    { label: 'Проекты', nodes: others.filter((node) => !node.future) },
  ].filter(({ nodes }) => nodes.length > 0);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`О чем сессия: ${session.title}`}
          title="О чем эта сессия"
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground data-[state=open]:bg-accent"
        >
          <Tag className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-96 max-w-80 overflow-y-auto">
        <DropdownMenuRadioGroup
          value={current?.project.slug ?? OWN}
          onValueChange={(slug) =>
            topic.mutate(
              { id: session.external_id, topic: slug === OWN ? null : slug },
              { onError: () => toast.error('Не удалось сохранить, о чем была сессия') },
            )
          }
        >
          <DropdownMenuRadioItem value={OWN}>
            <span className="truncate">{home?.project.name ?? 'О своем проекте'}</span>
          </DropdownMenuRadioItem>
          {groups.map(({ label, nodes }) => (
            <DropdownMenuGroup key={label}>
              <DropdownMenuLabel>{label}</DropdownMenuLabel>
              {nodes.map(({ project }) => (
                <DropdownMenuRadioItem key={project.id} value={project.slug}>
                  <span className="truncate">{project.name}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuGroup>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
