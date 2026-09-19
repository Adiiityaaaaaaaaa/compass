import { EJSON } from 'bson';
import { AtlasUserData, FileUserData } from '@mongodb-js/compass-user-data';
import type { AtlasService } from '@mongodb-js/atlas-service/provider';
import { DeletedDocumentSchema } from './deleted-document-schema';
import { BaseCompassDeletedDocumentsStorage } from './base-deleted-documents-storage';

// Web-specific factory function
export type WebStorageOptions = {
  orgId: string;
  projectId: string;
  atlasService: AtlasService;
};

export function createWebDeletedDocumentsStorage(options: WebStorageOptions) {
  const userData = new AtlasUserData(
    DeletedDocumentSchema,
    'DeletedDocuments',
    {
      orgId: options.orgId,
      projectId: options.projectId,
      atlasService: options.atlasService,
      serialize: (content) => EJSON.stringify(content),
      deserialize: (content: string) => EJSON.parse(content),
    }
  );
  return new BaseCompassDeletedDocumentsStorage(userData);
}

// Electron-specific factory function
export type ElectronStorageOptions = {
  basepath?: string;
};

export function createElectronDeletedDocumentsStorage(
  options: ElectronStorageOptions = {}
) {
  const userData = new FileUserData(DeletedDocumentSchema, 'DeletedDocuments', {
    basePath: options.basepath,
    serialize: (content) => EJSON.stringify(content, undefined, 2),
    deserialize: (content: string) => EJSON.parse(content),
  });
  return new BaseCompassDeletedDocumentsStorage(userData);
}
