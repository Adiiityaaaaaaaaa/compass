import { search, searchKeymap } from '@codemirror/search';
import { keymap, EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';
import { fontFamilies, palette, spacing } from '@mongodb-js/compass-components';

function getSearchPanelTheme(dark: boolean): Extension {
  const background = dark ? palette.gray.dark3 : palette.gray.light3;
  const border = dark ? palette.gray.dark2 : palette.gray.light2;
  const text = dark ? palette.gray.light2 : palette.black;
  const inputBackground = dark ? palette.gray.dark4 : palette.white;
  const inputBorder = dark ? palette.gray.dark1 : palette.gray.light1;
  const buttonBackground = dark ? palette.gray.dark2 : palette.white;
  const buttonBorder = dark ? palette.gray.dark1 : palette.gray.light1;
  const buttonHoverBackground = dark ? palette.gray.dark1 : palette.gray.light2;
  const checkboxAccent = dark ? palette.green.light1 : palette.green.dark1;

  return EditorView.theme(
    {
      '& .cm-panel.cm-search': {
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: `${spacing[150]}px`,
        padding: `${spacing[200]}px ${spacing[300]}px`,
        paddingRight: `${spacing[600]}px`, // room for the absolutely positioned close button
        backgroundColor: background,
        borderBottom: `1px solid ${border}`,
        color: text,
        fontFamily: fontFamilies.default,
        fontSize: '12px',

        '& br': {
          // The default panel uses a <br> to start a new row for the
          // replace controls; the flex-wrap layout here does that on its
          // own once the row runs out of space.
          display: 'none',
        },

        '& input, & button, & label': {
          margin: 0,
        },

        '& .cm-textfield': {
          backgroundColor: inputBackground,
          border: `1px solid ${inputBorder}`,
          borderRadius: `${spacing[50]}px`,
          color: text,
          padding: `${spacing[50]}px ${spacing[150]}px`,
          fontFamily: fontFamilies.code,
          fontSize: '12px',
          outline: 'none',
        },
        '& .cm-textfield:focus': {
          borderColor: palette.blue.base,
        },

        '& .cm-button': {
          backgroundColor: buttonBackground,
          backgroundImage: 'none',
          border: `1px solid ${buttonBorder}`,
          borderRadius: `${spacing[50]}px`,
          color: text,
          padding: `${spacing[50]}px ${spacing[200]}px`,
          fontFamily: fontFamilies.default,
          fontSize: '12px',
          cursor: 'pointer',
        },
        '& .cm-button:hover': {
          backgroundColor: buttonHoverBackground,
        },

        '& label': {
          display: 'inline-flex',
          alignItems: 'center',
          gap: `${spacing[50]}px`,
          fontSize: '12px',
          color: text,
          whiteSpace: 'nowrap',
          userSelect: 'none',
        },
        '& input[type=checkbox]': {
          accentColor: checkboxAccent,
          margin: 0,
        },

        '& [name=close]': {
          color: text,
          fontSize: '16px',
          lineHeight: 1,
          cursor: 'pointer',
          padding: `${spacing[50]}px`,
        },
        '& [name=close]:hover': {
          backgroundColor: buttonHoverBackground,
          borderRadius: `${spacing[50]}px`,
        },
      },
    },
    { dark }
  );
}

const searchPanelTheme = {
  light: getSearchPanelTheme(false),
  dark: getSearchPanelTheme(true),
} as const;

/**
 * Adds a "find in document" panel (Ctrl/Cmd-F to open, matching CodeMirror's
 * default search keybindings) to an editor via its `customExtensions` prop,
 * themed to match the rest of Compass instead of CodeMirror's plain default
 * panel styles. Intended for editors showing large documents, where the
 * browser's own find-in-page can't reach text hidden by
 * virtualization/folding.
 */
export function createFindInDocumentExtension(darkMode = false): Extension {
  return [
    search({ top: true }),
    keymap.of(searchKeymap),
    searchPanelTheme[darkMode ? 'dark' : 'light'],
  ];
}
