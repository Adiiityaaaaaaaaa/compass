import { createContext, useContext } from 'react';
import type { PipelineStorage } from './pipeline-storage';
import type { FavoriteQueryStorage, RecentQueryStorage } from './query-storage';
import type { BuilderQueryStorageInterface as BuilderQueryStorage } from './storage-interfaces';
import type { AtlasService } from '@mongodb-js/atlas-service/provider';
import { createServiceLocator } from '@mongodb-js/compass-app-registry';

// Define the options types locally since we deleted the original files
export type QueryStorageOptions = {
  basepath?: string;
  orgId?: string;
  projectId?: string;
  atlasService?: AtlasService;
};

export type PipelineStorageOptions = {
  basePath?: string;
  orgId?: string;
  projectId?: string;
  atlasService?: AtlasService;
};

export type {
  PipelineStorage,
  FavoriteQueryStorage,
  RecentQueryStorage,
  BuilderQueryStorage,
};

export type FavoriteQueryStorageAccess = {
  getStorage(options?: QueryStorageOptions): FavoriteQueryStorage;
};

export type RecentQueryStorageAccess = {
  getStorage(options?: QueryStorageOptions): RecentQueryStorage;
};

export type PipelineStorageAccess = {
  getStorage(options?: PipelineStorageOptions): PipelineStorage;
};

export type BuilderQueryStorageAccess = {
  getStorage(options?: QueryStorageOptions): BuilderQueryStorage;
};

const PipelineStorageContext = createContext<PipelineStorageAccess | undefined>(
  undefined
);
const FavoriteQueryStorageContext = createContext<
  FavoriteQueryStorageAccess | undefined
>(undefined);
const RecentQueryStorageContext = createContext<
  RecentQueryStorageAccess | undefined
>(undefined);
const BuilderQueryStorageContext = createContext<
  BuilderQueryStorageAccess | undefined
>(undefined);

export const PipelineStorageProvider = PipelineStorageContext.Provider;
export const FavoriteQueryStorageProvider =
  FavoriteQueryStorageContext.Provider;
export const RecentQueryStorageProvider = RecentQueryStorageContext.Provider;
export const BuilderQueryStorageProvider = BuilderQueryStorageContext.Provider;

export const usePipelineStorage = () => useContext(PipelineStorageContext);
export const pipelineStorageLocator = createServiceLocator(
  usePipelineStorage,
  'pipelineStorageLocator'
);

export const useFavoriteQueryStorageAccess = () =>
  useContext(FavoriteQueryStorageContext);
export const favoriteQueryStorageAccessLocator = createServiceLocator(
  useFavoriteQueryStorageAccess,
  'favoriteQueryStorageAccessLocator'
);

export const useRecentQueryStorageAccess = () =>
  useContext(RecentQueryStorageContext);
export const recentQueryStorageAccessLocator = createServiceLocator(
  useRecentQueryStorageAccess,
  'recentQueryStorageAccessLocator'
);

export const useBuilderQueryStorageAccess = () =>
  useContext(BuilderQueryStorageContext);
export const builderQueryStorageAccessLocator = createServiceLocator(
  useBuilderQueryStorageAccess,
  'builderQueryStorageAccessLocator'
);
