(function() {

  var EXAMPLE_NETLIST =
    '// Coverage & Assertion Demo Circuit\n' +
    '// This design demonstrates:\n' +
    '// - Coverage analysis (branches, toggles, dead code)\n' +
    '// - Assertion checking (pass/fail assertions)\n' +
    'module coverage_demo;\n' +
    '\n' +
    '// Clock definition\n' +
    'clock clk period=10 phase=0;\n' +
    '\n' +
    'input rst, en;\n' +
    'output q0, q1, q2;\n' +
    'output valid;\n' +
    '\n' +
    '// Unused wire (dead code demo)\n' +
    'wire dead_wire, unused_and, const_zero;\n' +
    '// Wire that never toggles (AND with constant 0)\n' +
    'wire stuck_wire;\n' +
    'wire nq0, nq1, nq2;\n' +
    '\n' +
    'reg q0, q1, q2;\n' +
    'reg valid;\n' +
    'reg unused_reg;  // Never written\n' +
    '\n' +
    '// Assertion examples:\n' +
    '// Assertion 1: Should always PASS - rst can only be 0 or 1\n' +
    'assert (rst == 1 | rst == 0) : "rst must be 0 or 1";\n' +
    '// Assertion 2: Should FAIL - q0 will become 1 after en=1\n' +
    'assert (q0 == 0) : "q0 must never be 1 (this assertion will fail)";\n' +
    '// Assertion 3: Should FAIL - valid will become 1 after en=1\n' +
    'assert (valid == 0) : "valid must always be 0 (this assertion will fail)";\n' +
    '\n' +
    '// 3-bit counter\n' +
    'always @(posedge clk) begin\n' +
    '  if (rst) begin\n' +
    '    q0 <= 0;\n' +
    '    q1 <= 0;\n' +
    '    q2 <= 0;\n' +
    '    valid <= 0;\n' +
    '  end else if (en) begin\n' +
    '    q0 <= nq0;\n' +
    '    q1 <= nq1;\n' +
    '    q2 <= nq2;\n' +
    '    // This branch is reached at 30ns when en becomes 1\n' +
    '    valid <= 1;\n' +
    '  end else begin\n' +
    '    // This branch is taken when en=0\n' +
    '    valid <= 0;\n' +
    '  end\n' +
    'end\n' +
    '\n' +
    'assign nq0 = ~q0;\n' +
    'assign nq1 = q0 ^ q1;\n' +
    'assign nq2 = (q0 & q1) ^ q2;\n' +
    '\n' +
    '// Dead code: This assign is never used downstream\n' +
    'assign dead_wire = q0 & q1;\n' +
    '\n' +
    '// Unused AND gate with constant 0 input (never toggles)\n' +
    'assign const_zero = 0;\n' +
    'assign stuck_wire = const_zero & q1;\n' +
    '\n' +
    '// Another unused signal\n' +
    'assign unused_and = q2 | valid;\n' +
    '\n' +
    '// Stimulus\n' +
    'initial begin\n' +
    '  #0 rst = 1;\n' +
    '  #0 en = 0;\n' +
    '  #15 rst = 0;\n' +
    '  #30 en = 1;     // en becomes 1 at 30ns - counter starts, assertions 2 and 3 will fail\n' +
    'end\n' +
    '\n' +
    'endmodule';

  var editor = document.getElementById('editor');
  var lineNumbers = document.getElementById('line-numbers');
  var errorPanel = document.getElementById('error-panel');
  var errorList = document.getElementById('error-list');
  var btnRun = document.getElementById('btnRun');
  var btnStop = document.getElementById('btnStop');
  var btnClear = document.getElementById('btnClear');
  var clockPeriodInput = document.getElementById('clockPeriod');
  var simDurationInput = document.getElementById('simDuration');
  var gateDelayInput = document.getElementById('gateDelay');
  var simStatus = document.getElementById('sim-status');
  var glitchClose = document.getElementById('glitch-close');
  var frameClose = document.getElementById('frame-close');
  var cdcClose = document.getElementById('cdc-close');
  var divider = document.getElementById('divider');
  var editorPanel = document.getElementById('editor-panel');

  var canvas = document.getElementById('waveform-canvas');
  var signalListEl = document.getElementById('signal-list-inner');
  var viewer = new WaveformViewer(canvas, signalListEl);

  var coveragePanel = document.getElementById('coverage-panel');
  var coverageToggle = document.getElementById('coverage-toggle');
  var assertionsPanel = document.getElementById('assertions-panel');
  var assertionsToggle = document.getElementById('assertions-toggle');

  var worker = null;
  var running = false;

  editor.value = EXAMPLE_NETLIST;
  updateLineNumbers();

  editor.addEventListener('input', updateLineNumbers);

  coverageToggle.addEventListener('click', function(e) {
    e.stopPropagation();
    coveragePanel.classList.toggle('collapsed');
  });

  coveragePanel.querySelector('.coverage-header').addEventListener('click', function() {
    coveragePanel.classList.toggle('collapsed');
  });

  assertionsToggle.addEventListener('click', function(e) {
    e.stopPropagation();
    assertionsPanel.classList.toggle('collapsed');
  });

  assertionsPanel.querySelector('.assertions-header').addEventListener('click', function() {
    assertionsPanel.classList.toggle('collapsed');
  });
  editor.addEventListener('scroll', syncScroll);
  editor.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      var start = editor.selectionStart;
      var end = editor.selectionEnd;
      editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
      editor.selectionStart = editor.selectionEnd = start + 2;
      updateLineNumbers();
    }
  });

  function updateLineNumbers() {
    var lines = editor.value.split('\n').length;
    var html = '';
    for (var i = 1; i <= lines; i++) {
      html += i + '\n';
    }
    lineNumbers.textContent = html;
  }

  function syncScroll() {
    lineNumbers.scrollTop = editor.scrollTop;
  }

  btnRun.addEventListener('click', runSimulation);
  btnStop.addEventListener('click', stopSimulation);
  btnClear.addEventListener('click', clearAll);
  glitchClose.addEventListener('click', function() {
    document.getElementById('glitch-detail').classList.add('hidden');
  });

  if (frameClose) {
    frameClose.addEventListener('click', function() {
      document.getElementById('frame-detail').classList.add('hidden');
    });
  }

  if (cdcClose) {
    cdcClose.addEventListener('click', function() {
      document.getElementById('cdc-detail').classList.add('hidden');
    });
  }

  document.querySelectorAll('.dialog-close').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var dialogId = this.dataset.dialog;
      var dialog = document.getElementById(dialogId);
      if (dialog) {
        dialog.classList.add('hidden');
      }
    });
  });

  var signalFilterInput = document.getElementById('signal-filter');
  var btnNewGroup = document.getElementById('btn-new-group');

  if (signalFilterInput) {
    signalFilterInput.addEventListener('input', function() {
      viewer.setFilterText(this.value);
    });
  }

  if (btnNewGroup) {
    btnNewGroup.addEventListener('click', function() {
      var groupName = prompt('输入组名:');
      if (groupName && groupName.trim()) {
        viewer.createNewGroup(groupName.trim());
      }
    });
  }

  function runSimulation() {
    if (running) return;

    var source = editor.value;
    if (!source.trim()) return;

    errorPanel.classList.add('hidden');
    errorList.innerHTML = '';

    simStatus.textContent = 'Running...';
    simStatus.className = 'status-running';
    btnRun.disabled = true;
    btnStop.disabled = false;
    running = true;

    document.getElementById('glitch-detail').classList.add('hidden');

    try {
      worker = new Worker('worker.js');
    } catch (e) {
      runSimulationFallback(source);
      return;
    }

    worker.onmessage = function(e) {
      var msg = e.data;
      running = false;
      btnRun.disabled = false;
      btnStop.disabled = true;

      if (msg.type === 'parseError') {
        showErrors(msg.errors);
        simStatus.textContent = 'Parse Error';
        simStatus.className = 'status-error';
      } else if (msg.type === 'error') {
        showErrors([{ line: 0, message: msg.message }]);
        simStatus.textContent = 'Error';
        simStatus.className = 'status-error';
      } else if (msg.type === 'result') {
        var coverageData = msg.coverageData;
        if (!coverageData && msg.netlist) {
          try {
            var simResult = {
              signalNames: msg.signalNames,
              signalMap: msg.signalMap,
              waveforms: msg.waveforms,
              clocks: msg.clocks,
              depGraph: msg.depGraph,
              branches: msg.netlist.branches || {},
              branchHits: msg.branchHits || {}
            };
            coverageData = CoverageAnalyzer.runFullAnalysis(simResult, msg.netlist);
          } catch (e) {
            console.error('Fallback coverage analysis failed:', e);
            console.error('Error stack:', e.stack);
          }
        }
        msg.coverageData = coverageData;
        viewer.setData(msg);
        if (coverageData) {
          showCoverageReport(coverageData);
          coveragePanel.classList.remove('hidden');
          coveragePanel.classList.remove('collapsed');
          var togglePct = Math.round(CoverageAnalyzer.extractPercentage(coverageData.toggleCoverage));
          var branchPct = Math.round(CoverageAnalyzer.extractPercentage(coverageData.branchCoverage));
          simStatus.textContent = 'Done (' + msg.signalNames.length + ' sig, ' + togglePct + '% toggle, ' + branchPct + '% branch)';
        } else {
          coveragePanel.classList.add('hidden');
          simStatus.textContent = 'Done (' + msg.signalNames.length + ' signals)';
        }
        if (msg.assertions && msg.assertions.length > 0) {
          showAssertionsReport(msg.assertions, msg.assertionStatus, msg.assertionViolations);
          assertionsPanel.classList.remove('hidden');
          assertionsPanel.classList.remove('collapsed');
        } else {
          assertionsPanel.classList.add('hidden');
        }
        var cdcCount = (msg.cdcViolations || []).length;
        simStatus.className = 'status-done';
      }

      if (worker) {
        worker.terminate();
        worker = null;
      }
    };

    worker.onerror = function(e) {
      running = false;
      btnRun.disabled = false;
      btnStop.disabled = true;
      showErrors([{ line: 0, message: 'Worker error: ' + (e.message || 'Unknown') }]);
      simStatus.textContent = 'Error';
      simStatus.className = 'status-error';
    };

    worker.postMessage({
      type: 'simulate',
      source: source,
      clockPeriod: parseInt(clockPeriodInput.value, 10) || 10,
      simDuration: parseInt(simDurationInput.value, 10) || 200,
      gateDelay: parseInt(gateDelayInput.value, 10) || 1
    });
  }

  function runSimulationFallback(source) {
    try {
      var parseResult = CircuitParser.parse(source);
      if (parseResult.errors && parseResult.errors.length > 0) {
        showErrors(parseResult.errors);
        simStatus.textContent = 'Parse Error';
        simStatus.className = 'status-error';
      } else {
        var netlist = parseResult.data;
        if (!netlist.signals.clk) {
          netlist.signals.clk = { name: 'clk', type: 'clk', isReg: false };
        }
        var result = Simulator.simulate(
          netlist,
          parseInt(clockPeriodInput.value, 10) || 10,
          parseInt(simDurationInput.value, 10) || 200,
          parseInt(gateDelayInput.value, 10) || 1
        );
        var coverageData = CoverageAnalyzer.runFullAnalysis(result, netlist);
        result.coverageData = coverageData;
        result.netlist = netlist;
        viewer.setData(result);
        showCoverageReport(coverageData);
        coveragePanel.classList.remove('hidden');
        coveragePanel.classList.remove('collapsed');
        var cdcCount = (result.cdcViolations || []).length;
        var cdcText = cdcCount > 0 ? ', ' + cdcCount + ' CDC' : '';
        var togglePct = Math.round(CoverageAnalyzer.extractPercentage(coverageData.toggleCoverage));
        var branchPct = Math.round(CoverageAnalyzer.extractPercentage(coverageData.branchCoverage));
        simStatus.textContent = 'Done (' + result.signalNames.length + ' sig, ' + togglePct + '% toggle, ' + branchPct + '% branch)';
        if (result.assertions && result.assertions.length > 0) {
          showAssertionsReport(result.assertions, result.assertionStatus, result.assertionViolations);
          assertionsPanel.classList.remove('hidden');
          assertionsPanel.classList.remove('collapsed');
        } else {
          assertionsPanel.classList.add('hidden');
        }
        simStatus.className = 'status-done';
      }
    } catch (err) {
      showErrors([{ line: 0, message: err.message || String(err) }]);
      simStatus.textContent = 'Error';
      simStatus.className = 'status-error';
    }

    running = false;
    btnRun.disabled = false;
    btnStop.disabled = true;
  }

  function stopSimulation() {
    if (worker) {
      worker.terminate();
      worker = null;
    }
    running = false;
    btnRun.disabled = false;
    btnStop.disabled = true;
    simStatus.textContent = 'Stopped';
    simStatus.className = 'status-idle';
  }

  function clearAll() {
    stopSimulation();
    viewer.clear();
    viewer.clearCursors();
    viewer.setSearchMarkers([]);
    searchResults = [];
    currentSearchIdx = -1;
    updateSearchResultList();
    updateSearchNav();
    document.getElementById('search-input').value = '';
    errorPanel.classList.add('hidden');
    errorList.innerHTML = '';
    document.getElementById('glitch-detail').classList.add('hidden');
    coveragePanel.classList.add('hidden');
    assertionsPanel.classList.add('hidden');
    simStatus.textContent = 'Idle';
    simStatus.className = 'status-idle';
  }

  function showCoverageReport(coverageData) {
    if (!coverageData) return;

    var togglePct = CoverageAnalyzer.extractPercentage(coverageData.toggleCoverage);
    var branchPct = CoverageAnalyzer.extractPercentage(coverageData.branchCoverage);
    var toggleStats = CoverageAnalyzer.extractStats(coverageData.toggleCoverage);
    var branchStats = CoverageAnalyzer.extractStats(coverageData.branchCoverage);
    var deadAssigns = (coverageData.deadCode && coverageData.deadCode.deadAssigns) || [];
    var unusedRegs = (coverageData.deadCode && coverageData.deadCode.unusedRegs) || [];

    var toggleCanvas = document.getElementById('toggle-chart');
    var branchCanvas = document.getElementById('branch-chart');

    CoverageAnalyzer.drawDonutChart(toggleCanvas, togglePct, '#a6e3a1', 'Toggle');
    CoverageAnalyzer.drawDonutChart(branchCanvas, branchPct, '#fab387', 'Branch');

    var uncoveredList = document.getElementById('uncovered-list');
    var branchList = document.getElementById('branch-list');
    var deadcodeList = document.getElementById('deadcode-list');

    uncoveredList.innerHTML = '';
    branchList.innerHTML = '';
    deadcodeList.innerHTML = '';

    var uncoveredSignals = [];
    for (var sigName in toggleStats) {
      if (toggleStats.hasOwnProperty(sigName)) {
        var tc = toggleStats[sigName];
        if (tc.status === 'uncovered' || tc.status === 'stuck') {
          uncoveredSignals.push({
            name: sigName,
            reason: tc.reason,
            toggleCount: tc.toggleCount
          });
        }
      }
    }

    document.getElementById('uncovered-count').textContent = uncoveredSignals.length;
    uncoveredSignals.forEach(function(item) {
      var div = document.createElement('div');
      div.className = 'coverage-item uncovered-item';
      div.dataset.signal = item.name;
      div.innerHTML = item.name + '<span class="item-line">' + item.reason + ' (' + item.toggleCount + ' toggles)</span>';
      div.addEventListener('click', function() {
        viewer.toggleHighlight(item.name);
      });
      uncoveredList.appendChild(div);
    });

    var uncoveredBranches = [];
    for (var branchId in branchStats) {
      if (branchStats.hasOwnProperty(branchId)) {
        var bs = branchStats[branchId];
        if (bs.uncovered.length > 0) {
          uncoveredBranches.push(bs);
        }
      }
    }

    document.getElementById('unbranched-count').textContent = uncoveredBranches.length;
    uncoveredBranches.forEach(function(item) {
      var div = document.createElement('div');
      div.className = 'coverage-item branch-item';
      div.innerHTML = 'if (' + item.condition + ')<span class="item-line">Line ' + item.line + ': missing ' + item.uncovered.join(', ') + '</span>';
      branchList.appendChild(div);
    });

    var totalDead = deadAssigns.length + unusedRegs.length;
    document.getElementById('deadcode-count').textContent = totalDead;

    deadAssigns.forEach(function(item) {
      var div = document.createElement('div');
      div.className = 'coverage-item deadcode-item';
      div.dataset.signal = item.signal;
      div.innerHTML = 'assign ' + item.signal + ' = ...' + '<span class="item-line">' + item.expr + '</span>';
      div.addEventListener('click', function() {
        viewer.toggleHighlight(item.signal);
      });
      deadcodeList.appendChild(div);
    });

    unusedRegs.forEach(function(item) {
      var div = document.createElement('div');
      div.className = 'coverage-item deadcode-item';
      div.dataset.signal = item.name;
      div.innerHTML = 'reg ' + item.name + '<span class="item-line">Unused register</span>';
      div.addEventListener('click', function() {
        viewer.toggleHighlight(item.name);
      });
      deadcodeList.appendChild(div);
    });
  }

  function showAssertionsReport(assertions, assertionStatus, assertionViolations) {
    if (!assertions || assertions.length === 0) return;

    var passedCount = 0;
    for (var ai = 0; ai < assertions.length; ai++) {
      var status = assertionStatus[assertions[ai].id];
      if (status && status.passed) {
        passedCount++;
      }
    }

    document.getElementById('assertions-passed').textContent = passedCount;
    document.getElementById('assertions-total').textContent = assertions.length;

    var assertionsList = document.getElementById('assertions-list');
    assertionsList.innerHTML = '';

    for (var i = 0; i < assertions.length; i++) {
      var assertion = assertions[i];
      var status = assertionStatus[assertion.id];
      var isPassed = status ? status.passed : true;
      var firstViolation = status ? status.firstViolationTime : null;
      var violationCount = status ? status.violations : 0;

      var div = document.createElement('div');
      div.className = 'assertion-item' + (isPassed ? ' assertion-passed' : ' assertion-failed');
      div.dataset.assertId = assertion.id;

      var statusIcon = isPassed ? '<span class="assertion-status assertion-pass">✓</span>' : '<span class="assertion-status assertion-fail">✗</span>';
      var violationInfo = '';
      if (!isPassed) {
        violationInfo = '<span class="assertion-violation-info">Failed at ' + firstViolation + 'ns (' + violationCount + ' violations)</span>';
      }

      div.innerHTML =
        '<div class="assertion-header">' +
        statusIcon +
        '<span class="assertion-desc">' + assertion.description + '</span>' +
        '</div>' +
        '<div class="assertion-detail">' +
        '<span class="assertion-expr">' + assertion.exprStr + '</span>' +
        '<span class="assertion-line">Line ' + assertion.line + '</span>' +
        violationInfo +
        '</div>';

      if (!isPassed) {
        div.addEventListener('click', function() {
          var assertId = this.dataset.assertId;
          viewer.navigateToAssertionViolation(assertId);
        });
      }

      assertionsList.appendChild(div);
    }
  }

  function showErrors(errors) {
    errorPanel.classList.remove('hidden');
    var html = '';
    for (var i = 0; i < errors.length; i++) {
      html += '<div class="error-item">';
      if (errors[i].line) {
        html += '<span class="line-num">Line ' + errors[i].line + ':</span> ';
      }
      html += errors[i].message + '</div>';
    }
    errorList.innerHTML = html;
  }

  var isDragging = false;
  var startX = 0;
  var startWidth = 0;

  divider.addEventListener('mousedown', function(e) {
    isDragging = true;
    startX = e.clientX;
    startWidth = editorPanel.offsetWidth;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e) {
    if (!isDragging) return;
    var dx = e.clientX - startX;
    var newWidth = Math.max(280, Math.min(800, startWidth + dx));
    editorPanel.style.width = newWidth + 'px';
    viewer.resize();
    viewer.draw();
  });

  document.addEventListener('mouseup', function() {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  });

  viewer.resize();
  viewer.draw();

  function parseSearchQuery(query) {
    var tokens = [];
    var current = '';
    for (var i = 0; i < query.length; i++) {
      var ch = query[i];
      if (ch === ' ' || ch === '\t') {
        if (current.length > 0) {
          tokens.push(current);
          current = '';
        }
      } else {
        current += ch;
      }
    }
    if (current.length > 0) {
      tokens.push(current);
    }

    if (tokens.length === 0) return null;

    var firstToken = tokens[0];
    var dotPos = firstToken.indexOf('.');
    if (dotPos === -1) return null;

    var signal1 = firstToken.substring(0, dotPos);
    var edge1 = firstToken.substring(dotPos + 1);

    if (edge1 !== 'rise' && edge1 !== 'fall') return null;

    if (tokens.length === 1) {
      return { type: 'single', signal: signal1, edge: edge1 };
    }

    if (tokens.length >= 4 && tokens[1] === 'within') {
      var withinStr = tokens[2];
      var withinNs = 0;
      var numEnd = 0;
      for (var ni = 0; ni < withinStr.length; ni++) {
        var nc = withinStr.charCodeAt(ni);
        if (nc >= 48 && nc <= 57 || nc === 46) {
          numEnd = ni + 1;
        } else {
          break;
        }
      }
      withinNs = parseFloat(withinStr.substring(0, numEnd));
      if (isNaN(withinNs) || withinNs <= 0) return null;

      var secondToken = tokens[3];
      var dotPos2 = secondToken.indexOf('.');
      if (dotPos2 === -1) return null;

      var signal2 = secondToken.substring(0, dotPos2);
      var edge2 = secondToken.substring(dotPos2 + 1);

      if (edge2 !== 'rise' && edge2 !== 'fall') return null;

      return {
        type: 'within',
        signal1: signal1,
        edge1: edge1,
        withinNs: withinNs,
        signal2: signal2,
        edge2: edge2
      };
    }

    return null;
  }

  function executeSearch(parsed) {
    if (!parsed) return [];
    var results = [];

    if (parsed.type === 'single') {
      var edges = viewer.findEdges(parsed.signal, parsed.edge);
      for (var i = 0; i < edges.length; i++) {
        var t = edges[i];
        var val = viewer.getValueAtTime(parsed.signal, t);
        results.push({
          time: t,
          description: parsed.signal + '.' + parsed.edge,
          signalValue: parsed.signal + '=' + val
        });
      }
    } else if (parsed.type === 'within') {
      var edges1 = viewer.findEdges(parsed.signal1, parsed.edge1);
      var edges2 = viewer.findEdges(parsed.signal2, parsed.edge2);

      for (var ei = 0; ei < edges1.length; ei++) {
        var t1 = edges1[ei];
        for (var ej = 0; ej < edges2.length; ej++) {
          var t2 = edges2[ej];
          var diff = t2 - t1;
          if (diff >= 0 && diff <= parsed.withinNs) {
            var val1 = viewer.getValueAtTime(parsed.signal1, t1);
            var val2 = viewer.getValueAtTime(parsed.signal2, t2);
            results.push({
              time: t1,
              description: parsed.signal1 + '.' + parsed.edge1 + ' @' + t1.toFixed(2) + 'ns → ' +
                parsed.signal2 + '.' + parsed.edge2 + ' @' + t2.toFixed(2) + 'ns (Δ' + diff.toFixed(2) + 'ns)',
              signalValue: parsed.signal1 + '=' + val1 + ', ' + parsed.signal2 + '=' + val2
            });
            break;
          }
          if (t2 > t1 + parsed.withinNs) break;
        }
      }
    }

    return results;
  }

  var searchResults = [];
  var currentSearchIdx = -1;

  function doSearch() {
    var query = document.getElementById('search-input').value.trim();
    if (!query) return;

    var parsed = parseSearchQuery(query);
    if (!parsed) {
      alert('Invalid search syntax. Examples:\n  q0.rise\n  q0.rise within 10ns q1.rise');
      return;
    }

    searchResults = executeSearch(parsed);
    currentSearchIdx = -1;

    var markers = [];
    for (var i = 0; i < searchResults.length; i++) {
      markers.push({ time: searchResults[i].time });
    }
    viewer.setSearchMarkers(markers);

    updateSearchResultList();
    updateSearchNav();
  }

  function updateSearchResultList() {
    var container = document.getElementById('search-results');
    if (searchResults.length === 0) {
      container.classList.add('hidden');
      container.innerHTML = '';
      return;
    }

    container.classList.remove('hidden');
    var html = '';
    var maxShow = Math.min(searchResults.length, 50);
    for (var i = 0; i < maxShow; i++) {
      var r = searchResults[i];
      html += '<div class="search-result-item" data-idx="' + i + '">' +
        '<span class="search-result-time">' + r.time.toFixed(2) + 'ns</span>' +
        '<span class="search-result-desc">' + r.signalValue + '</span>' +
        '<span class="search-result-edge">' + r.description + '</span></div>';
    }
    if (searchResults.length > 50) {
      html += '<div class="search-result-item" style="color:var(--text-muted);cursor:default;">...and ' + (searchResults.length - 50) + ' more results</div>';
    }
    container.innerHTML = html;

    container.querySelectorAll('.search-result-item[data-idx]').forEach(function(item) {
      item.addEventListener('click', function() {
        var idx = parseInt(this.dataset.idx, 10);
        goToSearchResult(idx);
      });
    });
  }

  function updateSearchNav() {
    var prevBtn = document.getElementById('btn-search-prev');
    var nextBtn = document.getElementById('btn-search-next');
    var indexSpan = document.getElementById('search-result-index');

    if (searchResults.length === 0) {
      prevBtn.disabled = true;
      nextBtn.disabled = true;
      indexSpan.textContent = '0/0';
      return;
    }

    prevBtn.disabled = currentSearchIdx <= 0;
    nextBtn.disabled = currentSearchIdx >= searchResults.length - 1;
    indexSpan.textContent = (currentSearchIdx >= 0 ? currentSearchIdx + 1 : 0) + '/' + searchResults.length;
  }

  function goToSearchResult(idx) {
    if (idx < 0 || idx >= searchResults.length) return;
    currentSearchIdx = idx;
    viewer.navigateToSearchResult(idx);
    updateSearchNav();

    var container = document.getElementById('search-results');
    var items = container.querySelectorAll('.search-result-item[data-idx]');
    for (var i = 0; i < items.length; i++) {
      var itemIdx = parseInt(items[i].dataset.idx, 10);
      items[i].classList.toggle('active', itemIdx === idx);
    }
  }

  var btnSetCursorA = document.getElementById('btn-set-cursor-a');
  var btnSetCursorB = document.getElementById('btn-set-cursor-b');
  var btnClearCursors = document.getElementById('btn-clear-cursors');

  btnSetCursorA.addEventListener('click', function() {
    if (viewer.cursorPlacementMode === 'A') {
      viewer.cursorPlacementMode = null;
      btnSetCursorA.classList.remove('active');
    } else {
      viewer.setPlacementMode('A');
      btnSetCursorA.classList.add('active');
      btnSetCursorB.classList.remove('active');
    }
  });

  btnSetCursorB.addEventListener('click', function() {
    if (viewer.cursorPlacementMode === 'B') {
      viewer.cursorPlacementMode = null;
      btnSetCursorB.classList.remove('active');
    } else {
      viewer.setPlacementMode('B');
      btnSetCursorB.classList.add('active');
      btnSetCursorA.classList.remove('active');
    }
  });

  btnClearCursors.addEventListener('click', function() {
    viewer.clearCursors();
    viewer.setSearchMarkers([]);
    searchResults = [];
    currentSearchIdx = -1;
    updateSearchResultList();
    updateSearchNav();
    document.getElementById('search-input').value = '';
    btnSetCursorA.classList.remove('active');
    btnSetCursorB.classList.remove('active');
  });

  viewer.onCursorPlaced = function() {
    btnSetCursorA.classList.remove('active');
    btnSetCursorB.classList.remove('active');
  };

  var btnSearch = document.getElementById('btn-search');
  var btnSearchPrev = document.getElementById('btn-search-prev');
  var btnSearchNext = document.getElementById('btn-search-next');
  var searchInput = document.getElementById('search-input');

  btnSearch.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') doSearch();
  });

  btnSearchPrev.addEventListener('click', function() {
    if (currentSearchIdx > 0) goToSearchResult(currentSearchIdx - 1);
  });

  btnSearchNext.addEventListener('click', function() {
    if (currentSearchIdx < searchResults.length - 1) goToSearchResult(currentSearchIdx + 1);
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      if (viewer.cursorPlacementMode) {
        viewer.cursorPlacementMode = null;
        btnSetCursorA.classList.remove('active');
        btnSetCursorB.classList.remove('active');
        return;
      }
      if (viewer.cursorATime >= 0 || viewer.cursorBTime >= 0) {
        viewer.clearCursors();
        btnSetCursorA.classList.remove('active');
        btnSetCursorB.classList.remove('active');
        return;
      }
    }
  });

})();
