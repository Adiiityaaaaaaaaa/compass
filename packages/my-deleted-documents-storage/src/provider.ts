import { createContext, useContext } from 'react';
import type { AtlasService } from '@mongodb-js/atlas-service/provider';
import { createServiceLocator } from '@mongodb-js/compass-app-registry';
import type {
  DeletedDocumentsStorageInterface,
  NewDeletedDocument,
} from './storage-interfaces';
import type { DeletedDocument } from './deleted-document-schema';

export type {
  DeletedDocumentsStorageInterface,
  NewDeletedDocument,
  DeletedDocument,
};

export type DeletedDocumentsStorageOptions = {
  basepath?: string;
  orgId?: string;
  projectId?: string;
  atlasService?: AtlasService;
};

export type DeletedDocumentsStorageAccess = {
  getStorage(
    options?: DeletedDocumentsStorageOptions
  ): DeletedDocumentsStorageInterface;
};

const DeletedDocumentsStorageContext = createContext<
  DeletedDocumentsStorageAccess | undefined
>(undefined);

export const DeletedDocumentsStorageProvider =
  DeletedDocumentsStorageContext.Provider;

export const useDeletedDocumentsStorageAccess = () =>
  useContext(DeletedDocumentsStorageContext);

export const deletedDocumentsStorageAccessLocator = createServiceLocator(
  useDeletedDocumentsStorageAccess,
  'deletedDocumentsStorageAccessLocator'
);
