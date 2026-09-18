import { expect } from 'chai';
import { EditorView } from '@codemirror/view';
import { languages } from '../editor';
import { getJsonFieldPathAtLine } from './json-field-drag-gutter';

function createView(doc: string) {
  return new EditorView({
    doc,
    extensions: languages.json(),
  });
}

function pathAtLine(doc: string, lineNumber: number) {
  const view = createView(doc);
  const line = view.state.doc.line(lineNumber);
  return getJsonFieldPathAtLine(view.state, line.from, line.to);
}

describe('getJsonFieldPathAtLine', function () {
  it('returns the path for a top-level field', function () {
    const doc = ['{', '  "name": "Alice",', '  "age": 28', '}'].join('\n');
    expect(pathAtLine(doc, 2)).to.deep.equal(['name']);
    expect(pathAtLine(doc, 3)).to.deep.equal(['age']);
  });

  it('returns the path for a nested object field', function () {
    const doc = [
      '{',
      '  "user": {',
      '    "name": "Alice",',
      '    "address": {',
      '      "city": "NYC"',
      '    }',
      '  }',
      '}',
    ].join('\n');
    expect(pathAtLine(doc, 3)).to.deep.equal(['user', 'name']);
    expect(pathAtLine(doc, 5)).to.deep.equal(['user', 'address', 'city']);
  });

  it('returns the path with numeric indices for fields inside an array of objects', function () {
    const doc = [
      '{',
      '  "users": [',
      '    { "name": "Alice" },',
      '    { "name": "Bob" }',
      '  ]',
      '}',
    ].join('\n');
    expect(pathAtLine(doc, 3)).to.deep.equal(['users', 0, 'name']);
    expect(pathAtLine(doc, 4)).to.deep.equal(['users', 1, 'name']);
  });

  it('returns null for lines with no field, such as closing brackets', function () {
    const doc = ['{', '  "name": "Alice"', '}'].join('\n');
    expect(pathAtLine(doc, 1)).to.equal(null);
    expect(pathAtLine(doc, 3)).to.equal(null);
  });

  it('returns null for a bare array element line (no field name)', function () {
    const doc = [
      '{',
      '  "tags": [',
      '    "sports",',
      '    "music"',
      '  ]',
      '}',
    ].join('\n');
    expect(pathAtLine(doc, 3)).to.equal(null);
    expect(pathAtLine(doc, 4)).to.equal(null);
  });

  it('returns the first field path when multiple fields share one line', function () {
    const doc = '{ "a": 1, "b": 2 }';
    expect(pathAtLine(doc, 1)).to.deep.equal(['a']);
  });
});
