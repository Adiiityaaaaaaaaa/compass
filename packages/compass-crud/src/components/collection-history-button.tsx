import React, { useCallback, useState } from 'react';
import { EJSON } from 'bson';
import {
  Icon,
  Button,
  Badge,
  BadgeVariant,
  Checkbox,
  Modal,
  ModalHeader,
  css,
  cx,
  spacing,
  palette,
  useDarkMode,
  openToast,
  WorkspaceContainer,
} from '@mongodb-js/compass-components';
import type { DeletedDocument } from '@mongodb-js/my-deleted-documents-storage/provider';
import { DOCUMENT_NARROW_ICON_BREAKPOINT } from '../constants/document-narrow-icon-breakpoint';

const buttonStyles = css({
  whiteSpace: 'nowrap',
});

const buttonTextStyles = css({
  [`@container ${WorkspaceContainer.toolbarContainerQueryName} (width < ${DOCUMENT_NARROW_ICON_BREAKPOINT})`]:
    {
      display: 'none',
    },
});

const modalBodyStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: spacing[200],
  padding: `0 ${spacing[800]}px ${spacing[800]}px`,
  maxHeight: '65vh',
  overflow: 'auto',
});

const toolbarStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: spacing[300],
  position: 'sticky',
  top: 0,
});

const toolbarActionsStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: spacing[100],
  marginLeft: 'auto',
});

const listStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: spacing[100],
});

const entryStyles = css({
  display: 'flex',
  alignItems: 'flex-start',
  gap: spacing[150],
  padding: spacing[200],
  borderRadius: spacing[100],
});

const entryLight = css({
  backgroundColor: palette.gray.light3,
});

const entryDark = css({
  backgroundColor: palette.gray.dark3,
});

const entryCheckboxStyles = css({
  flex: 'none',
  paddingTop: spacing[100],
});

const entryContentStyles = css({
  display: 'flex',
  flexDirection: 'column',
  gap: spacing[150],
  flex: 1,
  minWidth: 0,
});

const entryHeaderStyles = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: spacing[200],
});

const entryHeaderLeftStyles = css({
  display: 'flex',
  alignItems: 'center',
  gap: spacing[150],
});

const previewStyles = css({
  margin: 0,
  maxHeight: '280px',
  overflow: 'auto',
  fontFamily: 'monospace',
  fontSize: '12px',
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
});

const timeStyles = css({
  flex: 'none',
  fontSize: '12px',
  color: palette.gray.base,
});

const emptyStyles = css({
  padding: spacing[400],
  textAlign: 'center',
  color: palette.gray.base,
});

function formatPreview(entry: DeletedDocument): string {
  try {
    return EJSON.stringify(entry.document, undefined, 2);
  } catch {
    return String((entry.document as { _id?: unknown })?._id ?? entry._id);
  }
}

// Restoring a 'delete' entry re-inserts the document; restoring an 'update'
// entry replaces the document's current (edited) value back to this
// snapshot. Shown per-entry so it's clear which will happen on Restore.
function changeTypeBadge(entry: DeletedDocument) {
  if (entry._changeType === 'update') {
    return { label: 'Edited', variant: BadgeVariant.Blue };
  }
  return { label: 'Deleted', variant: BadgeVariant.Red };
}

export type CollectionHistoryButtonProps = {
  loadDeletedDocuments: () => Promise<DeletedDocument[]>;
  restoreDeletedDocument: (
    entryId: string
  ) => Promise<{ success: boolean; error?: string }>;
};

const CollectionHistoryButton: React.FunctionComponent<
  CollectionHistoryButtonProps
