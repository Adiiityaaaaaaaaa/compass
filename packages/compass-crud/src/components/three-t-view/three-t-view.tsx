import React, { useCallback, useMemo, useState } from 'react';
import {
  css,
  palette,
  spacing,
  useDarkMode,
  cx,
} from '@mongodb-js/compass-components';
import DocumentList from '../document-list';
import type { DocumentListProps } from '../document-list';
import { QueryBuilderPanel } from './query-builder-panel';
import type { BuilderState } from './builder-query';
import { EMPTY_BUILDER_STATE, compileBuilderState } from './builder-query';

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
});

const builderPane = css({
  flex: 'none',
  width: spacing[1600] * 5,
  maxWidth: '45%',
  borderLeft: `1px solid ${palette.gray.light2}`,
  display: 'flex',
  minHeight: 0,
});

const builderPaneDark = css({
  borderLeftColor: palette.gray.dark2,
});

/**
 * The "3T View" collection tab: the usual document results on the left, and a
 * visual query builder on the right that fields can be dragged into.
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

  const compiled = useMemo(
    () => compileBuilderState(builderState),
    [builderState]
  );

  const { store } = props;

  const onRun = useCallback(() => {
    const query: Record<string, unknown> = Object.assign(
      Object.create(null) as Record<string, unknown>,
      { filter: compiled.filter }
    );
    if (compiled.project) {
      query.project = compiled.project;
    }
    if (compiled.sort) {
      query.sort = compiled.sort;
    }
    if (compiled.skip !== null) {
      query.skip = compiled.skip;
    }
    if (compiled.limit !== null) {
      query.limit = compiled.limit;
    }
    // 'crud' is the source the document list reads its applied query from.
    store.queryBar.setAndApplyQuery(query, 'crud');
    void store.refreshDocuments(true);
  }, [compiled, store]);

  return (
    <div className={layout} data-testid="three-t-view">
      <div className={resultsPane}>
        <DocumentList {...props} />
      </div>
      <aside className={cx(builderPane, darkMode && builderPaneDark)}>
        <QueryBuilderPanel
          state={builderState}
          onChange={setBuilderState}
          onRun={onRun}
          errors={compiled.errors}
        />
      </aside>
    </div>
  );
};

export default ThreeTView;
