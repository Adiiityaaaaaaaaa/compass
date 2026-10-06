import { expect } from 'chai';
import type { Document } from 'mongodb';
import {
  CrossDbLookupError,
  MAX_FOREIGN_DOCUMENTS,
  MAX_LOCAL_KEYS,
  collectLocalKeys,
  buildEmbeddedLookupStage,
  findCrossDbLookups,
  hasCrossDbLookup,
  resolveCrossDbLookups,
} from './cross-db-lookup';

const crossDbStage = {
  $lookup: {
    from: { db: 'sales', coll: 'regions' },
    localField: 'regionId',
    foreignField: '_id',
    as: 'region',
  },
};

/** Stands in for the data service, recording what it was asked for. */
function fakeAggregate(
  byNamespace: Record<string, Document[]>,
  localKeys: unknown[] = [1]
) {
  const calls: { ns: string; pipeline: Document[] }[] = [];
  const aggregate = (ns: string, pipeline: Document[]) => {
    calls.push({ ns, pipeline });
    // The key collecting query is the one ending in a $group; everything else
    // is a read of a foreign collection.
    const last = pipeline[pipeline.length - 1];
    if (last && '$group' in last) {
      return Promise.resolve([{ _id: null, keys: localKeys }]);
    }
    return Promise.resolve(byNamespace[ns] ?? []);
  };
  const foreignReads = () =>
    calls
      .filter(({ pipeline }) => !('$group' in pipeline[pipeline.length - 1]))
      .map(({ ns }) => ns);
  return { aggregate, calls, foreignReads };
}

