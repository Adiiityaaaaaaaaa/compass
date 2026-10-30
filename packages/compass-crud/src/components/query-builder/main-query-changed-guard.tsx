import React from 'react';
import {
  Body,
  Button,
  KeylineCard,
  css,
  cx,
  spacing,
} from '@mongodb-js/compass-components';
import { useQueryBarQuery } from '@mongodb-js/compass-query-bar';
import type { BuilderState, CompiledQuery } from './builder-query';
import { builderHasRows, doesQueryBarShow } from './builder-query';

const guard = css({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  // Anchors the notice, which covers the builder rather than scrolling with it.
  position: 'relative',
});

const guardedContent = css({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
});

const greyedOut = css({
  opacity: 0.4,
  filter: 'grayscale(1)',
});

const overlay = css({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'center',
  padding: spacing[400],
});

const notice = css({
  maxWidth: 400,
  padding: spacing[400],
  display: 'flex',
  flexDirection: 'column',
  gap: spacing[300],
});

const noticeActions = css({
  display: 'flex',
  justifyContent: 'flex-end',
  gap: spacing[200],
});

export type MainQueryChangedGuardProps = {
  builderState: BuilderState;
  compiled: CompiledQuery;
  onProceed: () => void;
  onClearBuilder: () => void;
  children: React.ReactNode;
};

/**
 * Greys out the builder once the main query no longer matches it, and asks
 * which of the two to keep.
 *
 * Editing the main query by hand leaves the builder's rows as they were, and
 * editing a row would quietly write over the hand edit. Locking the builder
 * makes that a choice: proceed with the builder's query, or clear the builder
 * and keep the main one.
 *
 * This is the part that watches the query bar, so that a keystroke there
 * re-renders the guard alone rather than the document list beside it.
 */
export const MainQueryChangedGuard: React.FunctionComponent<
  MainQueryChangedGuardProps
> = ({ builderState, compiled, onProceed, onClearBuilder, children }) => {
  const queryBarQuery = useQueryBarQuery();
  const isMainQueryChanged =
    builderHasRows(builderState) && !doesQueryBarShow(queryBarQuery, compiled);

  return (
    <div className={guard}>
      <div
        className={cx(guardedContent, isMainQueryChanged && greyedOut)}
        aria-hidden={isMainQueryChanged || undefined}
        // React 18 has no prop for `inert`, so it goes through as a plain
        // attribute. It keeps keyboard focus out of the greyed out rows as
        // well as clicks, which pointer-events alone would not.
        {...(isMainQueryChanged ? { inert: '' } : {})}
        data-testid="query-builder-guarded-content"
      >
        {children}
      </div>
      {isMainQueryChanged && (
        <div className={overlay}>
          <KeylineCard
            className={notice}
            data-testid="query-builder-main-query-changed"
          >
            <Body weight="medium">The main query has been changed.</Body>
            <Body>
              Clicking Proceed will override the main query with the
              builder&apos;s query. Clear builder keeps the main query and
              empties the builder.
            </Body>
            <div className={noticeActions}>
              <Button size="small" onClick={onClearBuilder}>
                Clear builder
              </Button>
              <Button size="small" variant="primary" onClick={onProceed}>
                Proceed
              </Button>
            </div>
          </KeylineCard>
        </div>
      )}
    </div>
  );
};

export default MainQueryChangedGuard;
