// Electron-specific exports for Compass Electron
export { createElectronDeletedDocumentsStorage } from './storage-factories';

export type { ElectronStorageOptions } from './storage-factories';

export type {
  DeletedDocumentsStorageInterface,
  NewDeletedDocument,
} from './storage-interfaces';

export type { DeletedDocument } from './deleted-document-schema';
