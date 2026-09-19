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
  document: z.any(),
});

export type DeletedDocument = z.output<typeof DeletedDocumentSchema>;
