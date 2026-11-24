import { describe, expect, it } from 'vitest';
import { folderPath, obsidianUrl, resumeCommand, vscodeUrl } from './links';

describe('folderPath', () => {
  it('shows a Windows path the way Explorer does', () => {
    expect(folderPath('d:/Projects/orbit/')).toBe('D:\\Projects\\orbit');
    expect(folderPath(' D:\\Projects\\orbit ')).toBe('D:\\Projects\\orbit');
    expect(folderPath('C:\\')).toBe('C:\\');
  });

  it('keeps a Unix path', () => {
    expect(folderPath('/home/v/orbit/')).toBe('/home/v/orbit');
  });

  it('refuses what is not a local absolute path', () => {
    for (const bad of ['', '  ', 'orbit', '..\\x', 'javascript:alert(1)', 'https://a.b']) {
      expect(folderPath(bad)).toBeNull();
    }
    expect(folderPath('D:\\a\nb')).toBeNull();
    expect(folderPath('D:orbit')).toBeNull();
  });

  it('refuses network shares: opening one may send the Windows password hash', () => {
    expect(folderPath('\\\\evil\\share')).toBeNull();
    expect(folderPath('//evil/share')).toBeNull();
    expect(folderPath('\\/evil/share')).toBeNull();
  });

  it('nothing in, nothing out', () => {
    expect(folderPath(null)).toBeNull();
  });
});

describe('vscodeUrl', () => {
  it('opens the folder in a new window', () => {
    expect(vscodeUrl('D:\\Projects\\orbit')).toBe(
      'vscode://file/D:/Projects/orbit?windowId=_blank',
    );
    expect(vscodeUrl('/home/v/orbit')).toBe('vscode://file/home/v/orbit?windowId=_blank');
  });

  it('escapes spaces, Cyrillic and characters with a meaning in addresses', () => {
    expect(vscodeUrl('C:\\Users\\Ann Lee\\a#b?c%d')).toBe(
      'vscode://file/C:/Users/Ann%20Lee/a%23b%3Fc%25d?windowId=_blank',
    );
    expect(vscodeUrl('D:\\Кот')).toBe('vscode://file/D:/%D0%9A%D0%BE%D1%82?windowId=_blank');
  });

  it('gives no link for a bad path', () => {
    expect(vscodeUrl('\\\\evil\\share')).toBeNull();
    expect(vscodeUrl(null)).toBeNull();
  });
});

describe('obsidianUrl', () => {
  it('opens a note of the vault', () => {
    expect(obsidianUrl('IT', 'Inbox/orbit/0. orbit.md')).toBe(
      'obsidian://open?vault=IT&file=Inbox%2Forbit%2F0.%20orbit.md',
    );
  });

  it('accepts Windows separators', () => {
    expect(obsidianUrl('IT', 'Inbox\\orbit.md')).toBe(
      'obsidian://open?vault=IT&file=Inbox%2Forbit.md',
    );
  });

  it('cannot smuggle extra parameters', () => {
    expect(obsidianUrl('My vault', 'a&vault=other')).toBe(
      'obsidian://open?vault=My%20vault&file=a%26vault%3Dother',
    );
  });

  it('needs both a vault and a note', () => {
    expect(obsidianUrl(null, 'a')).toBeNull();
    expect(obsidianUrl('IT', null)).toBeNull();
    expect(obsidianUrl('IT', ' ')).toBeNull();
  });
});

describe('resumeCommand', () => {
  const id = 'a1b2c3d4-0000-4000-8000-000000000001';

  it('goes to the folder of the session first', () => {
    expect(resumeCommand('d:\\Projects\\orbit', id)).toBe(
      `cd 'D:\\Projects\\orbit'; claude --resume ${id}`,
    );
  });

  it('a quote in the folder name does not end the string', () => {
    expect(resumeCommand("D:\\it's", id)).toBe(`cd 'D:\\it''s'; claude --resume ${id}`);
  });

  it('without a usable folder only resumes', () => {
    expect(resumeCommand(null, id)).toBe(`claude --resume ${id}`);
    expect(resumeCommand('\\\\evil\\x', id)).toBe(`claude --resume ${id}`);
  });
});
