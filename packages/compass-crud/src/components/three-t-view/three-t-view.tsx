import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
 * The builder owns its rows and compiles them into a query. Running applies
 * that query through the query bar, so the results, the query bar contents and
 * the recent query history all stay consistent with the rest of Compass.
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

  // This tab is about scanning rows next to the builder, so it opens in the
  // table view. setState rather than viewChanged: the latter persists the
  // choice, which would change what the Documents tab opens with too. The
  // view switcher in the toolbar still works from here.
  const didSetInitialView = useRef(false);
  useEffect(() => {
    if (!didSetInitialView.current) {
      didSetInitialView.current = true;
      store.setState({ view: 'Table' });
    }
  }, [store]);

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
              compiled={compiled}
            />
          </div>
        </aside>
      )}
    </div>
  );
};

export default ThreeTView;
