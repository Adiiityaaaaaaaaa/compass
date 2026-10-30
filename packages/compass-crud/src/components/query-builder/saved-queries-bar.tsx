import React, { useCallback, useState } from 'react';
import {
  Body,
  Button,
  Icon,
  IconButton,
  Option,
  Select,
  TextInput,
  css,
  spacing,
} from '@mongodb-js/compass-components';
import type { BuilderQuery } from '@mongodb-js/my-queries-storage';
import { SectionShell } from './query-builder-panel';

const toolbar = css({
  display: 'flex',
  alignItems: 'center',
  gap: spacing[200],
});

const grow = css({ flex: 1, minWidth: 0 });

const optionLabel = css({
  whiteSpace: 'nowrap',
});

export type SavedQueriesBarProps = {
  savedQueries: BuilderQuery[];
  selectedId: string | null;
  /** False while the builder has no rows, since there is nothing to save. */
  canSave: boolean;
  onOpen: (id: string) => void;
  onSave: (name: string) => void;
  onToggleDefault: (id: string) => void;
  onDelete: (id: string) => void;
};

function optionText(query: BuilderQuery) {
  return query._isDefault ? `${query._name} (default)` : query._name;
}

/**
 * Queries saved from the builder for this collection. Opening one fills the
 * rows in without running them. The starred one is the default, which runs
 * when the collection opens.
 */
export const SavedQueriesBar: React.FunctionComponent<SavedQueriesBarProps> = ({
  savedQueries,
  selectedId,
  canSave,
  onOpen,
  onSave,
  onToggleDefault,
  onDelete,
}) => {
  // The name being typed, while saving. Null when not saving.
  const [draftName, setDraftName] = useState<string | null>(null);
  const selected = savedQueries.find((query) => query._id === selectedId);
  // The box only appears because "Save as…" was pressed, so typing the name
  // is the next thing to do.
  const focusNameInput = useCallback((input: HTMLInputElement | null) => {
    input?.focus();
  }, []);

  if (draftName !== null) {
    const trimmed = draftName.trim();
    const replaces = savedQueries.some((query) => query._name === trimmed);
    const save = () => {
      if (trimmed) {
        onSave(trimmed);
        setDraftName(null);
      }
    };
    return (
      <SectionShell title="Saved queries">
        <div className={toolbar}>
          <div className={grow}>
            <TextInput
              aria-label="Saved query name"
              placeholder="Name"
              sizeVariant="small"
              ref={focusNameInput}
              value={draftName}
              onChange={(event) => setDraftName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  save();
                } else if (event.key === 'Escape') {
                  setDraftName(null);
                }
              }}
            />
          </div>
          <Button size="small" onClick={() => setDraftName(null)}>
            Cancel
          </Button>
          <Button
            size="small"
            variant="primary"
            disabled={!trimmed}
            onClick={save}
          >
            Save
          </Button>
        </div>
        {replaces && <Body>Replaces the rows saved under this name.</Body>}
      </SectionShell>
    );
  }

  const defaultLabel = selected?._isDefault
    ? 'Stop running this query when the collection opens'
    : 'Run this query when the collection opens';

  return (
    <SectionShell title="Saved queries">
      <div className={toolbar}>
        <div className={grow}>
          <Select
            aria-label="Saved query"
            size="small"
            allowDeselect={false}
            disabled={savedQueries.length === 0}
            placeholder={
              savedQueries.length === 0 ? 'No saved queries yet' : 'Open…'
            }
            value={selected?._id ?? ''}
            onChange={(id) => {
              if (id) {
                onOpen(id);
              }
            }}
          >
            {savedQueries.map((query) => (
              <Option key={query._id} value={query._id} className={optionLabel}>
                {optionText(query)}
              </Option>
            ))}
          </Select>
        </div>
        <Button
          size="small"
          disabled={!canSave}
          // Starts from the open query's name, so saving again updates it.
          onClick={() => setDraftName(selected?._name ?? '')}
        >
          Save as…
        </Button>
        <IconButton
          aria-label={defaultLabel}
          title={defaultLabel}
          aria-pressed={!!selected?._isDefault}
          disabled={!selected}
          onClick={() => selected && onToggleDefault(selected._id)}
        >
          <Icon
            glyph={selected?._isDefault ? 'Favorite' : 'OutlineFavorite'}
            size="small"
          />
        </IconButton>
        <IconButton
          aria-label="Delete saved query"
          title="Delete saved query"
          disabled={!selected}
          onClick={() => selected && onDelete(selected._id)}
        >
          <Icon glyph="Trash" size="small" />
        </IconButton>
      </div>
    </SectionShell>
  );
};

export default SavedQueriesBar;
