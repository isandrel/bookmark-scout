/**
 * Hook for bookmark CRUD operations with toast feedback.
 */

import { useCallback } from 'react';
import {
  createBookmark,
  deleteBookmark,
  getBookmark,
  getCurrentTab,
  moveBookmark,
} from '@/services';
import type { DragOperation } from '@/types';
import { useToast } from './use-toast';

interface UseBookmarkOperationsReturn {
  /** Add the current tab as a bookmark to a folder */
  addBookmarkToFolder: (folderId: string) => Promise<boolean>;
  /** Create a new folder */
  createFolder: (parentId: string, name: string) => Promise<boolean>;
  /** Delete a bookmark */
  removeBookmark: (bookmarkId: string) => Promise<boolean>;
  /** Delete a folder and its contents */
  removeFolder: (folderId: string) => Promise<boolean>;
  /** Handle a drag-drop operation */
  handleDrop: (operation: DragOperation) => Promise<boolean>;
}

export function useBookmarkOperations(onRefresh: () => Promise<void>): UseBookmarkOperationsReturn {
  const { toast } = useToast();

  const addBookmarkToFolder = useCallback(
    async (folderId: string): Promise<boolean> => {
      try {
        const tab = await getCurrentTab();
        const parentFolder = await getBookmark(folderId);
        await createBookmark({
          parentId: folderId,
          title: tab.title || 'New Bookmark',
          url: tab.url || '',
        });
        await onRefresh();

        const truncatedTitle = tab.title
          ? tab.title.length > 30
            ? `${tab.title.slice(0, 30)}...`
            : tab.title
          : 'New Bookmark';

        toast({
          title: '✓ Bookmark Added',
          description: `"${truncatedTitle}" added to "${parentFolder.title}"`,
          variant: 'success',
        });
        return true;
      } catch (error) {
        console.error('Failed to add bookmark:', error);
        toast({
          title: '× Error Adding Bookmark',
          description: 'Failed to add bookmark. Please try again.',
          variant: 'destructive',
        });
        return false;
      }
    },
    [onRefresh, toast],
  );

  const createFolder = useCallback(
    async (parentId: string, name: string): Promise<boolean> => {
      try {
        const parentFolder = await getBookmark(parentId);
        await createBookmark({
          parentId,
          title: name.trim(),
        });
        await onRefresh();

        toast({
          title: '✓ Folder Created',
          description: `New folder "${name.trim()}" added in "${parentFolder.title}"`,
          variant: 'success',
        });
        return true;
      } catch (error) {
        console.error('Failed to create folder:', error);
        toast({
          title: '× Error Creating Folder',
          description: 'Failed to create new folder. Please try again.',
          variant: 'destructive',
        });
        return false;
      }
    },
    [onRefresh, toast],
  );

  const removeBookmark = useCallback(
    async (bookmarkId: string): Promise<boolean> => {
      try {
        const bookmark = await getBookmark(bookmarkId);
        await deleteBookmark(bookmarkId);
        await onRefresh();

        const truncatedTitle = bookmark.title
          ? bookmark.title.length > 30
            ? `${bookmark.title.slice(0, 30)}...`
            : bookmark.title
          : 'Bookmark';

        toast({
          title: '✓ Bookmark Deleted',
          description: `"${truncatedTitle}" has been removed`,
          variant: 'success',
        });
        return true;
      } catch (error) {
        console.error('Failed to delete bookmark:', error);
        toast({
          title: '× Error Deleting Bookmark',
          description: 'Failed to delete bookmark. Please try again.',
          variant: 'destructive',
        });
        return false;
      }
    },
    [onRefresh, toast],
  );

  const removeFolder = useCallback(
    async (folderId: string): Promise<boolean> => {
      try {
        const folder = await getBookmark(folderId);
        await deleteBookmark(folderId);
        await onRefresh();

        const truncatedTitle = folder.title
          ? folder.title.length > 30
            ? `${folder.title.slice(0, 30)}...`
            : folder.title
          : 'Folder';

        toast({
          title: '✓ Folder Deleted',
          description: `"${truncatedTitle}" has been removed`,
          variant: 'success',
        });
        return true;
      } catch (error) {
        console.error('Failed to delete folder:', error);
        toast({
          title: '× Error Deleting Folder',
          description: 'Failed to delete folder. Please try again.',
          variant: 'destructive',
        });
        return false;
      }
    },
    [onRefresh, toast],
  );

  const handleDrop = useCallback(
    async (operation: DragOperation): Promise<boolean> => {
      try {
        if (operation.type === 'folder-move' || operation.type === 'bookmark-move') {
          await moveBookmark(operation.sourceId, {
            parentId: operation.targetParentId,
            index: operation.targetIndex,
          });
        } else if (operation.type === 'folder-reorder' || operation.type === 'bookmark-reorder') {
          await moveBookmark(operation.sourceId, {
            index: operation.targetIndex,
          });
        }

        await onRefresh();

        const sourceItem = await getBookmark(operation.sourceId);
        const targetFolder = operation.targetParentId
          ? await getBookmark(operation.targetParentId)
          : null;

        toast({
          title: '✓ Item Moved',
          description: operation.type.includes('move')
            ? `"${sourceItem.title}" moved to "${targetFolder?.title || 'root'}"`
            : `"${sourceItem.title}" reordered to position ${operation.targetIndex + 1}`,
          variant: 'success',
        });
        return true;
      } catch (error) {
        console.error('Failed to move item:', error);
        toast({
          title: '× Error Moving Item',
          description: 'Failed to move item. Please try again.',
          variant: 'destructive',
        });
        return false;
      }
    },
    [onRefresh, toast],
  );

  return {
    addBookmarkToFolder,
    createFolder,
    removeBookmark,
    removeFolder,
    handleDrop,
  };
}
