import type { Document, Element } from 'hadron-document';

type Parent = Pick<Document | Element, 'elements'>;

function keepExpandedElements(before: Parent, after: Parent) {
  for (const element of before.elements ?? []) {
    const counterpart = after.elements?.get(element.currentKey);
    if (!element.expanded || !counterpart) {
      continue;
    }
    counterpart.expand();
    counterpart.setMaxVisibleElementsCount(element.maxVisibleElementsCount);
    keepExpandedElements(element, counterpart);
  }
}

/**
 * Unfolds the fields of freshly fetched documents that were unfolded in the
 * documents they replace, matched by _id and then by each field's key, and
 * keeps how many of their fields were shown. Running the query again would
 * otherwise fold up every document the user had opened.
 */
export function keepExpandedFields(
  previousDocs: Document[] | null,
  docs: Document[]
): void {
  const previousById = new Map<string, Document>();
  for (const doc of previousDocs ?? []) {
    const id = doc.getStringId();
    if (id !== null) {
      previousById.set(id, doc);
    }
  }
  if (previousById.size === 0) {
    return;
  }

  for (const doc of docs) {
    const id = doc.getStringId();
    const previous = id === null ? undefined : previousById.get(id);
    if (previous) {
      // Not doc.expand(), which would unfold every field: this keeps the
      // expand-all toggle as it was, and the fields as they were left.
      doc.expanded = previous.expanded;
      doc.setMaxVisibleElementsCount(previous.maxVisibleElementsCount);
      keepExpandedElements(previous, doc);
    }
  }
}
