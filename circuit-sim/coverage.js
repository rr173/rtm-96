var CoverageAnalyzer = (function() {

  function extractPercentage(val) {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (val && typeof val === 'object' && typeof val.percentage === 'number') return isNaN(val.percentage) ? 0 : val.percentage;
    return 0;
  }

  function extractStats(val) {
    if (val && typeof val === 'object' && val.stats) return val.stats;
    return {};
  }

  function analyzeToggleCoverage(signalNames, signalMap, waveforms, clocks) {
    var clockNames = [];
    if (Array.isArray(clocks)) {
      clockNames = clocks.map(function(c) { return c.name; });
    } else if (clocks && typeof clocks === 'object' && clocks.name) {
      clockNames = [clocks.name];
    }
    signalNames = Array.isArray(signalNames) ? signalNames : [];
    signalMap = signalMap || {};
    waveforms = waveforms || {};
    var toggleStats = {};
    var coveredSignals = 0;
    var totalSignals = 0;

    for (var i = 0; i < signalNames.length; i++) {
      var sigName = signalNames[i];
      if (clockNames.indexOf(sigName) !== -1) continue;

      var wf = waveforms[sigName] || [];
      var toggleCount = 0;
      var hasZero = false;
      var hasOne = false;
      var firstValue = wf.length > 0 ? wf[0].value : 0;

      if (firstValue === 0) hasZero = true;
      else hasOne = true;

      for (var j = 1; j < wf.length; j++) {
        var prev = wf[j - 1];
        var curr = wf[j];
        if (prev.value !== curr.value) {
          toggleCount++;
        }
        if (curr.value === 0) hasZero = true;
        else hasOne = true;
      }

      var sig = signalMap[sigName] || {};
      var isReg = sig.isReg;
      var status = 'covered';
      var reason = '';

      if (isReg) {
        if (!hasZero || !hasOne) {
          status = 'stuck';
          reason = !hasZero ? '始终为1' : '始终为0';
        } else {
          coveredSignals++;
        }
      } else {
        if (toggleCount === 0) {
          status = 'uncovered';
          reason = '从未翻转';
        } else {
          coveredSignals++;
        }
      }

      totalSignals++;
      toggleStats[sigName] = {
        name: sigName,
        isReg: isReg,
        toggleCount: toggleCount,
        hasZero: hasZero,
        hasOne: hasOne,
        status: status,
        reason: reason
      };
    }

    return {
      stats: toggleStats,
      covered: coveredSignals,
      total: totalSignals,
      percentage: totalSignals > 0 ? (coveredSignals / totalSignals) * 100 : 0
    };
  }

  function analyzeBranchCoverage(branches, branchHits) {
    var branchStats = {};
    var coveredBranches = 0;
    var totalBranches = 0;

    branches = branches || {};
    branchHits = branchHits || {};

    for (var branchId in branches) {
      if (!branches.hasOwnProperty(branchId)) continue;

      var branch = branches[branchId];
      var hits = branchHits[branchId] || { true: 0, false: 0 };

      var trueCovered = hits['true'] > 0;
      var falseCovered = hits['false'] > 0;

      totalBranches += 2;
      var localCovered = 0;
      var uncovered = [];

      if (trueCovered) {
        localCovered++;
      } else {
        uncovered.push('true分支');
      }

      if (falseCovered) {
        localCovered++;
      } else {
        uncovered.push('false分支');
      }

      coveredBranches += localCovered;

      branchStats[branchId] = {
        branchId: branchId,
        condition: branch.conditionStr,
        line: branch.line,
        trueHits: hits['true'],
        falseHits: hits['false'],
        uncovered: uncovered,
        status: uncovered.length === 0 ? 'covered' : 'partial'
      };
    }

    return {
      stats: branchStats,
      covered: coveredBranches,
      total: totalBranches,
      percentage: totalBranches > 0 ? (coveredBranches / totalBranches) * 100 : 0
    };
  }

  function analyzeDeadCode(netlist, toggleCoverage, depGraph, signalMap) {
    var deadAssigns = [];
    var unusedRegs = [];
    var outputPorts = {};

    netlist = netlist || {};
    netlist.ports = netlist.ports || [];
    netlist.combinational = netlist.combinational || [];
    netlist.sequential = netlist.sequential || [];
    toggleCoverage = toggleCoverage || { stats: {} };
    toggleCoverage.stats = toggleCoverage.stats || {};
    depGraph = depGraph || {};
    signalMap = signalMap || {};

    for (var i = 0; i < netlist.ports.length; i++) {
      if (netlist.ports[i].direction === 'output') {
        outputPorts[netlist.ports[i].name] = true;
      }
    }

    var reverseDeps = depGraph.reverseDeps || {};

    function hasActiveDownstream(sigName, visited) {
      visited = visited || {};
      if (visited[sigName]) return false;
      visited[sigName] = true;

      if (outputPorts[sigName]) return true;

      var downstream = reverseDeps[sigName] || [];
      for (var j = 0; j < downstream.length; j++) {
        var downstreamSig = downstream[j];
        var downSig = signalMap[downstreamSig];

        if (toggleCoverage.stats[downstreamSig]) {
          var status = toggleCoverage.stats[downstreamSig].status;
          if (status === 'covered') return true;
        }

        if (hasActiveDownstream(downstreamSig, visited)) return true;
      }

      var regsDrivenBy = findRegsDrivenBySignal(sigName, netlist);
      for (var k = 0; k < regsDrivenBy.length; k++) {
        var regName = regsDrivenBy[k];
        if (toggleCoverage.stats[regName]) {
          if (toggleCoverage.stats[regName].status === 'covered') return true;
        }
        if (hasActiveDownstream(regName, visited)) return true;
      }

      return false;
    }

    for (var ci = 0; ci < netlist.combinational.length; ci++) {
      var ca = netlist.combinational[ci];
      var target = ca.target;
      var tc = toggleCoverage.stats[target];

      if (tc && tc.status !== 'covered') {
        if (!hasActiveDownstream(target, {})) {
          deadAssigns.push({
            signal: target,
            expr: exprToString(ca.expr),
            line: ca.line || 0
          });
        }
      }
    }

    var regNames = [];
    for (var sn in signalMap) {
      if (!signalMap.hasOwnProperty(sn)) continue;
      if (signalMap[sn].isReg) {
        regNames.push(sn);
      }
    }

    var regWriters = findRegWriters(netlist);

    for (var ri = 0; ri < regNames.length; ri++) {
      var regName = regNames[ri];
      var tc = toggleCoverage.stats[regName];

      if (tc && tc.status !== 'covered') {
        if (!hasActiveDownstream(regName, {})) {
          var written = regWriters[regName] || false;
          unusedRegs.push({
            name: regName,
            written: written
          });
        }
      }
    }

    return {
      deadAssigns: deadAssigns,
      unusedRegs: unusedRegs
    };
  }

  function findRegsDrivenBySignal(sigName, netlist) {
    var driven = [];

    function checkStatement(stmt) {
      if (stmt.type === 'nb_assign' || stmt.type === 'blocking_assign') {
        var inputs = collectExprSignals(stmt.expr);
        if (inputs[sigName]) {
          if (driven.indexOf(stmt.target) === -1) {
            driven.push(stmt.target);
          }
        }
      } else if (stmt.type === 'ifelse') {
        var condInputs = collectExprSignals(stmt.condition);
        if (condInputs[sigName]) {
          collectTargetsFromBody(stmt.ifBody, driven);
          collectTargetsFromBody(stmt.elseBody, driven);
        }
        for (var i = 0; i < stmt.ifBody.length; i++) {
          checkStatement(stmt.ifBody[i]);
        }
        for (var j = 0; j < stmt.elseBody.length; j++) {
          checkStatement(stmt.elseBody[j]);
        }
      }
    }

    for (var i = 0; i < netlist.sequential.length; i++) {
      checkStatement(netlist.sequential[i]);
    }

    return driven;
  }

  function collectTargetsFromBody(body, targets) {
    for (var i = 0; i < body.length; i++) {
      var stmt = body[i];
      if (stmt.type === 'nb_assign' || stmt.type === 'blocking_assign') {
        if (targets.indexOf(stmt.target) === -1) {
          targets.push(stmt.target);
        }
      }
    }
  }

  function collectExprSignals(expr) {
    var set = {};
    if (expr.op === 'signal') {
      set[expr.name] = true;
    } else if (expr.op === 'literal') {
    } else if (expr.operand) {
      var sub = collectExprSignals(expr.operand);
      for (var k in sub) if (sub.hasOwnProperty(k)) set[k] = true;
    } else {
      if (expr.left) {
        var sl = collectExprSignals(expr.left);
        for (var kl in sl) if (sl.hasOwnProperty(kl)) set[kl] = true;
      }
      if (expr.right) {
        var sr = collectExprSignals(expr.right);
        for (var kr in sr) if (sr.hasOwnProperty(kr)) set[kr] = true;
      }
    }
    return set;
  }

  function findRegWriters(netlist) {
    var writers = {};

    function scanStatement(stmt) {
      if (stmt.type === 'nb_assign' || stmt.type === 'blocking_assign') {
        writers[stmt.target] = true;
      } else if (stmt.type === 'ifelse') {
        for (var i = 0; i < stmt.ifBody.length; i++) {
          scanStatement(stmt.ifBody[i]);
        }
        for (var j = 0; j < stmt.elseBody.length; j++) {
          scanStatement(stmt.elseBody[j]);
        }
      }
    }

    for (var i = 0; i < netlist.sequential.length; i++) {
      scanStatement(netlist.sequential[i]);
    }

    return writers;
  }

  function exprToString(expr) {
    if (!expr) return '';
    if (expr.op === 'signal') return expr.name;
    if (expr.op === 'literal') return String(expr.value);
    if (expr.op === 'not' || expr.op === 'lnot') return '~' + exprToString(expr.operand);
    if (expr.op === 'band' || expr.op === 'land') return '(' + exprToString(expr.left) + ' & ' + exprToString(expr.right) + ')';
    if (expr.op === 'bor' || expr.op === 'lor') return '(' + exprToString(expr.left) + ' | ' + exprToString(expr.right) + ')';
    if (expr.op === 'xor') return '(' + exprToString(expr.left) + ' ^ ' + exprToString(expr.right) + ')';
    if (expr.op === 'eq') return '(' + exprToString(expr.left) + ' == ' + exprToString(expr.right) + ')';
    if (expr.op === 'neq') return '(' + exprToString(expr.left) + ' != ' + exprToString(expr.right) + ')';
    return '?';
  }

  function runFullAnalysis(simResult, netlist) {
    simResult = simResult || {};

    var toggleCov = analyzeToggleCoverage(
      simResult.signalNames,
      simResult.signalMap,
      simResult.waveforms,
      simResult.clocks
    );

    var branchCov = analyzeBranchCoverage(
      simResult.branches,
      simResult.branchHits
    );

    var deadCode = analyzeDeadCode(
      netlist,
      toggleCov,
      simResult.depGraph,
      simResult.signalMap
    );

    if (isNaN(toggleCov.percentage)) {
      toggleCov.percentage = 0;
    }
    if (isNaN(branchCov.percentage)) {
      branchCov.percentage = 0;
    }

    return {
      toggleCoverage: toggleCov,
      branchCoverage: branchCov,
      deadCode: deadCode
    };
  }

  function drawDonutChart(canvas, percentage, color, label) {
    if (!canvas || !canvas.getContext) return;
    var ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    var size = canvas.width;
    var center = size / 2;
    var radius = size / 2 - 8;
    var innerRadius = radius * 0.6;

    ctx.clearRect(0, 0, size, size);

    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.arc(center, center, innerRadius, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(69, 71, 90, 0.5)';
    ctx.fill();

    var angle = (percentage / 100) * Math.PI * 2 - Math.PI / 2;
    ctx.beginPath();
    ctx.arc(center, center, radius, -Math.PI / 2, angle);
    ctx.arc(center, center, innerRadius, angle, -Math.PI / 2, true);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();

    var fontFamily = 'sans-serif';
    if (typeof window !== 'undefined' && window.getComputedStyle && document && document.body) {
      fontFamily = window.getComputedStyle(document.body).fontFamily || 'sans-serif';
    }

    ctx.fillStyle = '#cdd6f4';
    ctx.font = 'bold 18px ' + fontFamily;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(percentage) + '%', center, center - 5);

    ctx.fillStyle = '#6c7086';
    ctx.font = '10px ' + fontFamily;
    ctx.fillText(label, center, center + 14);
  }

  return {
    analyzeToggleCoverage: analyzeToggleCoverage,
    analyzeBranchCoverage: analyzeBranchCoverage,
    analyzeDeadCode: analyzeDeadCode,
    runFullAnalysis: runFullAnalysis,
    drawDonutChart: drawDonutChart,
    exprToString: exprToString,
    extractPercentage: extractPercentage,
    extractStats: extractStats
  };

})();
