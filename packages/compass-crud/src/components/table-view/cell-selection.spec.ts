import { expect } from 'chai';
import HadronDocument from 'hadron-document';
import {
  Binary,
  BSONRegExp,
  Decimal128,
  Double,
  Int32,
  Long,
  MinKey,
  ObjectId,
  Timestamp,
  UUID,
} from 'bson';
import {
  cellsToText,
  cellValueText,
  isCellInSelection,
  selectedCells,
} from './cell-selection';

const COLUMNS = ['_id', 'age', 'city', 'email', 'name'];

describe('cell-selection', function () {
  describe('selectedCells', function () {
    it('covers the block between the two cells, whichever way it was stretched', function () {
      const forwards = selectedCells(
        {
          anchor: { rowIndex: 0, colId: 'age' },
          focus: { rowIndex: 2, colId: 'email' },
        },
        COLUMNS
      );
      const backwards = selectedCells(
        {
          anchor: { rowIndex: 2, colId: 'email' },
          focus: { rowIndex: 0, colId: 'age' },
        },
        COLUMNS
      );
      const expected = {
        firstRow: 0,
        lastRow: 2,
        colIds: ['age', 'city', 'email'],
      };
      expect(forwards).to.deep.equal(expected);
      expect(backwards).to.deep.equal(expected);
    });

    it('follows the order the columns are shown in', function () {
      expect(
        selectedCells(
          {
            anchor: { rowIndex: 0, colId: 'name' },
            focus: { rowIndex: 0, colId: 'city' },
          },
          ['name', '_id', 'city']
        )?.colIds
      ).to.deep.equal(['name', '_id', 'city']);
    });

    it('is null once a column it started on is gone', function () {
      expect(
        selectedCells(
          {
            anchor: { rowIndex: 0, colId: 'removed' },
            focus: { rowIndex: 1, colId: 'city' },
          },
          COLUMNS
        )
      ).to.equal(null);
    });
  });

  describe('isCellInSelection', function () {
    const selected = { firstRow: 1, lastRow: 2, colIds: ['city', 'email'] };

    it('is true only inside the block', function () {
      expect(isCellInSelection(selected, 1, 'city')).to.equal(true);
      expect(isCellInSelection(selected, 2, 'email')).to.equal(true);
      expect(isCellInSelection(selected, 0, 'city')).to.equal(false);
      expect(isCellInSelection(selected, 3, 'city')).to.equal(false);
      expect(isCellInSelection(selected, 1, 'age')).to.equal(false);
      expect(isCellInSelection(selected, null, 'city')).to.equal(false);
      expect(isCellInSelection(null, 1, 'city')).to.equal(false);
    });
  });

  describe('cellValueText', function () {
    const id = new ObjectId('6aa58011e0a9d9da5c3b1f2e');
    const doc = new HadronDocument({
      _id: id,
      string: 'Bangalore',
      int32: new Int32(25),
      double: new Double(2.5),
      long: Long.fromString('9007199254740993'),
      decimal: Decimal128.fromString('12345678901234567890.123456789'),
      boolean: true,
      null: null,
      date: new Date('2024-01-02T03:04:05.006Z'),
      regex: new BSONRegExp('^ali', 'i'),
      uuid: new UUID('0e5b3f5c-1a2b-4c3d-8e4f-5a6b7c8d9e0f'),
      binary: new Binary(Buffer.from('hi'), 0),
      timestamp: new Timestamp({ t: 1, i: 2 }),
      minKey: new MinKey(),
      object: { city: 'Pune', at: new Date('2024-01-02T00:00:00Z') },
      array: [1, 'two', { three: 3 }],
    });

    function text(field: string) {
      return cellValueText(doc.get(field));
    }

    it('copies strings without quotes', function () {
      expect(text('string')).to.equal('Bangalore');
    });

    it('copies numbers as numbers, every digit of a long one kept', function () {
      expect(text('int32')).to.equal('25');
      expect(text('double')).to.equal('2.5');
      expect(text('long')).to.equal('9007199254740993');
      expect(text('decimal')).to.equal('12345678901234567890.123456789');
    });

    it('copies an id as its hex string and a date as ISO', function () {
      expect(text('_id')).to.equal('6aa58011e0a9d9da5c3b1f2e');
      expect(text('date')).to.equal('2024-01-02T03:04:05.006Z');
    });

    it('copies booleans, null, patterns and UUIDs as they are written', function () {
      expect(text('boolean')).to.equal('true');
      expect(text('null')).to.equal('null');
      expect(text('regex')).to.equal('/^ali/i');
      expect(text('uuid')).to.equal('0e5b3f5c-1a2b-4c3d-8e4f-5a6b7c8d9e0f');
    });

    it('copies objects and arrays as JSON', function () {
      expect(JSON.parse(text('object'))).to.deep.equal({
        city: 'Pune',
        at: { $date: '2024-01-02T00:00:00Z' },
      });
      expect(JSON.parse(text('array'))).to.deep.equal([1, 'two', { three: 3 }]);
    });

    it('copies other types as extended JSON', function () {
      expect(JSON.parse(text('binary'))).to.deep.equal({
        $binary: { base64: 'aGk=', subType: '00' },
      });
      expect(JSON.parse(text('timestamp'))).to.deep.equal({
        $timestamp: { t: 1, i: 2 },
      });
      expect(JSON.parse(text('minKey'))).to.deep.equal({ $minKey: 1 });
    });

    it('copies a missing or removed field as an empty cell', function () {
      expect(cellValueText(undefined)).to.equal('');
      const edited = new HadronDocument({ city: 'Pune' });
      const city = edited.get('city');
      city?.remove();
      expect(cellValueText(city)).to.equal('');
    });

    it('copies the value being edited', function () {
      const edited = new HadronDocument({ city: 'Pune' });
      edited.get('city')?.edit('Mumbai');
      expect(cellValueText(edited.get('city'))).to.equal('Mumbai');
    });
  });

  describe('cellsToText', function () {
    const doc = new HadronDocument({
      age: new Int32(25),
      city: 'Bangalore',
      note: 'line one\nline two',
      tabbed: 'a\tb',
      quoted: '"as said"',
      inner: 'say "hi"',
    });

    it('copies a single cell as its value alone', function () {
      expect(cellsToText([[doc.get('note')]])).to.equal('line one\nline two');
    });

    it('copies a block with tabs between cells and new lines between rows', function () {
      expect(
        cellsToText([
          [doc.get('age'), doc.get('city')],
          [undefined, undefined],
          [doc.get('age'), doc.get('city')],
        ])
      ).to.equal('25\tBangalore\n\t\n25\tBangalore');
    });

    it('quotes a value that would otherwise break the block apart', function () {
      expect(
        cellsToText([
          [doc.get('note'), doc.get('tabbed')],
          [doc.get('quoted'), doc.get('inner')],
        ])
      ).to.equal('"line one\nline two"\t"a\tb"\n"""as said"""\tsay "hi"');
    });
  });
});
