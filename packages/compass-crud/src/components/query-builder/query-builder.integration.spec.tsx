import React from 'react';
import { expect } from 'chai';
import sinon from 'sinon';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import {
  Binary,
  BSONRegExp,
  Code,
  Decimal128,
  Double,
  Int32,
  Long,
  MaxKey,
  MinKey,
  ObjectId,
  Timestamp,
} from 'bson';
import type { Document } from 'bson';
import HadronDocument from 'hadron-document';
import type { Element } from 'hadron-document';
import type { DataService } from 'mongodb-data-service';
import { connect } from 'mongodb-data-service';
import { mochaTestServer } from '@mongodb-js/compass-test-server';
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from '@mongodb-js/testing-library-compass';
import { DocumentList } from '@mongodb-js/compass-components';
import { registerCompassPlugin } from '@mongodb-js/compass-app-registry';
import type { QueryBarService } from '@mongodb-js/compass-query-bar';
import QueryBarPlugin, {
  queryBarServiceLocator,
} from '@mongodb-js/compass-query-bar';
import { PreferencesProvider } from 'compass-preferences-model/provider';
import {
  createElectronBuilderQueryStorage,
  createWebBuilderQueryStorage,
} from '@mongodb-js/my-queries-storage';
import { createSandboxFromDefaultPreferences } from 'compass-preferences-model';
import { QueryBuilderPanel } from './query-builder-panel';
import type { BuilderState, ConditionRow } from './builder-query';
import {
  EMPTY_BUILDER_STATE,
  compileBuilderState,
  compiledQueryToAppliedQuery,
  doesQueryBarShow,
  nextRowId,
  toBuilderState,
  valueTextForOperator,
} from './builder-query';

/**
 * The builder end to end: a field dragged out of a real document, the query
 * it compiles to written into the real query bar and read back the way the
 * bar reads it, and that query run on a real server.
 *
 * Every query is checked against a decoy that holds a near miss for each
 * field, such as the Int64 one below the target's, past the point where a
 * double can tell them apart. A value that is only roughly right matches
 * the decoy instead, or as well.
 */

const NS = 'query-builder-integration.people';

const T = new ObjectId('6aa58011e0a9d9da55fffea5'); // the target
const D = new ObjectId('6aa58011e0a9d9da55fffea6'); // the decoy
const S = new ObjectId('6aa58011e0a9d9da55fffea7'); // sparse: most fields absent

const UUID_TEXT = '3b241101-e2bb-4255-8caf-4136c566a962';

const TARGET = {
  _id: T,
  str: 'alice@example.com',
  digits: '1300932190',
  empty: '',
  special: 'a.b*c (x) [y]',
  unicode: 'Ünïcødé ✓',
  int32: new Int32(25),
  int64: Long.fromString('9007199254740993'),
  double: new Double(2.5),
  wholeDouble: new Double(2),
  decimal: Decimal128.fromString('1.5'),
  bigDecimal: Decimal128.fromString('12345678901234567890.123456789'),
  bool: true,
  date: new Date('2024-01-02T03:04:05.678Z'),
  oid: new ObjectId('64b7f1c2a1b2c3d4e5f60718'),
  uuid: new Binary(Buffer.from(UUID_TEXT.replace(/-/g, ''), 'hex'), 4),
  // The same UUID as a C# driver stores it: the first three groups reversed.
  csuuid: new Binary(Buffer.from('0111243bbbe255428caf4136c566a962', 'hex'), 3),
  binary: new Binary(Buffer.from('hello'), 0),
  nul: null,
  regex: new BSONRegExp('^ali', 'i'),
  timestamp: new Timestamp({ t: 1700000000, i: 1 }),
  minKey: new MinKey(),
  maxKey: new MaxKey(),
  code: new Code('function () { return 1; }'),
  tags: ['red', 'green'],
  address: { city: 'Bangalore', zip: '560001' },
  items: [
    { sku: 'A1', qty: new Int32(2) },
    { sku: 'B2', qty: new Int32(5) },
  ],
};

