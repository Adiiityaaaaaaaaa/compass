import { expect } from 'chai';
import { DeletedDocumentSchema } from './deleted-document-schema';

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    _id: '11111111-1111-1111-1111-111111111111',
    _ns: 'test.coll',
    _connectionId: 'connection-1',
    _deletedAt: new Date('2024-01-01T00:00:00.000Z'),
    _operation: 'single',
    _batchId: null,
    document: { _id: 1, a: 1 },
    ...overrides,
  };
}

describe('DeletedDocumentSchema', function () {
  describe('_changeType backward compatibility', function () {
    it('defaults to "delete" when _changeType is missing entirely (pre-existing snapshots on disk)', function () {
      const entry = baseEntry();
      // Sanity check: the key is genuinely absent, not just undefined.
      expect(Object.prototype.hasOwnProperty.call(entry, '_changeType')).to.be
        .false;

      const parsed = DeletedDocumentSchema.parse(entry);
      expect(parsed._changeType).to.equal('delete');
    });

    it('defaults to "delete" when _changeType is null (EJSON.stringify serializes undefined as null on disk)', function () {
      const parsed = DeletedDocumentSchema.parse(
        baseEntry({ _changeType: null })
      );
      expect(parsed._changeType).to.equal('delete');
    });

    it('defaults to "delete" when _changeType is undefined', function () {
      const parsed = DeletedDocumentSchema.parse(
        baseEntry({ _changeType: undefined })
      );
      expect(parsed._changeType).to.equal('delete');
    });

    it('preserves an explicit "update" value', function () {
      const parsed = DeletedDocumentSchema.parse(
        baseEntry({ _changeType: 'update' })
      );
      expect(parsed._changeType).to.equal('update');
    });

    it('preserves an explicit "delete" value', function () {
      const parsed = DeletedDocumentSchema.parse(
        baseEntry({ _changeType: 'delete' })
      );
      expect(parsed._changeType).to.equal('delete');
    });

    it('rejects an invalid _changeType value', function () {
      expect(() =>
        DeletedDocumentSchema.parse(baseEntry({ _changeType: 'oops' }))
      ).to.throw();
    });
  });
});
