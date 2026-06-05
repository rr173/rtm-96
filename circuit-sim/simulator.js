function createSimulator() {

  function evaluateExpr(expr, signalValues) {
    switch (expr.op) {
      case 'literal':
        return expr.value ? 1 : 0;
      case 'signal':
        return signalValues[expr.name] || 0;
      case 'not':
        return evaluateExpr(expr.operand, signalValues) ? 0 : 1;
      case 'lnot':
        return evaluateExpr(expr.operand, signalValues) ? 0 : 1;
      case 'bor': {
        var l = evaluateExpr(expr.left, signalValues);
        var r = evaluateExpr(expr.right, signalValues);
        return (l || r) ? 1 : 0;
      }
      case 'lor': {
        var la = evaluateExpr(expr.left, signalValues);
        var ra = evaluateExpr(expr.right, signalValues);
        return (la || ra) ? 1 : 0;
      }
      case 'band': {
        var lb = evaluateExpr(expr.left, signalValues);
        var rb = evaluateExpr(expr.right, signalValues);
        return (lb && rb) ? 1 : 0;
      }
      case 'land': {
        var lc = evaluateExpr(expr.left, signalValues);
        var rc = evaluateExpr(expr.right, signalValues);
        return (lc && rc) ? 1 : 0;
      }
      case 'xor': {
        var ld = evaluateExpr(expr.left, signalValues);
        var rd = evaluateExpr(expr.right, signalValues);
        return (ld ^ rd) ? 1 : 0;
      }
      case 'eq': {
        var le = evaluateExpr(expr.left, signalValues);
        var re = evaluateExpr(expr.right, signalValues);
        return (le === re) ? 1 : 0;
      }
      case 'neq': {
        var lf = evaluateExpr(expr.left, signalValues);
        var rf = evaluateExpr(expr.right, signalValues);
        return (lf !== rf) ? 1 : 0;
      }
      default:
        return 0;
    }
  }

  function collectExprSignals(expr, set) {
    if (!set) set = {};
    if (expr.op === 'signal') {
      set[expr.name] = true;
    } else if (expr.op === 'literal') {
      // nothing
    } else if (expr.operand) {
      collectExprSignals(expr.operand, set);
    } else {
      if (expr.left) collectExprSignals(expr.left, set);
      if (expr.right) collectExprSignals(expr.right, set);
    }
    return set;
  }

  function buildDepGraph(netlist) {
    var combDeps = {};
    var reverseDeps = {};
    var signalSources = {};

    for (var i = 0; i < netlist.combinational.length; i++) {
      var ca = netlist.combinational[i];
      var inputs = Object.keys(collectExprSignals(ca.expr));
      combDeps[ca.target] = inputs;
      signalSources[ca.target] = { type: 'comb', expr: ca.expr, inputs: inputs };

      for (var j = 0; j < inputs.length; j++) {
        if (!reverseDeps[inputs[j]]) reverseDeps[inputs[j]] = [];
        if (reverseDeps[inputs[j]].indexOf(ca.target) === -1) {
          reverseDeps[inputs[j]].push(ca.target);
        }
      }
    }

    var topoOrder = [];
    var visited = {};
    var inStack = {};

    function topoVisit(node) {
      if (inStack[node]) return false;
      if (visited[node]) return true;

      inStack[node] = true;
      var deps = combDeps[node] || [];
      for (var k = 0; k < deps.length; k++) {
        if (combDeps[deps[k]]) {
          if (!topoVisit(deps[k])) return false;
        }
      }
      inStack[node] = false;
      visited[node] = true;
      topoOrder.push(node);
      return true;
    }

    var combSignals = Object.keys(combDeps);
    for (var m = 0; m < combSignals.length; m++) {
      if (!visited[combSignals[m]]) {
        topoVisit(combSignals[m]);
      }
    }

    return {
      combDeps: combDeps,
      reverseDeps: reverseDeps,
      signalSources: signalSources,
      topoOrder: topoOrder
    };
  }

  function simulate(netlist, clockPeriod, simDuration, gateDelay) {
    var depGraph = buildDepGraph(netlist);

    var allClocks = [];
    var clockNames = {};
    for (var ci = 0; ci < (netlist.clocks || []).length; ci++) {
      var c = netlist.clocks[ci];
      if (!clockNames[c.name]) {
        allClocks.push(c);
        clockNames[c.name] = true;
      }
    }
    if (!clockNames['clk']) {
      allClocks.push({ name: 'clk', period: clockPeriod, phase: 0, isGlobal: true });
      clockNames['clk'] = true;
    }

    var signalNames = allClocks.map(function(c) { return c.name; });
    var signalMap = {};
    for (var cmi = 0; cmi < allClocks.length; cmi++) {
      var clkName = allClocks[cmi].name;
      signalMap[clkName] = { name: clkName, type: 'clock', isReg: false, isClock: true };
    }

    var regClockDomains = {};
    for (var si = 0; si < netlist.sequential.length; si++) {
      var seq = netlist.sequential[si];
      collectRegClockDomains(seq, seq.clk || 'clk', regClockDomains);
    }

    var portOrder = [];
    for (var pi = 0; pi < netlist.ports.length; pi++) {
      portOrder.push(netlist.ports[pi].name);
    }

    var sigKeys = Object.keys(netlist.signals);
    for (var ski = 0; ski < sigKeys.length; ski++) {
      var sk = sigKeys[ski];
      if (signalMap[sk]) continue;
      signalMap[sk] = netlist.signals[sk];
      if (signalMap[sk].isReg && regClockDomains[sk]) {
        signalMap[sk].clockDomain = regClockDomains[sk];
      }
    }

    var orderedNames = allClocks.map(function(c) { return c.name; });
    for (var oi = 0; oi < portOrder.length; oi++) {
      if (allClocks.some(function(c) { return c.name === portOrder[oi]; })) continue;
      if (signalMap[portOrder[oi]]) {
        orderedNames.push(portOrder[oi]);
      }
    }
    var remainingComb = [];
    var remainingReg = [];
    for (var ri = 0; ri < sigKeys.length; ri++) {
      var rk = sigKeys[ri];
      if (allClocks.some(function(c) { return c.name === rk; }) || portOrder.indexOf(rk) !== -1) continue;
      if (signalMap[rk].isReg) {
        remainingReg.push(rk);
      } else {
        remainingComb.push(rk);
      }
    }
    orderedNames = orderedNames.concat(remainingComb).concat(remainingReg);

    for (var ni = 0; ni < orderedNames.length; ni++) {
      if (signalNames.indexOf(orderedNames[ni]) === -1) {
        signalNames.push(orderedNames[ni]);
      }
    }

    var waveforms = {};
    for (var wi = 0; wi < signalNames.length; wi++) {
      waveforms[signalNames[wi]] = [];
    }

    var branchHits = {};

    var assertions = netlist.assertions || [];
    var assertionViolations = [];
    var assertionStatus = {};

    for (var ai = 0; ai < assertions.length; ai++) {
      assertionStatus[assertions[ai].id] = {
        passed: true,
        firstViolationTime: null,
        violations: 0
      };
    }

    var currentValues = {};
    for (var ci = 0; ci < signalNames.length; ci++) {
      currentValues[signalNames[ci]] = 0;
    }

    var eventQueue = [];

    for (var ib = 0; ib < netlist.initialBlocks.length; ib++) {
      var block = netlist.initialBlocks[ib];
      var cumulativeDelay = 0;
      for (var is = 0; is < block.length; is++) {
        cumulativeDelay += block[is].delay;
        var val = evaluateExpr(block[is].value, currentValues);
        eventQueue.push({ time: cumulativeDelay, signal: block[is].target, value: val });
      }
    }

    for (var cli = 0; cli < allClocks.length; cli++) {
      var clock = allClocks[cli];
      var clkName = clock.name;
      var startPhase = clock.phase || 0;

      for (var cp = startPhase; cp <= simDuration; cp += clock.period) {
        if (cp > 0) {
          eventQueue.push({
            time: cp,
            signal: '__posedge_' + clkName + '__',
            value: 1,
            clockName: clkName,
            priority: 0
          });
        }
      }

      for (var ct = startPhase; ct <= simDuration; ct += clock.period) {
        eventQueue.push({
          time: ct,
          signal: clkName,
          value: 1,
          priority: 1
        });
        var fallTime = ct + Math.floor(clock.period / 2);
        if (fallTime <= simDuration) {
          eventQueue.push({
            time: fallTime,
            signal: clkName,
            value: 0,
            priority: 1
          });
        }
      }
    }

    eventQueue.sort(function(a, b) {
      if (a.time !== b.time) return a.time - b.time;
      var pa = a.priority !== undefined ? a.priority : 2;
      var pb = b.priority !== undefined ? b.priority : 2;
      return pa - pb;
    });

    function recordAllSignals(time) {
      for (var rsi = 0; rsi < signalNames.length; rsi++) {
        waveforms[signalNames[rsi]].push({
          time: time,
          value: currentValues[signalNames[rsi]]
        });
      }
    }

    function checkAssertions(time) {
      for (var ai = 0; ai < assertions.length; ai++) {
        var assertion = assertions[ai];
        var condValue = evaluateExpr(assertion.expr, currentValues);

        if (condValue === 0) {
          var signalValues = {};
          for (var si = 0; si < assertion.signals.length; si++) {
            var sigName = assertion.signals[si];
            signalValues[sigName] = currentValues[sigName] || 0;
          }

          assertionViolations.push({
            assertId: assertion.id,
            time: time,
            signalValues: signalValues
          });

          assertionStatus[assertion.id].passed = false;
          assertionStatus[assertion.id].violations++;
          if (assertionStatus[assertion.id].firstViolationTime === null) {
            assertionStatus[assertion.id].firstViolationTime = time;
          }
        }
      }
    }

    function propagateComb(startTime, changedSignals) {
      var toEvaluate = depGraph.topoOrder.slice();
      var maxIterations = toEvaluate.length + 1;
      var iteration = 0;
      var currentDelay = gateDelay;

      while (changedSignals.length > 0 && iteration < maxIterations) {
        iteration++;
        var pendingChanges = {};

        for (var tei = 0; tei < toEvaluate.length; tei++) {
          var sig = toEvaluate[tei];
          var src = depGraph.signalSources[sig];
          if (!src || src.type !== 'comb') continue;

          var hasChangedInput = false;
          var inputs = src.inputs;
          for (var ii = 0; ii < inputs.length; ii++) {
            if (changedSignals.indexOf(inputs[ii]) !== -1) {
              hasChangedInput = true;
              break;
            }
          }

          if (hasChangedInput) {
            var newVal = evaluateExpr(src.expr, currentValues);
            if (newVal !== currentValues[sig]) {
              pendingChanges[sig] = newVal;
            }
          }
        }

        var newChanged = [];
        for (var s in pendingChanges) {
          if (!pendingChanges.hasOwnProperty(s)) continue;
          currentValues[s] = pendingChanges[s];
          newChanged.push(s);
          var delayTime = startTime + currentDelay;
          if (delayTime <= simDuration) {
            waveforms[s].push({ time: delayTime, value: pendingChanges[s] });
          }
        }

        changedSignals = newChanged;
        currentDelay += gateDelay;
      }
    }

    function propagateCombInitial(startTime, changedSignals) {
      var toEvaluate = depGraph.topoOrder.slice();
      var maxIterations = toEvaluate.length + 1;
      var iteration = 0;
      var hasChanges = true;

      while (hasChanges && iteration < maxIterations) {
        iteration++;
        hasChanges = false;

        for (var tei = 0; tei < toEvaluate.length; tei++) {
          var sig = toEvaluate[tei];
          var src = depGraph.signalSources[sig];
          if (!src || src.type !== 'comb') continue;

          var newVal = evaluateExpr(src.expr, currentValues);
          if (newVal !== currentValues[sig]) {
            currentValues[sig] = newVal;
            hasChanges = true;
          }
        }
      }
    }

    function processPosedge(time, clockName, branchHits) {
      var regUpdates = [];

      for (var si = 0; si < netlist.sequential.length; si++) {
        var seq = netlist.sequential[si];
        var seqClk = seq.clk || 'clk';
        if (seqClk === clockName) {
          collectSequentialUpdates(seq, currentValues, regUpdates, branchHits);
        }
      }

      for (var ui = 0; ui < regUpdates.length; ui++) {
        currentValues[regUpdates[ui].target] = regUpdates[ui].value;
        waveforms[regUpdates[ui].target].push({
          time: time + gateDelay,
          value: regUpdates[ui].value
        });
      }

      var changedRegs = [];
      for (var cri = 0; cri < regUpdates.length; cri++) {
        changedRegs.push(regUpdates[cri].target);
      }

      if (changedRegs.length > 0) {
        propagateComb(time + gateDelay, changedRegs);
      }
    }

    function collectSequentialUpdates(stmt, values, updates, branchHits) {
      if (stmt.type === 'nb_assign') {
        var v = evaluateExpr(stmt.expr, values);
        updates.push({ target: stmt.target, value: v });
      } else if (stmt.type === 'blocking_assign') {
        var vb = evaluateExpr(stmt.expr, values);
        values[stmt.target] = vb;
        updates.push({ target: stmt.target, value: vb });
      } else if (stmt.type === 'ifelse') {
        var condVal = evaluateExpr(stmt.condition, values);

        if (stmt.branchId && branchHits) {
          if (!branchHits[stmt.branchId]) {
            branchHits[stmt.branchId] = { 'true': 0, 'false': 0 };
          }
          branchHits[stmt.branchId][condVal ? 'true' : 'false']++;
        }

        if (condVal) {
          for (var ii = 0; ii < stmt.ifBody.length; ii++) {
            collectSequentialUpdates(stmt.ifBody[ii], values, updates, branchHits);
          }
        } else {
          for (var ei = 0; ei < stmt.elseBody.length; ei++) {
            collectSequentialUpdates(stmt.elseBody[ei], values, updates, branchHits);
          }
        }
      }
    }

    function collectRegClockDomains(stmt, clkName, domains) {
      if (stmt.type === 'nb_assign' || stmt.type === 'blocking_assign') {
        domains[stmt.target] = clkName;
      } else if (stmt.type === 'ifelse') {
        for (var ii = 0; ii < stmt.ifBody.length; ii++) {
          collectRegClockDomains(stmt.ifBody[ii], clkName, domains);
        }
        for (var ei = 0; ei < stmt.elseBody.length; ei++) {
          collectRegClockDomains(stmt.elseBody[ei], clkName, domains);
        }
      }
    }

    var initialChangedSignals = [];
    for (var ci2 = 0; ci2 < signalNames.length; ci2++) {
      initialChangedSignals.push(signalNames[ci2]);
    }
    propagateCombInitial(0, initialChangedSignals);

    checkAssertions(0);
    recordAllSignals(0);

    var lastEventTime = 0;
    for (var ei = 0; ei < eventQueue.length; ei++) {
      var evt = eventQueue[ei];

      if (evt.time > simDuration) break;

      if (evt.time > lastEventTime) {
        checkAssertions(lastEventTime);
        lastEventTime = evt.time;
      }

      if (evt.clockName) {
        processPosedge(evt.time, evt.clockName, branchHits);
        continue;
      }

      var isClock = allClocks.some(function(c) { return c.name === evt.signal; });
      if (isClock) {
        currentValues[evt.signal] = evt.value;
        waveforms[evt.signal].push({ time: evt.time, value: evt.value });
        continue;
      }

      currentValues[evt.signal] = evt.value;
      waveforms[evt.signal].push({ time: evt.time, value: evt.value });

      propagateComb(evt.time, [evt.signal]);
    }

    checkAssertions(simDuration);

    var regInputs = buildRegInputs(netlist);
    depGraph.regInputs = regInputs;

    var glitches = detectGlitches(signalNames, waveforms, depGraph, gateDelay);
    var cdcViolations = detectCDCViolations(signalMap, depGraph, netlist);

    return {
      signalNames: signalNames,
      signalMap: signalMap,
      waveforms: waveforms,
      glitches: glitches,
      cdcViolations: cdcViolations,
      clocks: allClocks,
      depGraph: depGraph,
      branches: netlist.branches || {},
      branchHits: branchHits,
      assertions: assertions,
      assertionStatus: assertionStatus,
      assertionViolations: assertionViolations
    };
  }

  function detectGlitches(signalNames, waveforms, depGraph, gateDelay) {
    var glitches = [];

    for (var si = 0; si < signalNames.length; si++) {
      var sig = signalNames[si];
      if (sig === 'clk') continue;

      var src = depGraph.signalSources[sig];
      if (!src || src.type !== 'comb') continue;

      var wf = waveforms[sig];
      if (wf.length < 3) continue;

      for (var wi = 1; wi < wf.length - 1; wi++) {
        var prev = wf[wi - 1];
        var curr = wf[wi];
        var next = wf[wi + 1];

        if (curr.value !== prev.value && curr.value !== next.value && prev.value === next.value) {
          var glitchDuration = next.time - curr.time;
          if (glitchDuration <= gateDelay * 2) {
            var paths = analyzeGlitchPaths(sig, depGraph, gateDelay);
            glitches.push({
              signal: sig,
              startTime: curr.time,
              endTime: next.time,
              glitchValue: curr.value,
              stableValue: prev.value,
              paths: paths
            });
          }
        }
      }
    }

    return glitches;
  }

  function analyzeGlitchPaths(signal, depGraph, gateDelay) {
    var src = depGraph.signalSources[signal];
    if (!src) return [];

    var paths = [];
    var inputs = src.inputs;

    for (var i = 0; i < inputs.length; i++) {
      var inputSig = inputs[i];
      var inputSrc = depGraph.signalSources[inputSig];
      var depth = 1;
      var trace = [inputSig];

      while (inputSrc && inputSrc.type === 'comb') {
        depth++;
        if (inputSrc.inputs.length > 0) {
          inputSig = inputSrc.inputs[0];
          trace.push(inputSig);
          inputSrc = depGraph.signalSources[inputSig];
        } else {
          break;
        }
      }

      paths.push({
        from: trace[trace.length - 1],
        to: signal,
        depth: depth,
        delay: depth * gateDelay,
        trace: trace
      });
    }

    if (paths.length >= 2) {
      var maxDelay = 0;
      var minDelay = Infinity;
      for (var p = 0; p < paths.length; p++) {
        if (paths[p].delay > maxDelay) maxDelay = paths[p].delay;
        if (paths[p].delay < minDelay) minDelay = paths[p].delay;
      }
      for (var q = 0; q < paths.length; q++) {
        paths[q].delayDiff = maxDelay - paths[q].delay;
      }
    }

    return paths;
  }

  function buildRegInputs(netlist) {
    var regInputs = {};

    function collectRegInputs(stmt, inputs) {
      if (stmt.type === 'nb_assign' || stmt.type === 'blocking_assign') {
        var exprInputs = collectExprSignals(stmt.expr);
        for (var key in exprInputs) {
          if (exprInputs.hasOwnProperty(key)) {
            inputs[key] = true;
          }
        }
      } else if (stmt.type === 'ifelse') {
        var condInputs = collectExprSignals(stmt.condition);
        for (var ck in condInputs) {
          if (condInputs.hasOwnProperty(ck)) {
            inputs[ck] = true;
          }
        }
        for (var ii = 0; ii < stmt.ifBody.length; ii++) {
          collectRegInputs(stmt.ifBody[ii], inputs);
        }
        for (var ei = 0; ei < stmt.elseBody.length; ei++) {
          collectRegInputs(stmt.elseBody[ei], inputs);
        }
      }
    }

    function collectAllRegInputs(stmt, clkName) {
      if (stmt.type === 'nb_assign' || stmt.type === 'blocking_assign') {
        if (!regInputs[stmt.target]) regInputs[stmt.target] = {};
        collectRegInputs(stmt, regInputs[stmt.target]);
      } else if (stmt.type === 'ifelse') {
        for (var ii = 0; ii < stmt.ifBody.length; ii++) {
          collectAllRegInputs(stmt.ifBody[ii], clkName);
        }
        for (var ei = 0; ei < stmt.elseBody.length; ei++) {
          collectAllRegInputs(stmt.elseBody[ei], clkName);
        }
      }
    }

    for (var si = 0; si < netlist.sequential.length; si++) {
      var seq = netlist.sequential[si];
      collectAllRegInputs(seq, seq.clk || 'clk');
    }

    return regInputs;
  }

  function detectCDCViolations(signalMap, depGraph, netlist) {
    var violations = [];
    var regSources = {};
    var regInputs = depGraph.regInputs || {};

    for (var name in signalMap) {
      if (!signalMap.hasOwnProperty(name)) continue;
      var sig = signalMap[name];
      if (sig.isReg && sig.clockDomain) {
        regSources[name] = sig.clockDomain;
      }
    }

    function collectRegInputs(stmt, inputs) {
      if (stmt.type === 'nb_assign' || stmt.type === 'blocking_assign') {
        var exprInputs = collectExprSignals(stmt.expr);
        for (var key in exprInputs) {
          if (exprInputs.hasOwnProperty(key)) {
            inputs[key] = true;
          }
        }
      } else if (stmt.type === 'ifelse') {
        var condInputs = collectExprSignals(stmt.condition);
        for (var ck in condInputs) {
          if (condInputs.hasOwnProperty(ck)) {
            inputs[ck] = true;
          }
        }
        for (var ii = 0; ii < stmt.ifBody.length; ii++) {
          collectRegInputs(stmt.ifBody[ii], inputs);
        }
        for (var ei = 0; ei < stmt.elseBody.length; ei++) {
          collectRegInputs(stmt.elseBody[ei], inputs);
        }
      }
    }

    function collectAllRegInputs(stmt, clkName) {
      if (stmt.type === 'nb_assign' || stmt.type === 'blocking_assign') {
        if (!regInputs[stmt.target]) regInputs[stmt.target] = {};
        collectRegInputs(stmt, regInputs[stmt.target]);
      } else if (stmt.type === 'ifelse') {
        for (var ii = 0; ii < stmt.ifBody.length; ii++) {
          collectAllRegInputs(stmt.ifBody[ii], clkName);
        }
        for (var ei = 0; ei < stmt.elseBody.length; ei++) {
          collectAllRegInputs(stmt.elseBody[ei], clkName);
        }
      }
    }

    for (var si = 0; si < netlist.sequential.length; si++) {
      var seq = netlist.sequential[si];
      collectAllRegInputs(seq, seq.clk || 'clk');
    }

    function traceBackToReg(signal, visited, startReg) {
      visited = visited || {};
      if (visited[signal]) return null;
      visited[signal] = true;

      if (regSources[signal] && signal !== startReg) {
        return { reg: signal, domain: regSources[signal], path: [signal] };
      }

      var src = depGraph.signalSources[signal];
      if (src && src.type === 'comb' && src.inputs) {
        for (var i = 0; i < src.inputs.length; i++) {
          var result = traceBackToReg(src.inputs[i], visited, startReg);
          if (result) {
            result.path.unshift(signal);
            return result;
          }
        }
      }

      if (regInputs[signal]) {
        for (var inputName in regInputs[signal]) {
          if (regInputs[signal].hasOwnProperty(inputName)) {
            var result2 = traceBackToReg(inputName, visited, startReg);
            if (result2) {
              result2.path.unshift(signal);
              return result2;
            }
          }
        }
      }

      return null;
    }

    function checkSyncChain(destReg, targetDomain) {
      var dffCount = 0;
      var current = destReg;
      var visited2 = {};
      var maxDepth = 10;
      var depth = 0;

      while (current && depth < maxDepth) {
        depth++;
        if (visited2[current]) break;
        visited2[current] = true;

        if (regSources[current] === targetDomain) {
          dffCount++;
          if (dffCount >= 2) {
            return true;
          }
        } else if (regSources[current]) {
          break;
        }

        var foundInput = false;
        if (regInputs[current]) {
          var inputKeys = Object.keys(regInputs[current]);
          if (inputKeys.length === 1) {
            current = inputKeys[0];
            foundInput = true;
          }
        }

        if (!foundInput) {
          var src2 = depGraph.signalSources[current];
          if (src2 && src2.type === 'comb' && src2.inputs && src2.inputs.length === 1) {
            current = src2.inputs[0];
            foundInput = true;
          }
        }

        if (!foundInput) break;
      }

      return false;
    }

    for (var sigName in signalMap) {
      if (!signalMap.hasOwnProperty(sigName)) continue;
      var sigInfo = signalMap[sigName];

      if (!sigInfo.isReg || !sigInfo.clockDomain) continue;
      if (!regInputs[sigName]) continue;

      var targetDomain = sigInfo.clockDomain;
      var inputSignals = Object.keys(regInputs[sigName]);

      for (var isi = 0; isi < inputSignals.length; isi++) {
        var trace = traceBackToReg(inputSignals[isi], {}, sigName);

        if (trace && trace.domain !== targetDomain) {
          var hasSync = checkSyncChain(sigName, targetDomain);

          var uniqueSignals = {};
          for (var pi = 0; pi < trace.path.length; pi++) {
            uniqueSignals[trace.path[pi]] = true;
          }
          uniqueSignals[trace.reg] = true;
          uniqueSignals[sigName] = true;

          violations.push({
            sourceReg: trace.reg,
            sourceDomain: trace.domain,
            destReg: sigName,
            destDomain: targetDomain,
            path: trace.path,
            signals: Object.keys(uniqueSignals),
            hasSynchronizer: hasSync
          });
        }
      }
    }

    var uniqueViolations = {};
    for (var vi = 0; vi < violations.length; vi++) {
      var v = violations[vi];
      var key = v.sourceReg + '->' + v.destReg;
      if (!uniqueViolations[key]) {
        uniqueViolations[key] = v;
      }
    }

    return Object.keys(uniqueViolations).map(function(k) { return uniqueViolations[k]; });
  }

  return {
    simulate: simulate,
    evaluateExpr: evaluateExpr,
    collectExprSignals: collectExprSignals,
    buildDepGraph: buildDepGraph
  };

}

var Simulator = createSimulator();
