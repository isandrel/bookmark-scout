import { Input } from "@/components/ui/input";
import { BookmarkPlus, Folder, FolderPlus, Trash2, ChevronDown, ChevronUp, ChevronsDown, ChevronsUp } from "lucide-react";
import { useEffect, useState, useCallback, useRef } from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDebounce } from "@/hooks/use-debounce";
import { useToast } from "@/hooks/use-toast";
import { Toaster } from "@/components/ui/toaster";
import { draggable, dropTargetForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { monitorForElements } from '@atlaskit/pragmatic-drag-and-drop/element/adapter';
import { combine } from '@atlaskit/pragmatic-drag-and-drop/combine';
import { extractClosestEdge } from '@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge';
import { getReorderDestinationIndex } from '@atlaskit/pragmatic-drag-and-drop-hitbox/util/get-reorder-destination-index';
import * as liveRegion from '@atlaskit/pragmatic-drag-and-drop-live-region';

// Add styles for drag and drop
const styles = `
    .dragging {
        opacity: 0.5;
        cursor: grabbing;
        background-color: hsl(var(--accent));
        border-radius: 0.5rem;
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    }
    .drop-target {
        background-color: hsl(var(--accent));
        border-radius: 0.5rem;
        transition: background-color 0.2s ease;
    }
    /* Drop indicator styles */
    .drop-indicator {
        position: absolute;
        left: 0;
        right: 0;
        height: 2px;
        background-color: rgb(37, 99, 235);
        pointer-events: none;
        z-index: 1000;
        transition: all 0.2s ease;
        box-shadow: 0 0 0 1px white;
    }
    .drop-indicator::before, .drop-indicator::after {
        content: '';
        position: absolute;
        width: 6px;
        height: 6px;
        background-color: rgb(37, 99, 235);
        border-radius: 50%;
        top: -2px;
    }
    .drop-indicator::before {
        left: -1px;
    }
    .drop-indicator::after {
        right: -1px;
    }
    /* Fix for scrolling issues */
    .accordion-content {
        overflow: hidden !important;
        position: relative;
    }
    .accordion-item {
        overflow: visible !important;
        transition: all 0.2s ease;
        position: relative;
    }
    /* Ensure the main container allows scrolling */
    .accordion-container {
        max-height: 100%;
        overflow-y: auto;
        position: relative;
    }
    /* Fix for nested accordion items */
    .accordion-content .accordion-content {
        overflow: hidden;
    }
    /* Fix for the main content area */
    .bookmark-content {
        height: 100%;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        position: relative;
    }
    /* Position relative for drop indicators */
    .accordion-item {
        position: relative;
    }
    /* Hover effects */
    .bookmark-item {
        transition: all 0.2s ease;
        position: relative;
    }
    .bookmark-item:hover {
        background-color: hsl(var(--accent));
    }
    /* Folder styles */
    .folder-item {
        transition: all 0.2s ease;
        position: relative;
    }
    .folder-item:hover {
        background-color: hsl(var(--accent));
    }
    /* Button styles */
    .action-button {
        opacity: 0;
        transition: all 0.2s ease;
    }
    .bookmark-item:hover .action-button,
    .folder-item:hover .action-button {
        opacity: 1;
    }
    .action-button:hover {
        transform: scale(1.1);
    }
    /* Search input styles */
    .search-input {
        transition: all 0.2s ease;
    }
    .search-input:focus {
        transform: translateY(-1px);
        box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    }
`;

interface BookmarkTreeNode {
    id: string;
    parentId?: string;
    index?: number;
    title: string;
    url?: string;
    dateAdded?: number;
    dateGroupModified?: number;
    children?: BookmarkTreeNode[];
    isOpen?: boolean;
    isTemporary?: boolean;
}

type DragOperation = {
    type: 'folder-move' | 'folder-reorder' | 'bookmark-move' | 'bookmark-reorder';
    sourceId: string;
    sourceParentId: string;
    sourceIndex: number;
    targetId: string;
    targetParentId: string;
    targetIndex: number;
};

function PopupPage() {
    const [query, setQuery] = useState('');
    const [folders, setFolders] = useState<BookmarkTreeNode[]>([]);
    const [filteredFolders, setFilteredFolders] = useState<BookmarkTreeNode[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [creatingFolderId, setCreatingFolderId] = useState<string | null>(null);
    const [newFolderName, setNewFolderName] = useState('');
    const [expandedFolders, setExpandedFolders] = useState<string[]>([]);
    const [forceExpandAll, setForceExpandAll] = useState(false);
    const debouncedQuery = useDebounce(query, 300);
    const { toast } = useToast();
    const inputRef = useRef<HTMLInputElement>(null);
    const [draggedItem, setDraggedItem] = useState<BookmarkTreeNode | null>(null);
    const [instanceId] = useState(() => Symbol('instance-id'));

    const fetchFolders = useCallback(async (): Promise<BookmarkTreeNode[]> => {
        return new Promise((resolve, reject) => {
            if (!chrome || !chrome.bookmarks) {
                reject("Chrome bookmarks API not available.");
            }
            chrome.bookmarks.getTree((tree) => {
                const processNode = (node: chrome.bookmarks.BookmarkTreeNode): BookmarkTreeNode => {
                    return {
                        id: node.id,
                        parentId: node.parentId,
                        index: node.index,
                        title: node.title,
                        url: node.url,
                        dateAdded: node.dateAdded,
                        dateGroupModified: node.dateGroupModified,
                        children: node.children ? node.children.map(processNode) : undefined,
                        isOpen: false
                    };
                };
                resolve(tree.map(processNode));
            });
        });
    }, []);

    useEffect(() => {
        setIsLoading(true);
        setError(null);
        fetchFolders()
            .then((data) => {
                setFolders(data);
                setFilteredFolders(data);
                setIsLoading(false);
            })
            .catch((error) => {
                console.error('Error fetching bookmarks:', error);
                setError(error.toString());
                setIsLoading(false);
            });
    }, [fetchFolders]);

    // Function to get all folder IDs recursively
    const getAllChildFolderIds = useCallback((node: BookmarkTreeNode): string[] => {
        if (!node.children) return [];
        
        return node.children.reduce((acc: string[], child) => {
            if (child.children) {
                return [...acc, child.id, ...getAllChildFolderIds(child)];
            }
            return acc;
        }, []);
    }, []);
    
    // Function to expand/collapse all children of a folder
    const toggleExpandAllChildren = useCallback((node: BookmarkTreeNode, e: React.MouseEvent) => {
        e.stopPropagation();
        
        // Get all child folder IDs from the original folders tree, not the filtered one
        // This ensures we get all folders regardless of search matching
        const findNodeInOriginalTree = (nodes: BookmarkTreeNode[], targetId: string): BookmarkTreeNode | null => {
            for (const node of nodes) {
                if (node.id === targetId) return node;
                if (node.children) {
                    const found = findNodeInOriginalTree(node.children, targetId);
                    if (found) return found;
                }
            }
            return null;
        };
        
        const originalNode = findNodeInOriginalTree(folders, node.id);
        if (!originalNode) return;
        
        const childFolderIds = getAllChildFolderIds(originalNode);
        const isCurrentlyExpanded = childFolderIds.every(id => expandedFolders.includes(id));
        
        if (isCurrentlyExpanded) {
            // Collapse all children
            setExpandedFolders(prev => prev.filter(id => !childFolderIds.includes(id)));
        } else {
            // Expand all children
            setExpandedFolders(prev => [...new Set([...prev, ...childFolderIds])]);
        }
    }, [expandedFolders, getAllChildFolderIds, folders]);

    // Function to get all folder IDs from a tree
    const getAllFolderIds = useCallback((nodes: BookmarkTreeNode[]): string[] => {
        return nodes.reduce((acc: string[], node) => {
            if (node.children) {
                return [...acc, node.id, ...getAllFolderIds(node.children)];
            }
            return acc;
        }, []);
    }, []);

    // Function to handle forceExpandAll case
    const handleForceExpandAll = useCallback((nodes: BookmarkTreeNode[]): BookmarkTreeNode[] => {
        // Create a deep copy of the nodes to avoid modifying the original
        const deepCopy = (node: BookmarkTreeNode): BookmarkTreeNode => {
            return {
                ...node,
                children: node.children ? node.children.map(deepCopy) : undefined,
                isOpen: true // Force all folders to be open
            };
        };
        
        return nodes.map(deepCopy);
    }, []);

    const filterFolders = useCallback((nodes: BookmarkTreeNode[], query: string): BookmarkTreeNode[] => {
        if (!query) return nodes;
        
        // If forceExpandAll is true, we want to include all content regardless of matching
        if (forceExpandAll) {
            // Use the handleForceExpandAll function to ensure all content is included and expanded
            return handleForceExpandAll(nodes);
        }
        
        // Normal filtering behavior when forceExpandAll is false
        const filtered: BookmarkTreeNode[] = [];
        nodes.forEach((node) => {
            // Check if current node matches the query
            const nodeMatches = node.title.toLowerCase().includes(query.toLowerCase());
            
            // If it's a folder, check its children
            if (node.children) {
                const filteredChildren = filterFolders(node.children, query);
                
                // If either the current node matches or has matching children, include it
                if (nodeMatches || filteredChildren.length > 0) {
                    // If the current node matches, include all children but make sure to bold matching child folders
                    let childrenToInclude;
                    if (nodeMatches) {
                        // When parent matches, include all children but apply bold formatting to matching ones
                        childrenToInclude = node.children.map(child => {
                            if (child.children && child.title.toLowerCase().includes(query.toLowerCase())) {
                                // This is a child folder that matches the query
                                return {
                                    ...child,
                                    title: child.title.replace(new RegExp(`(${query})`, 'gi'), '<b>$1</b>'),
                                    isOpen: true
                                };
                            }
                            return child;
                        });
                    } else {
                        // When parent doesn't match, only include matching children
                        childrenToInclude = filteredChildren;
                    }
                    
                    // Determine if we should expand this folder
                    // Expand if: 
                    // 1. The current folder doesn't match but has matching children, OR
                    // 2. Both the current folder and a child folder match
                    const shouldExpand = !nodeMatches || (nodeMatches && node.children?.some(child => 
                        child.children && child.title.toLowerCase().includes(query.toLowerCase())
                    ));
                    
                    filtered.push({
                        ...node,
                        title: nodeMatches ? node.title.replace(new RegExp(`(${query})`, 'gi'), '<b>$1</b>') : node.title,
                        children: childrenToInclude,
                        isOpen: shouldExpand
                    });
                }
            } else if (nodeMatches) {
                // If it's a bookmark and matches, include it
                filtered.push({
                    ...node,
                    title: node.title.replace(new RegExp(`(${query})`, 'gi'), '<b>$1</b>')
                });
            }
        });
        return filtered;
    }, [forceExpandAll, handleForceExpandAll]);

    useEffect(() => {
        if (debouncedQuery) {
            const filtered = filterFolders(folders, debouncedQuery);
            setFilteredFolders(filtered);
            
            // Get folder IDs that should be expanded
            const getExpandableFolderIds = (nodes: BookmarkTreeNode[]): string[] => {
                return nodes.reduce((acc: string[], node) => {
                    // Include folders that should be expanded based on the isOpen property
                    if (node.children && (node.isOpen || forceExpandAll)) {
                        return [...acc, node.id, ...getExpandableFolderIds(node.children)];
                    }
                    return acc;
                }, []);
            };
            
            setExpandedFolders(getExpandableFolderIds(filtered));
        } else {
            setFilteredFolders(folders);
            setExpandedFolders([]); // Reset expanded folders when search is cleared
            setForceExpandAll(false); // Reset force expand when search is cleared
        }
    }, [debouncedQuery, folders, filterFolders, forceExpandAll]);

    // Add temporary folder to the tree
    const addTemporaryFolder = useCallback((nodes: BookmarkTreeNode[], parentId: string): BookmarkTreeNode[] => {
        return nodes.map(node => {
            if (node.id === parentId) {
                return {
                    ...node,
                    children: [
                        {
                            id: 'temp-folder',
                            parentId: node.id,
                            title: 'New Folder',
                            isOpen: false,
                            isTemporary: true,
                            children: [] // Add empty children array to ensure it's treated as a folder
                        },
                        ...(node.children || [])
                    ]
                };
            }
            if (node.children) {
                return {
                    ...node,
                    children: addTemporaryFolder(node.children, parentId)
                };
            }
            return node;
        });
    }, []);

    const handleAddFolder = async (folderId: string) => {
        setCreatingFolderId(folderId);
        setNewFolderName('');
        // Add the parent folder to expanded folders
        setExpandedFolders(prev => [...prev, folderId]);
        // Add temporary folder to the tree
        setFilteredFolders(prev => addTemporaryFolder(prev, folderId));
    };

    const handleCreateFolder = async () => {
        if (!creatingFolderId || !newFolderName.trim()) {
            handleCancelCreateFolder();
            return;
        }

        try {
            const parentFolder = await chrome.bookmarks.get(creatingFolderId);
            await chrome.bookmarks.create({
                parentId: creatingFolderId,
                title: newFolderName.trim()
            });
            // Refresh folders after adding
            const updatedFolders = await fetchFolders();
            setFolders(updatedFolders);
            setFilteredFolders(updatedFolders);
            toast({
                title: "✓ Folder Created",
                description: `New folder "${newFolderName.trim()}" added in "${parentFolder[0].title}"`,
                variant: "success",
            });
            setCreatingFolderId(null);
            setNewFolderName('');
        } catch (error) {
            console.error('Failed to add folder:', error);
            setError('Failed to add folder');
            toast({
                title: "× Error Creating Folder",
                description: "Failed to create new folder. Please try again.",
                variant: "destructive",
            });
        }
    };

    const handleCancelCreateFolder = () => {
        setCreatingFolderId(null);
        setNewFolderName('');
        // Remove temporary folder from the tree
        setFilteredFolders(prev => {
            const removeTempFolder = (nodes: BookmarkTreeNode[]): BookmarkTreeNode[] => {
                return nodes.filter(node => {
                    if (node.id === 'temp-folder') {
                        return false;
                    }
                    if (node.children) {
                        node.children = removeTempFolder(node.children);
                    }
                    return true;
                });
            };
            return removeTempFolder(prev);
        });
    };

    const handleAddBookmark = async (folderId: string) => {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const parentFolder = await chrome.bookmarks.get(folderId);
            await chrome.bookmarks.create({
                parentId: folderId,
                title: tab.title || 'New Bookmark',
                url: tab.url || ''
            });
            // Refresh folders after adding
            const updatedFolders = await fetchFolders();
            setFolders(updatedFolders);
            setFilteredFolders(updatedFolders);
            const truncatedTitle = tab.title ? 
                (tab.title.length > 30 ? tab.title.slice(0, 30) + '...' : tab.title) 
                : 'New Bookmark';
            toast({
                title: "✓ Bookmark Added",
                description: `"${truncatedTitle}" added to "${parentFolder[0].title}"`,
                variant: "success",
            });
        } catch (error) {
            console.error('Failed to add bookmark:', error);
            setError('Failed to add bookmark');
            toast({
                title: "× Error Adding Bookmark",
                description: "Failed to add bookmark. Please try again.",
                variant: "destructive",
            });
        }
    };

    const handleDeleteBookmark = async (bookmarkId: string) => {
        try {
            const bookmark = await chrome.bookmarks.get(bookmarkId);
            await chrome.bookmarks.removeTree(bookmarkId);
            // Refresh folders after deleting
            const updatedFolders = await fetchFolders();
            setFolders(updatedFolders);
            setFilteredFolders(updatedFolders);
            toast({
                title: "✓ Bookmark Deleted",
                description: `"${bookmark[0].title?.slice(0, 30)}${bookmark[0].title?.length > 30 ? '...' : ''}" has been removed`,
                variant: "success",
            });
        } catch (error) {
            console.error('Failed to delete bookmark:', error);
            setError('Failed to delete bookmark');
            toast({
                title: "× Error Deleting Bookmark",
                description: "Failed to delete bookmark. Please try again.",
                variant: "destructive",
            });
        }
    };

    const handleDeleteFolder = async (folderId: string) => {
        try {
            const folder = await chrome.bookmarks.get(folderId);
            await chrome.bookmarks.removeTree(folderId);
            // Refresh folders after deleting
            const updatedFolders = await fetchFolders();
            setFolders(updatedFolders);
            setFilteredFolders(updatedFolders);
            toast({
                title: "✓ Folder Deleted",
                description: `"${folder[0].title?.slice(0, 30)}${folder[0].title?.length > 30 ? '...' : ''}" has been removed`,
                variant: "success",
            });
        } catch (error) {
            console.error('Failed to delete folder:', error);
            setError('Failed to delete folder');
            toast({
                title: "× Error Deleting Folder",
                description: "Failed to delete folder. Please try again.",
                variant: "destructive",
            });
        }
    };

    function getFaviconUrl(pageUrl: string) {
        const url = new URL(chrome.runtime.getURL("/_favicon/"));
        url.searchParams.set("pageUrl", pageUrl);
        url.searchParams.set("size", "16");
        return url.toString();
    }

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (inputRef.current && !inputRef.current.contains(event.target as Node)) {
                if (!newFolderName.trim()) {
                    handleCancelCreateFolder();
                } else {
                    handleCreateFolder();
                }
            }
        };

        if (creatingFolderId) {
            document.addEventListener('mousedown', handleClickOutside);
            return () => {
                document.removeEventListener('mousedown', handleClickOutside);
            };
        }
    }, [creatingFolderId, newFolderName, handleCreateFolder, handleCancelCreateFolder]);

    // Add drag and drop handlers
    const handleDragStart = useCallback((node: BookmarkTreeNode) => {
        setDraggedItem(node);
    }, []);

    const handleDragEnd = useCallback(() => {
        setDraggedItem(null);
    }, []);

    const getParentFolderIds = useCallback((nodes: BookmarkTreeNode[], targetId: string): string[] => {
        const result: string[] = [];
        
        const findParents = (currentNodes: BookmarkTreeNode[], id: string, path: string[] = []) => {
            for (const node of currentNodes) {
                if (node.id === id) {
                    result.push(...path);
                    return true;
                }
                if (node.children) {
                    if (findParents(node.children, id, [...path, node.id])) {
                        return true;
                    }
                }
            }
            return false;
        };
        
        findParents(nodes, targetId);
        return result;
    }, []);

    const handleDrop = useCallback(async (operation: DragOperation) => {
        try {
            // Store the current expanded state before the move
            const currentExpandedState = new Set(expandedFolders);

            if (operation.type === 'folder-move' || operation.type === 'bookmark-move') {
                await chrome.bookmarks.move(operation.sourceId, {
                    parentId: operation.targetParentId,
                    index: operation.targetIndex
                });
            } else if (operation.type === 'folder-reorder' || operation.type === 'bookmark-reorder') {
                await chrome.bookmarks.move(operation.sourceId, {
                    index: operation.targetIndex
                });
            }

            // Refresh folders after moving
            const updatedFolders = await fetchFolders();
            setFolders(updatedFolders);

            // Get all parent folder IDs for the target location
            const parentFolders = getParentFolderIds(updatedFolders, operation.targetParentId);
            
            // Combine current expanded state with parent folders
            const newExpandedState = new Set([
                ...currentExpandedState,
                ...parentFolders,
                operation.targetParentId
            ]);

            // If there's a search query active, filter the updated folders
            if (debouncedQuery) {
                const filtered = filterFolders(updatedFolders, debouncedQuery);
                setFilteredFolders(filtered);
            } else {
                setFilteredFolders(updatedFolders);
            }

            // Update expanded folders state
            setExpandedFolders(Array.from(newExpandedState));

            // Announce the move
            const sourceItem = await chrome.bookmarks.get(operation.sourceId);
            const targetFolder = operation.targetParentId ? await chrome.bookmarks.get(operation.targetParentId) : null;
            
            if (operation.type.includes('move')) {
                liveRegion.announce(
                    `Moved "${sourceItem[0].title}" to "${targetFolder?.[0].title || 'root'}"`
                );
            } else {
                liveRegion.announce(
                    `Reordered "${sourceItem[0].title}" to position ${operation.targetIndex + 1}`
                );
            }

            toast({
                title: "✓ Item Moved",
                description: operation.type.includes('move')
                    ? `"${sourceItem[0].title}" moved to "${targetFolder?.[0].title || 'root'}"`
                    : `"${sourceItem[0].title}" reordered to position ${operation.targetIndex + 1}`,
                variant: "success",
            });
        } catch (error) {
            console.error('Failed to move item:', error);
            setError('Failed to move item');
            toast({
                title: "× Error Moving Item",
                description: "Failed to move item. Please try again.",
                variant: "destructive",
            });
        }
    }, [fetchFolders, filterFolders, debouncedQuery, expandedFolders, getParentFolderIds, toast]);

    // Setup drag and drop monitoring
    useEffect(() => {
        return combine(
            monitorForElements({
                canMonitor({ source }) {
                    return source.data.instanceId === instanceId;
                },
                onDrop(args) {
                    const { location, source } = args;
                    if (!location.current.dropTargets.length) {
                        return;
                    }

                    const sourceData = source.data as { type: 'folder' | 'bookmark', node: BookmarkTreeNode };
                    const sourceNode = sourceData.node;
                    const target = location.current.dropTargets[0];
                    const targetData = target.data as { type: 'folder' | 'bookmark', node: BookmarkTreeNode };
                    const targetNode = targetData.node;

                    // Get the closest edge of the target
                    const closestEdge = extractClosestEdge(target.data);

                    // Calculate the target index based on the edge
                    const targetIndex = getReorderDestinationIndex({
                        startIndex: sourceNode.index || 0,
                        indexOfTarget: targetNode.index || 0,
                        closestEdgeOfTarget: closestEdge,
                        axis: 'vertical',
                    });

                    // Determine if this is a move or reorder operation
                    const isDroppingIntoFolder = targetNode.children !== undefined;
                    
                    // Determine the operation type based on source type
                    let operationType: 'folder-move' | 'folder-reorder' | 'bookmark-move' | 'bookmark-reorder';
                    
                    if (sourceData.type === 'folder') {
                        operationType = isDroppingIntoFolder ? 'folder-move' : 'folder-reorder';
                    } else {
                        operationType = isDroppingIntoFolder ? 'bookmark-move' : 'bookmark-reorder';
                    }

                    const operation: DragOperation = {
                        type: operationType,
                        sourceId: sourceNode.id,
                        sourceParentId: sourceNode.parentId || 'root',
                        sourceIndex: sourceNode.index || 0,
                        targetId: targetNode.id,
                        targetParentId: targetNode.parentId || 'root',
                        targetIndex,
                    };

                    handleDrop(operation);
                },
            }),
        );
    }, [instanceId, handleDrop]);

    // Cleanup live region on unmount
    useEffect(() => {
        return liveRegion.cleanup();
    }, []);

    // Add styles to document
    useEffect(() => {
        const styleSheet = document.createElement('style');
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
        return () => {
            document.head.removeChild(styleSheet);
        };
    }, []);

    const renderFolderItem = (node: BookmarkTreeNode) => {
        if (node.isTemporary) {
            return (
                <div 
                    key={node.id} 
                    className="flex items-center gap-2 py-1 px-2 hover:bg-accent rounded-md folder-item"
                    onClick={(e) => e.stopPropagation()}
                >
                    <Folder className="w-4 h-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1">
                        <Input
                            ref={inputRef}
                            type="text"
                            value={newFolderName}
                            onChange={(e) => setNewFolderName(e.target.value)}
                            placeholder="New folder name"
                            className="h-7 text-sm w-full search-input"
                            autoFocus
                            onKeyDown={(e) => {
                                if (e.key === 'Escape') {
                                    handleCancelCreateFolder();
                                }
                                if (e.key === 'Enter') {
                                    handleCreateFolder();
                                }
                            }}
                        />
                    </div>
                </div>
            );
        }

        const isDragging = draggedItem?.id === node.id;
        const isDropTarget = draggedItem && draggedItem.id !== node.id && node.children;
        const hasChildren = node.children && node.children.length > 0;
        
        // Find the original node in the unfiltered tree to get all child folder IDs
        const findNodeInOriginalTree = (nodes: BookmarkTreeNode[], targetId: string): BookmarkTreeNode | null => {
            for (const node of nodes) {
                if (node.id === targetId) return node;
                if (node.children) {
                    const found = findNodeInOriginalTree(node.children, targetId);
                    if (found) return found;
                }
            }
            return null;
        };
        
        const originalNode = findNodeInOriginalTree(folders, node.id);
        const childFolderIds = originalNode ? getAllChildFolderIds(originalNode) : [];
        const isAllChildrenExpanded = hasChildren && childFolderIds.length > 0 && childFolderIds.every(id => expandedFolders.includes(id));

        return (
            <AccordionItem 
                key={node.id} 
                value={node.id} 
                className={`border-none accordion-item ${isDragging ? 'opacity-50' : ''} ${isDropTarget ? 'drop-target' : ''}`}
            >
                <AccordionTrigger className="hover:no-underline py-1 px-2 hover:bg-accent rounded-md h-8 folder-item">
                    <div className="flex items-center w-full">
                        <div 
                            className="flex items-center flex-1 min-w-0 cursor-grab active:cursor-grabbing"
                            ref={(element) => {
                                if (element) {
                                    const cleanup = draggable({
                                        element,
                                        onDragStart: () => {
                                            handleDragStart(node);
                                            element.classList.add('dragging');
                                        },
                                        onDrag: () => {
                                            handleDragEnd();
                                            element.classList.remove('dragging');
                                        },
                                        getInitialData: () => ({ 
                                            type: 'folder',
                                            node,
                                            instanceId
                                        }),
                                    });

                                    const dropTargetCleanup = dropTargetForElements({
                                        element,
                                        onDrag: ({ source, location }) => {
                                            const sourceData = source.data as { type: 'folder' | 'bookmark', node: BookmarkTreeNode };
                                            if (sourceData.node.id !== node.id) {
                                                element.classList.add('drop-target');
                                                // Remove any existing drop indicators
                                                const existingIndicator = element.parentElement?.querySelector('.drop-indicator');
                                                if (existingIndicator) {
                                                    existingIndicator.remove();
                                                }

                                                // Create drop indicator
                                                const indicator = document.createElement('div');
                                                indicator.className = 'drop-indicator';
                                                
                                                // Get the mouse position relative to the element
                                                const rect = element.getBoundingClientRect();
                                                const mouseY = location.current.input.clientY;
                                                const relativeY = mouseY - rect.top;
                                                
                                                // Extract closest edge
                                                const closestEdge = relativeY < rect.height / 2 ? 'top' : 'bottom';
                                                
                                                // Position the indicator based on the closest edge
                                                if (closestEdge === 'top') {
                                                    indicator.style.top = '-1px';
                                                } else {
                                                    indicator.style.bottom = '-1px';
                                                }
                                                
                                                // Store the edge information for use in onDrop
                                                element.dataset.closestEdge = closestEdge;
                                                
                                                element.parentElement?.appendChild(indicator);
                                            }
                                        },
                                        onDragLeave: () => {
                                            element.classList.remove('drop-target');
                                            // Remove drop indicator
                                            const indicator = element.parentElement?.querySelector('.drop-indicator');
                                            if (indicator) {
                                                indicator.remove();
                                            }
                                            // Clean up stored edge information
                                            delete element.dataset.closestEdge;
                                        },
                                        onDrop: ({ source }) => {
                                            const sourceData = source.data as { type: 'folder' | 'bookmark', node: BookmarkTreeNode };
                                            if (sourceData.node.id !== node.id) {
                                                const closestEdge = element.dataset.closestEdge as 'top' | 'bottom' | undefined;
                                                
                                                // Check if we're dropping into a folder or reordering
                                                const isDroppingIntoFolder = node.children !== undefined;
                                                
                                                // Determine the operation type based on source type
                                                let operationType: 'folder-move' | 'folder-reorder' | 'bookmark-move' | 'bookmark-reorder';
                                                
                                                if (sourceData.type === 'folder') {
                                                    operationType = isDroppingIntoFolder ? 'folder-move' : 'folder-reorder';
                                                } else {
                                                    operationType = isDroppingIntoFolder ? 'bookmark-move' : 'bookmark-reorder';
                                                }
                                                
                                                const operation: DragOperation = {
                                                    type: operationType,
                                                    sourceId: sourceData.node.id,
                                                    sourceParentId: sourceData.node.parentId || 'root',
                                                    sourceIndex: sourceData.node.index || 0,
                                                    targetId: node.id,
                                                    targetParentId: node.parentId || 'root',
                                                    targetIndex: closestEdge === 'bottom' ? (node.index || 0) + 1 : (node.index || 0),
                                                };
                                                
                                                handleDrop(operation);
                                            }
                                            element.classList.remove('drop-target');
                                            // Remove drop indicator
                                            const indicator = element.parentElement?.querySelector('.drop-indicator');
                                            if (indicator) {
                                                indicator.remove();
                                            }
                                            // Clean up stored edge information
                                            delete element.dataset.closestEdge;
                                        },
                                        getData: () => ({ 
                                            type: 'folder',
                                            node,
                                            instanceId
                                        }),
                                    });

                                    return () => {
                                        cleanup();
                                        dropTargetCleanup();
                                    };
                                }
                            }}
                        >
                            <Folder className="w-4 h-4 mr-2 shrink-0 text-muted-foreground" />
                            <span 
                                className="truncate text-sm"
                                dangerouslySetInnerHTML={{ __html: node.title }}
                            />
                        </div>
                        <div className="flex items-center gap-1 ml-2 shrink-0 action-button">
                            {hasChildren && (
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5"
                                    onClick={(e) => toggleExpandAllChildren(node, e)}
                                    title={isAllChildrenExpanded ? "Collapse all subfolders" : "Expand all subfolders"}
                                >
                                    {isAllChildrenExpanded ? <ChevronsUp className="h-3 w-3" /> : <ChevronsDown className="h-3 w-3" />}
                                </Button>
                            )}
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddBookmark(node.id);
                                }}
                            >
                                <BookmarkPlus className="h-3 w-3" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddFolder(node.id);
                                }}
                            >
                                <FolderPlus className="h-3 w-3" />
                            </Button>
                            <Button
                                variant="ghost"
                                size="icon"
                                className="h-5 w-5 text-destructive hover:text-destructive"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDeleteFolder(node.id);
                                }}
                            >
                                <Trash2 className="h-3 w-3" />
                            </Button>
                        </div>
                    </div>
                </AccordionTrigger>
                <AccordionContent className="pl-6 py-0 accordion-content">
                    {node.children?.map((child) => 
                        child.isTemporary ? renderFolderItem(child) : 
                        child.children ? renderFolderItem(child) : renderBookmarkItem(child)
                    )}
                </AccordionContent>
            </AccordionItem>
        );
    };

    const renderBookmarkItem = (node: BookmarkTreeNode) => {
        if (node.isTemporary) {
            return null;
        }
        
        const isDragging = draggedItem?.id === node.id;
        const isDropTarget = draggedItem && draggedItem.id !== node.id && node.children;

        return (
            <div 
                key={node.id} 
                className={`flex items-center justify-between h-8 py-1 px-2 hover:bg-accent rounded-md group bookmark-item ${isDragging ? 'opacity-50' : ''} ${isDropTarget ? 'drop-target' : ''}`}
            >
                <a
                    href={node.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center flex-1 min-w-0 cursor-grab active:cursor-grabbing"
                    ref={(element) => {
                        if (element) {
                            const cleanup = draggable({
                                element,
                                onDragStart: () => {
                                    handleDragStart(node);
                                    element.classList.add('dragging');
                                },
                                onDrag: () => {
                                    handleDragEnd();
                                    element.classList.remove('dragging');
                                },
                                getInitialData: () => ({ 
                                    type: 'bookmark',
                                    node,
                                    instanceId
                                }),
                            });

                            const dropTargetCleanup = dropTargetForElements({
                                element,
                                onDrag: ({ source, location }) => {
                                    const sourceData = source.data as { type: 'folder' | 'bookmark', node: BookmarkTreeNode };
                                    if (sourceData.node.id !== node.id) {
                                        element.classList.add('drop-target');
                                        // Remove any existing drop indicators
                                        const existingIndicator = element.parentElement?.querySelector('.drop-indicator');
                                        if (existingIndicator) {
                                            existingIndicator.remove();
                                        }

                                        // Create drop indicator
                                        const indicator = document.createElement('div');
                                        indicator.className = 'drop-indicator';
                                        
                                        // Get the mouse position relative to the element
                                        const rect = element.getBoundingClientRect();
                                        const mouseY = location.current.input.clientY;
                                        const relativeY = mouseY - rect.top;
                                        
                                        // Extract closest edge
                                        const closestEdge = relativeY < rect.height / 2 ? 'top' : 'bottom';
                                        
                                        // Position the indicator based on the closest edge
                                        if (closestEdge === 'top') {
                                            indicator.style.top = '-1px';
                                        } else {
                                            indicator.style.bottom = '-1px';
                                        }
                                        
                                        // Store the edge information for use in onDrop
                                        element.dataset.closestEdge = closestEdge;
                                        
                                        element.parentElement?.appendChild(indicator);
                                    }
                                },
                                onDragLeave: () => {
                                    element.classList.remove('drop-target');
                                    // Remove drop indicator
                                    const indicator = element.parentElement?.querySelector('.drop-indicator');
                                    if (indicator) {
                                        indicator.remove();
                                    }
                                    // Clean up stored edge information
                                    delete element.dataset.closestEdge;
                                },
                                onDrop: ({ source }) => {
                                    const sourceData = source.data as { type: 'folder' | 'bookmark', node: BookmarkTreeNode };
                                    if (sourceData.node.id !== node.id) {
                                        const closestEdge = element.dataset.closestEdge as 'top' | 'bottom' | undefined;
                                        
                                        // Check if we're dropping into a folder or reordering
                                        const isDroppingIntoFolder = node.children !== undefined;
                                        
                                        // Determine the operation type based on source type
                                        let operationType: 'folder-move' | 'folder-reorder' | 'bookmark-move' | 'bookmark-reorder';
                                        
                                        if (sourceData.type === 'folder') {
                                            operationType = isDroppingIntoFolder ? 'folder-move' : 'folder-reorder';
                                        } else {
                                            operationType = isDroppingIntoFolder ? 'bookmark-move' : 'bookmark-reorder';
                                        }
                                        
                                        const operation: DragOperation = {
                                            type: operationType,
                                            sourceId: sourceData.node.id,
                                            sourceParentId: sourceData.node.parentId || 'root',
                                            sourceIndex: sourceData.node.index || 0,
                                            targetId: node.id,
                                            targetParentId: node.parentId || 'root',
                                            targetIndex: closestEdge === 'bottom' ? (node.index || 0) + 1 : (node.index || 0),
                                        };
                                        
                                        handleDrop(operation);
                                    }
                                    element.classList.remove('drop-target');
                                    // Remove drop indicator
                                    const indicator = element.parentElement?.querySelector('.drop-indicator');
                                    if (indicator) {
                                        indicator.remove();
                                    }
                                    // Clean up stored edge information
                                    delete element.dataset.closestEdge;
                                },
                                getData: () => ({ 
                                    type: 'bookmark',
                                    node,
                                    instanceId
                                }),
                            });

                            return () => {
                                cleanup();
                                dropTargetCleanup();
                            };
                        }
                    }}
                >
                    <img
                        src={getFaviconUrl(node.url ?? "")}
                        alt="favicon"
                        className="w-4 h-4 mr-2 shrink-0"
                    />
                    <span 
                        className="truncate text-sm"
                        dangerouslySetInnerHTML={{ __html: node.title }}
                    />
                </a>
                <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-5 w-5 ml-2 shrink-0 action-button text-destructive hover:text-destructive"
                    onClick={() => handleDeleteBookmark(node.id)}
                >
                    <Trash2 className="h-3 w-3" />
                </Button>
            </div>
        );
    };

    if (error) {
        return (
            <div className="p-4">
                <div className="text-red-500 mb-4">Error: {error}</div>
                <Button onClick={() => window.location.reload()}>Retry</Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full w-full min-h-0 overflow-hidden">
            <style>{styles}</style>
            <div className="flex flex-col h-full overflow-hidden">
                <div className="p-4 border-b shrink-0">
                    <div className="flex items-center gap-2">
                        <Input
                            ref={inputRef}
                            type="text"
                            placeholder="Search bookmarks..."
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            className="w-full"
                        />
                        {query && (
                            <Button
                                variant="outline"
                                size="icon"
                                className="shrink-0"
                                onClick={() => setForceExpandAll(!forceExpandAll)}
                                title={forceExpandAll ? "Collapse non-matching folders" : "Expand all folders"}
                            >
                                {forceExpandAll ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </Button>
                        )}
                    </div>
                </div>
                <div className="flex-1 overflow-hidden bookmark-content">
                    {isLoading ? (
                        <div className="p-4 space-y-2">
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                            <Skeleton className="h-8 w-full" />
                        </div>
                    ) : error ? (
                        <div className="p-4 text-red-500">{error}</div>
                    ) : (
                        <div className="p-4">
                            <Accordion
                                type="multiple"
                                value={expandedFolders}
                                onValueChange={setExpandedFolders}
                                className="w-full accordion-container"
                            >
                                {filteredFolders.map((node) => renderFolderItem(node))}
                            </Accordion>
                        </div>
                    )}
                </div>
            </div>
            <Toaster />
        </div>
    );
}

export default PopupPage;
