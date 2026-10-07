import type { Document } from 'mongodb';
import { BSON } from 'bson';

/**
 * Joining across databases, which the server will not do.
 *
 * `$lookup` resolves `from` inside the database the pipeline runs against, so
 * a pipeline cannot reach a collection in another database. Atlas Data
 * Federation lifts that restriction with an object `from`:
 *
 *     { $lookup: { from: { db: 'sales', coll: 'regions' }, ... } }
 *
 * That syntax is borrowed here and made to work against an ordinary
 * deployment: the foreign documents are read first, then the stage is
 * rewritten into a `$set` that filters over them as a literal array. The rest
 * of the pipeline is untouched and still runs on the server, so the stages
 * after the join behave exactly as they would with a real `$lookup`.
 *
 * The cost of carrying the documents in the command is a ceiling on how much
 * can be joined. That suits a lookup table, and not two large collections;
 * going over the ceiling is reported rather than left to fail as a server
 * error about command size.
 */

/** The server rejects a command over 16MB. Half of that leaves room for the
 * rest of the pipeline, the documents being joined against, and the wrapping
 * the driver adds. */
export const MAX_FOREIGN_BYTES = 8 * 1024 * 1024;

/** Read no more than this from the foreign collection. A count rather than a
 * size alone, so a collection of millions of tiny documents is also refused
 * before it is pulled across the wire. */
export const MAX_FOREIGN_DOCUMENTS = 10_000;

export type CrossDbLookup = {
  /** Where the stage sits in the pipeline, so it can be put back. */
  index: number;
  db: string;
  coll: string;
  localField: string;
  foreignField: string;
  as: string;
};

export class CrossDbLookupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrossDbLookupError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads an object `from` out of a `$lookup`, or returns null for every other
 * stage, including an ordinary same-database `$lookup` with a string `from`.
 *
 * Throws for a cross-database stage this cannot run, rather than letting it
 * reach the server as something that would fail there for an unrelated
 * sounding reason.
 */
function readCrossDbLookup(
  stage: unknown,
  index: number
): CrossDbLookup | null {
  if (!isRecord(stage)) {
    return null;
  }
  const spec = stage.$lookup;
  if (!isRecord(spec) || !isRecord(spec.from)) {
    return null;
  }

  const { db, coll } = spec.from;
  if (typeof db !== 'string' || !db || typeof coll !== 'string' || !coll) {
    throw new CrossDbLookupError(
      'A $lookup joining another database needs `from: { db: "…", coll: "…" }` with both named.'
    );
  }

  // The `let`/`pipeline` form runs its own pipeline against the foreign
  // collection, per input document. That is a different problem from reading a
  // collection once, and quietly doing something else would be worse than
  // saying so.
  if ('pipeline' in spec || 'let' in spec) {
    throw new CrossDbLookupError(
      `Joining ${db}.${coll} across databases supports the localField/foreignField form only. ` +
        'A $lookup with its own `pipeline` has to run on the server, which cannot reach another database.'
    );
  }

  const { localField, foreignField, as } = spec;
  if (
    typeof localField !== 'string' ||
    typeof foreignField !== 'string' ||
    typeof as !== 'string'
  ) {
    throw new CrossDbLookupError(
      `Joining ${db}.${coll} across databases needs localField, foreignField and as.`
    );
  }

  return { index, db, coll, localField, foreignField, as };
}

/** Every cross-database `$lookup` in the pipeline, in the order they appear. */
export function findCrossDbLookups(pipeline: Document[]): CrossDbLookup[] {
  const found: CrossDbLookup[] = [];
  pipeline.forEach((stage, index) => {
    const lookup = readCrossDbLookup(stage, index);
    if (lookup) {
      found.push(lookup);
    }
  });
  return found;
}

export function hasCrossDbLookup(pipeline: Document[]): boolean {
  return pipeline.some((stage, index) => !!readCrossDbLookup(stage, index));
}

