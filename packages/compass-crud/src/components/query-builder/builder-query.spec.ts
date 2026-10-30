import { expect } from 'chai';
import { BSON } from 'bson';
import type { BuilderState, ConditionRow } from './builder-query';
import {
  EMPTY_BUILDER_STATE,
  compileBuilderState,
  compiledQueryToAppliedQuery,
  doesQueryBarShow,
  nextRowId,
  toBuilderState,
  parseValueText,
  parseListText,
  valueTextForOperator,
  detectValueType,
  conditionValue,
  takesTypedValue,
  VALUE_TYPES,
  valueToText,
} from './builder-query';

function condition(row: Partial<ConditionRow>): ConditionRow {
  return {
    id: 'c1',
    field: 'status',
    operator: 'eq',
    valueText: "'shipped'",
    enabled: true,
    ...row,
  };
}

function state(overrides: Partial<BuilderState> = {}): BuilderState {
  return { ...EMPTY_BUILDER_STATE, ...overrides };
}

describe('builder-query', function () {
  describe('valueToText', function () {
    it('renders a string as itself, since the box takes plain text', function () {
      expect(valueToText('London')).to.equal('London');
    });

    it('writes a BSON value on its own, since the type has its own dropdown', function () {
      expect(
        valueToText(new BSON.ObjectId('6a709bfd0ce4efdf334e9979'))
      ).to.equal('6a709bfd0ce4efdf334e9979');
      expect(valueToText(new BSON.Long(2))).to.equal('2');
      expect(valueToText(new Date('2026-01-02T03:04:05Z'))).to.equal(
        '2026-01-02T03:04:05.000Z'
      );
      expect(valueToText(null)).to.equal('null');
      expect(valueToText(true)).to.equal('true');
    });

    it('renders an empty string for a missing value', function () {
      expect(valueToText(undefined)).to.equal('');
    });
  });

  describe('parseValueText', function () {
    function read(text: string) {
      const parsed = parseValueText(text);
      if (!parsed.ok) {
        throw new Error(parsed.error);
      }
      return parsed.value;
    }

    it('reads a whole number past 2^53 as an Int64, every digit kept', function () {
      const value = read('9007199254740993');
      expect(value).to.be.instanceOf(BSON.Long);
      expect(String(value)).to.equal('9007199254740993');
      expect(String(read('-9007199254740993'))).to.equal('-9007199254740993');
    });

    it('reads a whole number past an Int64 as a Decimal128', function () {
      const value = read('99999999999999999999');
      expect(value).to.be.instanceOf(BSON.Decimal128);
      expect(String(value)).to.equal('99999999999999999999');
    });

    it('reads a fraction with more digits than a double holds as a Decimal128', function () {
      const value = read('12345678901234567890.123456789');
      expect(value).to.be.instanceOf(BSON.Decimal128);
      expect(String(value)).to.equal('12345678901234567890.123456789');
    });

    it('leaves numbers a double holds exactly as numbers', function () {
      expect(read('25')).to.equal(25);
      expect(read('-2.5')).to.equal(-2.5);
      expect(read('9007199254740991')).to.equal(9007199254740991);
      expect(read('0.123456789012345')).to.equal(0.123456789012345);
    });

    it('shows an Int64 in the type dropdown for a long whole number', function () {
      expect(
        detectValueType(
          conditionValue(condition({ valueText: '9007199254740993' }))
        )
      ).to.equal('Int64');
    });

    it('reads a value back out of shell syntax', function () {
      expect(parseValueText("'London'")).to.deep.equal({
        ok: true,
        value: 'London',
      });
    });

    it('round trips a value rendered by valueToText', function () {
      const objectId = new BSON.ObjectId('6a709bfd0ce4efdf334e9979');
      const parsed = parseValueText(valueToText(objectId));
      expect(parsed.ok).to.equal(true);
      expect(String((parsed as { value: unknown }).value)).to.equal(
        String(objectId)
      );
    });

    it('reports empty input rather than guessing', function () {
      expect(parseValueText('   ')).to.deep.equal({
        ok: false,
        error: 'Value is empty',
      });
    });

    it('reads a bare word as a string, so quoting is not required', function () {
      expect(parseValueText('London')).to.deep.equal({
        ok: true,
        value: 'London',
      });
    });

    it('still reads numbers, booleans and BSON as themselves', function () {
      expect(parseValueText('42')).to.deep.equal({ ok: true, value: 42 });
      expect(parseValueText('true')).to.deep.equal({ ok: true, value: true });
      const oid = parseValueText("ObjectId('6a709bfd0ce4efdf334e9979')");
      expect(String((oid as { value: unknown }).value)).to.equal(
        '6a709bfd0ce4efdf334e9979'
      );
    });

    it('reports broken syntax, rather than taking it as a string', function () {
      // Opens with a brace, so it was meant as syntax.
      expect(parseValueText('{ this is not valid').ok).to.equal(false);
      expect(parseValueText("'unterminated").ok).to.equal(false);
    });

    it('still takes a word containing a quote as text', function () {
      expect(parseValueText("don't")).to.deep.equal({
        ok: true,
        value: "don't",
      });
    });
  });

  describe('parseListText', function () {
    it('keeps every digit of the numbers in a list', function () {
      const parsed = parseListText('[9007199254740993, 1]');
      expect(parsed.ok).to.equal(true);
      const values = (parsed as { value: unknown[] }).value;
      expect(String(values[0])).to.equal('9007199254740993');
      expect(values[1]).to.equal(1);
    });

    it('reads words in brackets as words', function () {
      expect(parseListText('[shipped, pending]')).to.deep.equal({
        ok: true,
        value: ['shipped', 'pending'],
      });
    });

    it('still reads a list with quotes in it as one', function () {
      expect(parseListText("['a, b', 'c']")).to.deep.equal({
        ok: true,
        value: ['a, b', 'c'],
      });
    });

    it('still reads an empty list as an empty list', function () {
      expect(parseListText('[]')).to.deep.equal({ ok: true, value: [] });
    });

    it('splits a bare list on commas', function () {
      expect(parseListText('shipped, pending')).to.deep.equal({
        ok: true,
        value: ['shipped', 'pending'],
      });
    });

    it('reads an explicit list as one', function () {
      expect(parseListText("['a', 'b']")).to.deep.equal({
        ok: true,
        value: ['a', 'b'],
      });
    });

    it('keeps numbers as numbers', function () {
      expect(parseListText('1, 2, 3')).to.deep.equal({
        ok: true,
        value: [1, 2, 3],
      });
    });

    it('ignores a trailing comma', function () {
      expect(parseListText('a, b,')).to.deep.equal({
        ok: true,
        value: ['a', 'b'],
      });
    });

    it('reports empty input', function () {
      expect(parseListText('  ')).to.deep.equal({
        ok: false,
        error: 'Value is empty',
      });
    });
  });

  describe('valueTextForOperator', function () {
    it('shows an empty list when in is picked with nothing written', function () {
      expect(valueTextForOperator('', 'eq', 'in')).to.equal('[]');
    });

    it('wraps and quotes what was already there', function () {
      expect(valueTextForOperator('London', 'eq', 'in')).to.equal("['London']");
    });

    it('wraps several values written with commas', function () {
      expect(valueTextForOperator('shipped, pending', 'eq', 'in')).to.equal(
        "['shipped', 'pending']"
      );
    });

    it('does not quote numbers', function () {
      expect(valueTextForOperator('1, 2', 'eq', 'in')).to.equal('[1, 2]');
    });

    it('keeps a dragged string a string when wrapping it', function () {
      // Reading the text back would make "12" the number 12, which matches
      // nothing on a string field.
      expect(valueTextForOperator('12', 'eq', 'in', '12')).to.equal("['12']");
    });

    it('still wraps a genuine number as a number', function () {
      expect(valueTextForOperator('12', 'eq', 'in', 12)).to.equal('[12]');
    });

    it('drops the brackets again when leaving in', function () {
      expect(valueTextForOperator("['a', 'b']", 'in', 'eq')).to.equal('a, b');
    });

    it('leaves the text alone when the shape does not change', function () {
      expect(valueTextForOperator('London', 'eq', 'ne')).to.equal('London');
      expect(valueTextForOperator("['a']", 'in', 'nin')).to.equal("['a']");
    });
  });

  describe('value types', function () {
    it('offers the types a query is written against', function () {
      const values = VALUE_TYPES.map((entry) => entry.value);
      expect(values).to.include.members([
        'String',
        'Int32',
        'Double',
        'Boolean',
        'Date',
        'ObjectId',
        'LegacyCSharpUUID',
        'Null',
      ]);
    });

    it('keeps a pinned String when a number is typed over it', function () {
      // Dragging a string field pins String; typing 12 into it must not
      // quietly make the query look for the number 12.
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({
              field: 'reference',
              operator: 'eq',
              valueText: '12',
              valueType: 'String',
            }),
          ],
        })
      );
      expect(compiled.filter).to.deep.equal({ reference: '12' });
    });

    it('reverses a C# UUID so Mongo can find it', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({
              field: 'guid',
              operator: 'eq',
              valueText: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
              valueType: 'LegacyCSharpUUID',
            }),
          ],
        })
      );
      const value = compiled.filter.guid as {
        sub_type: number;
        toString: (enc: string) => string;
      };
      // Subtype 3 is how a legacy driver stored one, and the first three
      // groups come back reversed, which is what C# wrote.
      expect(value.sub_type).to.equal(3);
      expect(value.toString('hex')).to.equal(
        '10b8a76bad9dd11180b400c04fd430c8'
      );
      expect(compiled.errors).to.be.empty;
    });

    it('leaves a plain UUID in the order it was written', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({
              field: 'guid',
              operator: 'eq',
              valueText: '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
              valueType: 'UUID',
            }),
          ],
        })
      );
      const value = compiled.filter.guid as {
        sub_type: number;
        toString: (enc: string) => string;
      };
      expect(value.sub_type).to.equal(4);
      expect(value.toString('hex')).to.equal(
        '6ba7b8109dad11d180b400c04fd430c8'
      );
    });

    it('reports a C# UUID that is not a uuid', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({
              field: 'guid',
              operator: 'eq',
              valueText: 'not-a-uuid',
              valueType: 'LegacyCSharpUUID',
            }),
          ],
        })
      );
      expect(compiled.filter).to.deep.equal({});
      expect(compiled.errors).to.have.lengthOf(1);
    });

    it('reports the type a value already has', function () {
      expect(detectValueType('London')).to.equal('String');
      expect(detectValueType(true)).to.equal('Boolean');
    });

    it('has no type to choose for exists or contains', function () {
      expect(takesTypedValue('exists')).to.equal(false);
      expect(takesTypedValue('notExists')).to.equal(false);
      expect(takesTypedValue('contains')).to.equal(false);
      expect(takesTypedValue('eq')).to.equal(true);
      expect(takesTypedValue('in')).to.equal(true);
    });

    it('reads a number as a string when String is chosen', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({
              field: 'reference',
              operator: 'eq',
              valueText: '12',
              valueType: 'String',
            }),
          ],
        })
      );
      expect(compiled.filter).to.deep.equal({ reference: '12' });
    });

    it('reads a string as a number when Int32 is chosen', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({
              field: 'count',
              operator: 'eq',
              valueText: '12',
              valueType: 'Int32',
            }),
          ],
        })
      );
      expect(Number(compiled.filter.count)).to.equal(12);
    });

    it('overrides the type a dragged value came with', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({
              field: 'reference',
              operator: 'eq',
              valueText: '12',
              value: 12,
              valueType: 'String',
            }),
          ],
        })
      );
      expect(compiled.filter).to.deep.equal({ reference: '12' });
    });

    it('applies the type to every value in an in list', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({
              field: 'reference',
              operator: 'in',
              valueText: '12, 13',
              valueType: 'String',
            }),
          ],
        })
      );
      expect(compiled.filter).to.deep.equal({
        reference: { $in: ['12', '13'] },
      });
    });

    it('reports a value that cannot be the chosen type', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({
              field: 'count',
              operator: 'eq',
              valueText: 'not a number',
              valueType: 'Int32',
            }),
          ],
        })
      );
      expect(compiled.filter).to.deep.equal({});
      expect(compiled.errors).to.have.lengthOf(1);
      expect(compiled.errors[0]).to.match(/not a Int32|not a number/);
    });

    it('keeps a dragged ObjectId the id it was', function () {
      const id = new BSON.ObjectId('6aa58011e0a9d9da55fffea5');
      // As a dragged _id arrives: the value, its text, its type pinned.
      const rows = state({
        conditions: [
          condition({
            field: '_id',
            valueText: valueToText(id),
            value: id,
            valueType: 'ObjectId',
          }),
        ],
      });

      const first = compileBuilderState(rows);
      const second = compileBuilderState(rows);

      expect(String(first.filter._id)).to.equal('6aa58011e0a9d9da55fffea5');
      expect(String(second.filter._id)).to.equal(String(first.filter._id));
    });

    it('reports a value that cannot be an ObjectId rather than making one up', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({
              field: '_id',
              valueText: '123',
              valueType: 'ObjectId',
            }),
          ],
        })
      );
      expect(compiled.filter).to.deep.equal({});
      expect(compiled.errors).to.deep.equal(['_id: 123 is not a ObjectId']);
    });
  });

  describe('compileBuilderState', function () {
    it('compiles an empty builder to an empty filter', function () {
      const compiled = compileBuilderState(state());
      expect(compiled).to.deep.include({
        filter: {},
        project: null,
        sort: null,
        skip: null,
        limit: null,
      });
      expect(compiled.errors).to.be.empty;
    });

    it('folds conditions matching all into one document', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({ id: 'c1' }),
            condition({
              id: 'c2',
              field: 'total',
              operator: 'gt',
              valueText: '100',
            }),
          ],
        })
      );
      expect(compiled.filter).to.deep.equal({
        status: 'shipped',
        total: { $gt: 100 },
      });
    });

    it('uses $and when the same field is used twice', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({
              id: 'c1',
              field: 'total',
              operator: 'gt',
              valueText: '10',
            }),
            condition({
              id: 'c2',
              field: 'total',
              operator: 'lt',
              valueText: '90',
            }),
          ],
        })
      );
      expect(compiled.filter).to.deep.equal({
        $and: [{ total: { $gt: 10 } }, { total: { $lt: 90 } }],
      });
    });

    it('compiles $or when matching any', function () {
      const compiled = compileBuilderState(
        state({
          match: 'or',
          conditions: [
            condition({ id: 'c1' }),
            condition({ id: 'c2', field: 'status', valueText: "'pending'" }),
          ],
        })
      );
      expect(compiled.filter).to.deep.equal({
        $or: [{ status: 'shipped' }, { status: 'pending' }],
      });
    });

    it('wraps a single value for the in operator', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [condition({ operator: 'in', valueText: "'shipped'" })],
        })
      );
      expect(compiled.filter).to.deep.equal({
        status: { $in: ['shipped'] },
      });
    });

    it('keeps a list as it is for the in operator', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({ operator: 'in', valueText: "['shipped', 'pending']" }),
          ],
        })
      );
      expect(compiled.filter).to.deep.equal({
        status: { $in: ['shipped', 'pending'] },
      });
    });

    it('compiles the exists operators without reading a value', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({ id: 'c1', operator: 'exists', valueText: '' }),
            condition({
              id: 'c2',
              field: 'cancelledAt',
              operator: 'notExists',
              valueText: '',
            }),
          ],
        })
      );
      expect(compiled.filter).to.deep.equal({
        status: { $exists: true },
        cancelledAt: { $exists: false },
      });
      expect(compiled.errors).to.be.empty;
    });

    it('builds a list for in, from values typed without brackets', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({
              field: 'status',
              operator: 'in',
              valueText: 'shipped, pending',
            }),
          ],
        })
      );
      expect(compiled.filter).to.deep.equal({
        status: { $in: ['shipped', 'pending'] },
      });
      expect(compiled.errors).to.be.empty;
    });

    it('keeps a dragged string a string inside an in list', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({
              field: 'reference',
              operator: 'in',
              valueText: '1300932190',
              value: '1300932190',
            }),
          ],
        })
      );
      expect(compiled.filter).to.deep.equal({
        reference: { $in: ['1300932190'] },
      });
    });

    it('keeps a dragged string a string, even when it is all digits', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({
              field: 'reference',
              operator: 'eq',
              valueText: '1300932190',
              value: '1300932190',
            }),
          ],
        })
      );
      // The text alone reads as a number; the document it came from says
      // otherwise, and a reference that became a number would match nothing.
      expect(compiled.filter).to.deep.equal({ reference: '1300932190' });
    });

    it('forgets the dragged value once the text is edited', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({
              field: 'reference',
              operator: 'eq',
              valueText: '42',
              value: '1300932190',
            }),
          ],
        })
      );
      expect(compiled.filter).to.deep.equal({ reference: 42 });
    });

    it('takes an unquoted word as a string', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({ field: 'city', operator: 'eq', valueText: 'London' }),
          ],
        })
      );
      expect(compiled.filter).to.deep.equal({ city: 'London' });
    });

    it('compiles contains to a case insensitive regex', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({
              field: 'name',
              operator: 'contains',
              valueText: 'lon',
            }),
          ],
        })
      );
      const value = compiled.filter.name as RegExp;
      expect(value).to.be.instanceOf(RegExp);
      expect(value.source).to.equal('lon');
      expect(value.flags).to.equal('i');
      expect(compiled.errors).to.be.empty;
    });

    it('matches contains anywhere in the value, ignoring case', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({
              field: 'name',
              operator: 'contains',
              valueText: 'lon',
            }),
          ],
        })
      );
      const value = compiled.filter.name as RegExp;
      expect(value.test('London')).to.equal(true);
      expect(value.test('Colony')).to.equal(true);
      expect(value.test('Paris')).to.equal(false);
    });

    it('takes contains text literally rather than as a pattern', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({
              field: 'code',
              operator: 'contains',
              valueText: 'a.c',
            }),
          ],
        })
      );
      const value = compiled.filter.code as RegExp;
      expect(value.test('xa.cx')).to.equal(true);
      // Without escaping the dot this would match, which is the whole
      // difference between "contains" and "matches".
      expect(value.test('abc')).to.equal(false);
    });

    it('unwraps a quoted string dropped into a contains row', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({
              field: 'name',
              operator: 'contains',
              valueText: "'London'",
            }),
          ],
        })
      );
      const value = compiled.filter.name as RegExp;
      expect(value.source).to.equal('London');
      expect(value.test('London')).to.equal(true);
    });

    it('reports an empty contains value', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({ field: 'name', operator: 'contains', valueText: '  ' }),
          ],
        })
      );
      expect(compiled.filter).to.deep.equal({});
      expect(compiled.errors).to.deep.equal(['name: Value is empty']);
    });

    it('skips disabled rows', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({ id: 'c1' }),
            condition({
              id: 'c2',
              field: 'total',
              valueText: '5',
              enabled: false,
            }),
          ],
        })
      );
      expect(compiled.filter).to.deep.equal({ status: 'shipped' });
    });

    it('reports a bad value and leaves the rest of the query usable', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({ id: 'c1' }),
            condition({ id: 'c2', field: 'total', valueText: '{ oops' }),
          ],
        })
      );
      expect(compiled.filter).to.deep.equal({ status: 'shipped' });
      expect(compiled.errors).to.have.lengthOf(1);
      expect(compiled.errors[0]).to.contain('total');
    });

    it('compiles projection and sort rows', function () {
      const compiled = compileBuilderState(
        state({
          projections: [
            {
              id: 'p1',
              field: 'conversationid',
              mode: 'include',
              enabled: true,
            },
            { id: 'p2', field: 'secret', mode: 'exclude', enabled: true },
          ],
          sorts: [
            { id: 's1', field: 'timestamp', direction: 'asc', enabled: true },
            { id: 's2', field: 'total', direction: 'desc', enabled: true },
          ],
        })
      );
      expect(compiled.project).to.deep.equal({ conversationid: 1, secret: 0 });
      expect(compiled.sort).to.deep.equal({ timestamp: 1, total: -1 });
    });

    it('contributes nothing once every row is cleared', function () {
      const full = state({
        conditions: [condition({})],
        projections: [
          { id: 'p1', field: 'timestamp', mode: 'include', enabled: true },
        ],
        sorts: [
          { id: 's1', field: 'timestamp', direction: 'asc', enabled: true },
        ],
      });
      full.conditions = full.conditions.map((r) => ({ ...r, enabled: false }));
      full.projections = full.projections.map((r) => ({
        ...r,
        enabled: false,
      }));
      full.sorts = full.sorts.map((r) => ({ ...r, enabled: false }));
      const compiled = compileBuilderState(full);
      expect(compiled.filter).to.deep.equal({});
      expect(compiled.project).to.equal(null);
      expect(compiled.sort).to.equal(null);
    });

    it('reads skip and limit', function () {
      const compiled = compileBuilderState(state({ skip: '10', limit: '50' }));
      expect(compiled.skip).to.equal(10);
      expect(compiled.limit).to.equal(50);
    });

    it('reports a non numeric limit', function () {
      const compiled = compileBuilderState(state({ limit: 'lots' }));
      expect(compiled.limit).to.equal(null);
      expect(compiled.errors).to.deep.equal(['Limit must be a whole number']);
    });
  });

  describe('compiledQueryToAppliedQuery', function () {
    it('always includes every property, so removed rows are cleared', function () {
      // A property missing from the applied query keeps its previous value,
      // which is what made a removed projection stay in effect.
      const query = compiledQueryToAppliedQuery(compileBuilderState(state()));
      expect(Object.keys(query).sort()).to.deep.equal([
        'filter',
        'limit',
        'project',
        'skip',
        'sort',
      ]);
      expect(query.project).to.equal(undefined);
      expect(query.sort).to.equal(undefined);
      expect(query.skip).to.equal(undefined);
      expect(query.limit).to.equal(undefined);
    });

    it('clears the projection once its last row is removed', function () {
      const withProjection = state({
        projections: [
          { id: 'p1', field: 'firstName', mode: 'include', enabled: true },
        ],
      });
      expect(
        compiledQueryToAppliedQuery(compileBuilderState(withProjection)).project
      ).to.deep.equal({ firstName: 1 });

      const removed = state({ projections: [] });
      const query = compiledQueryToAppliedQuery(compileBuilderState(removed));
      expect(query).to.have.property('project');
      expect(query.project).to.equal(undefined);
    });

    it('clears the projection when every row is cleared', function () {
      const query = compiledQueryToAppliedQuery(
        compileBuilderState(
          state({
            projections: [
              { id: 'p1', field: 'firstName', mode: 'include', enabled: false },
            ],
          })
        )
      );
      expect(query).to.have.property('project');
      expect(query.project).to.equal(undefined);
    });

    it('passes through the values that are set', function () {
      const query = compiledQueryToAppliedQuery(
        compileBuilderState(
          state({
            conditions: [condition({})],
            sorts: [
              {
                id: 's1',
                field: 'timestamp',
                direction: 'desc',
                enabled: true,
              },
            ],
            skip: '5',
            limit: '20',
          })
        )
      );
      expect(query.filter).to.deep.equal({ status: 'shipped' });
      expect(query.sort).to.deep.equal({ timestamp: -1 });
      expect(query.skip).to.equal(5);
      expect(query.limit).to.equal(20);
    });
  });

  describe('toBuilderState', function () {
    it('reads saved rows back as they were saved', function () {
      const saved = state({
        match: 'or',
        conditions: [condition({ field: 'status' })],
        sorts: [{ id: 's1', field: 'age', direction: 'desc', enabled: true }],
        limit: '10',
      });

      const read = toBuilderState(saved);

      expect(read.match).to.equal('or');
      expect(read.limit).to.equal('10');
      expect(read.conditions[0]).to.include({ field: 'status' });
      expect(read.sorts[0]).to.include({ field: 'age', direction: 'desc' });
    });

    it('gives no two rows the same id, including rows added later', function () {
      // Saved in an earlier session, whose counter handed out the same ids
      // this one is about to.
      const saved = state({
        conditions: [
          condition({ id: 'condition-1' }),
          condition({ id: 'condition-1', field: 'total' }),
        ],
      });

      const read = toBuilderState(saved);
      const added = nextRowId('condition');

      const ids = [...read.conditions.map((row) => row.id), added];
      expect(new Set(ids).size).to.equal(ids.length);
    });

    it('reads what it cannot make sense of as an empty builder', function () {
      expect(toBuilderState(undefined)).to.deep.equal(EMPTY_BUILDER_STATE);
      expect(
        toBuilderState({ match: 'xor', conditions: 'none', skip: 5 })
      ).to.deep.equal(EMPTY_BUILDER_STATE);
    });
  });

  describe('doesQueryBarShow', function () {
    // What the bar holds for a projection, sort, skip and limit that were
    // written into it empty.
    const emptyBarParts = { project: null, sort: null, skip: 0, limit: 0 };

    it('is true for the query bar holding the builder query', function () {
      const compiled = compileBuilderState(
        state({ conditions: [condition({})] })
      );
      expect(
        doesQueryBarShow(
          { filter: { status: 'shipped' }, ...emptyBarParts },
          compiled
        )
      ).to.equal(true);
    });

    it('compares typed values by what they are, not by identity', function () {
      const compiled = compileBuilderState(
        state({
          conditions: [
            condition({ field: 'age', valueText: '25', valueType: 'Int64' }),
            condition({
              id: 'c2',
              field: 'email',
              operator: 'contains',
              valueText: 'alice@example.com',
            }),
          ],
        })
      );
      // The bar parses its own copies, so none of these are the builder's.
      const barFilter = {
        age: BSON.Long.fromNumber(25),
        email: /alice@example\.com/i,
      };
      expect(
        doesQueryBarShow({ filter: barFilter, ...emptyBarParts }, compiled)
      ).to.equal(true);
    });

    it('is false once the filter is edited in the bar', function () {
      const compiled = compileBuilderState(
        state({ conditions: [condition({})] })
      );
      expect(
        doesQueryBarShow(
          { filter: { status: 'delivered' }, ...emptyBarParts },
          compiled
        )
      ).to.equal(false);
    });

    it('is false once a projection is added in the bar', function () {
      const compiled = compileBuilderState(
        state({ conditions: [condition({})] })
      );
      expect(
        doesQueryBarShow(
          {
            filter: { status: 'shipped' },
            ...emptyBarParts,
            project: { name: 1 },
          },
          compiled
        )
      ).to.equal(false);
    });

    it('is false once the limit is changed in the bar', function () {
      const compiled = compileBuilderState(
        state({ conditions: [condition({})], limit: '20' })
      );
      expect(
        doesQueryBarShow(
          { filter: { status: 'shipped' }, ...emptyBarParts, limit: 50 },
          compiled
        )
      ).to.equal(false);
    });

    it('ignores the options the builder does not set', function () {
      const compiled = compileBuilderState(
        state({ conditions: [condition({})] })
      );
      const barQuery = {
        filter: { status: 'shipped' },
        ...emptyBarParts,
        collation: { locale: 'fr' },
        maxTimeMS: 5000,
      };
      expect(doesQueryBarShow(barQuery, compiled)).to.equal(true);
    });
  });
});
