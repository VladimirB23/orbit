/** One confirmation dialog for the whole app: `await confirm({...})`. */
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface Question {
  title: string;
  body: string;
  action: string;
  destructive?: boolean;
}

type Confirm = (question: Question) => Promise<boolean>;

const ConfirmContext = createContext<Confirm>(() => Promise.resolve(false));

export const useConfirm = () => useContext(ConfirmContext);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [question, setQuestion] = useState<Question | null>(null);
  const [open, setOpen] = useState(false);
  const resolve = useRef<(answer: boolean) => void>(() => {});

  const confirm = useCallback<Confirm>((next) => {
    setQuestion(next);
    setOpen(true);
    return new Promise((done) => {
      resolve.current = done;
    });
  }, []);

  const answer = (value: boolean) => {
    setOpen(false);
    resolve.current(value);
  };

  return (
    <ConfirmContext value={confirm}>
      {children}
      <AlertDialog open={open} onOpenChange={(next) => !next && answer(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{question?.title}</AlertDialogTitle>
            <AlertDialogDescription>{question?.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => answer(true)}
              className={
                question?.destructive ? 'bg-danger text-background hover:bg-danger/90' : undefined
              }
            >
              {question?.action}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext>
  );
}
