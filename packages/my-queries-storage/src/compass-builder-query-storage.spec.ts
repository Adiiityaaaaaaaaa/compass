import { expect } from 'chai';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { Long, ObjectId } from 'bson';
import {
  createElectronBuilderQueryStorage,
  createWebBuilderQueryStorage,
} from './storage-factories';
import type { BuilderQueryStorageInterface } from './storage-interfaces';

// Stands in for the browser's localStorage, which mocha does not have.
function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

// The same behaviour is expected wherever the queries are kept.
const BACKENDS: {
  name: string;
  create(): Promise<{
    storage: BuilderQueryStorageInterface;
    cleanup: () => Promise<void>;
  }>;
}[] = [
  {
    name: 'on disk, for the desktop app',
    async create() {
      const tmpDir = await fs.mkdtemp(
        path.join(os.tmpdir(), 'builder-query-tests')
      );
      return {
        storage: createElectronBuilderQueryStorage({ basepath: tmpDir }),
        cleanup: () => fs.rm(tmpDir, { recursive: true }),
      };
    },
  },
  {
    name: 'in the browser, for Compass Web',
    create() {
      return Promise.resolve({
        storage: createWebBuilderQueryStorage({ storage: memoryStorage() }),
        cleanup: () => Promise.resolve(),
      });
    },
  },
];

const ROWS = {
  match: 'and',
  conditions: [
    {
      id: 'condition-1',
      field: 'email',
      operator: 'eq',
      valueText: 'alice@example.com',
      enabled: true,
    },
  ],
  projections: [],
  sorts: [],
  skip: '',
  limit: '',
};

for (const backend of BACKENDS)
  describe(`CompassBuilderQueryStorage ${backend.name}`, function () {
    let storage: BuilderQueryStorageInterface;
    let cleanup: () => Promise<void>;

    beforeEach(async function () {
      ({ storage, cleanup } = await backend.create());
    });

    afterEach(async function () {
      await cleanup();
    });

    function save(name: string, connectionId = 'conn-1', ns = 'shop.users') {
      return storage.saveQuery({
        _name: name,
        _ns: ns,
        _connectionId: connectionId,
        builderState: ROWS,
      });
    }

    it('loads only the queries saved for the collection on the connection', async function () {
      await save('Alice');
      await save('Other collection', 'conn-1', 'shop.orders');
      await save('Other connection', 'conn-2', 'shop.users');

      const loaded = await storage.loadAll('conn-1', 'shop.users');

      expect(loaded.map((query) => query._name)).to.deep.equal(['Alice']);
      expect(loaded[0].builderState).to.deep.equal(ROWS);
    });

    it('keeps the BSON types of values dragged in from documents', async function () {
      const builderState = {
        ...ROWS,
        conditions: [
          {
            ...ROWS.conditions[0],
            value: new ObjectId('6aa58011e0a9d9da55fffea5'),
          },
          {
            ...ROWS.conditions[0],
            id: 'condition-2',
            value: Long.fromString('9007199254740993'),
          },
        ],
      };
      await storage.saveQuery({
        _name: 'Typed',
        _ns: 'shop.users',
        _connectionId: 'conn-1',
        builderState,
      });

      const [loaded] = await storage.loadAll('conn-1', 'shop.users');

      const [objectIdRow, longRow] = loaded.builderState.conditions;
      expect(objectIdRow.value).to.be.instanceOf(ObjectId);
      expect(String(longRow.value)).to.equal('9007199254740993');
    });

    it('updates the query saved under the same name rather than adding one', async function () {
      const first = await save('Alice');
      await storage.setDefault('conn-1', 'shop.users', first._id);

      await storage.saveQuery({
        _name: 'Alice',
        _ns: 'shop.users',
        _connectionId: 'conn-1',
        builderState: { ...ROWS, limit: '5' },
      });

      const loaded = await storage.loadAll('conn-1', 'shop.users');
      expect(loaded).to.have.lengthOf(1);
      expect(loaded[0]._id).to.equal(first._id);
      expect(loaded[0].builderState.limit).to.equal('5');
      expect(loaded[0]._isDefault).to.equal(true);
    });

    it('keeps one default per collection', async function () {
      const alice = await save('Alice');
      const bob = await save('Bob');
      const elsewhere = await save('Elsewhere', 'conn-1', 'shop.orders');
      await storage.setDefault('conn-1', 'shop.orders', elsewhere._id);

      await storage.setDefault('conn-1', 'shop.users', alice._id);
      await storage.setDefault('conn-1', 'shop.users', bob._id);

      const defaults = (await storage.loadAll('conn-1', 'shop.users')).filter(
        (query) => query._isDefault
      );
      expect(defaults.map((query) => query._name)).to.deep.equal(['Bob']);
      const [orders] = await storage.loadAll('conn-1', 'shop.orders');
      expect(orders._isDefault).to.equal(true);
    });

    it('clears the default', async function () {
      const alice = await save('Alice');
      await storage.setDefault('conn-1', 'shop.users', alice._id);

      await storage.setDefault('conn-1', 'shop.users', null);

      const [loaded] = await storage.loadAll('conn-1', 'shop.users');
      expect(loaded._isDefault).to.equal(false);
    });

    it('deletes a saved query', async function () {
      const alice = await save('Alice');
      await save('Bob');

      await storage.delete(alice._id);

      const loaded = await storage.loadAll('conn-1', 'shop.users');
      expect(loaded.map((query) => query._name)).to.deep.equal(['Bob']);
    });
  });
