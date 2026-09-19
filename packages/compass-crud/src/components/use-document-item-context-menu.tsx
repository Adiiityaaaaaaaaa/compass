import type HadronDocument from 'hadron-document';
import { useContextMenuGroups } from '@mongodb-js/compass-components';

import type { DocumentProps } from './document';
import { useOpenExpandedDocumentEditor } from './expanded-document-editor/expanded-document-editor-context';

export type UseDocumentItemContextMenuProps = {
  doc: HadronDocument;
  isEditable: boolean;
} & Pick<DocumentProps, 'copyToClipboard' | 'openInsertDocumentDialog'>;

export function useDocumentItemContextMenu({
  doc,
  isEditable,
  copyToClipboard,
  openInsertDocumentDialog,
}: UseDocumentItemContextMenuProps) {
  const { expanded: isExpanded, editing: isEditing } = doc;
  const openExpandedDocumentEditor = useOpenExpandedDocumentEditor();

  return useContextMenuGroups(
    () => [
      {
        telemetryLabel: 'Document Expand Collapse',
        items: [
          {
            label: isExpanded ? 'Collapse all fields' : 'Expand all fields',
            onAction: () => {
              if (isExpanded) {
                doc.collapse();
              } else {
                doc.expand();
              }
            },
          },
        ],
      },
      {
        telemetryLabel: 'Document Item',
        items: [
          ...(isEditable
            ? [
                {
                  label: isEditing ? 'Cancel editing' : 'Edit document',
                  onAction: () => {
                    if (isEditing) {
                      doc.finishEditing();
                    } else {
                      doc.startEditing();
                    }
                  },
                },
              ]
            : []),
          isEditable && openExpandedDocumentEditor
            ? {
                label: 'Expand document to edit...',
                onAction: () => {
                  openExpandedDocumentEditor(doc);
                },
              }
            : undefined,
          {
            label: 'Copy document as Shell Syntax',
            onAction: () => {
              copyToClipboard?.(doc, 'shell-syntax');
            },
          },
          {
            label: 'Copy document as EJSON',
            onAction: () => {
              copyToClipboard?.(doc, 'ejson');
            },
          },
          isEditable
            ? {
                label: 'Clone document...',
                onAction: () => {
                  const clonedDoc = doc.generateObject({
                    excludeInternalFields: true,
                  });
                  void openInsertDocumentDialog?.(clonedDoc, true);
                },
              }
            : undefined,
        ],
      },
      isEditable && !isEditing
        ? {
            telemetryLabel: 'Document Item Delete',
            items: [
              {
                label: 'Delete document',
                onAction: () => {
                  doc.markForDeletion();
                },
              },
            ],
          }
        : undefined,
    ],
    [
      doc,
      isExpanded,
      isEditing,
      isEditable,
      copyToClipboard,
      openInsertDocumentDialog,
      openExpandedDocumentEditor,
    ]
  );
}
