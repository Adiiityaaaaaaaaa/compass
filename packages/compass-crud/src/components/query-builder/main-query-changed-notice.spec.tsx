import React from 'react';
import { expect } from 'chai';
import { act, cleanup, screen } from '@mongodb-js/testing-library-compass';
import type { PreferencesAccess } from 'compass-preferences-model';
import { createSandboxFromDefaultPreferences } from 'compass-preferences-model';
import type { ChangeQueryFn } from '@mongodb-js/compass-query-bar';
import { useChangeQueryBarQuery } from '@mongodb-js/compass-query-bar';
import { renderWithQueryBar } from '../../../test/render-with-query-bar';
import { MainQueryChangedNotice } from './main-query-changed-notice';
import { QueryBuilderPanel } from './query-builder-panel';
import type { AppliedQuery, BuilderState } from './builder-query';
import {
  EMPTY_BUILDER_STATE,
  compileBuilderState,
  compiledQueryToAppliedQuery,
} from './builder-query';

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

/** What the builder would have written into the bar for these rows. */
function writtenFor(builderState: BuilderState): AppliedQuery {
  return compiledQueryToAppliedQuery(compileBuilderState(builderState));
}

describe('MainQueryChangedNotice', function () {
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

  function renderNotice(
    builderState: BuilderState,
    queryInBar: AppliedQuery | null = writtenFor(builderState)
  ) {
    renderWithQueryBar(
      <>
        <QueryBarHandle />
        <MainQueryChangedNotice
          builderState={builderState}
          queryInBar={queryInBar}
        >
          <QueryBuilderPanel
            state={builderState}
            onChange={() => {}}
            onRun={() => {}}
            errors={[]}
          />
        </MainQueryChangedNotice>
      </>,
      { preferences }
    );
  }

  const notice = () => screen.queryByTestId('query-builder-main-query-changed');

  beforeEach(async function () {
    preferences = await createSandboxFromDefaultPreferences();
  });

  afterEach(function () {
    cleanup();
  });

  it('says nothing while the bar shows what the builder wrote', function () {
    renderNotice(BUILDER_WITH_EMAIL);
    setMainQueryEmail('alice@example.com');

    expect(notice()).to.not.exist;
  });

  it('warns once the bar is changed to something else', function () {
    renderNotice(BUILDER_WITH_EMAIL);
    setMainQueryEmail('bob@example.com');

    expect(notice()).to.exist;
    expect(notice()?.textContent).to.match(/no longer matches the builder/);
  });

  it('stops warning when the bar is put back', function () {
    renderNotice(BUILDER_WITH_EMAIL);
    setMainQueryEmail('bob@example.com');
    expect(notice()).to.exist;

    setMainQueryEmail('alice@example.com');
    expect(notice()).to.not.exist;
  });

  it('leaves the builder usable, rather than blocking it', function () {
    renderNotice(BUILDER_WITH_EMAIL);
    setMainQueryEmail('bob@example.com');

    // The rows stay reachable: the warning says what is true and gets out of
    // the way, because running the builder writes the bar anyway.
    expect(screen.getByRole('button', { name: 'Run' })).to.exist;
    expect(screen.getByDisplayValue('alice@example.com')).to.exist;
  });

  it('does not warn about rows the builder has only just changed', function () {
    // The rows moved on but the bar has not been written yet, which is what
    // every keystroke in the builder looks like for an instant. Comparing
    // against what was actually written keeps that quiet.
    const edited: BuilderState = {
      ...BUILDER_WITH_EMAIL,
      conditions: [
        { ...BUILDER_WITH_EMAIL.conditions[0], valueText: 'carol@example.com' },
      ],
    };
    renderNotice(edited, writtenFor(BUILDER_WITH_EMAIL));
    setMainQueryEmail('alice@example.com');

    expect(notice()).to.not.exist;
  });

  it('says nothing when the builder has written nothing', function () {
    renderNotice(BUILDER_WITH_EMAIL, null);
    setMainQueryEmail('bob@example.com');

    expect(notice()).to.not.exist;
  });

  it('leaves an empty builder alone whatever the main query is', function () {
    renderNotice(EMPTY_BUILDER_STATE, null);
    setMainQueryEmail('bob@example.com');

    expect(notice()).to.not.exist;
  });
});
