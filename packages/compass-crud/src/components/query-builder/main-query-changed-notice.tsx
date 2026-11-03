import React from 'react';
import {
  Icon,
  css,
  cx,
  palette,
  spacing,
  useDarkMode,
} from '@mongodb-js/compass-components';
import { useQueryBarQuery } from '@mongodb-js/compass-query-bar';
import type { AppliedQuery, BuilderState } from './builder-query';
import { builderHasRows, doesQueryBarShow } from './builder-query';

const wrapper = css({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
});

const content = css({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
});

const warning = css({
  flex: 'none',
  display: 'flex',
  alignItems: 'flex-start',
  gap: spacing[200],
  padding: `${spacing[200]}px ${spacing[300]}px`,
  fontSize: 12,
  lineHeight: `${spacing[400]}px`,
  color: palette.yellow.dark2,
});

const warningDark = css({
  color: palette.yellow.light2,
});

export type MainQueryChangedNoticeProps = {
  builderState: BuilderState;
  /** What the builder last wrote into the query bar, if anything. */
  queryInBar: AppliedQuery | null;
  children: React.ReactNode;
};

/**
 * Says so when the query bar no longer shows the query the builder put there.
 *
 * The builder used to grey itself out and ask which of the two to keep, which
 * stood in the way of the far more common case: the person is working in the
 * builder and the bar is simply behind. It now says what is true and leaves
 * the builder alone, since running it writes the bar anyway.
 *
 * Only the query the builder actually wrote is compared, so editing a row
 * cannot set this off. The old check compiled the rows afresh and compared
 * that, which disagreed with the bar whenever a value did not survive being
 * written as text and parsed back, and blamed the person for it.
 *
 * This is also the part that watches the query bar, so a keystroke there
 * re-renders the notice alone rather than the document list beside it.
 */
export const MainQueryChangedNotice: React.FunctionComponent<
  MainQueryChangedNoticeProps
> = ({ builderState, queryInBar, children }) => {
  const darkMode = useDarkMode();
  const queryBarQuery = useQueryBarQuery();
  const isMainQueryChanged =
    builderHasRows(builderState) &&
    queryInBar !== null &&
    !doesQueryBarShow(queryBarQuery, queryInBar);

  return (
    <div className={wrapper}>
      <div className={content}>{children}</div>
      {isMainQueryChanged && (
        <div
          className={cx(warning, darkMode && warningDark)}
          data-testid="query-builder-main-query-changed"
        >
          <Icon glyph="Warning" size="small" />
          <span>
            The query bar has been edited and no longer matches the builder.
            Running the builder will replace it.
          </span>
        </div>
      )}
    </div>
  );
};

export default MainQueryChangedNotice;
