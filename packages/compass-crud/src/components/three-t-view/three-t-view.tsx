import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Icon,
  IconButton,
  ResizeDirection,
  ResizeHandle,
  css,
  cx,
  palette,
  spacing,
  useDarkMode,
} from '@mongodb-js/compass-components';
import DocumentList from '../document-list';
import type { DocumentListProps } from '../document-list';
import { QueryBuilderPanel } from './query-builder-panel';
import type { BuilderState } from './builder-query';
import {
  EMPTY_BUILDER_STATE,
  compileBuilderState,
  compiledQueryToAppliedQuery,
} from './builder-query';

const DEFAULT_BUILDER_WIDTH = 460;
const MIN_BUILDER_WIDTH = 280;
const MAX_BUILDER_WIDTH = 900;

const layout = css({
  display: 'flex',
  width: '100%',
  height: '100%',
  minHeight: 0,
});

const resultsPane = css({
  flex: 1,
  minWidth: 0,
  display: 'flex',
  flexDirection: 'column',
  // Anchors the resize handle, which positions itself on the right edge.
  position: 'relative',
});

const builderPane = css({
  flex: 'none',
  display: 'flex',
  flexDirection: 'column',
  minHeight: 0,
  borderLeft: `1px solid ${palette.gray.light2}`,
  backgroundColor: palette.gray.light3,
});

const builderPaneDark = css({
  borderLeftColor: palette.gray.dark2,
  backgroundColor: palette.black,
});

const builderHeader = css({
  flex: 'none',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  padding: `${spacing[100]}px ${spacing[100]}px 0`,
});

const builderScroll = css({
  flex: 1,
  minHeight: 0,
  overflowY: 'auto',
});

const collapsedStrip = css({
  flex: 'none',
  display: 'flex',
  justifyContent: 'center',
  padding: spacing[100],
  borderLeft: `1px solid ${palette.gray.light2}`,
});

const collapsedStripDark = css({
  borderLeftColor: palette.gray.dark2,
});

/**
 * The "3T View" collection tab: document results on the left, and a visual
 * query builder on the right that fields can be dragged into.
 *
 * The builder owns its rows and compiles them into a query. The query bar at
 * the top of the tab is where that query is shown: editing a row writes the
 * filter, projection, sort, skip and limit into the query bar inputs, and
 * running applies them from there. So the query the builder describes is the
 * same query, in the same boxes, as one typed by hand.
 */
export const ThreeTView: React.FunctionComponent<DocumentListProps> = (
  props
) => {
  const darkMode = useDarkMode();
  const [builderState, setBuilderState] =
    useState<BuilderState>(EMPTY_BUILDER_STATE);
  const [builderWidth, setBuilderWidth] = useState(DEFAULT_BUILDER_WIDTH);
  const [isCollapsed, setIsCollapsed] = useState(false);

  const compiled = useMemo(
    () => compileBuilderState(builderState),
    [builderState]
  );

  const { store } = props;

  // Keep the query bar showing what the rows currently describe, without
  // running it. The builder is the source of truth in this tab, so anything
  // typed directly into the bar is replaced the next time a row changes.
  useEffect(() => {
    store.queryBar.setQuery(compiledQueryToAppliedQuery(compiled));
  }, [compiled, store]);

  const onRun = useCallback(() => {
    // Every property is sent on every run, using undefined for the ones the
    // builder has no rows for. Leaving a property out of the query instead
    // leaves the previously applied value in place, so removing the last
    // projection row would not actually remove the projection.
    store.queryBar.setAndApplyQuery(
      compiledQueryToAppliedQuery(compiled),
      'crud'
    );
    void store.refreshDocuments(true);
  }, [compiled, store]);

  const onResize = useCallback(
    (nextValue: number) => {
      // The handle sits on the right edge of the results pane and adds the
      // pointer movement to the value it was given. The builder is on the
      // other side of it, so dragging right has to make it narrower.
      const delta = nextValue - builderWidth;
      setBuilderWidth(
        Math.min(
          MAX_BUILDER_WIDTH,
          Math.max(MIN_BUILDER_WIDTH, builderWidth - delta)
        )
      );
    },
    [builderWidth]
  );

  return (
    <div className={layout} data-testid="three-t-view">
      <div className={resultsPane}>
        <DocumentList {...props} />
        {!isCollapsed && (
          <ResizeHandle
            direction={ResizeDirection.RIGHT}
            value={builderWidth}
            minValue={MIN_BUILDER_WIDTH}
            maxValue={MAX_BUILDER_WIDTH}
            onChange={onResize}
            title="query builder"
          />
        )}
      </div>

      {isCollapsed ? (
        <div
          className={cx(collapsedStrip, darkMode && collapsedStripDark)}
          data-testid="three-t-builder-collapsed"
        >
          <IconButton
            aria-label="Show query builder"
            title="Show query builder"
            onClick={() => setIsCollapsed(false)}
          >
            <Icon glyph="ChevronLeft" />
          </IconButton>
        </div>
      ) : (
        <aside
          className={cx(builderPane, darkMode && builderPaneDark)}
          style={{ width: builderWidth }}
          data-testid="three-t-builder-pane"
        >
          <div className={builderHeader}>
            <IconButton
              aria-label="Hide query builder"
              title="Hide query builder"
              onClick={() => setIsCollapsed(true)}
            >
              <Icon glyph="ChevronRight" />
            </IconButton>
          </div>
          <div className={builderScroll}>
            <QueryBuilderPanel
              state={builderState}
              onChange={setBuilderState}
              onRun={onRun}
              errors={compiled.errors}
            />
          </div>
        </aside>
      )}
    </div>
  );
};

export default ThreeTView;
