import { expect } from 'chai';
import sinon from 'sinon';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import AppRegistry, {
  createActivateHelpers,
} from '@mongodb-js/compass-app-registry';
import { MongoDBInstance } from 'mongodb-instance-model';
import { createElectronBuilderQueryStorage } from '@mongodb-js/my-queries-storage';
import type { PreferencesAccess } from 'compass-preferences-model';
import { createSandboxFromDefaultPreferences } from 'compass-preferences-model';
import { createNoopLogger } from '@mongodb-js/compass-logging/provider';
import { createNoopTrack } from '@mongodb-js/compass-telemetry/provider';
import {
  type ConnectionInfoRef,
  ConnectionScopedAppRegistryImpl,
} from '@mongodb-js/compass-connections/provider';
import type { FieldStoreService } from '@mongodb-js/compass-field-store';
import {
  createDefaultConnectionInfo,
  waitFor,
} from '@mongodb-js/testing-library-compass';
import type {
  CrudStore,
  CrudStoreOptions,
  DocumentsPluginServices,
} from './crud-store';
import { activateDocumentsPlugin } from './crud-store';
import type { BuilderState } from '../components/query-builder/builder-query';
import { EMPTY_BUILDER_STATE } from '../components/query-builder/builder-query';

const NAMESPACE = 'shop.users';

function rowsFor(email: string): BuilderState {
  return {
    ...EMPTY_BUILDER_STATE,
    conditions: [
      {
        id: 'condition-1',
        field: 'email',
        operator: 'eq',
        valueText: email,
        enabled: true,
      },
    ],
  };
}

