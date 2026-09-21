import type AppRegistry from '@mongodb-js/compass-app-registry';
import type { ConnectionsService } from '@mongodb-js/compass-connections/provider';
import type { Logger } from '@mongodb-js/compass-logging';
import type { Action, AnyAction } from 'redux';
import { applyMiddleware, createStore } from 'redux';
import type { ThunkAction } from 'redux-thunk';
import thunk from 'redux-thunk';
import type { ActivateHelpers } from '@mongodb-js/compass-app-registry';
import type { TrackFunction } from '@mongodb-js/compass-telemetry';
import reducer, {
  copyCollection,
  openPasteModal,
} from '../modules/copy-collection';

export type CopyCollectionServices = {
  connections: ConnectionsService;
  globalAppRegistry: AppRegistry;
  logger: Logger;
  track: TrackFunction;
};

function configureStore(services: CopyCollectionServices) {
  return createStore(
    reducer,
    applyMiddleware(thunk.withExtraArgument(services))
  );
}

export type CopyCollectionRootState = ReturnType<
  ReturnType<typeof configureStore>['getState']
>;

export type CopyCollectionThunkAction<
  R,
  A extends Action = AnyAction
> = ThunkAction<R, CopyCollectionRootState, CopyCollectionServices, A>;

export function activateCopyCollectionPlugin(
  _: unknown,
  services: CopyCollectionServices,
  { on, cleanup }: ActivateHelpers
) {
  const { globalAppRegistry, connections } = services;
  const store = configureStore(services);

  on(
    globalAppRegistry,
    'copy-collection',
    (
      ns: { database: string; collection: string },
      { connectionId }: { connectionId?: string } = {}
    ) => {
      if (!connectionId) {
        throw new Error(
          'Cannot copy a collection without specifying connectionId'
        );
      }
      const connectionName =
        connections.getConnectionById(connectionId)?.title ?? '';
      store.dispatch(
        copyCollection(connectionId, connectionName, ns.database, ns.collection)
      );
    }
  );

  on(
    globalAppRegistry,
    'open-paste-collection',
    (
      { database }: { database?: string } = {},
      { connectionId }: { connectionId?: string } = {}
    ) => {
      if (!connectionId) {
        throw new Error(
          'Cannot paste a collection without specifying connectionId'
        );
      }
      const connectionName =
        connections.getConnectionById(connectionId)?.title ?? '';
      store.dispatch(openPasteModal(connectionId, connectionName, database));
    }
  );

  return {
    store,
    deactivate: cleanup,
  };
}
