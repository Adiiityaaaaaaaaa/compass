// Main exports - these use runtime detection for backward compatibility
export {
  createWebRecentQueryStorage,
  createWebFavoriteQueryStorage,
  createWebPipelineStorage,
  createWebBuilderQueryStorage,
  createElectronRecentQueryStorage,
  createElectronFavoriteQueryStorage,
  createElectronPipelineStorage,
  createElectronBuilderQueryStorage,
} from './storage-factories';

export type {
  WebStorageOptions,
  ElectronStorageOptions,
} from './storage-factories';

// Re-export shared interfaces
export type {
  RecentQueryStorageInterface,
  FavoriteQueryStorageInterface,
  PipelineStorageInterface,
  BuilderQueryStorageInterface,
} from './storage-interfaces';

// Re-export schemas
export type {
  RecentQuery,
  FavoriteQuery,
  BuilderQuery,
} from './query-storage-schema';
export type { SavedPipeline } from './pipeline-storage-schema';

// Re-export provider types
export type {
  FavoriteQueryStorageAccess,
  RecentQueryStorageAccess,
  PipelineStorageAccess,
  BuilderQueryStorageAccess,
} from './provider';

// Re-export provider components
export {
  PipelineStorageProvider,
  FavoriteQueryStorageProvider,
  RecentQueryStorageProvider,
  BuilderQueryStorageProvider,
} from './provider';