describe('saved builder queries', function () {
  const connectionInfoRef = {
    current: createDefaultConnectionInfo(),
  } as ConnectionInfoRef;
  let tmpDir: string;
  let storage: ReturnType<typeof createElectronBuilderQueryStorage>;
  let preferences: PreferencesAccess;
  let queryBar: {
    getLastAppliedQuery: sinon.SinonStub;
    getCurrentQuery: sinon.SinonStub;
    changeQuery: sinon.SinonStub;
    setQuery: sinon.SinonSpy;
    setAndApplyQuery: sinon.SinonSpy;
  };
  // Disconnected, so that loading documents stops before reaching a server.
  // It is the first thing a load asks, which marks when the load happened.
  let isConnected: sinon.SinonStub;
  let deactivate: (() => void) | undefined;

  function saveQuery(name: string, email: string) {
    return storage.saveQuery({
      _name: name,
      _ns: NAMESPACE,
      _connectionId: connectionInfoRef.current.id,
      builderState: rowsFor(email),
    });
  }

  function openCollection(options: Partial<CrudStoreOptions> = {}): CrudStore {
    const globalAppRegistry = new AppRegistry();
    const services = {
      dataService: { isConnected },
      instance: new MongoDBInstance({
        _id: '123',
        topologyDescription: { type: 'Unknown', servers: [] },
        build: { version: '6.0.0' },
        dataLake: { isDataLake: false },
        preferences,
      } as any),
      localAppRegistry: new AppRegistry(),
      globalAppRegistry,
      preferences,
      logger: createNoopLogger(),
      track: createNoopTrack(),
      fieldStoreService: {} as FieldStoreService,
      connectionInfoRef,
      connectionScopedAppRegistry: new ConnectionScopedAppRegistryImpl(
        globalAppRegistry.emit.bind(globalAppRegistry),
        connectionInfoRef
      ),
      queryBar,
      collection: {
        toJSON() {
          return {};
        },
        on() {},
        removeListener() {},
      },
      builderQueryStorageAccess: { getStorage: () => storage },
    } as unknown as DocumentsPluginServices;

    const plugin = activateDocumentsPlugin(
      {
        isSearchIndexesSupported: false,
        isReadonly: false,
        isTimeSeries: false,
        namespace: NAMESPACE,
        ...options,
      },
      services,
      createActivateHelpers()
    );
    deactivate = plugin.deactivate;
    return plugin.store;
  }

  async function openCollectionAndWaitForLoad(
    options: Partial<CrudStoreOptions> = {}
  ) {
    const store = openCollection(options);
    await waitFor(() => expect(isConnected).to.have.been.called);
    return store;
  }

  async function openCollectionWithoutLoading() {
    const store = openCollection({ noRefreshOnConfigure: true });
    await store.loadSavedBuilderQueries();
    return store;
  }

  before(async function () {
    preferences = await createSandboxFromDefaultPreferences();
  });

  beforeEach(async function () {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'crud-builder-queries'));
    storage = createElectronBuilderQueryStorage({ basepath: tmpDir });
    queryBar = {
      getLastAppliedQuery: sinon.stub().returns({}),
      getCurrentQuery: sinon.stub().returns({}),
      changeQuery: sinon.stub(),
      setQuery: sinon.spy(),
      setAndApplyQuery: sinon.spy(),
    };
    isConnected = sinon.stub().returns(false);
  });

  afterEach(async function () {
    deactivate?.();
    deactivate = undefined;
    await fs.rm(tmpDir, { recursive: true });
  });

  describe('opening the collection', function () {
    it('runs the default query, filling the builder with it', async function () {
      await saveQuery('Bob', 'bob@example.com');
      const alice = await saveQuery('Alice', 'alice@example.com');
      await storage.setDefault(
        connectionInfoRef.current.id,
        NAMESPACE,
        alice._id
      );

      const store = await openCollectionAndWaitForLoad();

      expect(queryBar.setAndApplyQuery).to.have.been.calledOnce;
      const [query, source] = queryBar.setAndApplyQuery.firstCall.args;
      expect(query.filter).to.deep.equal({ email: 'alice@example.com' });
      expect(source).to.equal('crud');
      // Applied first, so that the documents load with it.
      expect(queryBar.setAndApplyQuery).to.have.been.calledBefore(isConnected);
      expect(store.state.builderState.conditions[0].valueText).to.equal(
        'alice@example.com'
      );
      expect(store.state.selectedBuilderQueryId).to.equal(alice._id);
    });

    it('runs nothing when no saved query is the default', async function () {
      await saveQuery('Alice', 'alice@example.com');

      const store = await openCollectionAndWaitForLoad();

      expect(queryBar.setAndApplyQuery).to.not.have.been.called;
      expect(store.state.builderState).to.deep.equal(EMPTY_BUILDER_STATE);
      expect(store.state.savedBuilderQueries).to.have.lengthOf(1);
    });

    it('skips the default when opened to run a particular query', async function () {
      const alice = await saveQuery('Alice', 'alice@example.com');
      await storage.setDefault(
        connectionInfoRef.current.id,
        NAMESPACE,
        alice._id
      );

      const store = await openCollectionAndWaitForLoad({
        query: { filter: { name: 'From My Queries' } },
      });

      expect(queryBar.setAndApplyQuery).to.not.have.been.called;
      expect(store.state.builderState).to.deep.equal(EMPTY_BUILDER_STATE);
    });

    it('ignores the defaults of other connections', async function () {
      const elsewhere = await storage.saveQuery({
        _name: 'Elsewhere',
        _ns: NAMESPACE,
        _connectionId: 'another-connection',
        builderState: rowsFor('alice@example.com'),
      });
      await storage.setDefault('another-connection', NAMESPACE, elsewhere._id);

      const store = await openCollectionAndWaitForLoad();

      expect(queryBar.setAndApplyQuery).to.not.have.been.called;
      expect(store.state.savedBuilderQueries).to.deep.equal([]);
    });
  });

  describe('opening a saved query', function () {
    it('fills in its rows and writes them to the query bar without running them', async function () {
      const alice = await saveQuery('Alice', 'alice@example.com');
      const store = await openCollectionWithoutLoading();

      store.openSavedBuilderQuery(alice._id);

      expect(store.state.builderState.conditions[0].valueText).to.equal(
        'alice@example.com'
      );
      expect(store.state.selectedBuilderQueryId).to.equal(alice._id);
      expect(queryBar.setQuery).to.have.been.calledOnce;
      expect(queryBar.setQuery.firstCall.args[0].filter).to.deep.equal({
        email: 'alice@example.com',
      });
      expect(queryBar.setAndApplyQuery).to.not.have.been.called;
    });

    it('gives its rows new ids each time it is opened', async function () {
      const alice = await saveQuery('Alice', 'alice@example.com');
      const store = await openCollectionWithoutLoading();

      store.openSavedBuilderQuery(alice._id);
      const firstId = store.state.builderState.conditions[0].id;
      store.openSavedBuilderQuery(alice._id);

      expect(store.state.builderState.conditions[0].id).to.not.equal(firstId);
    });
  });

  describe('saving', function () {
    it('saves the rows under a name and selects the saved query', async function () {
      const store = await openCollectionWithoutLoading();
      store.setBuilderState(rowsFor('alice@example.com'));

      await store.saveBuilderQuery('  Alice  ');

      const saved = await storage.loadAll(
        connectionInfoRef.current.id,
        NAMESPACE
      );
      expect(saved.map((query) => query._name)).to.deep.equal(['Alice']);
      expect(saved[0].builderState.conditions[0].valueText).to.equal(
        'alice@example.com'
      );
      expect(store.state.savedBuilderQueries).to.deep.equal(saved);
      expect(store.state.selectedBuilderQueryId).to.equal(saved[0]._id);
    });

    it('saves nothing from an empty builder', async function () {
      const store = await openCollectionWithoutLoading();

      await store.saveBuilderQuery('Nothing');

      expect(
        await storage.loadAll(connectionInfoRef.current.id, NAMESPACE)
      ).to.deep.equal([]);
    });
  });

  describe('the default', function () {
    it('moves to the query starred last, and goes when it is unstarred', async function () {
      const alice = await saveQuery('Alice', 'alice@example.com');
      const bob = await saveQuery('Bob', 'bob@example.com');
      const store = await openCollectionWithoutLoading();
      const defaults = () =>
        store.state
          .savedBuilderQueries!.filter((query) => query._isDefault)
          .map((query) => query._name);

      await store.toggleDefaultBuilderQuery(alice._id);
      expect(defaults()).to.deep.equal(['Alice']);

      await store.toggleDefaultBuilderQuery(bob._id);
      expect(defaults()).to.deep.equal(['Bob']);

      await store.toggleDefaultBuilderQuery(bob._id);
      expect(defaults()).to.deep.equal([]);
    });
  });
});
