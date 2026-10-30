import { z } from '@mongodb-js/compass-user-data';

const queryProps = {
  filter: z.any().optional(),
  project: z.any().optional(),
  collation: z.any().optional(),
  sort: z.any().optional(),
  skip: z.number().optional(),
  limit: z.number().optional(),
  update: z.any().optional(),
  hint: z.any().optional(),
};

const commonMetadata = {
  _id: z.string().uuid(),
  _lastExecuted: z
    .union([z.coerce.date(), z.number()])
    .transform((x) => new Date(x)),
  _ns: z.string(),
  _host: z.string().optional(),
};

export const RecentQuerySchema = z.object({
  ...queryProps,
  ...commonMetadata,
});

export const FavoriteQuerySchema = z.object({
  ...queryProps,
  ...commonMetadata,
  _name: z.string().nonempty(),
  _dateModified: z
    .union([z.coerce.date(), z.number()])
    .optional()
    .transform((x) => (x !== undefined ? new Date(x) : x)),
  _dateSaved: z
    .union([z.coerce.date(), z.number()])
    .transform((x) => new Date(x)),
});

/**
 * A query saved from the visual query builder. It is saved as the builder's
 * rows rather than as a query, because opening it fills the rows back in, and
 * a query cannot be read back into rows.
 */
export const BuilderQuerySchema = z.object({
  _id: z.string().uuid(),
  _name: z.string().nonempty(),
  _ns: z.string(),
  // Saved queries belong to a collection on one connection: the same
  // namespace on another cluster starts with none.
  _connectionId: z.string(),
  // Runs when the collection is opened. At most one per collection.
  _isDefault: z.boolean().optional(),
  _dateSaved: z
    .union([z.coerce.date(), z.number()])
    .transform((x) => new Date(x)),
  _dateModified: z
    .union([z.coerce.date(), z.number()])
    .optional()
    .transform((x) => (x !== undefined ? new Date(x) : x)),
  // Shaped by the builder, which checks it when reading it back.
  builderState: z.any(),
});

export type RecentQuery = z.output<typeof RecentQuerySchema>;

export type FavoriteQuery = z.output<typeof FavoriteQuerySchema>;

export type BuilderQuery = z.output<typeof BuilderQuerySchema>;
