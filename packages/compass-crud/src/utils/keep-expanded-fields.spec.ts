import { expect } from 'chai';
import HadronDocument from 'hadron-document';
import { keepExpandedFields } from './keep-expanded-fields';

const alice = {
  _id: 'alice',
  name: 'Alice',
  activity: {
    events: [
      { type: 'login', at: { day: 1 } },
      { type: 'logout', at: { day: 2 } },
    ],
    lastSeen: { day: 2 },
  },
};

const bob = {
  _id: 'bob',
  name: 'Bob',
  activity: { events: [{ type: 'login', at: { day: 3 } }] },
};

function fetched(...docs: Record<string, unknown>[]) {
  return docs.map((doc) => new HadronDocument(doc));
}

describe('keepExpandedFields', function () {
  it('unfolds the same fields in the document with the same _id', function () {
    const [aliceBefore, bobBefore] = fetched(alice, bob);
    aliceBefore.get('activity')?.expand();
    aliceBefore.getChild(['activity', 'events'])?.expand();
    bobBefore.get('activity')?.expand();

    const [bobAfter, aliceAfter] = fetched(bob, alice);
    keepExpandedFields([aliceBefore, bobBefore], [bobAfter, aliceAfter]);

    expect(aliceAfter.get('activity')?.expanded).to.equal(true);
    expect(aliceAfter.getChild(['activity', 'events'])?.expanded).to.equal(
      true
    );
    expect(aliceAfter.getChild(['activity', 'lastSeen'])?.expanded).to.equal(
      false
    );
    expect(aliceAfter.getChild(['activity', 'events', 0])?.expanded).to.equal(
      false
    );
    expect(bobAfter.get('activity')?.expanded).to.equal(true);
    expect(bobAfter.getChild(['activity', 'events'])?.expanded).to.equal(false);
  });

  it('unfolds array items by their position', function () {
    const [before] = fetched(alice);
    before.get('activity')?.expand();
    before.getChild(['activity', 'events'])?.expand();
    before.getChild(['activity', 'events', 1])?.expand();

    const [after] = fetched(alice);
    keepExpandedFields([before], [after]);

    expect(after.getChild(['activity', 'events', 0])?.expanded).to.equal(false);
    expect(after.getChild(['activity', 'events', 1])?.expanded).to.equal(true);
  });

  it('keeps the expand-all toggle and how many fields were shown', function () {
    const [before] = fetched(alice);
    before.expand();
    before.setMaxVisibleElementsCount(40);
    before.get('activity')?.setMaxVisibleElementsCount(30);

    const [after] = fetched(alice);
    keepExpandedFields([before], [after]);

    expect(after.expanded).to.equal(true);
    expect(after.maxVisibleElementsCount).to.equal(40);
    expect(after.get('activity')?.maxVisibleElementsCount).to.equal(30);
    expect(after.getChild(['activity', 'events', 0, 'at'])?.expanded).to.equal(
      true
    );
  });

  it('leaves a document that was not shown before folded', function () {
    const [aliceBefore] = fetched(alice);
    aliceBefore.get('activity')?.expand();

    const [bobAfter] = fetched(bob);
    keepExpandedFields([aliceBefore], [bobAfter]);

    expect(bobAfter.get('activity')?.expanded).to.equal(false);
  });

  it('leaves documents without an _id folded, as they cannot be matched', function () {
    const { _id, ...withoutId } = alice;
    const [before] = fetched(withoutId);
    before.get('activity')?.expand();

    const [after] = fetched(withoutId);
    keepExpandedFields([before], [after]);

    expect(after.get('activity')?.expanded).to.equal(false);
  });

  it('skips fields that are gone or no longer hold other fields', function () {
    const [before] = fetched(alice);
    before.get('activity')?.expand();
    before.getChild(['activity', 'events'])?.expand();

    const [after] = fetched({
      ...alice,
      activity: { lastSeen: { day: 2 } },
    });
    const [flattened] = fetched({ ...alice, activity: 'none' });
    keepExpandedFields([before], [after]);
    keepExpandedFields([before], [flattened]);

    expect(after.get('activity')?.expanded).to.equal(true);
    expect(after.getChild(['activity', 'lastSeen'])?.expanded).to.equal(false);
    expect(flattened.get('activity')?.expanded).to.equal(false);
  });

  it('does nothing when there were no documents before', function () {
    const [after] = fetched(alice);

    keepExpandedFields(null, [after]);

    expect(after.get('activity')?.expanded).to.equal(false);
  });
});
