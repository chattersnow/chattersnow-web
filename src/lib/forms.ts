/**
 * What a form parser answers. `field` is optional and additive (#1082 Phase 2):
 * a parser that knows which input was at fault names it, so a caller can show
 * the message against that field rather than only at the top of the form.
 * Parsers that do not name one behave exactly as they did.
 */
export type ParseResult<T> = { data: T } | { error: string; field?: string };