/**
 * Reads a field path as an array, the way `$lookup` treats one.
 *
 * `$lookup` matches a scalar against a scalar, but also a value against an
 * array that contains it, in either position. Normalising both sides to arrays
 * and intersecting them gives the same answer for all four combinations, where
 * a plain `$eq` would silently miss the array ones.
 */
function asArray(path: string): Document {
  return {
    $let: {
      // A missing field is null to `$lookup`, and an array literal built from
      // a missing path would otherwise collapse to an empty array and match
      // nothing, including other missing fields.
      vars: { v: { $ifNull: [path, null] } },
      in: { $cond: [{ $isArray: '$$v' }, '$$v', ['$$v']] },
    },
  };
}

/**
 * The stage that replaces a cross-database `$lookup` once its documents have
 * been read.
 *
 * `$set` rather than `$lookup` because the documents travel inside the
 * pipeline: `$filter` walks them for each input document and keeps the matches
 * under `as`, which is the shape `$lookup` would have produced.
 */
export function buildEmbeddedLookupStage(
  lookup: CrossDbLookup,
  foreignDocuments: Document[]
): Document {
  // A user variable name has to start with a lowercase letter: the server
  // rejects a leading underscore outright.
  const element = 'crossDbLookupDoc';
  return {
    $set: {
      [lookup.as]: {
        $filter: {
          // `$literal` so that a foreign document holding something that reads
          // as an operator, such as a field named `$gt`, is data rather than
          // an expression.
          input: { $literal: foreignDocuments },
          as: element,
          cond: {
            $gt: [
              {
                $size: {
                  $setIntersection: [
                    asArray(`$${lookup.localField}`),
                    asArray(`$$${element}.${lookup.foreignField}`),
                  ],
                },
              },
              0,
            ],
          },
        },
      },
    },
  };
}

/**
 * Collections made to back a view, named so that they are recognisable as
 * Compass's own and never mistaken for something somebody made by hand.
 */
export const VIEW_COPY_PREFIX = '__compass_xdb_';

export function viewCopyName(lookup: CrossDbLookup): string {
  return `${VIEW_COPY_PREFIX}${lookup.db}_${lookup.coll}`;
}

/**
 * The pipeline a view can actually hold, with each cross-database `$lookup`
 * pointed at a copy of the foreign collection sitting in the view's own
 * database.
 *
 * A view is stored and run by the server, which cannot reach another database,
 * so the only way to have one at all is for the collection to be local. The
 * copy is a snapshot and the view is only as current as the last copy, which
 * is why it is a collection anybody can see and refresh rather than documents
 * hidden inside the view definition.
 */
export function rewriteLookupsForView(pipeline: Document[]): Document[] {
  const lookups = findCrossDbLookups(pipeline);
  if (lookups.length === 0) {
    return pipeline;
  }
  const rewritten = [...pipeline];
  for (const lookup of lookups) {
    rewritten[lookup.index] = {
      $lookup: {
        from: viewCopyName(lookup),
        localField: lookup.localField,
        foreignField: lookup.foreignField,
        as: lookup.as,
      },
    };
  }
  return rewritten;
}

/** Reads the foreign side, refusing anything too large to carry. */
/** Above this many distinct join keys, the `$in` built from them would itself
 * be unreasonable, so the foreign collection is read whole and judged by the
 * limits below instead. */
export const MAX_LOCAL_KEYS = 10_000;

/**
 * The join keys the pipeline will actually look for, by running the stages
 * that come before the lookup.
 *
 * Without this the whole foreign collection is read regardless of how narrow
 * the query is, so a pipeline that matches one document still drags a
 * collection of millions across. Returns null when there are too many keys to
 * be worth asking with, leaving the caller to read the collection whole.
 */
