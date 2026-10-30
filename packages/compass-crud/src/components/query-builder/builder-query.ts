import { parseFilter, toJSString } from 'mongodb-query-parser';
import TypeChecker from 'hadron-type-checker';
import { Decimal128, Long } from 'bson';

/**
 * The visual query builder keeps its own rows and compiles them into a query.
 * Everything in this module is pure so that the compilation rules can be
 * tested without rendering the panel.
 */

export type ConditionOperator =
  | 'eq'
  | 'ne'
  | 'gt'
  | 'gte'
  | 'lt'
  | 'lte'
  | 'in'
  | 'nin'
  | 'regex'
  | 'contains'
  | 'exists'
  | 'notExists';

export const CONDITION_OPERATORS: {
  value: ConditionOperator;
  label: string;
  /** Operators that match on the field itself rather than a value. */
  valueless?: boolean;
}[] = [
  { value: 'eq', label: '=' },
  { value: 'ne', label: '!=' },
  { value: 'gt', label: '>' },
  { value: 'gte', label: '>=' },
  { value: 'lt', label: '<' },
  { value: 'lte', label: '<=' },
  { value: 'in', label: 'in' },
  { value: 'nin', label: 'not in' },
  { value: 'regex', label: 'matches' },
  { value: 'contains', label: 'contains' },
  { value: 'exists', label: 'exists', valueless: true },
  { value: 'notExists', label: 'does not exist', valueless: true },
];

export function isValuelessOperator(operator: ConditionOperator): boolean {
  return operator === 'exists' || operator === 'notExists';
}

/**
 * The types a value can be given explicitly.
 *
 * A subset of what Compass can cast to, rather than all of it: these are the
 * ones a query is written against. Array and Object are left out because the
 * box holds one value, and the structural markers like MinKey have no use in
 * a filter written by hand.
 */
export const VALUE_TYPES = [
  { value: 'String', label: 'String' },
  { value: 'Int32', label: 'Int32' },
  { value: 'Int64', label: 'Int64' },
  { value: 'Double', label: 'Double' },
  { value: 'Decimal128', label: 'Decimal128' },
  { value: 'Boolean', label: 'Boolean' },
  { value: 'Date', label: 'Date' },
  { value: 'ObjectId', label: 'ObjectId' },
  { value: 'UUID', label: 'UUID' },
  // Stored as Binary subtype 3 with the first three groups byte reversed, so
  // a UUID copied out of a C# application will not match as it is written.
  // Choosing this reverses it, which is what makes the query find anything.
  { value: 'LegacyCSharpUUID', label: 'Legacy C# UUID' },
  { value: 'Null', label: 'Null' },
] as const;

export type ValueType = (typeof VALUE_TYPES)[number]['value'];

export function isValueType(type: string): type is ValueType {
  return VALUE_TYPES.some((entry) => entry.value === type);
}

/** What a value already is, so the dropdown opens on the right entry. */
export function detectValueType(value: unknown): ValueType | undefined {
  try {
    const detected = TypeChecker.type(value);
    return isValueType(detected) ? detected : undefined;
  } catch {
    return undefined;
  }
}

/** Reads a value as the type asked for, or says why it cannot be. */
export function castValue(value: unknown, type: ValueType): ParsedValue {
  if (detectValueType(value) === type) {
    return { ok: true, value };
  }
  // TypeChecker makes up a new ObjectId for anything but a hex string, an
  // ObjectId included, which suits the document editor changing a field's
  // type. In a query it matches nothing, and a different id on every compile.
  if (type === 'ObjectId' && typeof value !== 'string') {
    return { ok: false, error: `${String(value)} is not a ${type}` };
  }
  try {
    const cast = TypeChecker.cast(value, type);
    // A number that will not parse comes back as NaN rather than throwing,
    // and NaN in a filter matches nothing without saying so.
    if (typeof cast === 'number' && Number.isNaN(cast)) {
      return { ok: false, error: `${String(value)} is not a ${type}` };
    }
    return { ok: true, value: cast };
  } catch {
    return { ok: false, error: `${String(value)} is not a ${type}` };
  }
}

