/** Where the work lives: the folder to open in VS Code and the note in Obsidian. */
import { BookOpen, CodeXml, Folder } from 'lucide-react';
import { useMeta } from '@/api/queries';
import type { ProjectOut } from '@/api/types';
import { CopyButton } from '@/components/copy-button';
import { Button } from '@/components/ui/button';
import { folderPath, obsidianUrl, vscodeUrl } from '@/lib/links';

export interface PlaceLinks {
  folder: string | null;
  vscode: string | null;
  note: string | null;
}

export function usePlaces(project: ProjectOut | null | undefined): PlaceLinks {
  const { data: meta } = useMeta();
  return places(project, meta?.vault ?? null);
}

export function places(project: ProjectOut | null | undefined, vault: string | null): PlaceLinks {
  return {
    folder: folderPath(project?.repo_path ?? null),
    vscode: vscodeUrl(project?.repo_path ?? null),
    note: obsidianUrl(vault, project?.obsidian_path ?? null),
  };
}

/** The same two links for a project and for everything inside it. */
export function Places({ project }: { project: ProjectOut }) {
  const { folder, vscode, note } = usePlaces(project);
  if (!folder && !note) return null;
  return (
    <section aria-label="Где лежит проект" className="space-y-2">
      {folder && (
        <p className="flex items-center gap-2 text-sm">
          <Folder aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <span className="min-w-0 select-all [overflow-wrap:anywhere]">{folder}</span>
          <CopyButton text={folder} label="Скопировать адрес папки" />
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {vscode && (
          <Button asChild variant="outline" size="sm" className="font-normal">
            <a href={vscode}>
              <CodeXml /> Открыть в VS Code
            </a>
          </Button>
        )}
        {note && (
          <Button asChild variant="outline" size="sm" className="font-normal">
            <a href={note}>
              <BookOpen /> Заметка в Obsidian
            </a>
          </Button>
        )}
      </div>
    </section>
  );
}
