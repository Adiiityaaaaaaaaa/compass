import { EJSON } from 'bson';
import { AtlasUserData, FileUserData } from '@mongodb-js/compass-user-data';
import type { AtlasService } from '@mongodb-js/atlas-service/provider';
import {
  RecentQuerySchema,
  FavoriteQuerySchema,
  BuilderQuerySchema,
} from './query-storage-schema';
import { PipelineSchema } from './pipeline-storage-schema';
import {
  BaseCompassRecentQueryStorage,
  BaseCompassFavoriteQueryStorage,
} from './base-query-storage';
import { BaseCompassBuilderQueryStorage } from './base-builder-query-storage';
import type { KeyValueStorage } from './local-storage-user-data';
import { LocalStorageUserData } from './local-storage-user-data';
import { BaseCompassPipelineStorage } from './base-pipeline-storage';

// Web-specific factory functions
export type WebStorageOptions = {
  orgId: string;
  projectId: string;
  atlasService: AtlasService;
};

export function createWebRecentQueryStorage(options: WebStorageOptions) {
  const userData = new AtlasUserData(RecentQuerySchema, 'RecentQueries', {
    orgId: options.orgId,
    projectId: options.projectId,
    atlasService: options.atlasService,
    serialize: (content) => EJSON.stringify(content),
    deserialize: (content: string) => EJSON.parse(content),
  });
  return new BaseCompassRecentQueryStorage(userData);
}

export function createWebFavoriteQueryStorage(options: WebStorageOptions) {
  const userData = new AtlasUserData(FavoriteQuerySchema, 'FavoriteQueries', {
    orgId: options.orgId,
    projectId: options.projectId,
    atlasService: options.atlasService,
    serialize: (content) => EJSON.stringify(content),
    deserialize: (content: string) => EJSON.parse(content),
  });
  return new BaseCompassFavoriteQueryStorage(userData);
}

export function createWebPipelineStorage(options: WebStorageOptions) {
  const userData = new AtlasUserData(PipelineSchema, 'SavedPipelines', {
    orgId: options.orgId,
    projectId: options.projectId,
    atlasService: options.atlasService,
    serialize: (content) => EJSON.stringify(content),
    deserialize: (content: string) => EJSON.parse(content),
  });
  return new BaseCompassPipelineStorage<typeof PipelineSchema>(userData);
}

// Electron-specific factory functions
export type ElectronStorageOptions = {
  basepath?: string;
};

export function createElectronRecentQueryStorage(
  options: ElectronStorageOptions = {}
) {
  const userData = new FileUserData(RecentQuerySchema, 'RecentQueries', {
    basePath: options.basepath,
    serialize: (content) => EJSON.stringify(content, undefined, 2),
    deserialize: (content: string) => EJSON.parse(content),
  });
  return new BaseCompassRecentQueryStorage(userData);
}

export function createElectronFavoriteQueryStorage(
  options: ElectronStorageOptions = {}
) {
  const userData = new FileUserData(FavoriteQuerySchema, 'FavoriteQueries', {
    basePath: options.basepath,
    serialize: (content) => EJSON.stringify(content, undefined, 2),
    deserialize: (content: string) => EJSON.parse(content),
  });
  return new BaseCompassFavoriteQueryStorage(userData);
}

export function createElectronPipelineStorage(
  options: ElectronStorageOptions = {}
) {
  const userData = new FileUserData(PipelineSchema, 'SavedPipelines', {
    basePath: options.basepath,
  });
  return new BaseCompassPipelineStorage<typeof PipelineSchema>(userData);
}

export function createElectronBuilderQueryStorage(
  options: ElectronStorageOptions = {}
) {
  const userData = new FileUserData(BuilderQuerySchema, 'BuilderQueries', {
    basePath: options.basepath,
    // Canonical EJSON keeps the types of values dragged in from documents.
    // Relaxed mode writes an Int64 as a plain number, which comes back rounded
    // once it is past 2^53 and would then match a different document.
    serialize: (content) =>
      EJSON.stringify(content, undefined, 2, { relaxed: false }),
    deserialize: (content: string) => EJSON.parse(content, { relaxed: false }),
  });
  return new BaseCompassBuilderQueryStorage(userData);
}

/**
 * Builder queries for Compass Web, kept in the browser. The Atlas user data
 * service that holds the other web storages has no type for them.
 */
export function createWebBuilderQueryStorage(
  options: { storage?: KeyValueStorage } = {}
) {
  return new BaseCompassBuilderQueryStorage(
    new LocalStorageUserData(
      BuilderQuerySchema,
      'compass-builder-queries',
      options.storage ?? globalThis.localStorage
    )
  );
}
