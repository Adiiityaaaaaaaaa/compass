import { EJSON } from 'bson';
import type {
  Binary,
  BSONRegExp,
  Decimal128,
  Double,
  Int32,
  Long,
  ObjectId,
} from 'bson';
import type { Element } from 'hadron-document';

export const SELECTED_CELL_CLASS = 'table-view-cell-selected';

export type CellPosition = { rowIndex: number; colId: string };

/**
 * A block of cells, from the cell the selection started on to the one it was
 * stretched to, in either direction.
 */
export type CellSelection = { anchor: CellPosition; focus: CellPosition };

export type SelectedCells = {
  firstRow: number;
  lastRow: number;
  /** In the order the columns are shown. */
  colIds: string[];
};

/**
 * The rows and columns a selection covers, given the columns in the order
 * they're shown, or null when a column it started or ended on is gone.
 */
export function selectedCells(
  selection: CellSelection,
  columnIds: string[]
): SelectedCells | null {
  const anchorColumn = columnIds.indexOf(selection.anchor.colId);
  const focusColumn = columnIds.indexOf(selection.focus.colId);
  if (anchorColumn === -1 || focusColumn === -1) {
    return null;
  }
  return {
    firstRow: Math.min(selection.anchor.rowIndex, selection.focus.rowIndex),
    lastRow: Math.max(selection.anchor.rowIndex, selection.focus.rowIndex),
    colIds: columnIds.slice(
      Math.min(anchorColumn, focusColumn),
      Math.max(anchorColumn, focusColumn) + 1
    ),
  };
}

export function isCellInSelection(
  selected: SelectedCells | null,
  rowIndex: number | null,
  colId: string
): boolean {
  return (
    selected !== null &&
    rowIndex !== null &&
    rowIndex >= selected.firstRow &&
    rowIndex <= selected.lastRow &&
    selected.colIds.includes(colId)
  );
}

/**
 * A cell's value as plain text, the way a spreadsheet would hold it: no
 * quotes around strings and no type wrappers, so that a pasted id or date can
 * be used as it is. A missing field is an empty cell.
 */
export function cellValueText(element: Element | undefined): string {
  if (!element || element.isRemoved()) {
    return '';
  }
  const value = element.currentValue;
  switch (element.currentType) {
    case 'Object':
    case 'Array':
      return EJSON.stringify(element.generateObject(), { relaxed: true });
    case 'String':
      return value as string;
    case 'ObjectId':
      return (value as ObjectId).toHexString();
    case 'Date': {
      const date = value as Date;
      return Number.isNaN(date.getTime()) ? String(date) : date.toISOString();
    }
    case 'BSONRegExp': {
      const { pattern, options } = value as BSONRegExp;
      return `/${pattern}/${options}`;
    }
    case 'UUID':
      return (value as Binary).toUUID().toHexString();
    case 'Null':
      return 'null';
    case 'Undefined':
      return '';
    case 'Boolean':
    case 'Int32':
    case 'Double':
    case 'Int64':
    case 'Decimal128':
      return (
        value as boolean | number | Int32 | Double | Long | Decimal128
      ).toString();
    default:
      return EJSON.stringify(value, { relaxed: true });
  }
}

// A spreadsheet reads a field in quotes as one cell, which keeps a tab or a
// new line inside a value from splitting it, and keeps the quote at the start
// of a value that has one.
function toSpreadsheetField(text: string): string {
  return /[\t\n\r]/.test(text) || text.startsWith('"')
    ? `"${text.replace(/"/g, '""')}"`
    : text;
}

/**
 * Selected cells as text that pastes into a spreadsheet as the same block:
 * tabs between cells and new lines between rows. A single cell is its value
 * alone, as there's no block to keep.
 */
export function cellsToText(rows: (Element | undefined)[][]): string {
  if (rows.length === 1 && rows[0].length === 1) {
    return cellValueText(rows[0][0]);
  }
  return rows
    .map((row) =>
      row.map((cell) => toSpreadsheetField(cellValueText(cell))).join('\t')
    )
    .join('\n');
}
