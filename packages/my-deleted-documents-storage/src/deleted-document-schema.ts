import { z } from '@mongodb-js/compass-user-data';

export const DeletedDocumentSchema = z.object({
  _id: z.string().uuid(),
  _ns: z.string(),
  _connectionId: z.string(),
  _deletedAt: z
    .union([z.coerce.date(), z.number()])
    .transform((x) => new Date(x)),
  // A single-document delete produces one entry; a bulk delete produces one
  // entry per snapshotted document, all sharing the same _batchId, so the UI
  // can group/restore them together.
  _operation: z.union([z.literal('single'), z.literal('bulk')]),
  // EJSON.stringify serializes an omitted/undefined value as a literal
  // `null` on disk, so this needs to accept null too, not just "absent".
  _batchId: z.string().nullish(),
  // Distinguishes a pre-delete snapshot (restored via re-insert) from a
  // pre-edit snapshot taken before an update/replace (restored via
  // replace-back, since the document still exists in the collection).
  // Snapshots saved before this field existed have no `_changeType` at all
  // (or, per the EJSON.stringify `undefined` -> `null` caveat above, a
  // literal `null`), and were all delete snapshots, so both cases fall back
  // to 'delete' here for backward compatibility with already-saved files.
  _changeType: z
    .union([z.literal('delete'), z.literal('update')])
    .nullish()
    .transform((value) => value ?? 'delete'),
  document: z.any(),
});

export type DeletedDocument = z.output<typeof DeletedDocumentSchema>;