const DECOY = {
  _id: D,
  str: 'bob@example.com',
  digits: new Int32(1300932190),
  empty: 'not empty',
  special: 'abc x y',
  unicode: 'Unicode',
  int32: '25',
  int64: Long.fromString('9007199254740992'),
  double: new Double(2.4),
  wholeDouble: new Double(3),
  decimal: Decimal128.fromString('1.6'),
  bigDecimal: Decimal128.fromString('12345678901234567890.123456788'),
  bool: false,
  date: new Date('2024-01-02T03:04:05.679Z'),
  oid: new ObjectId('64b7f1c2a1b2c3d4e5f60719'),
  uuid: new Binary(Buffer.from('00000000000040008000000000000001', 'hex'), 4),
  csuuid: new Binary(Buffer.from('00000000000040008000000000000001', 'hex'), 3),
  binary: new Binary(Buffer.from('world'), 0),
  nul: 'not null',
  regex: new BSONRegExp('^bob'),
  timestamp: new Timestamp({ t: 1700000000, i: 2 }),
  minKey: new MaxKey(),
  maxKey: new MinKey(),
  code: new Code('function () { return 2; }'),
  tags: ['blue'],
  address: { city: 'Pune', zip: '411001' },
  items: [{ sku: 'C3', qty: new Int32(9) }],
};

const SPARSE = { _id: S, str: 'carol@example.com' };

function row(
  field: string,
  valueText: string,
  extra: Partial<ConditionRow> = {}
): ConditionRow {
  return {
    id: nextRowId('condition'),
    field,
    operator: 'eq',
    valueText,
    enabled: true,
    ...extra,
  };
}

function builder(overrides: Partial<BuilderState>): BuilderState {
  return { ...EMPTY_BUILDER_STATE, ...overrides };
}

function fakeDataTransfer() {
  const data = new Map<string, string>();
  return {
    dropEffect: 'none',
    get types() {
      return [...data.keys()];
    },
    setData(type: string, value: string) {
      data.set(type, value);
    },
    getData(type: string) {
      return data.get(type) ?? '';
    },
  };
}

// Every service the query bar takes is given, since a plugin rendered inside
// a mocked one is handed the same mocks and has no locator to fall back on.
const MockQueryBarPlugin = QueryBarPlugin.withMockServices({
  dataService: {
    sample: () => Promise.resolve([]),
    getConnectionString: () => ({ hosts: [] }),
  } as any,
  instance: { on() {}, removeListener() {} } as any,
  favoriteQueryStorageAccess: {
    getStorage: () => ({ loadAll: () => Promise.resolve([]) }),
  } as any,
  recentQueryStorageAccess: {
    getStorage: () => ({
      loadAll: () => Promise.resolve([]),
      saveQuery: () => Promise.resolve(),
    }),
  } as any,
  atlasAiService: {} as any,
  collection: { fetchMetadata: () => Promise.resolve({}) } as any,
});

// Hands over the query bar service the documents plugin is given, bound to
// the query bar the test renders.
let queryBar: QueryBarService;
const CaptureQueryBar = registerCompassPlugin(
  {
    name: 'CaptureQueryBar',
    component: () => null,
    activate(_props: unknown, services: { queryBar: QueryBarService }) {
      queryBar = services.queryBar;
      return { store: {}, deactivate() {} };
    },
  },
  { queryBar: queryBarServiceLocator }
);