export type ConditionRow = {
  id: string;
  field: string;
  operator: ConditionOperator;
  /** What the box shows. Plain text; see `parseValueText`. */
  valueText: string;
  /**
   * The value exactly as it came from the document it was dragged from, kept
   * while the box still shows it untouched.
   *
   * The box is plain text, so a string of digits is indistinguishable from a
   * number once written down. A reference like "1300932190" is a string in the
   * document and must stay one, and the only thing that knows that is the
   * document it came from. Cleared the moment the text is edited, because from
   * then on the text is what the person means.
   */
  value?: unknown;
  /**
   * The type the value is read as, when it has been chosen rather than left to
   * be worked out. This is how `12` is said to be the string "12" and not the
   * number, which the text alone cannot say.
   */
  valueType?: ValueType;
  enabled: boolean;
};

export type ProjectionRow = {
  id: string;
  field: string;
  mode: 'include' | 'exclude';
  enabled: boolean;
};

export type SortRow = {
  id: string;
  field: string;
  direction: 'asc' | 'desc';
  enabled: boolean;
};

export type BuilderState = {
  match: 'and' | 'or';
  conditions: ConditionRow[];
  projections: ProjectionRow[];
  sorts: SortRow[];
  skip: string;
  limit: string;
};

export const EMPTY_BUILDER_STATE: BuilderState = {
  match: 'and',
  conditions: [],
  projections: [],
  sorts: [],
  skip: '',
  limit: '',
};

/**
 * Whether the builder describes a query at all. Until it has a row it leaves
 * the query bar alone.
 */
export function builderHasRows(state: BuilderState): boolean {
  return (
    state.conditions.length > 0 ||
    state.projections.length > 0 ||
    state.sorts.length > 0 ||
    state.skip.trim() !== '' ||
    state.limit.trim() !== ''
  );
}

let idCounter = 0;
export function nextRowId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function savedRows<T extends { id: string }>(rows: unknown, prefix: string) {
  return Array.isArray(rows)
    ? (rows as T[]).map((row) => ({ ...row, id: nextRowId(prefix) }))
    : [];
}

/**
 * The builder state a saved query holds, ready to put back in the builder.
 *
 * Every row gets a new id. The ids come from a counter that starts again each
 * time Compass does, so the ones a query was saved with can already belong to
 * rows on screen, and two rows sharing an id are edited as one.
 */
export function toBuilderState(saved: unknown): BuilderState {
  const state = (saved ?? {}) as Partial<Record<keyof BuilderState, unknown>>;
  return {
    match: state.match === 'or' ? 'or' : 'and',
    conditions: savedRows<ConditionRow>(state.conditions, 'condition'),
    projections: savedRows<ProjectionRow>(state.projections, 'projection'),
    sorts: savedRows<SortRow>(state.sorts, 'sort'),
    skip: typeof state.skip === 'string' ? state.skip : '',
    limit: typeof state.limit === 'string' ? state.limit : '',
  };
}

/**
 * Renders a value the way the query bar would, so that a value dropped in from
 * a document reads the same as one typed by hand.
 */
export function valueToText(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  // The type is shown in its own dropdown, so the value is written on its
  // own: 2 rather than NumberLong('2'), and the date rather than ISODate(…).
  // Saying it twice made the box wide and hard to read, and the half in the
  // box could not be edited without rewriting the wrapper around it.
  if (typeof value === 'string') {
    return value;
  }
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  // Only for the types the dropdown carries. Anything else keeps its wrapper,
  // because nothing else would say what it is.
  const detected = detectValueType(value);
  if (
    detected === 'Int32' ||
    detected === 'Int64' ||
    detected === 'Double' ||
    detected === 'Decimal128' ||
    detected === 'ObjectId'
  ) {
    return String(value);
  }
  const asQuery = toJSString({ v: value }) ?? '';
  // toJSString always produces a pretty printed document; take what is between
  // the field name and the closing brace.
  const match = /v:\s*([\s\S]*?)\s*\}\s*$/.exec(asQuery);
  return match ? match[1] : String(value);
}

export type ParsedValue =
  | { ok: true; value: unknown }
  | { ok: false; error: string };

/**
 * A number written out in full, read so that it keeps every digit, or
 * undefined when a double already holds it exactly.
 *
 * The parser reads numbers as doubles, which hold whole numbers up to 2^53
 * and about 15 significant digits. Past that `9007199254740993` is read as
 * its neighbour and matches a different document, and choosing a type
 * afterwards cannot bring the lost digit back. So a whole number past 2^53
 * is an Int64, or a Decimal128 when it is past an Int64 too, and a fraction
 * with more digits than a double keeps is a Decimal128.
 */
