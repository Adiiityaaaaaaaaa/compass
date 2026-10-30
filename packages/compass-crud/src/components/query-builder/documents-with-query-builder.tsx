import React, { useCallback, useMemo } from 'react';
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
import { MainQueryChangedGuard } from './main-query-changed-guard';
import type { BuilderState } from './builder-query';
import {
  EMPTY_BUILDER_STATE,
  builderHasRows,
  compileBuilderState,
  compiledQueryToAppliedQuery,
} from './builder-query';
import {
  MAX_BUILDER_WIDTH,
  MIN_BUILDER_WIDTH,
  mirrorBuilderWidth,
} from './builder-panel-size';
import { useTabState } from '@mongodb-js/compass-workspaces/provider';

const DEFAULT_BUILDER_WIDTH = 680;

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
 * The documents view with a visual query builder beside it.
 *
 * The builder is a panel on the right of the document results. Fields dragged
 * out of a document land in it. It is open to begin with, and closing it is
 * remembered for the tab.
 *
 * The builder owns its rows and compiles them into a query. The query bar at
 * the top of the tab is where that query is shown: editing a row writes the
 * filter, projection, sort, skip and limit into the query bar inputs, and
 * running applies them from there. So the query the builder describes is the
 * same query, in the same boxes, as one typed by hand.
 *
 * It only goes that way. Editing the query bar by hand leaves the rows as they
 * were, and the builder is greyed out until it is either written back over
 * the bar or cleared.
 */
export const DocumentsWithQueryBuilder: React.FunctionComponent<
  DocumentListProps
> = (props) => {
  const darkMode = useDarkMode();
  const { store } = props;
  // Per workspace tab, and surviving the unmount that switching tabs causes.
  // Two tabs on the same collection are two different queries, so this is
  // scoped to the tab rather than to the collection.
  // Defaults to EMPTY_BUILDER_STATE if useTabState ever hands back `undefined`
  // (e.g. a tab-state key that was previously set to `undefined` sticks,
  // since useTabState only backfills a missing key, not an undefined one).
  const [builderState = EMPTY_BUILDER_STATE, setBuilderState] =
    useTabState<BuilderState>('query-builder-rows', EMPTY_BUILDER_STATE);
  const [builderWidth, setBuilderWidth] = useTabState(
    'query-builder-width',
    DEFAULT_BUILDER_WIDTH
  );
  // Open to begin with, since in this build the builder is the reason the
  // documents view looks different at all and a panel nobody can see is a
  // panel nobody uses. Closing it is remembered for the tab, so anyone who
  // would rather have the room back only has to say so once.
  const [isCollapsed, setIsCollapsed] = useTabState(
    'query-builder-collapsed',
    false
  );

  const compiled = useMemo(
    () => compileBuilderState(builderState),
    [builderState]
  );

  // Keeps the query bar showing what the rows describe, without running it.
  //
  // Written as the rows change rather than from an effect. An effect left a
  // render in which the rows were new and the bar was not, which read as the
  // main query having changed, and it wrote again whenever the panel mounted,
  // replacing a query typed into the bar while the tab was in the background.
  //
  // An empty builder leaves the bar alone: removing the last row stops the
  // builder describing a query, rather than describing an empty one.
  const onBuilderChange = useCallback(
    (nextState: BuilderState) => {
      setBuilderState(nextState);
      if (builderHasRows(nextState)) {
        store.queryBar.setQuery(
          compiledQueryToAppliedQuery(compileBuilderState(nextState))
        );
      }
    },
    [setBuilderState, store]
  );

  const onProceed = useCallback(() => {
    store.queryBar.setQuery(compiledQueryToAppliedQuery(compiled));
  }, [compiled, store]);

  const onClearBuilder = useCallback(() => {
    setBuilderState(EMPTY_BUILDER_STATE);
  }, [setBuilderState]);

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

  // The handle works in mirrored width, so that its own clamping points the
  // same way the pointer does. See mirrorBuilderWidth for why.
  const onResize = useCallback((nextValue: number) => {
    setBuilderWidth(mirrorBuilderWidth(nextValue));
  }, []);

  return (
    <div className={layout} data-testid="documents-with-query-builder">
      <div className={resultsPane}>
        <DocumentList {...props} />
        {!isCollapsed && (
          <ResizeHandle
            direction={ResizeDirection.RIGHT}
            value={mirrorBuilderWidth(builderWidth)}
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
          data-testid="query-builder-collapsed"
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
          data-testid="query-builder-pane"
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
          <MainQueryChangedGuard
            builderState={builderState}
            compiled={compiled}
            onProceed={onProceed}
            onClearBuilder={onClearBuilder}
          >
            <div className={builderScroll}>
              <QueryBuilderPanel
                state={builderState}
                onChange={onBuilderChange}
                onRun={onRun}
                errors={compiled.errors}
              />
            </div>
          </MainQueryChangedGuard>
        </aside>
      )}
    </div>
  );
};

export default DocumentsWithQueryBuilder;
