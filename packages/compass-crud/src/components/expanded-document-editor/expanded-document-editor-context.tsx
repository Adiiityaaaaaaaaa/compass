import React, { createContext, useCallback, useContext, useState } from 'react';
import type { Document } from 'hadron-document';
import type { CrudActions } from '../../stores/crud-store';
import { ExpandedDocumentEditorModal } from './expanded-document-editor-modal';

type DocumentEditsMode = 'list' | 'json' | 'table';

type OpenExpandedDocumentEditor = (doc: Document) => void;

const ExpandedDocumentEditorContext =
  createContext<OpenExpandedDocumentEditor | null>(null);

/**
 * Lets any component nested under `ExpandedDocumentEditorProvider` open the
 * expanded document editor modal for a given document, without needing the
 * open handler threaded through props at every level (list and JSON view
 * items can be several components deep).
 *
 * Table view can't use this directly: ag-grid renders cell content outside
 * of the surrounding React context, so it's threaded through GridContext
 * (see document-table-view.tsx) instead, using the same provider.
 *
 * `document.tsx` (and the list/JSON view items that render it) are also
 * reused outside of the documents tab, e.g. for read-only previews in
 * schema validation and the aggregation pipeline builder, which never
 * render this provider. Returns `null` there instead of throwing, so
 * callers should treat a `null` result as "expanding isn't available here"
 * and hide the corresponding action rather than calling it.
 */
export function useOpenExpandedDocumentEditor(): OpenExpandedDocumentEditor | null {
  return useContext(ExpandedDocumentEditorContext);
}

export const ExpandedDocumentEditorProvider: React.FunctionComponent<{
  children: React.ReactNode;
  isEditable: boolean;
  mode: DocumentEditsMode;
  replaceDocument: CrudActions['replaceDocument'];
}> = ({ children, isEditable, mode, replaceDocument }) => {
  const [doc, setDoc] = useState<Document | null>(null);

  const open = useCallback<OpenExpandedDocumentEditor>((doc) => {
    setDoc(doc);
  }, []);

  const onClose = useCallback(() => {
    setDoc(null);
  }, []);

  return (
    <ExpandedDocumentEditorContext.Provider value={open}>
      {children}
      <ExpandedDocumentEditorModal
        doc={doc}
        isEditable={isEditable}
        mode={mode}
        onClose={onClose}
        replaceDocument={replaceDocument}
      />
    </ExpandedDocumentEditorContext.Provider>
  );
};
