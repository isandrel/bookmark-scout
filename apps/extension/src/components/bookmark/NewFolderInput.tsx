/**
 * NewFolderInput component.
 * Inline input for creating a new folder.
 */

import { Folder } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { t } from '@/hooks/use-i18n';

interface NewFolderInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}

export function NewFolderInput({ value, onChange, onSubmit, onCancel }: NewFolderInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (inputRef.current && !inputRef.current.contains(event.target as Node)) {
        if (!value.trim()) {
          onCancel();
        } else {
          onSubmit();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [value, onSubmit, onCancel]);

  return (
    // biome-ignore lint/a11y/useKeyWithClickEvents: onClick used only for event bubbling control
    // biome-ignore lint/a11y/noStaticElementInteractions: This div is a container, not interactive
    <div
      className="flex items-center gap-2 py-1 px-2 hover:bg-accent rounded-md folder-item"
      onClick={(e) => e.stopPropagation()}
    >
      <Folder className="w-4 h-4 shrink-0 text-muted-foreground" />
      <div className="flex-1">
        <Input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t('popup_enterFolderName')}
          className="h-7 text-sm w-full search-input"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              onCancel();
            }
            if (e.key === 'Enter') {
              onSubmit();
            }
          }}
        />
      </div>
    </div>
  );
}
