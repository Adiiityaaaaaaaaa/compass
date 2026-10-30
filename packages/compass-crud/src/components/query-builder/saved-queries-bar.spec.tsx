import React from 'react';
import { expect } from 'chai';
import sinon from 'sinon';
import {
  cleanup,
  render,
  screen,
  userEvent,
} from '@mongodb-js/testing-library-compass';
import type { BuilderQuery } from '@mongodb-js/my-queries-storage';
import type { SavedQueriesBarProps } from './saved-queries-bar';
import { SavedQueriesBar } from './saved-queries-bar';
import { EMPTY_BUILDER_STATE } from './builder-query';

function savedQuery(id: string, name: string, isDefault = false): BuilderQuery {
  return {
    _id: id,
    _name: name,
    _ns: 'shop.users',
    _connectionId: 'conn-1',
    _isDefault: isDefault,
    _dateSaved: new Date(),
    _dateModified: undefined,
    builderState: EMPTY_BUILDER_STATE,
  };
}

const ALICE = savedQuery('alice-id', 'Alice', true);
const BOB = savedQuery('bob-id', 'Bob');

function renderBar(props: Partial<SavedQueriesBarProps> = {}) {
  const handlers = {
    onOpen: sinon.spy(),
    onSave: sinon.spy(),
    onToggleDefault: sinon.spy(),
    onDelete: sinon.spy(),
  };
  render(
    <SavedQueriesBar
      savedQueries={[ALICE, BOB]}
      selectedId={null}
      canSave={true}
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

function picker() {
  // Anchored, since "Delete saved query" is a button too.
  return screen.getByRole('button', { name: /^saved query/i });
}

function nameInput() {
  return screen.getByRole('textbox', { name: 'Saved query name' });
}

function queryNameInput() {
  return screen.queryByRole('textbox', { name: 'Saved query name' });
}

// Disabled LeafyGreen buttons block pointer events, which userEvent refuses
// to click through unless told to.
function clickEvenIfDisabled(element: HTMLElement) {
  userEvent.click(element, undefined, { skipPointerEventsCheck: true });
}

describe('SavedQueriesBar', function () {
  afterEach(function () {
    cleanup();
  });

  it('opens the saved query that is picked', function () {
    const { onOpen } = renderBar();

    userEvent.click(picker());
    userEvent.click(screen.getByText('Bob'));

    expect(onOpen).to.have.been.calledOnceWith('bob-id');
  });

  it('marks the default in the list', function () {
    renderBar();

    userEvent.click(picker());

    expect(screen.getByText('Alice (default)')).to.exist;
  });

  it('saves the rows under the name typed', function () {
    const { onSave } = renderBar();

    userEvent.click(screen.getByRole('button', { name: 'Save as…' }));
    userEvent.type(nameInput(), 'Active users');
    userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(onSave).to.have.been.calledOnceWith('Active users');
    // Back to the picker once saved.
    expect(queryNameInput()).to.not.exist;
  });

  it('starts from the open query name, so saving again replaces it', function () {
    renderBar({ selectedId: 'bob-id' });

    userEvent.click(screen.getByRole('button', { name: 'Save as…' }));

    expect(nameInput()).to.have.value('Bob');
    expect(screen.getByText('Replaces the rows saved under this name.')).to
      .exist;
  });

  it('leaves the saved queries alone when saving is cancelled', function () {
    const { onSave } = renderBar();

    userEvent.click(screen.getByRole('button', { name: 'Save as…' }));
    userEvent.type(nameInput(), 'Draft');
    userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onSave).to.not.have.been.called;
    expect(queryNameInput()).to.not.exist;
  });

  it('has nothing to save while the builder is empty', function () {
    renderBar({ canSave: false });

    clickEvenIfDisabled(screen.getByRole('button', { name: 'Save as…' }));

    expect(queryNameInput()).to.not.exist;
  });

  it('makes the open query the default', function () {
    const { onToggleDefault } = renderBar({ selectedId: 'bob-id' });

    const star = screen.getByRole('button', {
      name: 'Run this query when the collection opens',
    });
    expect(star).to.have.attribute('aria-pressed', 'false');
    userEvent.click(star);

    expect(onToggleDefault).to.have.been.calledOnceWith('bob-id');
  });

  it('offers to stop the default from running', function () {
    renderBar({ selectedId: 'alice-id' });

    expect(
      screen.getByRole('button', {
        name: 'Stop running this query when the collection opens',
      })
    ).to.have.attribute('aria-pressed', 'true');
  });

  it('deletes the open query', function () {
    const { onDelete } = renderBar({ selectedId: 'bob-id' });

    userEvent.click(screen.getByRole('button', { name: 'Delete saved query' }));

    expect(onDelete).to.have.been.calledOnceWith('bob-id');
  });

  it('stars and deletes nothing until a query is open', function () {
    const { onToggleDefault, onDelete } = renderBar();

    clickEvenIfDisabled(
      screen.getByRole('button', {
        name: 'Run this query when the collection opens',
      })
    );
    clickEvenIfDisabled(
      screen.getByRole('button', { name: 'Delete saved query' })
    );

    expect(onToggleDefault).to.not.have.been.called;
    expect(onDelete).to.not.have.been.called;
  });

  it('says when nothing has been saved yet', function () {
    renderBar({ savedQueries: [] });

    expect(screen.getByText('No saved queries yet')).to.exist;
  });
});
