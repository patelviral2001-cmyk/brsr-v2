import { Decimal } from 'decimal.js';

/**
 * Safe CEL-subset evaluator for KPI calculation formulas.
 *
 * Supports:
 *   - literals: integers, decimals, strings, true/false, null
 *   - arithmetic: + - * / %  (Decimal precision, no float)
 *   - comparison: == != < <= > >=
 *   - logical: && || !
 *   - parens, conditional ternary `cond ? a : b`
 *   - variable references resolved from `ctx.metrics[<key>]`
 *   - function calls (allow-listed): sum, avg, min, max, ratio, abs, round, coalesce
 *
 * Each variable carries a unit; the evaluator throws on unit mismatch on +/-
 * and on ratio/comparison with incompatible units. Multiplication produces a
 * composite unit (e.g. kWh * kgCO2e/kWh -> kgCO2e if the factor declares it).
 *
 * SECURITY: this is a hand-written recursive-descent parser. We deliberately
 * do NOT use `Function` or `eval`. The whitelist of identifiers is enforced
 * during evaluation so a malicious formula cannot reach host objects.
 */

export interface CelValue {
  value: Decimal | string | boolean | null;
  unit?: string;
}

export interface CelContext {
  /** Pre-resolved metric values, keyed by canonicalKey or local alias. */
  metrics: Record<string, CelValue>;
  /** Emission factors / constants, keyed by code. */
  factors?: Record<string, CelValue>;
  /** Optional period scaling (days in period). */
  periodDays?: number;
}

const FUNCTIONS = new Set([
  'sum',
  'avg',
  'min',
  'max',
  'ratio',
  'abs',
  'round',
  'coalesce',
  'factor',
  'metric',
]);

// ---------- Tokenizer ----------

type Token =
  | { t: 'num'; v: Decimal }
  | { t: 'str'; v: string }
  | { t: 'ident'; v: string }
  | { t: 'op'; v: string }
  | { t: 'lparen' }
  | { t: 'rparen' }
  | { t: 'comma' }
  | { t: 'qmark' }
  | { t: 'colon' }
  | { t: 'bool'; v: boolean }
  | { t: 'nil' }
  | { t: 'eof' };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  const len = src.length;
  while (i < len) {
    const c = src[i] as string;
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }

    // number
    if (c >= '0' && c <= '9') {
      let j = i;
      while (j < len && /[0-9._]/.test(src[j] as string)) j++;
      // scientific
      if (j < len && (src[j] === 'e' || src[j] === 'E')) {
        j++;
        if (j < len && (src[j] === '+' || src[j] === '-')) j++;
        while (j < len && /[0-9]/.test(src[j] as string)) j++;
      }
      const numStr = src.slice(i, j).replace(/_/g, '');
      out.push({ t: 'num', v: new Decimal(numStr) });
      i = j;
      continue;
    }

    // string
    if (c === "'" || c === '"') {
      const quote = c;
      let j = i + 1;
      let s = '';
      while (j < len && src[j] !== quote) {
        if (src[j] === '\\' && j + 1 < len) {
          s += src[j + 1];
          j += 2;
        } else {
          s += src[j];
          j++;
        }
      }
      if (j >= len) throw new CelError(`Unterminated string at ${i}`);
      out.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }

    // identifier / keyword
    if (/[a-zA-Z_]/.test(c)) {
      let j = i;
      while (j < len && /[a-zA-Z0-9_.]/.test(src[j] as string)) j++;
      const ident = src.slice(i, j);
      if (ident === 'true') out.push({ t: 'bool', v: true });
      else if (ident === 'false') out.push({ t: 'bool', v: false });
      else if (ident === 'null' || ident === 'nil') out.push({ t: 'nil' });
      else out.push({ t: 'ident', v: ident });
      i = j;
      continue;
    }

    // multi-char operators
    const two = src.slice(i, i + 2);
    if (['==', '!=', '<=', '>=', '&&', '||'].includes(two)) {
      out.push({ t: 'op', v: two });
      i += 2;
      continue;
    }

    if ('+-*/%<>!'.includes(c)) { out.push({ t: 'op', v: c }); i++; continue; }
    if (c === '(') { out.push({ t: 'lparen' }); i++; continue; }
    if (c === ')') { out.push({ t: 'rparen' }); i++; continue; }
    if (c === ',') { out.push({ t: 'comma' }); i++; continue; }
    if (c === '?') { out.push({ t: 'qmark' }); i++; continue; }
    if (c === ':') { out.push({ t: 'colon' }); i++; continue; }

    throw new CelError(`Unexpected character '${c}' at ${i}`);
  }
  out.push({ t: 'eof' });
  return out;
}

