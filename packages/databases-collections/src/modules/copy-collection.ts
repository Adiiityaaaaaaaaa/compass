import type { Action, AnyAction, Reducer } from 'redux';
import { openToast } from '@mongodb-js/compass-components';
import type { CopyCollectionThunkAction } from '../stores/copy-collection';
import {
  copySameConnection,
  streamCopyCollection,
  type CopyCollectionMode,
  type CopyProgress,
} from './copy-collection-writer';

/**
 * No dots in DB name error message, matching create-namespace's validation.
 */
export const NO_DOT = 'Database names may not contain a "."';

export type CopiedCollection = {
  connectionId: string;
  connectionName: string;
  database: string;
  collection: string;
};

export type CopyCollectionState = {
  isVisible: boolean;
  isRunning: boolean;
  error: Error | null;
  copiedCollection: CopiedCollection | null;
  destConnectionId: string;
  destConnectionName: string;
  destDatabase: string;
  // True when the paste target already fixes the destination database (i.e.
  // the user chose "Paste" on a specific database, not on a connection), in
  // which case the database field is shown read-only in the modal.
  destDatabaseLocked: boolean;
  destCollection: string;
  mode: CopyCollectionMode;
  progress: CopyProgress | null;
};

export const INITIAL_STATE: CopyCollectionState = {
  isVisible: false,
  isRunning: false,
  error: null,
  copiedCollection: null,
  destConnectionId: '',
  destConnectionName: '',
  destDatabase: '',
  destDatabaseLocked: false,
  destCollection: '',
  mode: 'merge',
  progress: null,
};

export const CopyCollectionActionTypes = {
  SetCopiedCollection:
    'databases-collections/copy-collection/SetCopiedCollection',
  OpenPaste: 'databases-collections/copy-collection/OpenPaste',
  Close: 'databases-collections/copy-collection/Close',
  SetDestDatabase: 'databases-collections/copy-collection/SetDestDatabase',
  SetDestCollection: 'databases-collections/copy-collection/SetDestCollection',
  SetMode: 'databases-collections/copy-collection/SetMode',
  HandleError: 'databases-collections/copy-collection/HandleError',
  ClearError: 'databases-collections/copy-collection/ClearError',
  ToggleIsRunning: 'databases-collections/copy-collection/ToggleIsRunning',
  UpdateProgress: 'databases-collections/copy-collection/UpdateProgress',
  Reset: 'databases-collections/copy-collection/Reset',
} as const;

export type SetCopiedCollectionAction = {
  type: typeof CopyCollectionActionTypes.SetCopiedCollection;
  copiedCollection: CopiedCollection;
};

export type OpenPasteAction = {
  type: typeof CopyCollectionActionTypes.OpenPaste;
  destConnectionId: string;
  destConnectionName: string;
  destDatabase: string;
  destDatabaseLocked: boolean;
};

export type CloseAction = { type: typeof CopyCollectionActionTypes.Close };

export type SetDestDatabaseAction = {
  type: typeof CopyCollectionActionTypes.SetDestDatabase;
  database: string;
};

export type SetDestCollectionAction = {
  type: typeof CopyCollectionActionTypes.SetDestCollection;
  collection: string;
};

export type SetModeAction = {
  type: typeof CopyCollectionActionTypes.SetMode;
  mode: CopyCollectionMode;
};

export type HandleErrorAction = {
  type: typeof CopyCollectionActionTypes.HandleError;
  error: Error;
};

export type ClearErrorAction = {
  type: typeof CopyCollectionActionTypes.ClearError;
};

export type ToggleIsRunningAction = {
  type: typeof CopyCollectionActionTypes.ToggleIsRunning;
  isRunning: boolean;
};

export type UpdateProgressAction = {
  type: typeof CopyCollectionActionTypes.UpdateProgress;
  progress: CopyProgress;
};

export type ResetAction = { type: typeof CopyCollectionActionTypes.Reset };

export const close = (): CloseAction => ({
  type: CopyCollectionActionTypes.Close,
});

