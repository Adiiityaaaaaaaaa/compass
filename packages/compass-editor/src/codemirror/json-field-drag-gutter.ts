import { EditorView, gutter, GutterMarker } from '@codemirror/view';
import type { Extension, EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import { getAncestryOfToken } from './utils';
import type { Token } from './utils';

/**
 * A structural path to a field in a JSON document: object keys as strings,
 * array indices as numbers, e.g. ['users', 0, 'name'].
 */
export type JsonFieldPath = (string | number)[];

function parseAncestryToFieldPath(ancestry: string[]): JsonFieldPath {
  return ancestry.map((segment) => {
    const arrayIndexMatch = /^\[(\d+)\]$/.exec(segment);
    return arrayIndexMatch ? Number(arrayIndexMatch[1]) : segment;
  });
}

/**
 * Finds the first `PropertyName` node that starts within [from, to), i.e.
 * the field (if any) that this line of a JSON document declares.
 */
function findPropertyNameInRange(
  state: EditorState,
  from: number,
  to: number
): Token | null {
  let found: Token | null = null;
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (found) {
        return false;
      }
      if (node.name === 'PropertyName' && node.from >= from) {
        found = node.node;
        return false;
      }
      return undefined;
    },
  });
  return found;
}

/**
 * Returns the field path for the property declared on the given line, if
 * any (lines that only contain punctuation, a closing bracket, or a
 * continuation of a multi-line value have no path).
 */
export function getJsonFieldPathAtLine(
  state: EditorState,
  lineFrom: number,
  lineTo: number
): JsonFieldPath | null {
  const propertyName = findPropertyNameInRange(state, lineFrom, lineTo);
  if (!propertyName) {
    return null;
  }
  const documentText = state.sliceDoc(0, state.doc.length);
  return parseAncestryToFieldPath(
    getAncestryOfToken(propertyName, documentText)
  );
}

const dragHandleIcon =
  '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 16 16"><circle cx="5" cy="4" r="1.25" fill="currentColor"/><circle cx="5" cy="8" r="1.25" fill="currentColor"/><circle cx="5" cy="12" r="1.25" fill="currentColor"/><circle cx="10" cy="4" r="1.25" fill="currentColor"/><circle cx="10" cy="8" r="1.25" fill="currentColor"/><circle cx="10" cy="12" r="1.25" fill="currentColor"/></svg>';

class FieldDragHandleMarker extends GutterMarker {
  path: JsonFieldPath;
  onDragStart: (path: JsonFieldPath, event: DragEvent) => void;

  constructor(
    path: JsonFieldPath,
    onDragStart: (path: JsonFieldPath, event: DragEvent) => void
  ) {
    super();
    this.path = path;
    this.onDragStart = onDragStart;
  }

  eq(other: FieldDragHandleMarker): boolean {
    return JSON.stringify(this.path) === JSON.stringify(other.path);
  }

  toDOM(): Node {
    const el = document.createElement('div');
    el.className = 'json-field-drag-handle';
    el.draggable = true;
    el.setAttribute('aria-hidden', 'true');
    el.title = 'Drag to copy this field';
    el.innerHTML = dragHandleIcon;
    el.addEventListener('dragstart', (event) => {
      event.stopPropagation();
      this.onDragStart(this.path, event);
    });
    return el;
  }
}

const dragGutterTheme = EditorView.baseTheme({
  '.json-field-drag-gutter': {
    width: '16px',
  },
  '.json-field-drag-handle': {
    width: '16px',
    height: '16px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'grab',
    opacity: 0.4,
  },
  '.json-field-drag-handle:hover': {
    opacity: 1,
  },
  '.json-field-drag-handle:active': {
    cursor: 'grabbing',
  },
  '.json-field-drag-handle > svg': {
    width: '12px',
    height: '12px',
  },
});

/**
 * A CodeMirror gutter that shows a drag handle next to every line that
 * declares a JSON object field, letting the field (as "field: value") be
 * dragged out the same way it can be dragged from the list/table document
 * views, e.g. into the query bar or an aggregation stage.
 *
 * Only intended for read-only JSON documents (dragging while the text is
 * being actively edited would be ambiguous, mirroring how the other
 * document views also disable field dragging while editing).
 */
export function createJsonFieldDragGutter(
  onDragStart: (path: JsonFieldPath, event: DragEvent) => void
): Extension {
  return [
    dragGutterTheme,
    gutter({
      class: 'json-field-drag-gutter',
      lineMarker(view, line) {
        const path = getJsonFieldPathAtLine(view.state, line.from, line.to);
        if (!path || path.length === 0) {
          return null;
        }
        return new FieldDragHandleMarker(path, onDragStart);
      },
      // The gutter only exists while the document is read-only, so its
      // contents never need to be recomputed for the same text.
      lineMarkerChange: () => false,
    }),
  ];
}