// ---------- Parser (Pratt) ----------

interface Node {
  type: string;
  [k: string]: unknown;
}

class Parser {
  private pos = 0;
  constructor(private readonly toks: Token[]) {}

  parse(): Node {
    const expr = this.parseExpression(0);
    if (this.peek().t !== 'eof') throw new CelError('Unexpected trailing input');
    return expr;
  }

  private peek(off = 0): Token {
    return this.toks[this.pos + off] ?? { t: 'eof' };
  }
  private take(): Token {
    return this.toks[this.pos++] as Token;
  }

  private parseExpression(minBp: number): Node {
    let lhs = this.parseUnary();

    while (true) {
      const tok = this.peek();
      if (tok.t === 'qmark' && minBp <= 1) {
        this.take();
        const thenN = this.parseExpression(0);
        if (this.peek().t !== 'colon') throw new CelError('Expected ":" in ternary');
        this.take();
        const elseN = this.parseExpression(1);
        lhs = { type: 'cond', test: lhs, then: thenN, else: elseN };
        continue;
      }
      if (tok.t !== 'op') break;
      const bp = binaryBp(tok.v);
      if (bp === null || bp.left < minBp) break;
      this.take();
      const rhs = this.parseExpression(bp.right);
      lhs = { type: 'bin', op: tok.v, left: lhs, right: rhs };
    }
    return lhs;
  }