export const setDestDatabase = (database: string): SetDestDatabaseAction => ({
  type: CopyCollectionActionTypes.SetDestDatabase,
  database,
});

export const setDestCollection = (
  collection: string
): SetDestCollectionAction => ({
  type: CopyCollectionActionTypes.SetDestCollection,
  collection,
});

export const setMode = (mode: CopyCollectionMode): SetModeAction => ({
  type: CopyCollectionActionTypes.SetMode,
  mode,
});

export const clearError = (): ClearErrorAction => ({
  type: CopyCollectionActionTypes.ClearError,
});

const handleError = (error: Error): HandleErrorAction => ({
  type: CopyCollectionActionTypes.HandleError,
  error,
});

const toggleIsRunning = (isRunning: boolean): ToggleIsRunningAction => ({
  type: CopyCollectionActionTypes.ToggleIsRunning,
  isRunning,
});

const updateProgress = (progress: CopyProgress): UpdateProgressAction => ({
  type: CopyCollectionActionTypes.UpdateProgress,
  progress,
});

const reset = (): ResetAction => ({
  type: CopyCollectionActionTypes.Reset,
});

// "Copy" on a collection: just remembers it, no dialog. Mirrors an OS
// clipboard — the destination is chosen later, by pasting somewhere.
export const copyCollection = (
  connectionId: string,
  connectionName: string,
  database: string,
  collection: string
): CopyCollectionThunkAction<void, SetCopiedCollectionAction> => {
  return (dispatch) => {
    dispatch({
      type: CopyCollectionActionTypes.SetCopiedCollection,
      copiedCollection: { connectionId, connectionName, database, collection },
    });
    openToast('copy-collection-copied', {
      variant: 'success',
      title: '',
      description: `Copied "${database}.${collection}". Right-click a database or connection and choose Paste to copy it there.`,
    });
  };
};

// "Paste" on a database or connection: opens the modal, with the
// destination connection/database fixed by whatever was pasted onto.
export const openPasteModal = (
  destConnectionId: string,
  destConnectionName: string,
  destDatabase?: string
): CopyCollectionThunkAction<void> => {
  return (dispatch, getState, { track, connections }) => {
    const { copiedCollection } = getState();
    if (!copiedCollection) {
      openToast('copy-collection-empty-clipboard', {
        variant: 'warning',
        title: '',
        description:
          'Nothing copied yet. Right-click a collection and choose Copy first.',
      });
      return;
    }

    track(
      'Screen',
      { name: 'copy_collection_modal' },
      connections.getConnectionById(destConnectionId)?.info
    );

    dispatch({
      type: CopyCollectionActionTypes.OpenPaste,
      destConnectionId,
      destConnectionName,
      destDatabase: destDatabase || copiedCollection.database,
      destDatabaseLocked: !!destDatabase,
    });
  };
};

export const hideModal = (): CopyCollectionThunkAction<void, CloseAction> => {
  return (dispatch) => {
    dispatch(close());
  };
};

