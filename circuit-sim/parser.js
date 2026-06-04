var CircuitParser = (function() {

  var TOKEN_TYPES = {
    NUMBER: 'NUMBER',
    IDENT: 'IDENT',
    LBRACE: '{',
    RBRACE: '}',
    LPAREN: '(',
    RPAREN: ')',
    SEMI: ';',
    COMMA: ',',
    HASH: '#',
    AT: '@',
    ASSIGN_OP: '=',
    NB_ASSIGN: '<=',
    EQ: '==',
    NEQ: '!=',
    LAND: '&&',
    LOR: '||',
    BAND: '&',
    BOR: '|',
    BXOR: '^',
    BNOT: '~',
    LNOT: '!',
    KW_MODULE: 'module',
    KW_ENDMODULE: 'endmodule',
    KW_INPUT: 'input',
    KW_OUTPUT: 'output',
    KW_WIRE: 'wire',
    KW_REG: 'reg',
    KW_ASSIGN: 'assign',
    KW_ALWAYS: 'always',
    KW_INITIAL: 'initial',
    KW_POSEDGE: 'posedge',
    KW_IF: 'if',
    KW_ELSE: 'else',
    KW_BEGIN: 'begin',
    KW_END: 'end',
    KW_CLOCK: 'clock',
    KW_PERIOD: 'period',
    KW_PHASE: 'phase',
    KW_ASSERT: 'assert',
    COLON: ':',
    STRING: 'STRING',
    EOF: 'EOF'
  };

  var KEYWORDS = {
    'module': TOKEN_TYPES.KW_MODULE,
    'endmodule': TOKEN_TYPES.KW_ENDMODULE,
    'input': TOKEN_TYPES.KW_INPUT,
    'output': TOKEN_TYPES.KW_OUTPUT,
    'wire': TOKEN_TYPES.KW_WIRE,
    'reg': TOKEN_TYPES.KW_REG,
    'assign': TOKEN_TYPES.KW_ASSIGN,
    'always': TOKEN_TYPES.KW_ALWAYS,
    'initial': TOKEN_TYPES.KW_INITIAL,
    'posedge': TOKEN_TYPES.KW_POSEDGE,
    'if': TOKEN_TYPES.KW_IF,
    'else': TOKEN_TYPES.KW_ELSE,
    'begin': TOKEN_TYPES.KW_BEGIN,
    'end': TOKEN_TYPES.KW_END,
    'clock': TOKEN_TYPES.KW_CLOCK,
    'period': TOKEN_TYPES.KW_PERIOD,
    'phase': TOKEN_TYPES.KW_PHASE,
    'assert': TOKEN_TYPES.KW_ASSERT
  };

  var SIMPLE_TOKENS = {
    '{': TOKEN_TYPES.LBRACE,
    '}': TOKEN_TYPES.RBRACE,
    '(': TOKEN_TYPES.LPAREN,
    ')': TOKEN_TYPES.RPAREN,
    ';': TOKEN_TYPES.SEMI,
    ',': TOKEN_TYPES.COMMA,
    '#': TOKEN_TYPES.HASH,
    '@': TOKEN_TYPES.AT,
    '=': TOKEN_TYPES.ASSIGN_OP,
    '&': TOKEN_TYPES.BAND,
    '|': TOKEN_TYPES.BOR,
    '^': TOKEN_TYPES.BXOR,
    '~': TOKEN_TYPES.BNOT,
    '!': TOKEN_TYPES.LNOT,
    ':': TOKEN_TYPES.COLON
  };

  function Lexer(source) {
    this.source = source;
    this.pos = 0;
    this.line = 1;
    this.col = 1;
    this.tokens = [];
    this.errors = [];
  }

  Lexer.prototype.peek = function() {
    if (this.pos >= this.source.length) return '\0';
    return this.source[this.pos];
  };

  Lexer.prototype.advance = function() {
    var ch = this.source[this.pos];
    this.pos++;
    if (ch === '\n') {
      this.line++;
      this.col = 1;
    } else {
      this.col++;
    }
    return ch;
  };

  Lexer.prototype.skipWhitespace = function() {
    while (this.pos < this.source.length) {
      var ch = this.peek();
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
        this.advance();
      } else if (ch === '/' && this.pos + 1 < this.source.length && this.source[this.pos + 1] === '/') {
        while (this.pos < this.source.length && this.peek() !== '\n') {
          this.advance();
        }
      } else {
        break;
      }
    }
  };

  Lexer.prototype.addToken = function(type, value) {
    this.tokens.push({ type: type, value: value, line: this.line, col: this.col });
  };

  Lexer.prototype.tokenize = function() {
    while (this.pos < this.source.length) {
      this.skipWhitespace();
      if (this.pos >= this.source.length) break;

      var ch = this.peek();
      var startLine = this.line;
      var startCol = this.col;

      if (ch >= '0' && ch <= '9') {
        var num = '';
        while (this.pos < this.source.length && this.peek() >= '0' && this.peek() <= '9') {
          num += this.advance();
        }
        this.addToken(TOKEN_TYPES.NUMBER, parseInt(num, 10));
      } else if ((ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || ch === '_') {
        var ident = '';
        while (this.pos < this.source.length) {
          var c = this.peek();
          if ((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c === '_') {
            ident += this.advance();
          } else {
            break;
          }
        }
        if (KEYWORDS[ident]) {
          this.addToken(KEYWORDS[ident], ident);
        } else {
          this.addToken(TOKEN_TYPES.IDENT, ident);
        }
      } else if (ch === '<' && this.pos + 1 < this.source.length && this.source[this.pos + 1] === '=') {
        this.advance(); this.advance();
        this.addToken(TOKEN_TYPES.NB_ASSIGN, '<=');
      } else if (ch === '=' && this.pos + 1 < this.source.length && this.source[this.pos + 1] === '=') {
        this.advance(); this.advance();
        this.addToken(TOKEN_TYPES.EQ, '==');
      } else if (ch === '!' && this.pos + 1 < this.source.length && this.source[this.pos + 1] === '=') {
        this.advance(); this.advance();
        this.addToken(TOKEN_TYPES.NEQ, '!=');
      } else if (ch === '&' && this.pos + 1 < this.source.length && this.source[this.pos + 1] === '&') {
        this.advance(); this.advance();
        this.addToken(TOKEN_TYPES.LAND, '&&');
      } else if (ch === '|' && this.pos + 1 < this.source.length && this.source[this.pos + 1] === '|') {
        this.advance(); this.advance();
        this.addToken(TOKEN_TYPES.LOR, '||');
      } else if (ch === '"') {
        var str = '';
        this.advance();
        while (this.pos < this.source.length && this.peek() !== '"') {
          if (this.peek() === '\\') {
            this.advance();
            if (this.pos < this.source.length) {
              var escaped = this.advance();
              if (escaped === 'n') str += '\n';
              else if (escaped === 't') str += '\t';
              else if (escaped === '\\') str += '\\';
              else if (escaped === '"') str += '"';
              else str += escaped;
            }
          } else {
            str += this.advance();
          }
        }
        if (this.peek() === '"') {
          this.advance();
        }
        this.addToken(TOKEN_TYPES.STRING, str);
      } else if (SIMPLE_TOKENS[ch]) {
        this.advance();
        this.addToken(SIMPLE_TOKENS[ch], ch);
      } else {
        this.errors.push({ line: startLine, col: startCol, message: 'Unexpected character: ' + ch });
        this.advance();
      }
    }
    this.addToken(TOKEN_TYPES.EOF, null);
    return { tokens: this.tokens, errors: this.errors };
  };

  function Parser(tokens, errors) {
    this.tokens = tokens;
    this.errors = errors || [];
    this.pos = 0;
  }

  Parser.prototype.cur = function() {
    if (this.pos >= this.tokens.length) return this.tokens[this.tokens.length - 1];
    return this.tokens[this.pos];
  };

  Parser.prototype.lookahead = function(offset) {
    var idx = this.pos + (offset || 0);
    if (idx >= this.tokens.length) return this.tokens[this.tokens.length - 1];
    return this.tokens[idx];
  };

  Parser.prototype.advance = function() {
    var t = this.tokens[this.pos];
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  };

  Parser.prototype.expect = function(type) {
    var t = this.cur();
    if (t.type !== type) {
      this.errors.push({ line: t.line, col: t.col, message: 'Expected ' + type + ' but got ' + t.type + ' (' + (t.value != null ? t.value : 'EOF') + ')' });
      return t;
    }
    return this.advance();
  };

  Parser.prototype.match = function(type) {
    if (this.cur().type === type) {
      return this.advance();
    }
    return null;
  };

  Parser.prototype.parse = function() {
    var result = {
      moduleName: '',
      ports: [],
      signals: {},
      combinational: [],
      sequential: [],
      initialBlocks: [],
      clocks: [],
      branches: {},
      assertions: []
    };
    this.result = result;
    this.branchIdCounter = 0;
    this.assertIdCounter = 0;

    while (this.cur().type !== TOKEN_TYPES.EOF) {
      var t = this.cur();

      if (t.type === TOKEN_TYPES.KW_MODULE) {
        this.parseModule(result);
      } else if (t.type === TOKEN_TYPES.KW_CLOCK) {
        this.parseClockDecl(result);
      } else if (t.type === TOKEN_TYPES.KW_INPUT || t.type === TOKEN_TYPES.KW_OUTPUT) {
        this.parsePortDecl(result);
      } else if (t.type === TOKEN_TYPES.KW_WIRE) {
        this.parseWireDecl(result);
      } else if (t.type === TOKEN_TYPES.KW_REG) {
        this.parseRegDecl(result);
      } else if (t.type === TOKEN_TYPES.KW_ASSIGN) {
        this.parseAssign(result);
      } else if (t.type === TOKEN_TYPES.KW_ALWAYS) {
        this.parseAlways(result);
      } else if (t.type === TOKEN_TYPES.KW_INITIAL) {
        this.parseInitial(result);
      } else if (t.type === TOKEN_TYPES.KW_ASSERT) {
        this.parseAssert(result);
      } else if (t.type === TOKEN_TYPES.KW_ENDMODULE) {
        this.advance();
      } else {
        this.errors.push({ line: t.line, col: t.col, message: 'Unexpected token: ' + (t.value != null ? t.value : 'EOF') });
        this.advance();
      }
    }

    return { data: result, errors: this.errors };
  };

  Parser.prototype.parseModule = function(result) {
    this.expect(TOKEN_TYPES.KW_MODULE);
    var name = this.expect(TOKEN_TYPES.IDENT);
    result.moduleName = name.value;
    if (this.match(TOKEN_TYPES.SEMI)) return;
    if (this.match(TOKEN_TYPES.LPAREN)) {
      while (this.cur().type !== TOKEN_TYPES.RPAREN && this.cur().type !== TOKEN_TYPES.EOF) {
        this.advance();
      }
      this.match(TOKEN_TYPES.RPAREN);
    }
    this.match(TOKEN_TYPES.SEMI);
  };

  Parser.prototype.parseClockDecl = function(result) {
    this.expect(TOKEN_TYPES.KW_CLOCK);
    var name = this.expect(TOKEN_TYPES.IDENT);
    var period = 10;
    var phase = 0;

    while (this.cur().type !== TOKEN_TYPES.SEMI && this.cur().type !== TOKEN_TYPES.EOF) {
      if (this.cur().type === TOKEN_TYPES.KW_PERIOD) {
        this.advance();
        this.expect(TOKEN_TYPES.ASSIGN_OP);
        var periodNum = this.expect(TOKEN_TYPES.NUMBER);
        period = parseInt(periodNum.value, 10);
      } else if (this.cur().type === TOKEN_TYPES.KW_PHASE) {
        this.advance();
        this.expect(TOKEN_TYPES.ASSIGN_OP);
        var phaseNum = this.expect(TOKEN_TYPES.NUMBER);
        phase = parseInt(phaseNum.value, 10);
      } else {
        this.errors.push({ line: this.cur().line, message: 'Unexpected token in clock declaration' });
        this.advance();
      }
    }
    this.match(TOKEN_TYPES.SEMI);

    result.clocks.push({
      name: name.value,
      period: period,
      phase: phase
    });

    if (!result.signals[name.value]) {
      result.signals[name.value] = { name: name.value, type: 'clock', isReg: false, isClock: true };
    }
  };

  Parser.prototype.parsePortDecl = function(result) {
    var direction = this.advance().value;
    var names = this.parseIdentList();
    for (var i = 0; i < names.length; i++) {
      if (!result.signals[names[i]]) {
        result.signals[names[i]] = { name: names[i], type: direction, isReg: false };
      } else {
        result.signals[names[i]].type = direction;
      }
      var exists = false;
      for (var j = 0; j < result.ports.length; j++) {
        if (result.ports[j].name === names[i]) { exists = true; break; }
      }
      if (!exists) {
        result.ports.push({ name: names[i], direction: direction });
      }
    }
    this.match(TOKEN_TYPES.SEMI);
  };

  Parser.prototype.parseIdentList = function() {
    var names = [];
    names.push(this.expect(TOKEN_TYPES.IDENT).value);
    while (this.match(TOKEN_TYPES.COMMA)) {
      names.push(this.expect(TOKEN_TYPES.IDENT).value);
    }
    return names;
  };

  Parser.prototype.parseWireDecl = function(result) {
    this.advance();
    var names = this.parseIdentList();
    for (var i = 0; i < names.length; i++) {
      if (!result.signals[names[i]]) {
        result.signals[names[i]] = { name: names[i], type: 'wire', isReg: false };
      } else {
        result.signals[names[i]].type = result.signals[names[i]].type || 'wire';
      }
    }
    this.match(TOKEN_TYPES.SEMI);
  };

  Parser.prototype.parseRegDecl = function(result) {
    this.advance();
    var names = this.parseIdentList();
    for (var i = 0; i < names.length; i++) {
      if (!result.signals[names[i]]) {
        result.signals[names[i]] = { name: names[i], type: 'reg', isReg: true };
      } else {
        result.signals[names[i]].isReg = true;
        if (!result.signals[names[i]].type || result.signals[names[i]].type === 'wire') {
          result.signals[names[i]].type = 'reg';
        }
      }
    }
    this.match(TOKEN_TYPES.SEMI);
  };

  Parser.prototype.parseAssign = function(result) {
    this.expect(TOKEN_TYPES.KW_ASSIGN);
    var target = this.expect(TOKEN_TYPES.IDENT).value;
    this.expect(TOKEN_TYPES.ASSIGN_OP);
    var expr = this.parseExpr();
    this.match(TOKEN_TYPES.SEMI);
    result.combinational.push({ target: target, expr: expr });
  };

  Parser.prototype.parseAlways = function(result) {
    this.expect(TOKEN_TYPES.KW_ALWAYS);
    this.expect(TOKEN_TYPES.AT);
    this.expect(TOKEN_TYPES.LPAREN);
    this.expect(TOKEN_TYPES.KW_POSEDGE);
    var clkName = this.expect(TOKEN_TYPES.IDENT).value;
    this.expect(TOKEN_TYPES.RPAREN);

    var assignments = [];
    this.parseAlwaysBody(assignments);

    for (var i = 0; i < assignments.length; i++) {
      assignments[i].clk = clkName;
      result.sequential.push(assignments[i]);
    }
  };

  Parser.prototype.parseAlwaysBody = function(assignments) {
    if (this.match(TOKEN_TYPES.KW_BEGIN)) {
      while (this.cur().type !== TOKEN_TYPES.KW_END && this.cur().type !== TOKEN_TYPES.EOF) {
        this.parseStatement(assignments);
      }
      this.expect(TOKEN_TYPES.KW_END);
    } else {
      this.parseStatement(assignments);
    }
  };

  Parser.prototype.parseStatement = function(assignments) {
    if (this.cur().type === TOKEN_TYPES.KW_IF) {
      this.parseIfElse(assignments);
    } else {
      this.parseAssignment(assignments);
    }
  };

  Parser.prototype.parseIfElse = function(assignments) {
    var lineNum = this.cur().line;
    this.expect(TOKEN_TYPES.KW_IF);
    this.expect(TOKEN_TYPES.LPAREN);
    var cond = this.parseExpr();
    this.expect(TOKEN_TYPES.RPAREN);

    var ifAssigns = [];
    this.parseAlwaysBody(ifAssigns);

    var elseAssigns = [];
    if (this.match(TOKEN_TYPES.KW_ELSE)) {
      this.parseAlwaysBody(elseAssigns);
    }

    var branchId = 'branch_' + this.branchIdCounter++;
    this.result.branches[branchId] = {
      branchId: branchId,
      condition: cond,
      conditionStr: this.exprToString(cond),
      line: lineNum
    };

    assignments.push({ type: 'ifelse', condition: cond, ifBody: ifAssigns, elseBody: elseAssigns, branchId: branchId });
  };

  Parser.prototype.parseAssignment = function(assignments) {
    var target = this.expect(TOKEN_TYPES.IDENT).value;
    var op = this.cur();
    if (op.type === TOKEN_TYPES.NB_ASSIGN) {
      this.advance();
      var expr = this.parseExpr();
      this.match(TOKEN_TYPES.SEMI);
      assignments.push({ type: 'nb_assign', target: target, expr: expr });
    } else if (op.type === TOKEN_TYPES.ASSIGN_OP) {
      this.advance();
      var expr2 = this.parseExpr();
      this.match(TOKEN_TYPES.SEMI);
      assignments.push({ type: 'blocking_assign', target: target, expr: expr2 });
    } else {
      this.errors.push({ line: op.line, message: 'Expected = or <= but got ' + (op.value != null ? op.value : 'EOF') });
      this.advance();
    }
  };

  Parser.prototype.parseInitial = function(result) {
    this.expect(TOKEN_TYPES.KW_INITIAL);
    var stmts = [];
    if (this.match(TOKEN_TYPES.KW_BEGIN)) {
      while (this.cur().type !== TOKEN_TYPES.KW_END && this.cur().type !== TOKEN_TYPES.EOF) {
        this.parseInitialStmt(stmts);
      }
      this.expect(TOKEN_TYPES.KW_END);
    } else {
      this.parseInitialStmt(stmts);
    }
    result.initialBlocks.push(stmts);
  };

  Parser.prototype.parseInitialStmt = function(stmts) {
    var delay = 0;
    if (this.cur().type === TOKEN_TYPES.HASH) {
      this.advance();
      delay = parseInt(this.expect(TOKEN_TYPES.NUMBER).value, 10);
    }
    var target = this.expect(TOKEN_TYPES.IDENT).value;
    this.expect(TOKEN_TYPES.ASSIGN_OP);
    var value = this.parseExpr();
    this.match(TOKEN_TYPES.SEMI);
    stmts.push({ delay: delay, target: target, value: value });
  };

  Parser.prototype.parseAssert = function(result) {
    var lineNum = this.cur().line;
    this.expect(TOKEN_TYPES.KW_ASSERT);
    var expr = this.parseExpr();
    var description = null;

    if (this.match(TOKEN_TYPES.COLON)) {
      var strToken = this.match(TOKEN_TYPES.STRING);
      if (strToken) {
        description = strToken.value;
      }
    }

    this.match(TOKEN_TYPES.SEMI);

    var assertId = 'assert_' + this.assertIdCounter++;
    var exprStr = this.exprToString(expr);
    var signalSet = collectExprSignals(expr);
    var signals = Object.keys(signalSet);

    result.assertions.push({
      id: assertId,
      line: lineNum,
      expr: expr,
      exprStr: exprStr,
      description: description || exprStr,
      signals: signals
    });
  };

  Parser.prototype.parseExpr = function() {
    return this.parseOr();
  };

  Parser.prototype.parseOr = function() {
    var left = this.parseAnd();
    while (this.cur().type === TOKEN_TYPES.BOR || this.cur().type === TOKEN_TYPES.LOR) {
      var op = this.advance().value;
      var right = this.parseAnd();
      left = { op: op === '||' ? 'lor' : 'bor', left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseAnd = function() {
    var left = this.parseXor();
    while (this.cur().type === TOKEN_TYPES.BAND || this.cur().type === TOKEN_TYPES.LAND) {
      var op = this.advance().value;
      var right = this.parseXor();
      left = { op: op === '&&' ? 'land' : 'band', left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseXor = function() {
    var left = this.parseEquality();
    while (this.cur().type === TOKEN_TYPES.BXOR) {
      this.advance();
      var right = this.parseEquality();
      left = { op: 'xor', left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseEquality = function() {
    var left = this.parseUnary();
    while (this.cur().type === TOKEN_TYPES.EQ || this.cur().type === TOKEN_TYPES.NEQ) {
      var op = this.advance().value;
      var right = this.parseUnary();
      left = { op: op === '==' ? 'eq' : 'neq', left: left, right: right };
    }
    return left;
  };

  Parser.prototype.parseUnary = function() {
    if (this.cur().type === TOKEN_TYPES.BNOT) {
      this.advance();
      var operand = this.parseUnary();
      return { op: 'not', operand: operand };
    }
    if (this.cur().type === TOKEN_TYPES.LNOT) {
      this.advance();
      var operand2 = this.parseUnary();
      return { op: 'lnot', operand: operand2 };
    }
    return this.parsePrimary();
  };

  Parser.prototype.parsePrimary = function() {
    var t = this.cur();
    if (t.type === TOKEN_TYPES.NUMBER) {
      this.advance();
      return { op: 'literal', value: t.value !== 0 ? 1 : 0 };
    }
    if (t.type === TOKEN_TYPES.IDENT) {
      this.advance();
      return { op: 'signal', name: t.value };
    }
    if (t.type === TOKEN_TYPES.LPAREN) {
      this.advance();
      var expr = this.parseExpr();
      this.expect(TOKEN_TYPES.RPAREN);
      return expr;
    }
    this.errors.push({ line: t.line, col: t.col, message: 'Unexpected token in expression: ' + (t.value != null ? t.value : 'EOF') });
    this.advance();
    return { op: 'literal', value: 0 };
  };

  function parseNetlist(source) {
    var lexer = new Lexer(source);
    var lexResult = lexer.tokenize();
    if (lexResult.errors.length > 0) {
      return { data: null, errors: lexResult.errors };
    }
    var parser = new Parser(lexResult.tokens, []);
    var result = parser.parse();
    return result;
  }

  function collectExprSignals(expr, set) {
    if (!set) set = {};
    if (expr.op === 'signal') {
      set[expr.name] = true;
    } else if (expr.op === 'literal') {
      // no signals
    } else if (expr.operand) {
      collectExprSignals(expr.operand, set);
    } else {
      if (expr.left) collectExprSignals(expr.left, set);
      if (expr.right) collectExprSignals(expr.right, set);
    }
    return set;
  }

  Parser.prototype.exprToString = function(expr) {
    if (!expr) return '';
    if (expr.op === 'signal') return expr.name;
    if (expr.op === 'literal') return String(expr.value);
    if (expr.op === 'not' || expr.op === 'lnot') return '~' + this.exprToString(expr.operand);
    if (expr.op === 'band' || expr.op === 'land') return '(' + this.exprToString(expr.left) + ' & ' + this.exprToString(expr.right) + ')';
    if (expr.op === 'bor' || expr.op === 'lor') return '(' + this.exprToString(expr.left) + ' | ' + this.exprToString(expr.right) + ')';
    if (expr.op === 'xor') return '(' + this.exprToString(expr.left) + ' ^ ' + this.exprToString(expr.right) + ')';
    if (expr.op === 'eq') return '(' + this.exprToString(expr.left) + ' == ' + this.exprToString(expr.right) + ')';
    if (expr.op === 'neq') return '(' + this.exprToString(expr.left) + ' != ' + this.exprToString(expr.right) + ')';
    return '?';
  };

  return {
    parse: parseNetlist,
    collectExprSignals: collectExprSignals,
    TOKEN_TYPES: TOKEN_TYPES
  };

})();