describe('query builder against a server', function () {
  const cluster = mochaTestServer();
  let dataService: DataService;
  let target: HadronDocument;

  before(async function () {
    this.timeout(60_000);
    dataService = await connect({
      connectionOptions: { connectionString: cluster().connectionString },
    });
    try {
      await dataService.dropCollection(NS);
    } catch {
      // Not there yet.
    }
    await dataService.insertMany(NS, [TARGET, DECOY, SPARSE] as Document[]);
    // Read the way the documents list reads it, which is what a drag carries.
    const [doc] = await dataService.find(
      NS,
      { _id: T },
      { promoteValues: false, bsonRegExp: true }
    );
    target = new HadronDocument(doc);
  });

  after(async function () {
    await dataService?.disconnect();
  });

  beforeEach(async function () {
    // The collection's metadata is not read by anything tested here.
    const queryBarProps = {} as React.ComponentProps<typeof MockQueryBarPlugin>;
    render(
      <PreferencesProvider value={await createSandboxFromDefaultPreferences()}>
        <MockQueryBarPlugin {...queryBarProps}>
          <CaptureQueryBar />
        </MockQueryBarPlugin>
      </PreferencesProvider>
    );
  });

  afterEach(function () {
    cleanup();
  });

  /** Drags a field out of the target document and drops it on the builder. */
  function drag(element: Element): ConditionRow {
    const dataTransfer = fakeDataTransfer();
    // What a document row puts on a drag: see onFieldDragStart in the list.
    DocumentList.setDraggedDocumentField(
      dataTransfer as unknown as DataTransfer,
      {
        field: DocumentList.getNestedKeyPathForElement(element),
        value: element.generateObject(),
      }
    );
    const onChange = sinon.spy();
    const { unmount } = render(
      <QueryBuilderPanel
        state={EMPTY_BUILDER_STATE}
        onChange={onChange}
        onRun={() => {}}
        errors={[]}
      />
    );
    fireEvent.drop(screen.getByTestId('query-builder-query-drop-zone'), {
      dataTransfer,
    });
    unmount();
    return (onChange.firstCall.args[0] as BuilderState).conditions[0];
  }

  /**
   * Writes the builder's query into the query bar and runs what the bar then
   * holds, as pressing Run does.
   */
  async function run(state: BuilderState) {
    const compiled = compileBuilderState(state);
    queryBar.setQuery(compiledQueryToAppliedQuery(compiled));
    const barQuery = queryBar.getCurrentQuery();
    const docs = await dataService.find(NS, barQuery.filter ?? {}, {
      projection: barQuery.project ?? undefined,
      sort: barQuery.sort ?? undefined,
      skip: barQuery.skip || undefined,
      limit: barQuery.limit || undefined,
      promoteValues: false,
    });
    return { compiled, barQuery, docs };
  }

  async function expectMatches(
    state: BuilderState,
    expected: ObjectId[],
    { ordered = false } = {}
  ) {
    const { compiled, barQuery, docs } = await run(state);
    expect(compiled.errors, 'the rows compile').to.deep.equal([]);
    // Compiled afresh, as the panel does on every render. The builder greys
    // itself out when the bar does not show this.
    expect(
      doesQueryBarShow(barQuery, compileBuilderState(state)),
      `the query bar shows the builder query, ${JSON.stringify(
        barQuery.filter
      )}`
    ).to.equal(true);
    const ids = docs.map((doc) => String(doc._id));
    const want = expected.map(String);
    if (ordered) {
      expect(ids).to.deep.equal(want);
    } else {
      expect([...ids].sort()).to.deep.equal([...want].sort());
    }
  }

  const DRAGGED: [label: string, find: () => Element, expected: ObjectId[]][] =
    [
      ...Object.keys(TARGET).map((key): [string, () => Element, ObjectId[]] => [
        key,
        () => target.get(key)!,
        // null also matches a field that is not there at all.
        key === 'nul' ? [T, S] : [T],
      ]),
      ['an element of an array', () => target.get('tags')!.at(0)!, [T]],
      ['a document in an array', () => target.get('items')!.at(1)!, [T]],
      [
        'a field of a document in an array',
        () => target.get('items')!.at(1)!.get('sku')!,
        [T],
      ],
      [
        'an Int32 in a document in an array',
        () => target.get('items')!.at(0)!.get('qty')!,
        [T],
      ],
      [
        'a field of an embedded document',
        () => target.get('address')!.get('city')!,
        [T],
      ],
    ];

  describe('dragging a field out of a document finds that document', function () {
    for (const [label, find, expected] of DRAGGED) {
      it(label, async function () {
        await expectMatches(builder({ conditions: [drag(find())] }), expected);
      });
    }
  });

  /**
   * Changes a dragged row's operator as picking one in the panel does, which
   * rewrites the box for `in`, so the value is read back from its text.
   */
  function withOperator(
    dragged: ConditionRow,
    operator: ConditionRow['operator']
  ): ConditionRow {
    return {
      ...dragged,
      operator,
      valueText: valueTextForOperator(
        dragged.valueText,
        dragged.operator,
        operator,
        dragged.value
      ),
    };
  }

  describe('a dragged field, switched to in, still finds its document', function () {
    for (const [label, find, expected] of DRAGGED) {
      it(label, async function () {
        await expectMatches(
          builder({ conditions: [withOperator(drag(find()), 'in')] }),
          expected
        );
      });
    }
  });

  describe('a dragged field, switched to not equal, finds the others', function () {
    for (const [label, find] of DRAGGED) {
      it(label, async function () {
        await expectMatches(
          builder({ conditions: [withOperator(drag(find()), 'ne')] }),
          // Not null leaves out the missing field that null matched.
          label === 'nul' ? [D] : [D, S]
        );
      });
    }
  });

  describe('a saved query finds the same documents once opened again', function () {
    let tmpDir: string;

    beforeEach(async function () {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'qb-integration'));
    });

    afterEach(async function () {
      await fs.rm(tmpDir, { recursive: true });
    });

    for (const [name, create] of [
      [
        'in the browser',
        () => createWebBuilderQueryStorage({ storage: memoryStorage() }),
      ],
      [
        'on disk',
        () => createElectronBuilderQueryStorage({ basepath: tmpDir }),
      ],
    ] as const) {
      describe(name, function () {
        for (const [label, find, expected] of DRAGGED) {
          it(label, async function () {
            const storage = create();
            await storage.saveQuery({
              _name: label,
              _ns: NS,
              _connectionId: 'conn',
              builderState: builder({ conditions: [drag(find())] }),
            });
            const [saved] = await storage.loadAll('conn', NS);
            await expectMatches(toBuilderState(saved.builderState), expected);
          });
        }
      });
    }
  });

  describe('typing a value', function () {
    const TYPED: [label: string, rows: ConditionRow[], expected: ObjectId[]][] =
      [
        ['plain text, without quotes', [row('str', 'alice@example.com')], [T]],
        ['quoted text', [row('str', "'alice@example.com'")], [T]],
        ['unicode text', [row('unicode', 'Ünïcødé ✓')], [T]],
        ['the empty string, quoted', [row('empty', "''")], [T]],
        ['a whole number', [row('int32', '25')], [T]],
        [
          'a whole number, as String',
          [row('int32', '25', { valueType: 'String' })],
          [D],
        ],
        ['digits, which read as a number', [row('digits', '1300932190')], [D]],
        [
          'digits, as String',
          [row('digits', '1300932190', { valueType: 'String' })],
          [T],
        ],
        ['an Int64 past 2^53', [row('int64', '9007199254740993')], [T]],
        [
          'an Int64 past 2^53, as Int64',
          [row('int64', '9007199254740993', { valueType: 'Int64' })],
          [T],
        ],
        ['a fraction', [row('double', '2.5')], [T]],
        [
          'a whole number, as Double',
          [row('wholeDouble', '2', { valueType: 'Double' })],
          [T],
        ],
        [
          'a decimal, as Decimal128',
          [row('decimal', '1.5', { valueType: 'Decimal128' })],
          [T],
        ],
        [
          'a decimal with more digits than a double holds',
          [row('bigDecimal', '12345678901234567890.123456789')],
          [T],
        ],
        [
          'a decimal with more digits than a double holds, as Decimal128',
          [
            row('bigDecimal', '12345678901234567890.123456789', {
              valueType: 'Decimal128',
            }),
          ],
          [T],
        ],
        ['true', [row('bool', 'true')], [T]],
        ['false', [row('bool', 'false')], [D]],
        [
          'a date, as Date',
          [row('date', '2024-01-02T03:04:05.678Z', { valueType: 'Date' })],
          [T],
        ],
        [
          'an ObjectId, as ObjectId',
          [row('oid', '64b7f1c2a1b2c3d4e5f60718', { valueType: 'ObjectId' })],
          [T],
        ],
        [
          'a UUID, as UUID',
          [row('uuid', UUID_TEXT, { valueType: 'UUID' })],
          [T],
        ],
        [
          'a UUID as a C# application shows it, as Legacy C# UUID',
          [row('csuuid', UUID_TEXT, { valueType: 'LegacyCSharpUUID' })],
          [T],
        ],
        [
          'null, which also matches a missing field',
          [row('nul', 'null', { valueType: 'Null' })],
          [T, S],
        ],
      ];

    for (const [label, conditions, expected] of TYPED) {
      it(label, async function () {
        await expectMatches(builder({ conditions }), expected);
      });
    }
  });

  describe('operators', function () {
    const OPERATORS: [
      label: string,
      rows: ConditionRow[],
      expected: ObjectId[]
    ][] = [
      [
        'not equal, which also matches a missing field',
        [row('str', 'alice@example.com', { operator: 'ne' })],
        [D, S],
      ],
      ['greater than', [row('int32', '24', { operator: 'gt' })], [T]],
      ['at least', [row('int32', '25', { operator: 'gte' })], [T]],
      ['less than', [row('int32', '25', { operator: 'lt' })], []],
      ['at most', [row('double', '2.5', { operator: 'lte' })], [T, D]],
      [
        'greater than an Int64 past 2^53',
        [
          row('int64', '9007199254740992', {
            operator: 'gt',
            valueType: 'Int64',
          }),
        ],
        [T],
      ],
      [
        'a date range, on one field twice',
        [
          row('date', '2024-01-02T03:04:05.678Z', {
            operator: 'gte',
            valueType: 'Date',
          }),
          row('date', '2024-01-02T03:04:05.679Z', {
            operator: 'lt',
            valueType: 'Date',
          }),
        ],
        [T],
      ],
      [
        'in, from values separated by commas',
        [row('str', 'alice@example.com, bob@example.com', { operator: 'in' })],
        [T, D],
      ],
      [
        'not in',
        [row('str', 'alice@example.com, bob@example.com', { operator: 'nin' })],
        [S],
      ],
      ['in, from a list', [row('int32', '[25, 26]', { operator: 'in' })], [T]],
      [
        'in, with the type applied to every value',
        [
          row('digits', '1300932190, 1', {
            operator: 'in',
            valueType: 'String',
          }),
        ],
        [T],
      ],
      [
        'in, with Int64 values past 2^53',
        [
          row('int64', '9007199254740993, 1', {
            operator: 'in',
            valueType: 'Int64',
          }),
        ],
        [T],
      ],
      [
        'not equal to a pattern',
        [row('str', '/^ali/i', { operator: 'ne' })],
        [D, S],
      ],
      [
        'in, from a list of Int64 values past 2^53',
        [row('int64', '[9007199254740993, 1]', { operator: 'in' })],
        [T],
      ],
      [
        'in, from a list of words without quotes',
        [
          row('str', '[alice@example.com, carol@example.com]', {
            operator: 'in',
          }),
        ],
        [T, S],
      ],
      [
        'matches, which is case sensitive',
        [row('str', '^ALI', { operator: 'regex' })],
        [],
      ],
      [
        'matches, with flags',
        [row('str', '/^ALI/i', { operator: 'regex' })],
        [T],
      ],
      [
        // Carol's address has it as well.
        'contains, ignoring case',
        [row('str', 'EXAMPLE.COM', { operator: 'contains' })],
        [T, D, S],
      ],
      [
        'contains, with a dot taken literally',
        [row('special', 'a.b', { operator: 'contains' })],
        [T],
      ],
      [
        'contains, with regex characters taken literally',
        [row('special', 'b*c (x) [y', { operator: 'contains' })],
        [T],
      ],
      ['exists', [row('nul', '', { operator: 'exists' })], [T, D]],
      ['does not exist', [row('nul', '', { operator: 'notExists' })], [S]],
    ];

    for (const [label, conditions, expected] of OPERATORS) {
      it(label, async function () {
        await expectMatches(builder({ conditions }), expected);
      });
    }
  });

  describe('combining rows', function () {
    it('matches all of them', async function () {
      await expectMatches(
        builder({
          conditions: [row('str', 'alice@example.com'), row('int32', '25')],
        }),
        [T]
      );
    });

    it('matches any of them', async function () {
      await expectMatches(
        builder({
          match: 'or',
          conditions: [
            row('str', 'alice@example.com'),
            row('str', 'carol@example.com'),
          ],
        }),
        [T, S]
      );
    });

    it('leaves out a row that is not ticked', async function () {
      await expectMatches(
        builder({
          conditions: [
            row('str', 'bob@example.com', { enabled: false }),
            row('int32', '25'),
          ],
        }),
        [T]
      );
    });

    it('leaves out a row whose value cannot be read, and says so', async function () {
      const { compiled, docs } = await run(
        builder({ conditions: [row('int32', 'abc', { valueType: 'Int32' })] })
      );
      expect(compiled.errors).to.have.lengthOf(1);
      expect(docs).to.have.lengthOf(3);
    });
  });

  describe('sort, skip, limit and projection', function () {
    it('sorts', async function () {
      await expectMatches(
        builder({
          sorts: [{ id: 's1', field: 'str', direction: 'desc', enabled: true }],
        }),
        [S, D, T],
        { ordered: true }
      );
    });

    it('skips and limits', async function () {
      await expectMatches(
        builder({
          sorts: [{ id: 's1', field: 'str', direction: 'asc', enabled: true }],
          skip: '1',
          limit: '1',
        }),
        [D],
        { ordered: true }
      );
    });

    it('includes only the fields asked for', async function () {
      const { docs } = await run(
        builder({
          projections: [
            { id: 'p1', field: 'str', mode: 'include', enabled: true },
          ],
        })
      );
      for (const doc of docs) {
        expect(Object.keys(doc).sort()).to.deep.equal(['_id', 'str']);
      }
    });

    it('leaves out the fields asked for', async function () {
      const { docs } = await run(
        builder({
          projections: [
            { id: 'p1', field: 'str', mode: 'exclude', enabled: true },
          ],
        })
      );
      for (const doc of docs) {
        expect(doc).to.not.have.property('str');
      }
    });
  });
});

function memoryStorage() {
  const items = new Map<string, string>();
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}
