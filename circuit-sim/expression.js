var ExpressionEvaluator = (function() {

  var TOKEN = {
    EOF: 0,
    IDENT: 1,
    NUMBER: 2,
    LBRACK: 3,
    RBRACK: 4,
    LBRACE: 5,
    RBRACE: 6,
    LPAREN: 7,
    RPAREN: 8,
    NOT: 9,
    AND: 10,
    OR: 11,
    XOR: 12,
    LT: 13,
    GT: 14,
    LE: 15,
    GE: 16,
    EQ: 17,
    NE: 18,
    PLUS: 19,
    MINUS: 20,
    MUL: 21,
    COMMA: 22,
    COLON: 23,
    HASH: 24,
    TICK: 25
  };

  function Lexer(input) {
    this.input = input;
    this.pos = 0;
    this.tok = TOKEN.EOF;
    this.tokValue = null;
    this.tokStart = 0;
  }

  Lexer.prototype.next = function() {
    while (this.pos < this.input.length && /\s/.test(this.input[this.pos])) {
      this.pos++;
    }

    this.tokStart = this.pos;

    if (this.pos >= this.input.length) {
      this.tok = TOKEN.EOF;
      return;
    }

    var ch = this.input[this.pos];

    if (ch === "'") {
      this.tok = TOKEN.TICK;
      this.pos++;
      return;
    }

    if (ch === '{') { this.tok = TOKEN.LBRACE; this.pos++; return; }
    if (ch === '}') { this.tok = TOKEN.RBRACE; this.pos++; return; }
    if (ch === '[') { this.tok = TOKEN.LBRACK; this.pos++; return; }
    if (ch === ']') { this.tok = TOKEN.RBRACK; this.pos++; return; }
    if (ch === '(') { this.tok = TOKEN.LPAREN; this.pos++; return; }
    if (ch === ')') { this.tok = TOKEN.RPAREN; this.pos++; return; }
    if (ch === '~') { this.tok = TOKEN.NOT; this.pos++; return; }
    if (ch === '&') { this.tok = TOKEN.AND; this.pos++; return; }
    if (ch === '|') { this.tok = TOKEN.OR; this.pos++; return; }
    if (ch === '^') { this.tok = TOKEN.XOR; this.pos++; return; }
    if (ch === '+') { this.tok = TOKEN.PLUS; this.pos++; return; }
    if (ch === '-') { this.tok = TOKEN.MINUS; this.pos++; return; }
    if (ch === '*') { this.tok = TOKEN.MUL; this.pos++; return; }
    if (ch === ',') { this.tok = TOKEN.COMMA; this.pos++; return; }
    if (ch === ':') { this.tok = TOKEN.COLON; this.pos++; return; }
    if (ch === '#') { this.tok = TOKEN.HASH; this.pos++; return; }

    if (ch === '=') {
      this.pos++;
      if (this.pos < this.input.length && this.input[this.pos] === '=') {
        this.tok = TOKEN.EQ;
        this.pos++;
        return;
      }
      throw new Error('Unexpected character: ' + ch);
    }

    if (ch === '!') {
      this.pos++;
      if (this.pos < this.input.length && this.input[this.pos] === '=') {
        this.tok = TOKEN.NE;
        this.pos++;
        return;
      }
      throw new Error('Unexpected character: ' + ch);
    }

    if (ch === '>') {
      this.pos++;
      if (this.pos < this.input.length && this.input[this.pos] === '=') {
        this.tok = TOKEN.GE;
        this.pos++;
        return;
      }
      this.tok = TOKEN.GT;
      return;
    }

    if (ch === '<') {
      this.pos++;
      if (this.pos < this.input.length && this.input[this.pos] === '=') {
        this.tok = TOKEN.LE;
        this.pos++;
        return;
      }
      this.tok = TOKEN.LT;
      return;
    }

    if (/\d/.test(ch)) {
      var numStart = this.pos;
      while (this.pos < this.input.length && /[\da-zA-Z_]/.test(this.input[this.pos])) {
        this.pos++;
      }
      this.tokValue = this.input.substring(numStart, this.pos);
      this.tok = TOKEN.NUMBER;
      return;
    }

    if (/[a-zA-Z_]/.test(ch)) {
      var idStart = this.pos;
      while (this.pos < this.input.length && /[\w$]/.test(this.input[this.pos])) {
        this.pos++;
      }
      this.tokValue = this.input.substring(idStart, this.pos);
      this.tok = TOKEN.IDENT;
      return;
    }

    throw new Error('Unexpected character: ' + ch);
  };

  Lexer.prototype.expect = function(tok) {
    if (this.tok !== tok) {
      throw new Error('Expected token ' + tok + ' but got ' + this.tok);
    }
    this.next();
  };

  function Parser(input) {
    this.lexer = new Lexer(input);
    this.lexer.next();
    this.referencedSignals = {};
  }

  Parser.prototype.parse = function() {
    var ast = this.parseOr();
    if (this.lexer.tok !== TOKEN.EOF) {
      throw new Error('Unexpected input at position ' + this.lexer.tokStart);
    }
    return ast;
  };

  Parser.prototype.parseOr = function() {
    var left = this.parseXor();
    while (this.lexer.tok === TOKEN.OR) {
      this.lexer.next();
      var right = this.parseXor();
      left = { type: 'binop', op: '|', left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseXor = function() {
    var left = this.parseAnd();
    while (this.lexer.tok === TOKEN.XOR) {
      this.lexer.next();
      var right = this.parseAnd();
      left = { type: 'binop', op: '^', left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseAnd = function() {
    var left = this.parseEquality();
    while (this.lexer.tok === TOKEN.AND) {
      this.lexer.next();
      var right = this.parseEquality();
      left = { type: 'binop', op: '&', left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseEquality = function() {
    var left = this.parseComparison();
    while (this.lexer.tok === TOKEN.EQ || this.lexer.tok === TOKEN.NE) {
      var op = this.lexer.tok === TOKEN.EQ ? '==' : '!=';
      this.lexer.next();
      var right = this.parseComparison();
      left = { type: 'binop', op: op, left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseComparison = function() {
    var left = this.parseAdditive();
    while (this.lexer.tok === TOKEN.LT || this.lexer.tok === TOKEN.GT ||
           this.lexer.tok === TOKEN.LE || this.lexer.tok === TOKEN.GE) {
      var op;
      switch (this.lexer.tok) {
        case TOKEN.LT: op = '<'; break;
        case TOKEN.GT: op = '>'; break;
        case TOKEN.LE: op = '<='; break;
        case TOKEN.GE: op = '>='; break;
      }
      this.lexer.next();
      var right = this.parseAdditive();
      left = { type: 'binop', op: op, left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseAdditive = function() {
    var left = this.parseMultiplicative();
    while (this.lexer.tok === TOKEN.PLUS || this.lexer.tok === TOKEN.MINUS) {
      var op = this.lexer.tok === TOKEN.PLUS ? '+' : '-';
      this.lexer.next();
      var right = this.parseMultiplicative();
      left = { type: 'binop', op: op, left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseMultiplicative = function() {
    var left = this.parseUnary();
    while (this.lexer.tok === TOKEN.MUL) {
      this.lexer.next();
      var right = this.parseUnary();
      left = { type: 'binop', op: '*', left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseUnary = function() {
    if (this.lexer.tok === TOKEN.NOT) {
      this.lexer.next();
      var operand = this.parseUnary();
      return { type: 'unop', op: '~', operand: operand };
    }
    if (this.lexer.tok === TOKEN.MINUS) {
      this.lexer.next();
      var operand = this.parseUnary();
      return { type: 'unop', op: '-', operand: operand };
    }
    return this.parsePrimary();
  };

  Parser.prototype.parsePrimary = function() {
    if (this.lexer.tok === TOKEN.LPAREN) {
      this.lexer.next();
      var expr = this.parseOr();
      this.lexer.expect(TOKEN.RPAREN);
      return expr;
    }

    if (this.lexer.tok === TOKEN.LBRACE) {
      return this.parseConcat();
    }

    if (this.lexer.tok === TOKEN.NUMBER) {
      return this.parseNumber();
    }

    if (this.lexer.tok === TOKEN.IDENT) {
      return this.parseSignal();
    }

    throw new Error('Unexpected token at position ' + this.lexer.tokStart);
  };

  Parser.prototype.parseNumber = function() {
    var numStr = this.lexer.tokValue;
    this.lexer.next();

    if (this.lexer.tok === TOKEN.TICK) {
      this.lexer.next();
      var base = 10;
      if (this.lexer.tok === TOKEN.IDENT || this.lexer.tok === TOKEN.NUMBER) {
        var radixChar = this.lexer.tokValue.toLowerCase();
        if (radixChar === 'h' || radixChar === 'd' || radixChar === 'b' || radixChar === 'o') {
          this.lexer.next();
          if (radixChar === 'h') base = 16;
          else if (radixChar === 'b') base = 2;
          else if (radixChar === 'o') base = 8;
        }
      }
      if (this.lexer.tok !== TOKEN.NUMBER && this.lexer.tok !== TOKEN.IDENT) {
        throw new Error('Expected number after base specifier');
      }
      var valStr = this.lexer.tokValue;
      this.lexer.next();
      var width = parseInt(numStr, 10);
      var value = parseInt(valStr, base);
      return { type: 'literal', value: value, width: width };
    }

    var value = parseInt(numStr, 10);
    return { type: 'literal', value: value, width: Math.max(1, 32 - Math.clz32(value || 1)) };
  };

  Parser.prototype.parseSignal = function() {
    var name = this.lexer.tokValue;
    this.lexer.next();

    this.referencedSignals[name] = true;

    if (this.lexer.tok === TOKEN.LBRACK) {
      this.lexer.next();
      if (this.lexer.tok !== TOKEN.NUMBER) {
        throw new Error('Expected bit index');
      }
      var bitIdx = parseInt(this.lexer.tokValue, 10);
      this.lexer.next();

      var highIdx = bitIdx;
      var lowIdx = bitIdx;

      if (this.lexer.tok === TOKEN.COLON) {
        this.lexer.next();
        if (this.lexer.tok !== TOKEN.NUMBER) {
          throw new Error('Expected bit index');
        }
        lowIdx = parseInt(this.lexer.tokValue, 10);
        this.lexer.next();
      }

      this.lexer.expect(TOKEN.RBRACK);
      return { type: 'signal', name: name, bitHigh: highIdx, bitLow: lowIdx };
    }

    return { type: 'signal', name: name };
  };

  Parser.prototype.parseConcat = function() {
    this.lexer.expect(TOKEN.LBRACE);
    var parts = [];

    while (this.lexer.tok !== TOKEN.RBRACE) {
      var expr = this.parseOr();
      parts.push(expr);
      if (this.lexer.tok === TOKEN.COMMA) {
        this.lexer.next();
      } else if (this.lexer.tok !== TOKEN.RBRACE) {
        throw new Error('Expected comma or closing brace');
      }
    }

    this.lexer.expect(TOKEN.RBRACE);
    return { type: 'concat', parts: parts };
  };

  function Evaluator() {
    this.signalValues = {};
  }

  Evaluator.prototype.eval = function(ast, signalValues) {
    this.signalValues = signalValues || {};
    var result = this.evalNode(ast);
    return result;
  };

  Evaluator.prototype.evalNode = function(node) {
    switch (node.type) {
      case 'literal':
        return { value: node.value, width: node.width };

      case 'signal':
        return this.evalSignal(node);

      case 'unop':
        return this.evalUnop(node);

      case 'binop':
        return this.evalBinop(node);

      case 'concat':
        return this.evalConcat(node);

      default:
        throw new Error('Unknown node type: ' + node.type);
    }
  };

  Evaluator.prototype.evalSignal = function(node) {
    var sigValue = this.signalValues[node.name];
    if (sigValue === undefined) {
      throw new Error('Signal not found: ' + node.name);
    }

    var value = sigValue.value;
    var width = sigValue.width;

    if (node.bitHigh !== undefined) {
      var high = node.bitHigh;
      var low = node.bitLow;
      if (high < low) {
        var tmp = high; high = low; low = tmp;
      }

      var maskWidth = high - low + 1;
      var mask = ((1 << maskWidth) - 1) << low;
      value = (value & mask) >> low;
      width = maskWidth;
    }

    return { value: value, width: width };
  };

  Evaluator.prototype.evalUnop = function(node) {
    var operand = this.evalNode(node.operand);
    var value = operand.value;
    var width = operand.width;

    switch (node.op) {
      case '~':
        var mask = width >= 32 ? 0xffffffff : ((1 << width) - 1);
        return { value: (~value) & mask, width: width };
      case '-':
        return { value: -value, width: width + 1 };
      default:
        throw new Error('Unknown unary operator: ' + node.op);
    }
  };

  Evaluator.prototype.evalBinop = function(node) {
    var left = this.evalNode(node.left);
    var right = this.evalNode(node.right);
    var maxWidth = Math.max(left.width, right.width);

    var lVal = left.value;
    var rVal = right.value;
    var result;
    var resultWidth;

    switch (node.op) {
      case '&':
        result = lVal & rVal;
        resultWidth = maxWidth;
        break;
      case '|':
        result = lVal | rVal;
        resultWidth = maxWidth;
        break;
      case '^':
        result = lVal ^ rVal;
        resultWidth = maxWidth;
        break;
      case '+':
        result = lVal + rVal;
        resultWidth = maxWidth + 1;
        break;
      case '-':
        result = lVal - rVal;
        resultWidth = maxWidth + 1;
        break;
      case '*':
        result = lVal * rVal;
        resultWidth = left.width + right.width;
        break;
      case '==':
        result = lVal === rVal ? 1 : 0;
        resultWidth = 1;
        break;
      case '!=':
        result = lVal !== rVal ? 1 : 0;
        resultWidth = 1;
        break;
      case '<':
        result = lVal < rVal ? 1 : 0;
        resultWidth = 1;
        break;
      case '>':
        result = lVal > rVal ? 1 : 0;
        resultWidth = 1;
        break;
      case '<=':
        result = lVal <= rVal ? 1 : 0;
        resultWidth = 1;
        break;
      case '>=':
        result = lVal >= rVal ? 1 : 0;
        resultWidth = 1;
        break;
      default:
        throw new Error('Unknown binary operator: ' + node.op);
    }

    if (resultWidth < 32) {
      result = result & ((1 << resultWidth) - 1);
    }

    return { value: result, width: resultWidth };
  };

  Evaluator.prototype.evalConcat = function(node) {
    var result = 0;
    var totalWidth = 0;

    for (var i = 0; i < node.parts.length; i++) {
      var part = this.evalNode(node.parts[i]);
      result = (result << part.width) | (part.value & ((1 << part.width) - 1));
      totalWidth += part.width;
    }

    return { value: result, width: totalWidth };
  };

  function parseExpression(expr) {
    var parser = new Parser(expr);
    try {
      var ast = parser.parse();
      return {
        success: true,
        ast: ast,
        referencedSignals: Object.keys(parser.referencedSignals)
      };
    } catch (e) {
      return {
        success: false,
        error: e.message,
        referencedSignals: Object.keys(parser.referencedSignals)
      };
    }
  }

  function evaluateExpression(ast, signalValues) {
    var evaluator = new Evaluator();
    try {
      var result = evaluator.eval(ast, signalValues);
      return {
        success: true,
        value: result.value,
        width: result.width
      };
    } catch (e) {
      return {
        success: false,
        error: e.message
      };
    }
  }

  return {
    parse: parseExpression,
    evaluate: evaluateExpression
  };

})();
