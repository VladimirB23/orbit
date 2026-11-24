import { useState } from 'react';
import { useCreateProject } from '@/api/queries';
import type { Meta, ProjectOut } from '@/api/types';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { errorText } from '@/features/item/use-edit';
import { SLUG_RE, slugify } from '@/lib/slug';

interface Props {
  open: boolean;
  taken: string[];
  limits: Meta['limits'];
  onOpenChange: (open: boolean) => void;
  onCreated: (project: ProjectOut) => void;
}

export function NewProjectDialog(props: Props) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">{props.open && <Form {...props} />}</DialogContent>
    </Dialog>
  );
}

function Form({ taken, limits, onOpenChange, onCreated }: Props) {
  const create = useCreateProject();
  const [name, setName] = useState('');
  // null: follows the name until the person edits it.
  const [ownSlug, setOwnSlug] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const slug = ownSlug ?? slugify(name);

  function problem(): string | null {
    if (!name.trim()) return 'Нужно название';
    if (!SLUG_RE.test(slug)) return 'Код: латинские буквы, цифры и дефисы между ними';
    if (taken.includes(slug)) return 'Проект с таким кодом уже есть';
    return null;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const found = problem();
    if (found) return setError(found);
    try {
      onCreated(await create.mutateAsync({ name, slug, status: 'planned', priority: 0 }));
    } catch (failure) {
      setError(errorText(failure));
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4" noValidate>
      <DialogHeader>
        <DialogTitle>Новый проект</DialogTitle>
        <DialogDescription>Статус, сроки и этапы добавишь сразу после создания.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-2">
        <Label htmlFor="project-name">Название</Label>
        <Input
          id="project-name"
          autoFocus
          autoComplete="off"
          maxLength={limits.name}
          value={name}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="project-slug">Код</Label>
        <Input
          id="project-slug"
          autoComplete="off"
          spellCheck={false}
          maxLength={64}
          aria-describedby="project-slug-hint"
          value={slug}
          onChange={(event) => {
            setOwnSlug(event.target.value.toLowerCase());
            setError(null);
          }}
        />
        <p id="project-slug-hint" className="text-muted-foreground text-sm">
          По нему проект зовут в командах. Обычно это имя папки в D:\Projects.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-danger text-sm">
          {error}
        </p>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
          Отмена
        </Button>
        <Button type="submit" disabled={create.isPending}>
          Создать проект
        </Button>
      </DialogFooter>
    </form>
  );
}
