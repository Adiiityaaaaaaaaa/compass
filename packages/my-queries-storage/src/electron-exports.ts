// Electron-specific exports for Compass Electron
export {
  createElectronRecentQueryStorage,
  createElectronFavoriteQueryStorage,
  createElectronPipelineStorage,
  createElectronBuilderQueryStorage,
} from './storage-factories';

export type { ElectronStorageOptions } from './storage-factories';

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
