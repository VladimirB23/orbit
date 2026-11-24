import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { TextEditor } from './text-editor';

function setup(props: Partial<React.ComponentProps<typeof TextEditor>> = {}) {
  const onSave = vi.fn(async (_text: string) => true);
  const onClose = vi.fn();
  render(
    <TextEditor
      label="Название"
      initial="Старое"
      limit={20}
      onSave={onSave}
      onClose={onClose}
      {...props}
    />,
  );
  return { onSave, onClose, field: screen.getByLabelText('Название') };
}

describe('TextEditor', () => {
  it('is focused with the text selected, so typing replaces it', async () => {
    const { onSave, field } = setup();
    expect(field).toHaveFocus();
    await userEvent.keyboard('Новое{Enter}');
    expect(onSave).toHaveBeenCalledExactlyOnceWith('Новое');
  });

  it('saves on leaving the field: a click elsewhere never loses the text', async () => {
    const { onSave, field } = setup();
    await userEvent.type(field, ' и новое');
    fireEvent.blur(field);
    expect(onSave).toHaveBeenCalledExactlyOnceWith('Старое и новое');
  });

  it('Escape cancels without saving', async () => {
    const { onSave, onClose } = setup();
    await userEvent.keyboard('Новое{Escape}');
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('does not save unchanged text', async () => {
    const { onSave, onClose } = setup();
    await userEvent.keyboard('{Enter}');
    expect(onSave).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('refuses an empty required field and explains it', async () => {
    const { onSave, field } = setup({ required: true });
    await userEvent.clear(field);
    await userEvent.keyboard('{Enter}');
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('пустым');
  });

  it('keeps text that is too long in the field instead of cutting it', async () => {
    const { onSave, field } = setup();
    await userEvent.clear(field);
    await userEvent.type(field, 'x'.repeat(21));
    await userEvent.keyboard('{Enter}');
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('21 из 20');
    expect(field).toHaveValue('x'.repeat(21));
  });

  it('stays open with the draft when saving fails', async () => {
    const { onClose, field } = setup({ onSave: async () => false });
    await userEvent.type(field, '!');
    await userEvent.keyboard('{Enter}');
    expect(onClose).not.toHaveBeenCalled();
    expect(field).toHaveValue('Старое!');
  });

  it('does not let keys reach the tree behind it', async () => {
    const onKeyDown = vi.fn();
    render(
      // biome-ignore lint/a11y/noStaticElementInteractions: stands for the tree
      <div onKeyDown={onKeyDown}>
        <TextEditor
          label="Поле"
          initial=""
          limit={9}
          onSave={async () => true}
          onClose={() => {}}
        />
      </div>,
    );
    await userEvent.type(screen.getByLabelText('Поле'), 's{ArrowLeft}');
    expect(onKeyDown).not.toHaveBeenCalled();
  });
});
