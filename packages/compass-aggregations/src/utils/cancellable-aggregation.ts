import type { AggregateOptions, Document } from 'mongodb';
import type { PreferencesAccess } from 'compass-preferences-model';
import { capMaxTimeMSAtPreferenceLimit } from 'compass-preferences-model/provider';
import type { DataService } from '../modules/data-service';
import { resolveCrossDbLookups } from './cross-db-lookup';

const defaultOptions = {
  promoteValues: false,
  allowDiskUse: true,
  bsonRegExp: true,
};

export async function aggregatePipeline({
  dataService,
  preferences,
  signal,
  namespace,
  pipeline,
  options,
  skip,
  limit,
}: {
  dataService: DataService;
  preferences: PreferencesAccess;
  signal: AbortSignal;
  namespace: string;
  pipeline: Document[];
  options: AggregateOptions;
  skip?: number;
  limit?: number;
}): Promise<Document[]> {
  const allOptions = {
    ...defaultOptions,
    ...options,
    maxTimeMS: capMaxTimeMSAtPreferenceLimit(preferences, options.maxTimeMS),
  };
  // A $lookup naming another database is read and folded into the pipeline
  // before it is sent, since the server resolves `from` inside the database it
  // is running against. Pipelines without one come back untouched.
  const resolvedPipeline = await resolveCrossDbLookups(
    namespace,
    pipeline,
    (ns, foreignPipeline) =>
      dataService.aggregate(ns, foreignPipeline, allOptions, {
        abortSignal: signal,
      })
  );

  return dataService.aggregate(
    namespace,
    resolvedPipeline
      .concat(skip ? [{ $skip: skip }] : [])
      .concat(limit ? [{ $limit: limit }] : []),
    allOptions,
    {
      abortSignal: signal,
    }
  );
}
