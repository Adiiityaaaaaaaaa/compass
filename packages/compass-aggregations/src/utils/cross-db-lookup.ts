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

/** Reads the foreign side, refusing anything too large to carry. */
export async function fetchForeignDocuments(
  lookup: CrossDbLookup,
  aggregate: (ns: string, pipeline: Document[]) => Promise<Document[]>
): Promise<Document[]> {
  const ns = `${lookup.db}.${lookup.coll}`;
  // One over the limit, so that a collection sitting exactly on it is accepted
  // and the first document past it is what proves the collection is too big.
  const documents = await aggregate(ns, [
    { $limit: MAX_FOREIGN_DOCUMENTS + 1 },
  ]);

  if (documents.length > MAX_FOREIGN_DOCUMENTS) {
    throw new CrossDbLookupError(
      `${ns} has more than ${MAX_FOREIGN_DOCUMENTS.toLocaleString()} documents. ` +
        'Joining across databases carries the documents inside the query, so the collection joined to has to be small. ' +
        'Narrow it down first, or move the collections into one database to use an ordinary $lookup.'
    );
  }

  const bytes = BSON.calculateObjectSize({ documents });
  if (bytes > MAX_FOREIGN_BYTES) {
    throw new CrossDbLookupError(
      `${ns} is ${Math.round(bytes / 1024 / 1024)}MB, over the ${Math.round(
        MAX_FOREIGN_BYTES / 1024 / 1024
      )}MB a cross-database join can carry. ` +
        'Narrow it down first, or move the collections into one database to use an ordinary $lookup.'
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
    const documents = await fetchForeignDocuments(lookup, aggregate);
    resolved[lookup.index] = buildEmbeddedLookupStage(lookup, documents);
  }
  return resolved;
}
