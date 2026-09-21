import React, { useCallback } from 'react';
import { connect } from 'react-redux';
import {
  Banner,
  Body,
  FormFieldContainer,
  FormModal,
  Label,
  RadioBox,
  RadioBoxGroup,
  SpinLoader,
  TextInput,
  css,
  spacing,
} from '@mongodb-js/compass-components';
import type { CopyCollectionRootState } from '../../stores/copy-collection';
import type { CopiedCollection } from '../../modules/copy-collection';
import type { CopyCollectionMode } from '../../modules/copy-collection-writer';
import {
  hideModal,
  submitCopy,
  setDestDatabase,
  setDestCollection,
  setMode,
  clearError,
} from '../../modules/copy-collection';

const progressContainerStyles = css({
  display: 'flex',
  gap: spacing[200],
  alignItems: 'center',
});

const modeDescriptionStyles = css({
  marginTop: spacing[100],
  marginBottom: 0,
});

export interface CopyCollectionModalProps {
  isVisible: boolean;
  isRunning: boolean;
  error: Error | null;
  copiedCollection: CopiedCollection | null;
  destConnectionName: string;
  destDatabase: string;
  destDatabaseLocked: boolean;
  destCollection: string;
  mode: CopyCollectionMode;
  progress: { docsProcessed: number; docsWritten: number } | null;
  hideModal: () => void;
  submitCopy: () => void;
  setDestDatabase: (database: string) => void;
  setDestCollection: (collection: string) => void;
  setMode: (mode: CopyCollectionMode) => void;
  clearError: () => void;
}

const MODE_DESCRIPTIONS: Record<CopyCollectionMode, string> = {
  merge:
    'Insert documents into the destination. Documents whose _id already exists there are left untouched.',
  overwrite:
    'Insert documents into the destination. Documents whose _id already exists there are replaced.',
  replace:
    'Empty the destination collection first, then copy every document into it.',
};

function CopyCollectionModal({
  isVisible,
  isRunning,
  error,
  copiedCollection,
  destConnectionName,
  destDatabase,
  destDatabaseLocked,
  destCollection,
  mode,
  progress,
  hideModal,
  submitCopy,
  setDestDatabase,
  setDestCollection,
  setMode,
  clearError,
}: CopyCollectionModalProps) {
  const onDatabaseChange = useCallback(
    (evt: React.ChangeEvent<HTMLInputElement>) => {
      clearError();
      setDestDatabase(evt.target.value);
    },
    [clearError, setDestDatabase]
  );

  const onCollectionChange = useCallback(
    (evt: React.ChangeEvent<HTMLInputElement>) => {
      clearError();
      setDestCollection(evt.target.value);
    },
    [clearError, setDestCollection]
  );

  const onModeChange = useCallback(
    ({ target: { value } }: React.ChangeEvent<HTMLInputElement>) => {
      setMode(value as CopyCollectionMode);
    },
    [setMode]
  );

  const onSubmit = useCallback(() => {
    submitCopy();
  }, [submitCopy]);

  const onCancel = useCallback(() => {
    if (isRunning) {
      return;
    }
    hideModal();
  }, [isRunning, hideModal]);

  if (!isVisible || !copiedCollection) {
    return null;
  }

  return (
    <FormModal
      title="Paste Collection"
      open={isVisible}
      onSubmit={onSubmit}
      onCancel={onCancel}
      submitButtonText="Paste"
      variant="primary"
      submitDisabled={
        isRunning || destDatabase.trim() === '' || destCollection.trim() === ''
      }
      data-testid="copy-collection-modal"
    >
      <FormFieldContainer>
        <Body>
          {`Paste "${copiedCollection.database}.${copiedCollection.collection}" (from ${copiedCollection.connectionName}) into ${destConnectionName}.`}
        </Body>
      </FormFieldContainer>
      <FormFieldContainer>
        <TextInput
          data-testid="copy-collection-dest-database"
          label="Destination database"
          value={destDatabase}
          onChange={onDatabaseChange}
          disabled={destDatabaseLocked}
        />
      </FormFieldContainer>
      <FormFieldContainer>
        <TextInput
          data-testid="copy-collection-dest-collection"
          label="Destination collection"
          value={destCollection}
          onChange={onCollectionChange}
        />
      </FormFieldContainer>
      <FormFieldContainer>
        <Label htmlFor="copy-collection-mode">
          If the destination collection already exists
        </Label>
        <RadioBoxGroup
          id="copy-collection-mode"
          data-testid="copy-collection-mode"
          onChange={onModeChange}
          value={mode}
        >
          <RadioBox
            id="copy-collection-mode-merge"
            data-testid="copy-collection-mode-merge"
            value="merge"
            checked={mode === 'merge'}
          >
            Merge
          </RadioBox>
          <RadioBox
            id="copy-collection-mode-overwrite"
            data-testid="copy-collection-mode-overwrite"
            value="overwrite"
            checked={mode === 'overwrite'}
          >
            Overwrite
          </RadioBox>
          <RadioBox
            id="copy-collection-mode-replace"
            data-testid="copy-collection-mode-replace"
            value="replace"
            checked={mode === 'replace'}
          >
            Replace All
          </RadioBox>
        </RadioBoxGroup>
        <Body className={modeDescriptionStyles}>{MODE_DESCRIPTIONS[mode]}</Body>
      </FormFieldContainer>
      {error && (
        <Banner variant="danger" data-testid="copy-collection-modal-error">
          {error.message}
        </Banner>
      )}
      {isRunning && (
        <Body className={progressContainerStyles}>
          <SpinLoader />
          <span>
            {progress
              ? `Copying… ${progress.docsWritten} of ${progress.docsProcessed} documents written`
              : 'Copying…'}
          </span>
        </Body>
      )}
    </FormModal>
  );
}

const MappedCopyCollectionModal = connect(
  (
    state: CopyCollectionRootState
  ): Omit<
    CopyCollectionModalProps,
    | 'hideModal'
    | 'submitCopy'
    | 'setDestDatabase'
    | 'setDestCollection'
    | 'setMode'
    | 'clearError'
  > => state,
  {
    hideModal,
    submitCopy,
    setDestDatabase,
    setDestCollection,
    setMode,
    clearError,
  }
)(CopyCollectionModal);

export default MappedCopyCollectionModal;