export async function collectLocalKeys(
  namespace: string,
  stagesBeforeLookup: Document[],
  localField: string,
  aggregate: (ns: string, pipeline: Document[]) => Promise<Document[]>
): Promise<unknown[] | null> {
  const result = await aggregate(namespace, [
    ...stagesBeforeLookup,
    {
      $group: {
        _id: null,
        // `$addToSet` leaves out a document whose field is missing, and
        // `$lookup` treats a missing local field as null and matches it
        // against a null foreign key. Without `$ifNull` those documents
        // contribute no key, the foreign side is never asked for null, and
        // they come back unjoined where a real $lookup would have matched.
        keys: { $addToSet: { $ifNull: [`$${localField}`, null] } },
      },
    },
  ]);

  const keys = (result[0]?.keys ?? []) as unknown[];
  // A local field holding an array joins on each of its elements, so the set
  // has to be flattened before it can be asked for.
  const flattened: unknown[] = [];
  for (const key of keys) {
    if (Array.isArray(key)) {
      flattened.push(...key);
    } else {
      flattened.push(key);
    }
  }

  // Empty only when nothing reached the lookup at all, since `$ifNull` above
  // gives every document that does reach it a key.
  if (flattened.length === 0) {
    return [];
  }
  if (flattened.length > MAX_LOCAL_KEYS) {
    return null;
  }
  return flattened;
}

export async function fetchForeignDocuments(
  lookup: CrossDbLookup,
  aggregate: (ns: string, pipeline: Document[]) => Promise<Document[]>,
  localKeys: unknown[] | null = null
): Promise<Document[]> {
  const ns = `${lookup.db}.${lookup.coll}`;
  // Ask only for the documents that can match. Falls back to reading the
  // collection when the keys are unknown or too many to ask with.
  const match = localKeys
    ? [{ $match: { [lookup.foreignField]: { $in: localKeys } } }]
    : [];
  // One over the limit, so that a collection sitting exactly on it is accepted
  // and the first document past it is what proves the collection is too big.
  const documents = await aggregate(ns, [
    ...match,
    { $limit: MAX_FOREIGN_DOCUMENTS + 1 },
  ]);

  if (documents.length > MAX_FOREIGN_DOCUMENTS) {
    throw new CrossDbLookupError(
      `The join to ${ns} matches more than ${MAX_FOREIGN_DOCUMENTS.toLocaleString()} documents. ` +
        'Joining across databases carries the matched documents inside the query, so it has to stay small. ' +
        'Narrow the pipeline before the $lookup, or move the collections into one database to use an ordinary $lookup.'
    );
  }

  const bytes = BSON.calculateObjectSize({ documents });
  if (bytes > MAX_FOREIGN_BYTES) {
    throw new CrossDbLookupError(
      `The join to ${ns} matches ${Math.round(
        bytes / 1024 / 1024
      )}MB of documents, over the ${Math.round(
        MAX_FOREIGN_BYTES / 1024 / 1024
      )}MB a cross-database join can carry. ` +
        'Narrow the pipeline before the $lookup, or move the collections into one database to use an ordinary $lookup.'
    );
  }

  return documents;
}

/**
 * The pipeline to actually send, with every cross-database `$lookup` replaced
 * by the documents it refers to. A pipeline without one is returned as it is,
 * so this costs nothing in the ordinary case.
 */
export async function resolveCrossDbLookups(
  namespace: string,
  pipeline: Document[],
  aggregate: (ns: string, pipeline: Document[]) => Promise<Document[]>
): Promise<Document[]> {
  const lookups = findCrossDbLookups(pipeline);
  if (lookups.length === 0) {
    return pipeline;
  }

  const resolved = [...pipeline];
  // Read the foreign collections one after another rather than together: the
  // first failure is the one worth reporting, and a pipeline joining several
  // collections should not open several cursors to discover that.
  for (const lookup of lookups) {
    // The stages before this one, already resolved, so a pipeline joining a
    // second database is narrowed by the first join as well.
    const keys = await collectLocalKeys(
      namespace,
      resolved.slice(0, lookup.index),
      lookup.localField,
      aggregate
    );
    // Nothing to join against: the join matches nothing, and asking the other
    // database would only confirm it.
    const documents =
      keys && keys.length === 0
        ? []
        : await fetchForeignDocuments(lookup, aggregate, keys);
    resolved[lookup.index] = buildEmbeddedLookupStage(lookup, documents);
  }
  return resolved;
}