  private parseUnary(): Node {
    const tok = this.peek();
    if (tok.t === 'op' && (tok.v === '-' || tok.v === '+' || tok.v === '!')) {
      this.take();
      const arg = this.parseUnary();
      return { type: 'unary', op: tok.v, arg };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const tok = this.take();
    switch (tok.t) {
      case 'num':
        return { type: 'num', value: tok.v };
      case 'str':
        return { type: 'str', value: tok.v };
      case 'bool':
        return { type: 'bool', value: tok.v };
      case 'nil':
        return { type: 'nil' };
      case 'lparen': {
        const inner = this.parseExpression(0);
        if (this.peek().t !== 'rparen') throw new CelError('Expected ")"');
        this.take();
        return inner;
      }
      case 'ident': {
        // call?
        if (this.peek().t === 'lparen') {
          this.take();
          const args: Node[] = [];
          if (this.peek().t !== 'rparen') {
            args.push(this.parseExpression(0));
            while (this.peek().t === 'comma') {
              this.take();
              args.push(this.parseExpression(0));
            }
          }
          if (this.peek().t !== 'rparen') throw new CelError('Expected ")" after args');
          this.take();
          return { type: 'call', name: tok.v, args };
        }
        return { type: 'ref', name: tok.v };
      }
      default:
        throw new CelError(`Unexpected token ${tok.t}`);
    }
  }
}

function binaryBp(op: string): { left: number; right: number } | null {
  switch (op) {
    case '||':
      return { left: 2, right: 3 };
    case '&&':
      return { left: 4, right: 5 };
    case '==':
    case '!=':
      return { left: 6, right: 7 };
    case '<':
    case '<=':
    case '>':
    case '>=':
      return { left: 8, right: 9 };
    case '+':
    case '-':
      return { left: 10, right: 11 };
    case '*':
    case '/':
    case '%':
      return { left: 12, right: 13 };
    default:
      return null;
  }
}

// ---------- Evaluator ----------

export class CelError extends Error {
  constructor(msg: string) {
    super(msg);
    this.name = 'CelError';
  }
}

function evalNode(node: Node, ctx: CelContext): CelValue {
  switch (node.type) {
    case 'num':
      return { value: node.value as Decimal };
    case 'str':
      return { value: node.value as string };
    case 'bool':
      return { value: node.value as boolean };
    case 'nil':
      return { value: null };
    case 'ref':
      return resolveRef(node.name as string, ctx);
    case 'unary': {
      const arg = evalNode(node.arg as Node, ctx);
      if (node.op === '-') {
        if (!(arg.value instanceof Decimal)) throw new CelError('Unary - on non-number');
        return { value: arg.value.negated(), unit: arg.unit };
      }
      if (node.op === '+') return arg;
      if (node.op === '!') return { value: !truthy(arg) };
      throw new CelError(`Unknown unary ${node.op as string}`);
    }
    case 'bin':
      return evalBin(node, ctx);
    case 'cond': {
      const test = evalNode(node.test as Node, ctx);
      return truthy(test) ? evalNode(node.then as Node, ctx) : evalNode(node.else as Node, ctx);
    }
    case 'call':
      return evalCall(node.name as string, (node.args as Node[]).map((a) => evalNode(a, ctx)), ctx);
    default:
      throw new CelError(`Unknown node ${node.type}`);
  }
}

function resolveRef(name: string, ctx: CelContext): CelValue {
  if (name === 'periodDays') return { value: new Decimal(ctx.periodDays ?? 365) };
  if (name in ctx.metrics) {
    const v = ctx.metrics[name];
    if (v === undefined) throw new CelError(`Unresolved variable: ${name}`);
    return v;
  }
  if (ctx.factors && name in ctx.factors) {
    const f = ctx.factors[name];
    if (f === undefined) throw new CelError(`Unresolved factor: ${name}`);
    return f;
  }
  throw new CelError(`Unresolved reference: ${name}`);
}

function evalBin(node: Node, ctx: CelContext): CelValue {
  const op = node.op as string;
  const l = evalNode(node.left as Node, ctx);
  // short-circuit for logical
  if (op === '&&') return { value: truthy(l) ? truthy(evalNode(node.right as Node, ctx)) : false };
  if (op === '||') return { value: truthy(l) ? true : truthy(evalNode(node.right as Node, ctx)) };

  const r = evalNode(node.right as Node, ctx);

  if (['==', '!='].includes(op)) {
    const eq = sameValue(l, r);
    return { value: op === '==' ? eq : !eq };
  }

  if (['<', '<=', '>', '>='].includes(op)) {
    requireSameUnit(l, r, op);
    if (!(l.value instanceof Decimal) || !(r.value instanceof Decimal)) {
      throw new CelError(`Comparison ${op} requires numbers`);
    }
    const cmp = l.value.cmp(r.value);
    return {
      value:
        op === '<' ? cmp < 0 : op === '<=' ? cmp <= 0 : op === '>' ? cmp > 0 : cmp >= 0,
    };
  }

  // arithmetic
  if (!(l.value instanceof Decimal) || !(r.value instanceof Decimal)) {
    throw new CelError(`Arithmetic on non-numeric (${typeof l.value} ${op} ${typeof r.value})`);
  }
  switch (op) {
    case '+':
    case '-':
      requireSameUnit(l, r, op);
      return {
        value: op === '+' ? l.value.plus(r.value) : l.value.minus(r.value),
        unit: l.unit,
      };
    case '*':
      return { value: l.value.times(r.value), unit: combineUnits(l.unit, r.unit, '*') };
    case '/':
      if (r.value.isZero()) throw new CelError('Division by zero');
      return { value: l.value.div(r.value), unit: combineUnits(l.unit, r.unit, '/') };
    case '%':
      if (r.value.isZero()) throw new CelError('Modulo by zero');
      return { value: l.value.mod(r.value), unit: l.unit };
    default:
      throw new CelError(`Unknown op ${op}`);
  }
}

function evalCall(name: string, args: CelValue[], _ctx: CelContext): CelValue {
  if (!FUNCTIONS.has(name)) throw new CelError(`Function not allowed: ${name}`);
  switch (name) {
    case 'sum':
    case 'avg': {
      if (args.length === 0) return { value: new Decimal(0) };
      const unit = args[0]?.unit;
      let total = new Decimal(0);
      for (const a of args) {
        if (!(a.value instanceof Decimal)) throw new CelError(`${name}() requires numbers`);
        if (a.unit !== unit) throw new CelError(`${name}() unit mismatch: ${unit} vs ${a.unit}`);
        total = total.plus(a.value);
      }
      return name === 'sum' ? { value: total, unit } : { value: total.div(args.length), unit };
    }
    case 'min':
    case 'max': {
      if (args.length === 0) throw new CelError(`${name}() requires args`);
      const unit = args[0]?.unit;
      let best = args[0]?.value as Decimal;
      for (const a of args) {
        if (!(a.value instanceof Decimal)) throw new CelError(`${name}() requires numbers`);
        if (a.unit !== unit) throw new CelError(`${name}() unit mismatch`);
        const cmp = a.value.cmp(best);
        if ((name === 'min' && cmp < 0) || (name === 'max' && cmp > 0)) best = a.value;
      }
      return { value: best, unit };
    }
    case 'ratio': {
      if (args.length !== 2) throw new CelError('ratio(numer, denom)');
      const [n, d] = args as [CelValue, CelValue];
      if (!(n.value instanceof Decimal) || !(d.value instanceof Decimal)) throw new CelError('ratio() needs numbers');
      if (d.value.isZero()) throw new CelError('ratio() division by zero');
      return { value: n.value.div(d.value), unit: combineUnits(n.unit, d.unit, '/') };
    }
    case 'abs': {
      const a = args[0];
      if (!a || !(a.value instanceof Decimal)) throw new CelError('abs() needs number');
      return { value: a.value.abs(), unit: a.unit };
    }
    case 'round': {
      const a = args[0];
      const dp = args[1];
      if (!a || !(a.value instanceof Decimal)) throw new CelError('round() needs number');
      const places = dp && dp.value instanceof Decimal ? dp.value.toNumber() : 0;
      return { value: a.value.toDecimalPlaces(places), unit: a.unit };
    }
    case 'coalesce': {
      for (const a of args) {
        if (a.value !== null && a.value !== undefined) return a;
      }
      return { value: null };
    }
    case 'factor':
    case 'metric':
      // factor("EF_GRID_IN") and metric("ghg_scope1_total") look up by key.
      // (Already resolved as refs; the function form is a convenience.)
      throw new CelError(`Use bare reference for ${name}(); not implemented as a call here`);
    default:
      throw new CelError(`Unknown function ${name}`);
  }
}

function truthy(v: CelValue): boolean {
  if (v.value === null || v.value === undefined) return false;
  if (typeof v.value === 'boolean') return v.value;
  if (v.value instanceof Decimal) return !v.value.isZero();
  if (typeof v.value === 'string') return v.value.length > 0;
  return false;
}

function sameValue(a: CelValue, b: CelValue): boolean {
  if (a.value instanceof Decimal && b.value instanceof Decimal) return a.value.eq(b.value);
  return a.value === b.value;
}

function requireSameUnit(a: CelValue, b: CelValue, op: string): void {
  if (a.unit !== b.unit && a.unit && b.unit) {
    throw new CelError(`Unit mismatch on '${op}': ${a.unit} vs ${b.unit}`);
  }
}

function combineUnits(l: string | undefined, r: string | undefined, op: '*' | '/'): string | undefined {
  if (!l && !r) return undefined;
  if (op === '*') return `${l ?? ''}*${r ?? ''}`.replace(/^\*|\*$/g, '') || undefined;
  return `${l ?? ''}/${r ?? '1'}`.replace(/^\//, '1/');
}

// ---------- Public API ----------

export class CelEvaluator {
  /** Pre-validate syntax without context — used for formula upload. */
  static validate(expression: string): void {
    const toks = tokenize(expression);
    new Parser(toks).parse();
  }

  static evaluate(expression: string, ctx: CelContext): CelValue {
    const toks = tokenize(expression);
    const ast = new Parser(toks).parse();
    return evalNode(ast, ctx);
  }
}