function readExactNumber(text: string): ParsedValue | undefined {
  if (/^-?\d+$/.test(text)) {
    if (Number.isSafeInteger(Number(text))) {
      return undefined;
    }
    const whole = BigInt(text);
    return {
      ok: true,
      value:
        BigInt.asIntN(64, whole) === whole
          ? Long.fromBigInt(whole)
          : Decimal128.fromString(text),
    };
  }
  const fraction = /^-?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i.exec(text);
  const significant = fraction?.[1].replace('.', '').replace(/^0+/, '');
  if (significant && significant.length > 15) {
    return { ok: true, value: Decimal128.fromString(text) };
  }
  return undefined;
}

/**
 * Parses one value written in shell syntax by wrapping it in a document and
 * handing it to the same parser the query bar uses.
 */
export function parseValueText(text: string): ParsedValue {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { ok: false, error: 'Value is empty' };
  }
  const exact = readExactNumber(trimmed);
  if (exact) {
    return exact;
  }
  try {
    const parsed = parseFilter(`{"__value": ${trimmed}}`) as Record<
      string,
      unknown
    >;
    if (parsed && '__value' in parsed) {
      return { ok: true, value: parsed.__value };
    }
  } catch (err) {
    // Text that opens with a bracket, a quote or a slash was an attempt at
    // syntax, so a failure to read it is a mistake worth reporting rather than
    // a string that happens to start with a brace. `{ oops` should be an
    // error; `don't` should not.
    if (/^[[{'"/]/.test(trimmed)) {
      return { ok: false, error: (err as Error).message };
    }
  }
  // Anything else is the text itself. `London` means 'London' without having
  // to be written that way, which is the point of the box holding plain text.
  // Numbers, booleans, ObjectId(…), ISODate(…) and regexes are still read as
  // themselves, because the parser takes those.
  return { ok: true, value: trimmed };
}

/** A value written the way the query bar writes it, with strings quoted. */
export function valueToShellText(value: unknown): string {
  if (value === undefined) {
    return '';
  }
  const asQuery = toJSString({ v: value }) ?? '';
  const match = /v:\s*([\s\S]*?)\s*\}\s*$/.exec(asQuery);
  return match ? match[1] : String(value);
}

/**
 * The text to show when a row changes operator.
 *
 * `in` takes a list, so the box shows one: picking it puts the brackets there,
 * with whatever was already written quoted inside them, rather than leaving a
 * list to be assembled by hand. Picking something else takes them away again.
 *
 * Only the text changes. Both shapes are read either way, so this is about
 * what the box looks like rather than what it will accept.
 */
export function valueTextForOperator(
  valueText: string,
  from: ConditionOperator,
  to: ConditionOperator,
  /** The value dragged into the row, when the box still shows it untouched. */
  knownValue?: unknown
): string {
  const wasList = from === 'in' || from === 'nin';
  const isList = to === 'in' || to === 'nin';
  if (wasList === isList) {
    return valueText;
  }

  if (isList) {
    // A known value keeps its type: a dragged "12" is a string, and reading
    // its text back would quietly turn it into the number 12.
    if (knownValue !== undefined && valueText === valueToText(knownValue)) {
      return `[${valueToShellText(knownValue)}]`;
    }
    const parsed = parseListText(valueText);
    if (!parsed.ok || !Array.isArray(parsed.value)) {
      // Nothing to carry over, so just show the empty list.
      return '[]';
    }
    return `[${parsed.value.map(valueToShellText).join(', ')}]`;
  }

  // Leaving a list behind: keep the values, drop the brackets.
  const parsed = parseListText(valueText);
  if (!parsed.ok || !Array.isArray(parsed.value)) {
    return valueText;
  }
  return parsed.value.map((value) => valueToText(value)).join(', ');
}

/**
 * The values for `in` and `not in`, which take a list rather than one value.
 *
 * Written as a list, as a bare set of values, or as a single value, since
 * switching an existing row to `in` should not break it.
 */
export function parseListText(text: string): ParsedValue {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { ok: false, error: 'Value is empty' };
  }

  // A list of bare values, like `[1, 2]`, is read without its brackets, value
  // by value, so that a long number in it keeps its digits.
  const bare = /^\[([^[\]{}()'"/]*)\]$/.exec(trimmed)?.[1];
  const bareList = bare?.trim() ? bare : undefined;

  // Any other explicit list is read as one, so `['a', 'b']` keeps working.
  if (trimmed.startsWith('[') && !bareList) {
    const parsed = parseValueText(trimmed);
    if (parsed.ok && Array.isArray(parsed.value)) {
      return parsed;
    }
  }

  // Otherwise the commas separate the values, and each is read the same way a
  // single value is: `a, b` is two strings, `1, 2` is two numbers.
  const parts = (bareList ?? trimmed)
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part !== '');
  if (parts.length === 0) {
    return { ok: false, error: 'Value is empty' };
  }

  const values: unknown[] = [];
  for (const part of parts) {
    const parsed = parseValueText(part);
    if (!parsed.ok) {
      return parsed;
    }
    values.push(parsed.value);
  }
  return { ok: true, value: values };
}

/**
 * Escapes the regex metacharacters, so that "contains" looks for the text as
 * written. `3.5` finds a literal dot rather than any character, which is what
 * the words on the operator promise.
 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * The text a "contains" row searches for.
 *
 * Every other operator reads its box as shell syntax, and a value dragged in
 * from a document arrives quoted, so a string is unwrapped rather than searched
 * for along with its quotes. Anything that is not a string is taken as written,
 * which is what lets a bare word be typed without quoting it.
 */
function containsText(valueText: string): string {
  const parsed = parseValueText(valueText);
  if (parsed.ok) {
    if (typeof parsed.value === 'string') {
      return parsed.value;
    }
    // A regex typed into a "contains" box is a misunderstanding, but its text
    // is still what was meant; the escaping below makes it literal.
    if (parsed.value instanceof RegExp) {
      return parsed.value.source;
    }
  }
  return valueText.trim();
}

/**
 * The value a row stands for: what was dragged in, while the box still shows
 * it untouched, and otherwise whatever the box now says.
 */
function readValue(row: ConditionRow): ParsedValue {
  if (hasUntouchedDraggedValue(row)) {
    return { ok: true, value: row.value };
  }
  return parseValueText(row.valueText);
}

/** True while the box still shows exactly what was dragged into it. */
function hasUntouchedDraggedValue(row: ConditionRow): boolean {
  return row.value !== undefined && row.valueText === valueToText(row.value);
}

/**
 * The list a row stands for.
 *
 * A value dragged in is one value whose type is known, so the list is built
 * around it rather than read back out of its text: a reference like
 * "1300932190" is a string, and reading the text would make it a number and
 * match nothing.
 */
function readListValue(row: ConditionRow): ParsedValue {
  if (hasUntouchedDraggedValue(row)) {
    return { ok: true, value: [row.value] };
  }
  return parseListText(row.valueText);
}

/** Casts what was read to the chosen type, if one was chosen. */
/**
 * Whether the type dropdown applies to this operator.
 *
 * `exists` reads no value at all, and `contains` is always a search for text,
 * so neither has a type to choose.
 */
export function takesTypedValue(operator: ConditionOperator): boolean {
  return !isValuelessOperator(operator) && operator !== 'contains';
}

/**
 * The value a row currently holds, for showing which type it is. Unlike the
 * compile path this never fails: a box mid-edit is simply not a value yet.
 */
export function conditionValue(row: ConditionRow): unknown {
  if (row.valueType) {
    return undefined;
  }
  const read =
    row.operator === 'in' || row.operator === 'nin'
      ? readListValue(row)
      : readValue(row);
  if (!read.ok) {
    return undefined;
  }
  // A list is as many values as it has, but they share a field and so a type;
  // the first is what the dropdown reports.
  return Array.isArray(read.value) ? read.value[0] : read.value;
}

function applyValueType(
  read: { ok: true; value: unknown },
  valueType: ValueType | undefined,
  isList: boolean
): ParsedValue {
  if (!valueType) {
    return read;
  }
  if (!isList) {
    return castValue(read.value, valueType);
  }
  const values = Array.isArray(read.value) ? read.value : [read.value];
  const cast: unknown[] = [];
  for (const value of values) {
    const one = castValue(value, valueType);
    if (!one.ok) {
      return one;
    }
    cast.push(one.value);
  }
  return { ok: true, value: cast };
}

// By its tag rather than instanceof, since a value dragged from a document
// was made by whichever copy of bson the document list uses.
function isRegularExpression(value: unknown): boolean {
  return (
    value instanceof RegExp ||
    (value as { _bsontype?: string } | null)?._bsontype === 'BSONRegExp'
  );
}

function conditionToFilterFragment(
  row: ConditionRow
): { field: string; value: unknown } | { error: string } {
  if (row.operator === 'exists') {
    return { field: row.field, value: { $exists: true } };
  }
  if (row.operator === 'notExists') {
    return { field: row.field, value: { $exists: false } };
  }

  if (row.operator === 'contains') {
    const text = containsText(row.valueText);
    if (text === '') {
      return { error: `${row.field}: Value is empty` };
    }
    return { field: row.field, value: new RegExp(escapeRegExp(text), 'i') };
  }

  const isList = row.operator === 'in' || row.operator === 'nin';
  const read = isList ? readListValue(row) : readValue(row);
  if (!read.ok) {
    return { error: `${row.field}: ${read.error}` };
  }

  // A chosen type is an instruction, so it is applied last and overrides both
  // what the text looked like and what was dragged in. For a list it applies
  // to each value in it, since they all sit in the same field.
  const parsed = applyValueType(read, row.valueType, isList);
  if (!parsed.ok) {
    return { error: `${row.field}: ${parsed.error}` };
  }

  switch (row.operator) {
    case 'eq':
      return { field: row.field, value: parsed.value };
    case 'ne':
      // The server refuses a regex as the argument to $ne. $not takes one,
      // and leaves out exactly the documents equality with it would match:
      // https://www.mongodb.com/docs/manual/reference/operator/query/not/#-not-and-regular-expressions
      return {
        field: row.field,
        value: isRegularExpression(parsed.value)
          ? { $not: parsed.value }
          : { $ne: parsed.value },
      };
    case 'in':
    case 'nin': {
      // A single value is accepted and wrapped, so that switching an existing
      // row to `in` does not immediately break it.
      const list = Array.isArray(parsed.value) ? parsed.value : [parsed.value];
      return { field: row.field, value: { [`$${row.operator}`]: list } };
    }
    case 'regex':
      return {
        field: row.field,
        value:
          parsed.value instanceof RegExp
            ? parsed.value
            : { $regex: parsed.value },
      };
    default:
      return {
        field: row.field,
        value: { [`$${row.operator}`]: parsed.value },
      };
  }
}

export type CompiledQuery = {
  filter: Record<string, unknown>;
  project: Record<string, number> | null;
  sort: Record<string, number> | null;
  skip: number | null;
  limit: number | null;
  /** One message per row that could not be compiled. */
  errors: string[];
};

function compileConditions(state: BuilderState): {
  filter: Record<string, unknown>;
  errors: string[];
} {
  const errors: string[] = [];
  const rows = state.conditions.filter((row) => row.enabled && row.field);
  const fragments: { field: string; value: unknown }[] = [];

  for (const row of rows) {
    const fragment = conditionToFilterFragment(row);
    if ('error' in fragment) {
      errors.push(fragment.error);
      continue;
    }
    fragments.push(fragment);
  }

  if (fragments.length === 0) {
    return { filter: {}, errors };
  }

  if (state.match === 'or') {
    return {
      filter: {
        $or: fragments.map(({ field, value }) => ({ [field]: value })),
      },
      errors,
    };
  }

  // Matching all: fold into one document where possible, which is the shape a
  // person would write by hand. Repeated fields cannot be folded, so those fall
  // back to an explicit $and.
  const seen = new Set<string>();
  const hasRepeatedField = fragments.some(({ field }) => {
    if (seen.has(field)) {
      return true;
    }
    seen.add(field);
    return false;
  });

  if (hasRepeatedField) {
    return {
      filter: {
        $and: fragments.map(({ field, value }) => ({ [field]: value })),
      },
      errors,
    };
  }

  const filter: Record<string, unknown> = Object.create(null) as Record<
    string,
    unknown
  >;
  for (const { field, value } of fragments) {
    filter[field] = value;
  }
  return { filter, errors };
}

function compileCount(
  text: string,
  label: string
): {
  value: number | null;
  error?: string;
} {
  const trimmed = text.trim();
  if (trimmed === '') {
    return { value: null };
  }
  const parsed = Number(trimmed);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return { value: null, error: `${label} must be a whole number` };
  }
  return { value: parsed };
}

export function compileBuilderState(state: BuilderState): CompiledQuery {
  // A section contributes nothing once every row in it is switched off, which
  // is what the tick on its header now does, so there is no separate section
  // level flag to consult.
  const { filter, errors } = compileConditions(state);

  const projectionRows = state.projections.filter(
    (row) => row.enabled && row.field
  );
  const sortRows = state.sorts.filter((row) => row.enabled && row.field);

  const project = projectionRows.length
    ? Object.fromEntries(
        projectionRows.map((row) => [row.field, row.mode === 'include' ? 1 : 0])
      )
    : null;

  const sort = sortRows.length
    ? Object.fromEntries(
        sortRows.map((row) => [row.field, row.direction === 'asc' ? 1 : -1])
      )
    : null;

  const skip = compileCount(state.skip, 'Skip');
  const limit = compileCount(state.limit, 'Limit');
  const allErrors = [...errors];
  if (skip.error) {
    allErrors.push(skip.error);
  }
  if (limit.error) {
    allErrors.push(limit.error);
  }

  return {
    filter,
    project,
    sort,
    skip: skip.value,
    limit: limit.value,
    errors: allErrors,
  };
}

/** The compiled query rendered the way the query bar shows it. */
export function compiledQueryToText(compiled: CompiledQuery): {
  filter: string;
  project: string;
  sort: string;
} {
  return {
    filter: toJSString(compiled.filter) ?? '{}',
    project: compiled.project ? toJSString(compiled.project) ?? '' : '',
    sort: compiled.sort ? toJSString(compiled.sort) ?? '' : '',
  };
}

/**
 * The query to hand to the query bar for a compiled builder state.
 *
 * Every property is always present. A property left out of the query is not
 * cleared when the query is applied, it keeps whatever was applied before, so
 * removing the last projection row would otherwise leave the old projection
 * in effect. `undefined` is what clears a property.
 */
export function compiledQueryToAppliedQuery(compiled: CompiledQuery): {
  filter: Record<string, unknown>;
  project: Record<string, number> | undefined;
  sort: Record<string, number> | undefined;
  skip: number | undefined;
  limit: number | undefined;
} {
  return {
    filter: compiled.filter,
    project: compiled.project ?? undefined,
    sort: compiled.sort ?? undefined,
    skip: compiled.skip ?? undefined,
    limit: compiled.limit ?? undefined,
  };
}

/**
 * The parts of a query the builder writes. Collation, hint and maxTimeMS are
 * set in the query bar alone, so changing them there leaves the builder's
 * query as it was.
 */
const BUILDER_QUERY_PARTS = [
  'filter',
  'project',
  'sort',
  'skip',
  'limit',
] as const;

export type QueryBarQuery = Partial<
  Record<(typeof BUILDER_QUERY_PARTS)[number], unknown>
>;

/**
 * One part of a query as shell text, for comparing the builder's query with
 * the query bar's.
 *
 * The bar parses whatever is written into it, so it never holds the builder's
 * own objects, but written back out the two read the same. An empty projection
 * or sort comes back from the bar as null and an empty skip or limit as 0, so
 * those count as absent.
 */
function queryPartText(value: unknown): string {
  if (value === undefined || value === null || value === 0) {
    return '';
  }
  return toJSString(value, 0) ?? '';
}

/**
 * Whether the query bar still shows the builder's query. It stops doing so
 * once the query is edited in the bar by hand, or replaced from anywhere else
 * that writes to the bar, such as the query history.
 */
export function doesQueryBarShow(
  barQuery: QueryBarQuery,
  compiled: CompiledQuery
): boolean {
  const builderQuery = compiledQueryToAppliedQuery(compiled);
  return BUILDER_QUERY_PARTS.every(
    (part) =>
      queryPartText(barQuery[part]) === queryPartText(builderQuery[part])
  );
}
