export {
  createWebDeletedDocumentsStorage,
  createElectronDeletedDocumentsStorage,
} from './storage-factories';

export type {
  WebStorageOptions,
  ElectronStorageOptions,
} from './storage-factories';

export type {
  DeletedDocumentsStorageInterface,
  NewDeletedDocument,
} from './storage-interfaces';

export type { DeletedDocument } from './deleted-document-schema';

export type {
  DeletedDocumentsStorageAccess,
  DeletedDocumentsStorageOptions,
} from './provider';

export { DeletedDocumentsStorageProvider } from './provider';
