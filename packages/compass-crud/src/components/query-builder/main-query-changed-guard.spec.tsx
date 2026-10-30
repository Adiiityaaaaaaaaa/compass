import React from 'react';
import { expect } from 'chai';
import sinon from 'sinon';
import { ObjectId } from 'bson';
import {
  act,
  cleanup,
  screen,
  userEvent,
} from '@mongodb-js/testing-library-compass';
import type { PreferencesAccess } from 'compass-preferences-model';
import { createSandboxFromDefaultPreferences } from 'compass-preferences-model';
import type { ChangeQueryFn } from '@mongodb-js/compass-query-bar';
import { useChangeQueryBarQuery } from '@mongodb-js/compass-query-bar';
import { renderWithQueryBar } from '../../../test/render-with-query-bar';
import { MainQueryChangedGuard } from './main-query-changed-guard';
import { QueryBuilderPanel } from './query-builder-panel';
import type { BuilderState } from './builder-query';
import { EMPTY_BUILDER_STATE, compileBuilderState } from './builder-query';

const BUILDER_WITH_EMAIL: BuilderState = {
  ...EMPTY_BUILDER_STATE,
  conditions: [
    {
      id: 'c1',
      field: 'email',
      operator: 'eq',
      valueText: 'alice@example.com',
      enabled: true,
    },
  ],
};

describe('MainQueryChangedGuard', function () {
  let preferences: PreferencesAccess;
  let changeQuery: ChangeQueryFn;

  // Edits the main query the way a document's "add to query" does, which goes
  // through the same parse as typing into the bar.
  function QueryBarHandle() {
    changeQuery = useChangeQueryBarQuery();
    return null;
  }

  function setMainQueryEmail(email: string) {
    act(() => {
      changeQuery('setValue', { field: 'email', value: email });
    });
  }

  function renderGuard(builderState: BuilderState) {
    const onProceed = sinon.spy();
    const onClearBuilder = sinon.spy();
    renderWithQueryBar(
      <>
        <QueryBarHandle />
        <MainQueryChangedGuard
          builderState={builderState}
          compiled={compileBuilderState(builderState)}
          onProceed={onProceed}
          onClearBuilder={onClearBuilder}
        >
          <QueryBuilderPanel
            state={builderState}
            onChange={() => {}}
            onRun={() => {}}
            errors={[]}
          />
        </MainQueryChangedGuard>
      </>,
      { preferences }
    );
    return { onProceed, onClearBuilder };
  }

  beforeEach(async function () {
    preferences = await createSandboxFromDefaultPreferences();
  });

  afterEach(function () {
    cleanup();
  });

  it('leaves the builder usable while the main query is its query', function () {
    renderGuard(BUILDER_WITH_EMAIL);
    setMainQueryEmail('alice@example.com');

    expect(screen.queryByTestId('query-builder-main-query-changed')).to.not
      .exist;
    expect(screen.getByRole('button', { name: 'Run' })).to.exist;
  });

  it('greys out the builder once the main query is changed', function () {
    renderGuard(BUILDER_WITH_EMAIL);
    setMainQueryEmail('alice@example.com');
    setMainQueryEmail('bob@example.com');

    expect(screen.getByText('The main query has been changed.')).to.exist;
    expect(screen.queryByRole('button', { name: 'Run' })).to.not.exist;
    expect(
      screen.getByTestId('query-builder-guarded-content')
    ).to.have.attribute('inert');
  });

  it('lets the builder be used again once the main query is its query again', function () {
    renderGuard(BUILDER_WITH_EMAIL);
    setMainQueryEmail('bob@example.com');
    setMainQueryEmail('alice@example.com');

    expect(screen.queryByTestId('query-builder-main-query-changed')).to.not
      .exist;
    expect(
      screen.getByTestId('query-builder-guarded-content')
    ).to.not.have.attribute('inert');
  });

  it('leaves the builder usable with a dragged ObjectId in it', function () {
    const id = new ObjectId('6aa58011e0a9d9da55fffea5');
    const builderWithId: BuilderState = {
      ...EMPTY_BUILDER_STATE,
      conditions: [
        {
          id: 'c1',
          field: '_id',
          operator: 'eq',
          valueText: '6aa58011e0a9d9da55fffea5',
          value: id,
          valueType: 'ObjectId',
          enabled: true,
        },
      ],
    };
    renderGuard(builderWithId);

    act(() => {
      changeQuery('setValue', { field: '_id', value: id });
    });

    expect(screen.queryByTestId('query-builder-main-query-changed')).to.not
      .exist;
  });

  it('leaves an empty builder alone whatever the main query is', function () {
    renderGuard(EMPTY_BUILDER_STATE);
    setMainQueryEmail('bob@example.com');

    expect(screen.queryByTestId('query-builder-main-query-changed')).to.not
      .exist;
  });

  it('proceeds with the builder query', function () {
    const { onProceed, onClearBuilder } = renderGuard(BUILDER_WITH_EMAIL);
    setMainQueryEmail('bob@example.com');

    userEvent.click(screen.getByRole('button', { name: 'Proceed' }));

    expect(onProceed).to.have.been.calledOnce;
    expect(onClearBuilder).to.not.have.been.called;
  });

  it('clears the builder to keep the main query', function () {
    const { onProceed, onClearBuilder } = renderGuard(BUILDER_WITH_EMAIL);
    setMainQueryEmail('bob@example.com');

    userEvent.click(screen.getByRole('button', { name: 'Clear builder' }));

    expect(onClearBuilder).to.have.been.calledOnce;
    expect(onProceed).to.not.have.been.called;
  });
});