> = ({ loadDeletedDocuments, restoreDeletedDocument }) => {
  const darkMode = useDarkMode();
  const [isOpen, setIsOpen] = useState(false);
  const [entries, setEntries] = useState<DeletedDocument[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [restoringIds, setRestoringIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    void loadDeletedDocuments().then((loaded) => {
      setEntries(loaded);
      // Drop selections for entries that no longer exist (e.g. already restored).
      const loadedIds = new Set(loaded.map((entry) => entry._id));
      setSelectedIds((prev) => {
        const next = new Set([...prev].filter((id) => loadedIds.has(id)));
        return next;
      });
    });
  }, [loadDeletedDocuments]);

  const onOpen = useCallback(() => {
    setIsOpen(true);
    refresh();
  }, [refresh]);

  const onClose = useCallback(() => {
    setIsOpen(false);
  }, []);

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const allSelected =
    entries.length > 0 && entries.every((entry) => selectedIds.has(entry._id));
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleSelectAll = useCallback(() => {
    setSelectedIds((prev) => {
      if (prev.size === entries.length) {
        return new Set();
      }
      return new Set(entries.map((entry) => entry._id));
    });
  }, [entries]);

  const restoreMany = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) {
        return;
      }
      setRestoringIds((prev) => new Set([...prev, ...ids]));
      void Promise.all(ids.map((id) => restoreDeletedDocument(id)))
        .then((results) => {
          const succeeded = results.filter((result) => result.success).length;
          const failed = results.length - succeeded;
          openToast('collection-history-restore', {
            title: '',
            variant: failed === 0 ? 'success' : 'warning',
            dismissible: true,
            description:
              failed === 0
                ? `${succeeded} document${succeeded === 1 ? '' : 's'} restored.`
                : `${succeeded} document${
                    succeeded === 1 ? '' : 's'
                  } restored, ${failed} failed to restore.`,
          });
          refresh();
        })
        .finally(() => {
          setRestoringIds((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.delete(id));
            return next;
          });
        });
    },
    [restoreDeletedDocument, refresh]
  );

  const restoreSelected = useCallback(() => {
    restoreMany([...selectedIds]);
  }, [restoreMany, selectedIds]);

  const restoreAll = useCallback(() => {
    restoreMany(entries.map((entry) => entry._id));
  }, [restoreMany, entries]);

  const isRestoring = restoringIds.size > 0;

  return (
    <>
      <Button
        onClick={onOpen}
        title="Collection History"
        aria-label="Collection History"
        data-testid="collection-history-button"
        className={buttonStyles}
        size="xsmall"
        leftGlyph={<Icon glyph="Trash" />}
      >
        <span className={buttonTextStyles}>Collection History</span>
      </Button>
      <Modal
        open={isOpen}
        setOpen={onClose}
        data-testid="collection-history-modal"
      >
        <ModalHeader
          title="Collection History"
          subtitle="Recently deleted documents in this collection, available to restore."
        />
        <div className={modalBodyStyles}>
          {entries.length > 0 && (
            <div className={toolbarStyles}>
              <Checkbox
                data-testid="collection-history-select-all"
                aria-label="Select all"
                label="Select all"
                checked={allSelected}
                indeterminate={someSelected}
                onChange={toggleSelectAll}
              />
              <div className={toolbarActionsStyles}>
                <Button
                  size="xsmall"
                  data-testid="restore-selected-button"
                  disabled={selectedIds.size === 0 || isRestoring}
                  onClick={restoreSelected}
                  leftGlyph={<Icon glyph="Undo" />}
                >
                  Restore Selected
                  {selectedIds.size > 0 && ` (${selectedIds.size})`}
                </Button>
                <Button
                  size="xsmall"
                  variant="primary"
                  data-testid="restore-all-button"
                  disabled={isRestoring}
                  onClick={restoreAll}
                  leftGlyph={<Icon glyph="Undo" />}
                >
                  Restore All
                </Button>
              </div>
            </div>
          )}
          {entries.length === 0 && (
            <div className={emptyStyles} data-testid="collection-history-empty">
              No recently deleted documents in this collection.
            </div>
          )}
          <div className={listStyles}>
            {entries.map((entry) => (
              <div
                key={entry._id}
                className={cx(entryStyles, darkMode ? entryDark : entryLight)}
                data-testid="collection-history-entry"
              >
                <Checkbox
                  className={entryCheckboxStyles}
                  data-testid="collection-history-entry-checkbox"
                  aria-label="Select document"
                  checked={selectedIds.has(entry._id)}
                  onChange={() => toggleSelected(entry._id)}
                />
                <div className={entryContentStyles}>
                  <div className={entryHeaderStyles}>
                    <div className={entryHeaderLeftStyles}>
                      <Badge
                        data-testid="collection-history-entry-change-type"
                        variant={changeTypeBadge(entry).variant}
                      >
                        {changeTypeBadge(entry).label}
                      </Badge>
                      <div className={timeStyles}>
                        {new Date(entry._deletedAt).toLocaleString()}
                      </div>
                    </div>
                    <Button
                      size="xsmall"
                      data-testid="restore-document-button"
                      disabled={restoringIds.has(entry._id)}
                      onClick={() => restoreMany([entry._id])}
                      leftGlyph={<Icon glyph="Undo" />}
                    >
                      Restore
                    </Button>
                  </div>
                  <pre className={previewStyles}>{formatPreview(entry)}</pre>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
};

export default CollectionHistoryButton;