export const submitCopy = (): CopyCollectionThunkAction<Promise<void>> => {
  return async (
    dispatch,
    getState,
    { connections, track, logger: { log, mongoLogId }, globalAppRegistry }
  ) => {
    const state = getState();
    const { copiedCollection } = state;

    dispatch(clearError());

    if (!copiedCollection) {
      dispatch(handleError(new Error('Nothing copied yet.')));
      return;
    }

    const destDatabase = state.destDatabase.trim();
    const destCollection = state.destCollection.trim();

    if (!destDatabase || !destCollection) {
      dispatch(
        handleError(
          new Error('Enter a destination database and collection name.')
        )
      );
      return;
    }

    if (destDatabase.includes('.')) {
      dispatch(handleError(new Error(NO_DOT)));
      return;
    }

    const sourceNs = `${copiedCollection.database}.${copiedCollection.collection}`;
    const destNs = `${destDatabase}.${destCollection}`;

    if (
      state.destConnectionId === copiedCollection.connectionId &&
      destNs === sourceNs
    ) {
      dispatch(
        handleError(
          new Error(
            'Choose a different database, collection, or connection to paste into.'
          )
        )
      );
      return;
    }

    dispatch(toggleIsRunning(true));

    try {
      const sourceDataService = connections.getDataServiceForConnection(
        copiedCollection.connectionId
      );

      if (state.destConnectionId === copiedCollection.connectionId) {
        await copySameConnection({
          dataService: sourceDataService,
          sourceNs,
          destDb: destDatabase,
          destColl: destCollection,
          mode: state.mode,
        });
      } else {
        const destDataService = connections.getDataServiceForConnection(
          state.destConnectionId
        );
        await streamCopyCollection({
          sourceDataService,
          sourceNs,
          destDataService,
          destNs,
          mode: state.mode,
          onProgress: (progress) => dispatch(updateProgress(progress)),
        });
      }

      track(
        'Collection Copied',
        {
          same_connection:
            state.destConnectionId === copiedCollection.connectionId,
          mode: state.mode,
        },
        connections.getConnectionById(copiedCollection.connectionId)?.info
      );

      globalAppRegistry.emit('collection-created', destNs, {
        connectionId: state.destConnectionId,
      });

      dispatch(reset());
    } catch (err) {
      log.warn(
        mongoLogId(1_001_000_470),
        'Copy Collection',
        'Failed to copy collection',
        { sourceNs, destNs, error: (err as Error).message }
      );
      dispatch(toggleIsRunning(false));
      dispatch(handleError(err as Error));
    }
  };
};

function isAction<A extends AnyAction>(
  action: AnyAction,
  type: A['type']
): action is A {
  return action.type === type;
}

const reducer: Reducer<CopyCollectionState, Action> = (
  state = INITIAL_STATE,
  action
) => {
  if (
    isAction<SetCopiedCollectionAction>(
      action,
      CopyCollectionActionTypes.SetCopiedCollection
    )
  ) {
    return { ...state, copiedCollection: action.copiedCollection };
  }

  if (isAction<OpenPasteAction>(action, CopyCollectionActionTypes.OpenPaste)) {
    return {
      ...state,
      isVisible: true,
      isRunning: false,
      error: null,
      progress: null,
      destConnectionId: action.destConnectionId,
      destConnectionName: action.destConnectionName,
      destDatabase: action.destDatabase,
      destDatabaseLocked: action.destDatabaseLocked,
      destCollection: state.copiedCollection?.collection ?? '',
      mode: 'merge',
    };
  }

  if (isAction<CloseAction>(action, CopyCollectionActionTypes.Close)) {
    return { ...state, isVisible: false };
  }

  if (isAction<ResetAction>(action, CopyCollectionActionTypes.Reset)) {
    return {
      ...state,
      isVisible: false,
      isRunning: false,
      error: null,
      progress: null,
    };
  }

  if (
    isAction<SetDestDatabaseAction>(
      action,
      CopyCollectionActionTypes.SetDestDatabase
    )
  ) {
    return { ...state, destDatabase: action.database };
  }

  if (
    isAction<SetDestCollectionAction>(
      action,
      CopyCollectionActionTypes.SetDestCollection
    )
  ) {
    return { ...state, destCollection: action.collection };
  }

  if (isAction<SetModeAction>(action, CopyCollectionActionTypes.SetMode)) {
    return { ...state, mode: action.mode };
  }

  if (
    isAction<HandleErrorAction>(action, CopyCollectionActionTypes.HandleError)
  ) {
    return { ...state, isRunning: false, error: action.error };
  }

  if (
    isAction<ClearErrorAction>(action, CopyCollectionActionTypes.ClearError)
  ) {
    return { ...state, error: null };
  }

  if (
    isAction<ToggleIsRunningAction>(
      action,
      CopyCollectionActionTypes.ToggleIsRunning
    )
  ) {
    return { ...state, isRunning: action.isRunning };
  }

  if (
    isAction<UpdateProgressAction>(
      action,
      CopyCollectionActionTypes.UpdateProgress
    )
  ) {
    return { ...state, progress: action.progress };
  }

  return state;
};

export default reducer;
