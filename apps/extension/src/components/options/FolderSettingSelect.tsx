/**
 * The control for a folder setting (`type: 'folder'`): a searchable list of every folder a
 * bookmark can be saved in, by path, storing the folder's id. A folder deleted since it was chosen
 * stays visible as "Deleted folder", so the setting never silently changes.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

type FolderSettingSelectProps = {
  id: string;
  value: string;
  onChange: (folderId: string) => void;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
};

export function FolderSettingSelect({
  value,
  onChange,
  ...triggerProps
}: FolderSettingSelectProps) {
  const [folders, setFolders] = useState<QuickSaveFolder[] | null>(null);
  const language = useLanguage();

  const load = useCallback(() => {
    fetchBookmarkTree()
      .then((tree) => setFolders([...indexWritableFolders(tree).values()]))
      .catch(() => setFolders([]));
  }, []);
  useEffect(load, [load]);
  useBookmarkEvents(load);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the labels follow the language t() shows.
  const options = useMemo(() => {
    const list = (folders ?? []).map((folder) => ({
      value: folder.id,
      label: folder.path.map((title) => getBookmarkDisplayTitle(title)).join(FOLDER_PATH_SEPARATOR),
    }));
    const missing =
      value !== '' && folders !== null && !list.some((option) => option.value === value);
    return [
      { value: '', label: t('settings_folderNotChosen') },
      ...(missing ? [{ value, label: t('settings_folderMissing') }] : []),
      ...list,
    ];
  }, [folders, value, language]);

  return (
    <SearchableSelect
      {...triggerProps}
      className="w-full sm:w-settings-control"
      value={value}
      options={options}
      onValueChange={onChange}
      searchPlaceholder={t('select_searchPlaceholder')}
      emptyText={t('select_noMatches')}
    />
  );
}
