import React from 'react';
import { cx } from '@mongodb-js/compass-components';
import type { Column } from 'ag-grid-community';
import type { TableHeaderType } from '../../stores/grid-store';
import type { GridContext } from './document-table-view';

export type HeaderCellRendererProps = {
  displayName: string;
  bsonType: TableHeaderType;
  hide?: boolean;
  subtable?: boolean;
  column: Column;
  context: GridContext;
};

/**
  Custom cell renderer for the headers.
 */
class HeaderCellRenderer extends React.Component<HeaderCellRendererProps> {
  constructor(props: HeaderCellRendererProps) {
    super(props);
  }

  refresh() {
    return true;
  }

  handleClick = (event: React.MouseEvent) => {
    this.props.context.selectColumn(
      this.props.column.getColId(),
      event.shiftKey
    );
  };

  render() {
    if (this.props.hide) {
      return null;
    }
    let displayName = this.props.displayName;
    if (this.props.displayName === '$new') {
      displayName = 'New Field';
    }
    return (
      // ag-grid keeps keyboard focus on the header cell around this, so a key
      // handler here would never run.
      // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions
      <div
        className={cx('table-view-cell-header', {
          'table-view-cell-header-subtable-objectid':
            this.props.subtable === true,
        })}
        onClick={this.handleClick}
      >
        <b>{displayName}</b> {this.props.bsonType}
      </div>
    );
  }

  static displayName = 'HeaderCellRenderer';
}

export default HeaderCellRenderer;
