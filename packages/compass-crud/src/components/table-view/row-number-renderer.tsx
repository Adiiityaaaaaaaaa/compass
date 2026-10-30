import React from 'react';
import type { DocumentTableRowNode } from './cell-editor';
import type { GridContext } from './document-table-view';

/**
 Custom cell renderer for the row numbers. Required because we can't rely on
 the ag-cell-last-left-pinned CSS class because on nested views the ObjectId
 is the last pinned column.
 */
function RowNumberRenderer({
  value,
  node,
  context,
}: {
  value: JSX.Element | string | number;
  node: DocumentTableRowNode;
  context: GridContext;
}) {
  return (
    // ag-grid keeps keyboard focus on the cell around this, so only the mouse
    // reaches it.
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div
      className="table-view-cell-row-number"
      onMouseDown={(event) => context.startSelection(node, '$rowNumber', event)}
    >
      {value}
    </div>
  );
}

RowNumberRenderer.displayName = 'RowNumberRenderer';

export default RowNumberRenderer;