describe('cross-db-lookup', function () {
  describe('findCrossDbLookups', function () {
    it('finds a $lookup naming another database', function () {
      const found = findCrossDbLookups([{ $match: {} }, crossDbStage]);
      expect(found).to.have.lengthOf(1);
      expect(found[0]).to.deep.equal({
        index: 1,
        db: 'sales',
        coll: 'regions',
        localField: 'regionId',
        foreignField: '_id',
        as: 'region',
      });
    });

    it('leaves an ordinary same-database $lookup alone', function () {
      const pipeline = [
        {
          $lookup: {
            from: 'regions',
            localField: 'regionId',
            foreignField: '_id',
            as: 'region',
          },
        },
      ];
      expect(findCrossDbLookups(pipeline)).to.be.empty;
      expect(hasCrossDbLookup(pipeline)).to.equal(false);
    });

    it('ignores stages that are not $lookup', function () {
      expect(findCrossDbLookups([{ $match: { a: 1 } }, { $limit: 5 }])).to.be
        .empty;
    });

    it('refuses the pipeline form rather than quietly doing something else', function () {
      expect(() =>
        findCrossDbLookups([
          {
            $lookup: {
              from: { db: 'sales', coll: 'regions' },
              let: { id: '$regionId' },
              pipeline: [{ $match: {} }],
              as: 'region',
            },
          },
        ])
      ).to.throw(CrossDbLookupError, /localField\/foreignField form only/);
    });

    it('refuses a from object missing its parts', function () {
      expect(() =>
        findCrossDbLookups([{ $lookup: { from: { db: 'sales' }, as: 'r' } }])
      ).to.throw(CrossDbLookupError, /both named/);
    });

    it('refuses a cross database lookup without the join fields', function () {
      expect(() =>
        findCrossDbLookups([
          { $lookup: { from: { db: 'sales', coll: 'regions' }, as: 'r' } },
        ])
      ).to.throw(CrossDbLookupError, /localField, foreignField and as/);
    });
  });

  describe('buildEmbeddedLookupStage', function () {
    it('puts the matches under the name the lookup asked for', function () {
      const stage = buildEmbeddedLookupStage(
        findCrossDbLookups([crossDbStage])[0],
        [{ _id: 1, name: 'North' }]
      );
      expect(stage).to.have.nested.property('$set.region');
    });

    it('carries the documents as a literal, so field names are not expressions', function () {
      const stage = buildEmbeddedLookupStage(
        findCrossDbLookups([crossDbStage])[0],
        [{ _id: 1, $gt: 'not an operator' }]
      );
      expect(stage.$set.region.$filter.input).to.deep.equal({
        $literal: [{ _id: 1, $gt: 'not an operator' }],
      });
    });
  });

  describe('resolveCrossDbLookups', function () {
    it('returns a pipeline without a cross database lookup untouched', async function () {
      const pipeline = [{ $match: { a: 1 } }];
      const { aggregate, calls } = fakeAggregate({});
      expect(
        await resolveCrossDbLookups('base.orders', pipeline, aggregate)
      ).to.equal(pipeline);
      // Nothing was read, so an ordinary pipeline costs no extra round trip.
      expect(calls).to.be.empty;
    });

    it('reads the foreign collection and replaces the stage', async function () {
      const { aggregate, foreignReads } = fakeAggregate({
        'sales.regions': [{ _id: 1, name: 'North' }],
      });
      const resolved = await resolveCrossDbLookups(
        'base.orders',
        [{ $match: {} }, crossDbStage, { $limit: 10 }],
        aggregate
      );

      expect(foreignReads()).to.deep.equal(['sales.regions']);
      // The stage is replaced in place, and the stages around it are kept.
      expect(resolved[0]).to.deep.equal({ $match: {} });
      expect(resolved[2]).to.deep.equal({ $limit: 10 });
      expect(resolved[1]).to.have.nested.property('$set.region');
      expect((resolved[1] as Document).$set.region.$filter.input).to.deep.equal(
        { $literal: [{ _id: 1, name: 'North' }] }
      );
    });

    it('does not alter the pipeline it was given', async function () {
      const pipeline = [crossDbStage];
      const { aggregate } = fakeAggregate({ 'sales.regions': [] });
      await resolveCrossDbLookups('base.orders', pipeline, aggregate);
      expect(pipeline[0]).to.deep.equal(crossDbStage);
    });

    it('resolves every cross database lookup in the pipeline', async function () {
      const { aggregate, foreignReads } = fakeAggregate({
        'sales.regions': [{ _id: 1 }],
        'hr.people': [{ _id: 2 }],
      });
      const resolved = await resolveCrossDbLookups(
        'base.orders',
        [
          crossDbStage,
          {
            $lookup: {
              from: { db: 'hr', coll: 'people' },
              localField: 'ownerId',
              foreignField: '_id',
              as: 'owner',
            },
          },
        ],
        aggregate
      );
      expect(foreignReads()).to.deep.equal(['sales.regions', 'hr.people']);
      expect(resolved[0]).to.have.nested.property('$set.region');
      expect(resolved[1]).to.have.nested.property('$set.owner');
    });

    it('asks the foreign collection only for the keys the pipeline needs', async function () {
      const { aggregate, calls } = fakeAggregate(
        { 'sales.regions': [{ _id: 7 }] },
        [7]
      );
      await resolveCrossDbLookups(
        'base.orders',
        [{ $match: { reference: 'r1' } }, crossDbStage],
        aggregate
      );

      const foreignRead = calls.find(({ ns }) => ns === 'sales.regions');
      expect(foreignRead?.pipeline[0]).to.deep.equal({
        $match: { _id: { $in: [7] } },
      });
    });

    it('collects the keys by running the stages before the lookup', async function () {
      const { aggregate, calls } = fakeAggregate({ 'sales.regions': [] }, [1]);
      await resolveCrossDbLookups(
        'base.orders',
        [{ $match: { reference: 'r1' } }, crossDbStage],
        aggregate
      );

      const keyQuery = calls.find(({ ns }) => ns === 'base.orders');
      expect(keyQuery?.pipeline).to.deep.equal([
        { $match: { reference: 'r1' } },
        {
          $group: {
            _id: null,
            keys: { $addToSet: { $ifNull: ['$regionId', null] } },
          },
        },
      ]);
    });

    it('does not read the other database when nothing can match', async function () {
      const { aggregate, foreignReads } = fakeAggregate(
        { 'sales.regions': [{ _id: 1 }] },
        []
      );
      const resolved = await resolveCrossDbLookups(
        'base.orders',
        [crossDbStage],
        aggregate
      );
      expect(foreignReads()).to.be.empty;
      expect((resolved[0] as Document).$set.region.$filter.input).to.deep.equal(
        { $literal: [] }
      );
    });

    it('reads the collection whole when there are too many keys to ask with', async function () {
      const manyKeys = Array.from({ length: MAX_LOCAL_KEYS + 1 }, (_, i) => i);
      const { aggregate, calls } = fakeAggregate(
        { 'sales.regions': [{ _id: 1 }] },
        manyKeys
      );
      await resolveCrossDbLookups('base.orders', [crossDbStage], aggregate);
      const foreignRead = calls.find(({ ns }) => ns === 'sales.regions');
      // No $match: the keys were not worth asking with, so the limits on the
      // collection itself are what apply.
      expect(foreignRead?.pipeline[0]).to.have.property('$limit');
    });

    it('flattens an array local field into its elements', async function () {
      const { aggregate, calls } = fakeAggregate({ 'sales.regions': [] }, [
        [1, 2],
        3,
      ]);
      await resolveCrossDbLookups('base.orders', [crossDbStage], aggregate);
      const foreignRead = calls.find(({ ns }) => ns === 'sales.regions');
      expect(foreignRead?.pipeline[0]).to.deep.equal({
        $match: { _id: { $in: [1, 2, 3] } },
      });
    });

    it('reports a collection too large to carry instead of failing on command size', async function () {
      const tooMany = Array.from(
        { length: MAX_FOREIGN_DOCUMENTS + 1 },
        (_, i) => ({
          _id: i,
        })
      );
      const { aggregate } = fakeAggregate({ 'sales.regions': tooMany });
      try {
        await resolveCrossDbLookups('base.orders', [crossDbStage], aggregate);
        expect.fail('expected a CrossDbLookupError');
      } catch (err) {
        expect(err).to.be.instanceOf(CrossDbLookupError);
        expect((err as Error).message).to.match(/more than/);
      }
    });

    it('reports a collection too big in bytes', async function () {
      // Few documents, but each large enough to blow the byte ceiling.
      const fat = Array.from({ length: 10 }, (_, i) => ({
        _id: i,
        blob: 'x'.repeat(1024 * 1024),
      }));
      const { aggregate } = fakeAggregate({ 'sales.regions': fat }, [1]);
      try {
        await resolveCrossDbLookups('base.orders', [crossDbStage], aggregate);
        expect.fail('expected a CrossDbLookupError');
      } catch (err) {
        expect(err).to.be.instanceOf(CrossDbLookupError);
        expect((err as Error).message).to.match(/MB/);
      }
    });
  });
});
