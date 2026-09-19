import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Modal,
  ModalHeader,
  DocumentList,
  css,
  spacing,
  useDarkMode,
} from '@mongodb-js/compass-components';
import type { Document } from 'hadron-document';
import HadronDocument from 'hadron-document';
import {
  CodemirrorMultilineEditor,
  createFindInDocumentExtension,
} from '@mongodb-js/compass-editor';
import type { CrudActions } from '../../stores/crud-store';
import { useTelemetry } from '@mongodb-js/compass-telemetry/provider';
import { useConnectionInfoRef } from '@mongodb-js/compass-connections/provider';

const containerStyles = css({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
});

const editorAreaStyles = css({
  flex: 1,
  minHeight: 0,
  padding: `0 ${spacing[800]}px`,
  paddingBottom: spacing[400],
});

export type ExpandedDocumentEditorModalProps = {
  doc: Document | null;
  isEditable: boolean;
  mode: 'list' | 'json' | 'table';
  onClose: () => void;
  replaceDocument: CrudActions['replaceDocument'];
};

export const ExpandedDocumentEditorModal: React.FunctionComponent<
  ExpandedDocumentEditorModalProps
> = ({ doc, isEditable, mode, onClose, replaceDocument }) => {
  const track = useTelemetry();
  const connectionInfoRef = useConnectionInfoRef();
  const darkMode = useDarkMode();
  const [value, setValue] = useState('');
  const [initialValue, setInitialValue] = useState('');
  const [docValidationError, setDocValidationError] = useState<Error | null>(
    null
  );

  const findExtension = useMemo(
    () => [createFindInDocumentExtension(darkMode)],
    [darkMode]
  );

  useEffect(() => {
    if (!doc) {
      return;
    }
    if (!doc.editing) {
      doc.startEditing();
    }
    const currentValue = doc.modifiedEJSONString ?? doc.toEJSON();
    setValue(currentValue);
    setInitialValue(currentValue);
    setDocValidationError(null);
    track('Document Expanded Edit Opened', { mode }, connectionInfoRef.current);
    // Only reset when we start editing a (possibly new) document.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doc]);

  const onChange = useCallback((newValue: string) => {
    try {
      HadronDocument.FromEJSON(newValue);
      setDocValidationError(null);
    } catch (error) {
      setDocValidationError(error as Error);
    } finally {
      setValue(newValue);
    }
  }, []);

  const handleClose = useCallback(() => {
    track('Document Expanded Edit Closed', { mode }, connectionInfoRef.current);
    onClose();
  }, [onClose, track, mode, connectionInfoRef]);

  const onUpdate = useCallback(() => {
    if (!doc) {
      return;
    }
    try {
      const newDoc = HadronDocument.FromEJSON(value || '');
      newDoc.preserveTypes(doc);
      doc.apply(newDoc);
      void replaceDocument?.(doc);
    } finally {
      doc.finishEditing();
      handleClose();
    }
  }, [doc, value, replaceDocument, handleClose]);

  const onCancel = useCallback(() => {
    // The footer's own Cancel button already calls doc.cancel() before this
    // fires, reverting any in-progress changes.
    doc?.finishEditing();
    handleClose();
  }, [doc, handleClose]);

  const onDelete = useCallback(() => {
    // Deletion isn't offered from this view; the row/card the document was
    // expanded from already has a dedicated delete action.
  }, []);

  return (
    <Modal
      open={!!doc}
      setOpen={handleClose}
      fullScreen
      data-testid="expanded-document-editor-modal"
    >
      {doc && (
        <div className={containerStyles}>
          <ModalHeader title="Edit Document" />
          <div className={editorAreaStyles}>
            <CodemirrorMultilineEditor
              data-testid="expanded-document-editor"
              language="json"
              text={value}
              onChangeText={onChange}
              readOnly={!isEditable}
              copyable={false}
              formattable={false}
              minLines={30}
              customExtensions={findExtension}
            />
          </div>
          <DocumentList.DocumentEditActionsFooter
            doc={doc}
            alwaysForceUpdate
            editing
            deleting={false}
            modified={value !== initialValue}
            validationError={docValidationError}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onCancel={onCancel}
          />
        </div>
      )}
    </Modal>
  );
};
