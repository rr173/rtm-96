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

  var btnSaveSnapshot = document.getElementById('btn-save-snapshot');
  var btnCompare = document.getElementById('btn-compare');
  var compareDropdownMenu = document.getElementById('compare-dropdown-menu');
  var compareSnapshotList = document.getElementById('compare-snapshot-list');
  var btnExitCompare = document.getElementById('btn-exit-compare');
  var saveSnapshotDialog = document.getElementById('save-snapshot-dialog');
  var snapshotNameInput = document.getElementById('snapshot-name-input');
  var btnConfirmSnapshot = document.getElementById('btn-confirm-snapshot');
  var btnCancelSnapshot = document.getElementById('btn-cancel-snapshot');
  var diffSummaryClose = document.getElementById('diff-summary-close');

  if (btnSaveSnapshot) {
    btnSaveSnapshot.addEventListener('click', function() {
      if (!viewer.waveforms || Object.keys(viewer.waveforms).length === 0) {
        alert('请先运行仿真以生成波形数据');
        return;
      }
      snapshotNameInput.value = '';
      saveSnapshotDialog.classList.remove('hidden');
      snapshotNameInput.focus();
    });
  }

  if (btnConfirmSnapshot) {
    btnConfirmSnapshot.addEventListener('click', function() {
      var name = snapshotNameInput.value.trim();
      if (viewer.saveSnapshot(name)) {
        saveSnapshotDialog.classList.add('hidden');
        updateCompareDropdown();
      } else {
        alert('保存快照失败');
      }
    });
  }

  if (btnCancelSnapshot) {
    btnCancelSnapshot.addEventListener('click', function() {
      saveSnapshotDialog.classList.add('hidden');
    });
  }

  if (snapshotNameInput) {
    snapshotNameInput.addEventListener('keydown', function(e) {
      if (e.key === 'Enter') {
        btnConfirmSnapshot.click();
      } else if (e.key === 'Escape') {
        saveSnapshotDialog.classList.add('hidden');
      }
    });
  }

  if (btnCompare) {
    btnCompare.addEventListener('click', function(e) {
      e.stopPropagation();
      updateCompareDropdown();
      compareDropdownMenu.classList.toggle('hidden');
    });
  }

  document.addEventListener('click', function(e) {
    if (compareDropdownMenu && !compareDropdownMenu.classList.contains('hidden')) {
      if (!compareDropdownMenu.contains(e.target) && e.target !== btnCompare) {
        compareDropdownMenu.classList.add('hidden');
      }
    }
  });

  if (btnExitCompare) {
    btnExitCompare.addEventListener('click', function() {
      viewer.exitCompareMode();
      compareDropdownMenu.classList.add('hidden');
      updateCompareDropdown();
    });
  }

  if (diffSummaryClose) {
    diffSummaryClose.addEventListener('click', function() {
      document.getElementById('diff-summary-panel').classList.add('hidden');
    });
  }

  function updateCompareDropdown() {
    if (!compareSnapshotList) return;

    var snapshots = viewer.snapshots || [];
    var html = '';

    if (snapshots.length === 0) {
      html = '<div class="dropdown-item" style="color:var(--text-muted);cursor:default;">No snapshots saved</div>';
    } else {
      for (var i = 0; i < snapshots.length; i++) {
        var snap = snapshots[i];
        var timeStr = new Date(snap.createdAt).toLocaleTimeString('zh-CN', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit'
        });
        html +=
          '<div class="snapshot-item" data-snapshot-id="' + snap.id + '">' +
          '<span class="snapshot-item-name">' + snap.name + '</span>' +
          '<span class="snapshot-item-time">' + timeStr + '</span>' +
          '<button class="snapshot-item-delete" data-snapshot-id="' + snap.id + '" title="Delete">✕</button>' +
          '</div>';
      }
    }

    compareSnapshotList.innerHTML = html;

    compareSnapshotList.querySelectorAll('.snapshot-item').forEach(function(item) {
      item.addEventListener('click', function(e) {
        if (e.target.classList.contains('snapshot-item-delete')) {
          e.stopPropagation();
          var snapId = e.target.dataset.snapshotId;
          viewer.deleteSnapshot(snapId);
          updateCompareDropdown();
        } else {
          var snapId = this.dataset.snapshotId;
          if (viewer.enterCompareMode(snapId)) {
            compareDropdownMenu.classList.add('hidden');
            updateCompareDropdown();
          }
        }
      });
    });

    if (btnExitCompare) {
      if (viewer.compareMode) {
        btnExitCompare.classList.remove('hidden');
      } else {
        btnExitCompare.classList.add('hidden');
      }
    }
  }

  updateCompareDropdown();

  var ParamSweepEngine = (function() {
    var parameters = [];
    var metrics = [];
    var combinations = [];
    var results = [];
    var currentComboIndex = 0;
    var isSweeping = false;
    var sweepWorker = null;
    var shouldCancel = false;
    var selectedResultIndex = -1;
    var sortColumn = null;
    var sortDirection = 'asc';
    var currentCombo = null;

    var MAX_PARAMS = 3;
    var MAX_METRICS = 5;
    var MAX_COMBINATIONS = 200;

    var paramSweepPanel = document.getElementById('param-sweep-panel');
    var paramSweepToggle = document.getElementById('param-sweep-toggle');
    var paramSweepHeader = paramSweepPanel ? paramSweepPanel.querySelector('.param-sweep-header') : null;
    var paramListEl = document.getElementById('param-list');
    var metricListEl = document.getElementById('metric-list');
    var btnAddParam = document.getElementById('btn-add-param');
    var btnAddMetric = document.getElementById('btn-add-metric');
    var btnRunSweep = document.getElementById('btn-run-sweep');
    var btnCancelSweep = document.getElementById('btn-cancel-sweep');
    var combinationsLabel = document.getElementById('param-sweep-combinations');
    var sweepProgress = document.getElementById('sweep-progress');
    var sweepResultsDialog = document.getElementById('sweep-results-dialog');
    var sweepResultsClose = document.getElementById('sweep-results-close');
    var tabTable = document.getElementById('tab-table');
    var tabHeatmap = document.getElementById('tab-heatmap');
    var tableView = document.getElementById('sweep-table-view');
    var heatmapView = document.getElementById('sweep-heatmap-view');
    var sweepTableContainer = document.getElementById('sweep-table-container');
    var heatmapCanvas = document.getElementById('heatmap-canvas');
    var heatmapMetricSelect = document.getElementById('heatmap-metric-select-2');

    function init() {
      if (!paramSweepPanel) return;

      paramSweepToggle.addEventListener('click', function(e) {
        e.stopPropagation();
        paramSweepPanel.classList.toggle('collapsed');
      });

      if (paramSweepHeader) {
        paramSweepHeader.addEventListener('click', function() {
          paramSweepPanel.classList.toggle('collapsed');
        });
      }

      btnAddParam.addEventListener('click', addParameter);
      btnAddMetric.addEventListener('click', addMetric);
      btnRunSweep.addEventListener('click', startSweep);
      btnCancelSweep.addEventListener('click', cancelSweep);

      sweepResultsClose.addEventListener('click', function() {
        sweepResultsDialog.classList.add('hidden');
      });

      tabTable.addEventListener('click', function() {
        switchTab('table');
      });

      tabHeatmap.addEventListener('click', function() {
        switchTab('heatmap');
      });

      if (heatmapMetricSelect) {
        heatmapMetricSelect.addEventListener('change', function() {
          drawHeatmap();
        });
      }

      addParameter();
      addMetric();

      paramSweepPanel.classList.remove('hidden');
      paramSweepPanel.classList.remove('collapsed');
    }

    function getInitialTargets() {
      var targets = [
        { value: 'clock_period', label: 'Clock Period' },
        { value: 'gate_delay', label: 'Gate Delay' }
      ];

      var source = editor.value;
      var initialRegex = /#(\d+)\s+(\w+)\s*=/g;
      var match;
      var seen = new Set();
      while ((match = initialRegex.exec(source)) !== null) {
        var key = 'initial_' + match[2];
        if (!seen.has(key)) {
          seen.add(key);
          targets.push({
            value: key,
            label: 'Initial: ' + match[2] + ' (#' + match[1] + ')'
          });
        }
      }

      return targets;
    }

    function addParameter() {
      if (parameters.length >= MAX_PARAMS) {
        alert('Maximum ' + MAX_PARAMS + ' parameters allowed');
        return;
      }

      var id = Date.now();
      var targets = getInitialTargets();
      var param = {
        id: id,
        name: 'param' + (parameters.length + 1),
        target: targets[0].value,
        start: 10,
        end: 20,
        step: 5
      };
      parameters.push(param);
      renderParameters();
      updateCombinations();
    }

    function removeParameter(id) {
      parameters = parameters.filter(function(p) { return p.id !== id; });
      renderParameters();
      updateCombinations();
    }

    function renderParameters() {
      if (!paramListEl) return;

      if (parameters.length === 0) {
        paramListEl.innerHTML = '<div class="empty-param-list">No parameters. Click "Add" to add one.</div>';
        return;
      }

      var targets = getInitialTargets();
      var html = '';
      for (var i = 0; i < parameters.length; i++) {
        var p = parameters[i];
        html += '<div class="param-row" data-id="' + p.id + '">' +
          '<div class="param-row-header">' +
          '<input type="text" class="param-name" value="' + p.name + '" placeholder="Name">' +
          '<button class="param-delete" data-id="' + p.id + '">✕</button>' +
          '</div>' +
          '<div class="param-row-fields">' +
          '<select class="param-target">';
        for (var t = 0; t < targets.length; t++) {
          html += '<option value="' + targets[t].value + '"' + (p.target === targets[t].value ? ' selected' : '') + '>' + targets[t].label + '</option>';
        }
        html += '</select>' +
          '<input type="number" class="param-start" value="' + p.start + '" placeholder="Start" min="1">' +
          '<input type="number" class="param-end" value="' + p.end + '" placeholder="End" min="1">' +
          '<input type="number" class="param-step" value="' + p.step + '" placeholder="Step" min="1">' +
          '</div>' +
          '</div>';
      }
      paramListEl.innerHTML = html;

      paramListEl.querySelectorAll('.param-delete').forEach(function(btn) {
        btn.addEventListener('click', function() {
          removeParameter(parseInt(this.dataset.id, 10));
        });
      });

      paramListEl.querySelectorAll('.param-name').forEach(function(input) {
        input.addEventListener('input', function() {
          var row = this.closest('.param-row');
          var id = parseInt(row.dataset.id, 10);
          var p = parameters.find(function(x) { return x.id === id; });
          if (p) p.name = this.value;
        });
      });

      paramListEl.querySelectorAll('.param-target').forEach(function(select) {
        select.addEventListener('change', function() {
          var row = this.closest('.param-row');
          var id = parseInt(row.dataset.id, 10);
          var p = parameters.find(function(x) { return x.id === id; });
          if (p) p.target = this.value;
          updateCombinations();
        });
      });

      paramListEl.querySelectorAll('.param-start, .param-end, .param-step').forEach(function(input) {
        input.addEventListener('input', function() {
          var row = this.closest('.param-row');
          var id = parseInt(row.dataset.id, 10);
          var p = parameters.find(function(x) { return x.id === id; });
          if (p) {
            if (this.classList.contains('param-start')) p.start = parseFloat(this.value) || 0;
            if (this.classList.contains('param-end')) p.end = parseFloat(this.value) || 0;
            if (this.classList.contains('param-step')) p.step = parseFloat(this.value) || 1;
          }
          updateCombinations();
        });
      });
    }

    function addMetric() {
      if (metrics.length >= MAX_METRICS) {
        alert('Maximum ' + MAX_METRICS + ' metrics allowed');
        return;
      }

      var id = Date.now();
      var metric = {
        id: id,
        name: 'metric' + (metrics.length + 1),
        type: 'toggle_count',
        targetSignal: 'q0'
      };
      metrics.push(metric);
      renderMetrics();
    }

    function removeMetric(id) {
      metrics = metrics.filter(function(m) { return m.id !== id; });
      renderMetrics();
    }

    function getSignalNames() {
      var names = [];
      if (viewer && viewer.signalNames) {
        names = viewer.signalNames.slice();
      }
      if (names.length === 0) {
        names = ['clk', 'rst', 'en', 'q0', 'q1', 'q2', 'valid'];
      }
      return names;
    }

    function renderMetrics() {
      if (!metricListEl) return;

      if (metrics.length === 0) {
        metricListEl.innerHTML = '<div class="empty-metric-list">No metrics. Click "Add" to add one.</div>';
        return;
      }

      var signalNames = getSignalNames();
      var metricTypes = [
        { value: 'toggle_count', label: 'Toggle Count', needsSignal: true },
        { value: 'assertion_violations', label: 'Assertion Violations', needsSignal: false },
        { value: 'toggle_coverage', label: 'Toggle Coverage', needsSignal: false },
        { value: 'branch_coverage', label: 'Branch Coverage', needsSignal: false }
      ];

      var html = '';
      for (var i = 0; i < metrics.length; i++) {
        var m = metrics[i];
        html += '<div class="metric-row" data-id="' + m.id + '">' +
          '<div class="metric-row-header">' +
          '<input type="text" class="metric-name" value="' + m.name + '" placeholder="Name">' +
          '<button class="metric-delete" data-id="' + m.id + '">✕</button>' +
          '</div>' +
          '<div class="metric-row-fields">' +
          '<select class="metric-type">';
        for (var t = 0; t < metricTypes.length; t++) {
          html += '<option value="' + metricTypes[t].value + '"' + (m.type === metricTypes[t].value ? ' selected' : '') + '>' + metricTypes[t].label + '</option>';
        }
        html += '</select>' +
          '<input type="text" class="metric-signal" value="' + (m.targetSignal || '') + '" placeholder="Signal Name" ' +
          (m.type === 'toggle_count' ? '' : 'style="display:none;"') + '>' +
          '</div>' +
          '</div>';
      }
      metricListEl.innerHTML = html;

      metricListEl.querySelectorAll('.metric-delete').forEach(function(btn) {
        btn.addEventListener('click', function() {
          removeMetric(parseInt(this.dataset.id, 10));
        });
      });

      metricListEl.querySelectorAll('.metric-name').forEach(function(input) {
        input.addEventListener('input', function() {
          var row = this.closest('.metric-row');
          var id = parseInt(row.dataset.id, 10);
          var m = metrics.find(function(x) { return x.id === id; });
          if (m) m.name = this.value;
        });
      });

      metricListEl.querySelectorAll('.metric-type').forEach(function(select) {
        select.addEventListener('change', function() {
          var row = this.closest('.metric-row');
          var id = parseInt(row.dataset.id, 10);
          var m = metrics.find(function(x) { return x.id === id; });
          if (m) {
            m.type = this.value;
            var signalInput = row.querySelector('.metric-signal');
            if (m.type === 'toggle_count') {
              signalInput.style.display = '';
            } else {
              signalInput.style.display = 'none';
            }
          }
        });
      });

      metricListEl.querySelectorAll('.metric-signal').forEach(function(input) {
        input.addEventListener('input', function() {
          var row = this.closest('.metric-row');
          var id = parseInt(row.dataset.id, 10);
          var m = metrics.find(function(x) { return x.id === id; });
          if (m) m.targetSignal = this.value;
        });
      });
    }

    function updateCombinations() {
      combinations = generateCombinations();
      if (combinationsLabel) {
        var text = 'Total: ' + combinations.length + ' combinations';
        combinationsLabel.textContent = text;
        if (combinations.length > MAX_COMBINATIONS) {
          combinationsLabel.classList.add('warning');
        } else {
          combinationsLabel.classList.remove('warning');
        }
      }
    }

    function generateCombinations() {
      var paramValues = [];
      for (var i = 0; i < parameters.length; i++) {
        var p = parameters[i];
        var values = [];
        var start = Math.min(p.start, p.end);
        var end = Math.max(p.start, p.end);
        var step = Math.max(0.1, Math.abs(p.step));
        for (var v = start; v <= end + step / 100; v += step) {
          values.push(Math.round(v * 100) / 100);
        }
        paramValues.push({ param: p, values: values });
      }

      function cartesianProduct(arrays, index, current, result) {
        if (index === arrays.length) {
          result.push(current.slice());
          return;
        }
        for (var i = 0; i < arrays[index].values.length; i++) {
          current.push({ param: arrays[index].param, value: arrays[index].values[i] });
          cartesianProduct(arrays, index + 1, current, result);
          current.pop();
        }
      }

      var result = [];
      if (paramValues.length > 0) {
        cartesianProduct(paramValues, 0, [], result);
      }
      return result;
    }

    function applyParametersToSource(source, combo) {
      var modifiedSource = source;
      for (var i = 0; i < combo.length; i++) {
        var pv = combo[i];
        var target = pv.param.target;
        var value = pv.value;

        if (target === 'clock_period') {
          modifiedSource = modifiedSource.replace(
            /clock\s+(\w+)\s+period=\s*\d+/g,
            'clock $1 period=' + value
          );
        } else if (target === 'gate_delay') {
        } else if (target.indexOf('initial_') === 0) {
          var signalName = target.substring('initial_'.length);
          var regex = new RegExp('#\\d+\\s+' + signalName + '\\s*=', 'g');
          modifiedSource = modifiedSource.replace(regex, '#' + value + ' ' + signalName + '=');
        }
      }
      return modifiedSource;
    }

    function getClockPeriodFromCombo(combo) {
      for (var i = 0; i < combo.length; i++) {
        if (combo[i].param.target === 'clock_period') {
          return combo[i].value;
        }
      }
      return parseInt(clockPeriodInput.value, 10) || 10;
    }

    function getGateDelayFromCombo(combo) {
      for (var i = 0; i < combo.length; i++) {
        if (combo[i].param.target === 'gate_delay') {
          return combo[i].value;
        }
      }
      return parseInt(gateDelayInput.value, 10) || 1;
    }

    function startSweep() {
      if (isSweeping) return;
      if (parameters.length === 0) {
        alert('Please add at least one parameter');
        return;
      }
      if (metrics.length === 0) {
        alert('Please add at least one metric');
        return;
      }
      if (combinations.length === 0) {
        alert('No parameter combinations to run');
        return;
      }
      if (combinations.length > MAX_COMBINATIONS) {
        alert('Too many combinations. Maximum is ' + MAX_COMBINATIONS);
        return;
      }

      results = [];
      currentComboIndex = 0;
      isSweeping = true;
      shouldCancel = false;
      selectedResultIndex = -1;

      btnRunSweep.disabled = true;
      btnCancelSweep.disabled = false;
      sweepProgress.classList.add('running');

      initSweepWorker();
      runNextCombination();
    }

    function initSweepWorker() {
      if (sweepWorker) {
        try {
          sweepWorker.terminate();
        } catch (e) {}
      }

      try {
        sweepWorker = new Worker('worker.js');
        sweepWorker.onmessage = function(e) {
          var msg = e.data;
          handleSweepResult(msg);
        };
        sweepWorker.onerror = function(e) {
          console.error('Sweep worker error:', e);
          handleSweepResult({ type: 'error', message: e.message });
        };
      } catch (e) {
        sweepWorker = null;
      }
    }

    function runNextCombination() {
      if (shouldCancel || currentComboIndex >= combinations.length) {
        finishSweep();
        return;
      }

      currentCombo = combinations[currentComboIndex];
      sweepProgress.textContent = (currentComboIndex + 1) + '/' + combinations.length;

      var source = editor.value;
      var modifiedSource = applyParametersToSource(source, currentCombo);
      var clockPeriod = getClockPeriodFromCombo(currentCombo);
      var gateDelay = getGateDelayFromCombo(currentCombo);
      var simDuration = parseInt(simDurationInput.value, 10) || 200;

      if (sweepWorker) {
        sweepWorker.postMessage({
          type: 'simulate',
          source: modifiedSource,
          clockPeriod: clockPeriod,
          simDuration: simDuration,
          gateDelay: gateDelay
        });
      } else {
        runCombinationFallback(modifiedSource, clockPeriod, simDuration, gateDelay);
      }
    }

    function runCombinationFallback(source, clockPeriod, simDuration, gateDelay) {
      try {
        var parseResult = CircuitParser.parse(source);
        if (parseResult.errors && parseResult.errors.length > 0) {
          handleSweepResult({ type: 'parseError', errors: parseResult.errors });
        } else {
          var netlist = parseResult.data;
          if (!netlist.signals.clk) {
            netlist.signals.clk = { name: 'clk', type: 'clk', isReg: false };
          }
          var result = Simulator.simulate(netlist, clockPeriod, simDuration, gateDelay);
          result.type = 'result';
          var coverageData;
          try {
            if (typeof CoverageAnalyzer !== 'undefined' && CoverageAnalyzer.runFullAnalysis) {
              coverageData = CoverageAnalyzer.runFullAnalysis(result, netlist);
              result.coverageData = coverageData;
            }
          } catch (e) {}
          handleSweepResult(result);
        }
      } catch (e) {
        console.error('Sweep fallback error:', e);
        handleSweepResult({ type: 'error', message: e.message });
      }
    }

    function handleSweepResult(msg) {
      var combo = currentCombo;
      var metricValues = {};
      var hasError = msg.type === 'parseError' || msg.type === 'error';

      if (!hasError && (msg.type === 'result' || msg.signalNames)) {
        for (var i = 0; i < metrics.length; i++) {
          var m = metrics[i];
          metricValues[m.name] = extractMetric(msg, m);
        }
      }

      results.push({
        combo: combo,
        error: hasError,
        metrics: metricValues,
        fullResult: msg
      });

      currentComboIndex++;
      setTimeout(runNextCombination, 10);
    }

    function extractMetric(result, metric) {
      if (!result) return 0;

      switch (metric.type) {
        case 'toggle_count':
          return getToggleCount(result, metric.targetSignal);
        case 'assertion_violations':
          return getAssertionViolations(result);
        case 'toggle_coverage':
          return getToggleCoverage(result);
        case 'branch_coverage':
          return getBranchCoverage(result);
        default:
          return 0;
      }
    }

    function getToggleCount(result, signalName) {
      if (!result.waveforms || !result.signalMap) return 0;
      var sigIdx = result.signalMap[signalName];
      if (sigIdx === undefined) return 0;
      var waveform = result.waveforms[sigIdx];
      if (!waveform || waveform.length < 2) return 0;

      var count = 0;
      for (var i = 1; i < waveform.length; i++) {
        if (waveform[i].value !== waveform[i - 1].value) {
          count++;
        }
      }
      return count;
    }

    function getAssertionViolations(result) {
      if (!result.assertionStatus) return 0;
      var total = 0;
      for (var id in result.assertionStatus) {
        if (result.assertionStatus.hasOwnProperty(id)) {
          total += result.assertionStatus[id].violations || 0;
        }
      }
      return total;
    }

    function getToggleCoverage(result) {
      if (result.coverageData && result.coverageData.toggleCoverage) {
        try {
          return Math.round(CoverageAnalyzer.extractPercentage(result.coverageData.toggleCoverage));
        } catch (e) {
          return 0;
        }
      }
      return 0;
    }

    function getBranchCoverage(result) {
      if (result.coverageData && result.coverageData.branchCoverage) {
        try {
          return Math.round(CoverageAnalyzer.extractPercentage(result.coverageData.branchCoverage));
        } catch (e) {
          return 0;
        }
      }
      return 0;
    }

    function cancelSweep() {
      shouldCancel = true;
      if (sweepWorker) {
        try {
          sweepWorker.terminate();
        } catch (e) {}
        sweepWorker = null;
      }
    }

    function finishSweep() {
      isSweeping = false;
      btnRunSweep.disabled = false;
      btnCancelSweep.disabled = true;
      sweepProgress.classList.remove('running');
      sweepProgress.textContent = 'Done (' + results.length + '/' + combinations.length + ')';

      if (sweepWorker) {
        try {
          sweepWorker.terminate();
        } catch (e) {}
        sweepWorker = null;
      }

      if (results.length > 0) {
        try {
          showResultsDialog();
        } catch (e) {
          console.error('Error showing results dialog:', e);
        }
      }
    }

    function showResultsDialog() {
      if (!sweepResultsDialog) return;

      if (parameters.length === 2) {
        tabHeatmap.style.display = '';
      } else {
        tabHeatmap.style.display = 'none';
      }

      updateMetricSelects();
      renderTable();
      switchTab('table');

      sweepResultsDialog.classList.remove('hidden');
    }

    function updateMetricSelects() {
      var selects = [
        document.getElementById('heatmap-metric-select'),
        document.getElementById('heatmap-metric-select-2')
      ];

      for (var s = 0; s < selects.length; s++) {
        var select = selects[s];
        if (!select) continue;
        select.innerHTML = '';
        for (var i = 0; i < metrics.length; i++) {
          var option = document.createElement('option');
          option.value = metrics[i].name;
          option.textContent = metrics[i].name;
          select.appendChild(option);
        }
      }
    }

    function switchTab(tab) {
      tabTable.classList.toggle('active', tab === 'table');
      tabHeatmap.classList.toggle('active', tab === 'heatmap');
      tableView.classList.toggle('hidden', tab !== 'table');
      heatmapView.classList.toggle('hidden', tab !== 'heatmap');

      if (tab === 'heatmap') {
        setTimeout(drawHeatmap, 50);
      }
    }

    function renderTable() {
      if (!sweepTableContainer) return;

      var sortedResults = results.slice();
      if (sortColumn !== null) {
        sortedResults.sort(function(a, b) {
          var valA = getSortValue(a, sortColumn);
          var valB = getSortValue(b, sortColumn);
          if (sortDirection === 'asc') {
            return valA > valB ? 1 : valA < valB ? -1 : 0;
          } else {
            return valA < valB ? 1 : valA > valB ? -1 : 0;
          }
        });
      }

      var html = '<table class="sweep-table"><thead><tr>';
      html += '<th>#</th>';
      for (var i = 0; i < parameters.length; i++) {
        html += '<th class="sortable" data-col="param_' + i + '">' + parameters[i].name + '</th>';
      }
      for (var j = 0; j < metrics.length; j++) {
        html += '<th class="sortable" data-col="metric_' + j + '">' + metrics[j].name + '</th>';
      }
      html += '</tr></thead><tbody>';

      for (var r = 0; r < sortedResults.length; r++) {
        var res = sortedResults[r];
        html += '<tr class="result-row" data-idx="' + r + '">';
        html += '<td>' + (r + 1) + '</td>';
        for (var p = 0; p < parameters.length; p++) {
          var val = '';
          for (var c = 0; c < res.combo.length; c++) {
            if (res.combo[c].param.id === parameters[p].id) {
              val = res.combo[c].value;
              break;
            }
          }
          html += '<td class="param-value">' + val + '</td>';
        }
        for (var m = 0; m < metrics.length; m++) {
          var mval = res.metrics[metrics[m].name];
          html += '<td class="metric-value">' + (res.error ? 'Error' : (mval !== undefined ? mval : '-')) + '</td>';
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
      sweepTableContainer.innerHTML = html;

      sweepTableContainer.querySelectorAll('th.sortable').forEach(function(th) {
        th.addEventListener('click', function() {
          var col = this.dataset.col;
          if (sortColumn === col) {
            sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
          } else {
            sortColumn = col;
            sortDirection = 'asc';
          }
          renderTable();
        });
        if (this.dataset.col === sortColumn) {
          this.classList.add(sortDirection === 'asc' ? 'sorted-asc' : 'sorted-desc');
        }
      });

      sweepTableContainer.querySelectorAll('.result-row').forEach(function(row) {
        row.addEventListener('click', function() {
          var idx = parseInt(this.dataset.idx, 10);
          loadResultWaveform(idx, sortedResults);
        });
      });
    }

    function getSortValue(result, col) {
      if (col.indexOf('param_') === 0) {
        var pIdx = parseInt(col.substring('param_'.length), 10);
        for (var c = 0; c < result.combo.length; c++) {
          if (result.combo[c].param.id === parameters[pIdx].id) {
            return result.combo[c].value;
          }
        }
        return 0;
      } else if (col.indexOf('metric_') === 0) {
        var mIdx = parseInt(col.substring('metric_'.length), 10);
        return result.metrics[metrics[mIdx].name] || 0;
      }
      return 0;
    }

    function drawHeatmap() {
      if (!heatmapCanvas || parameters.length !== 2 || metrics.length === 0) return;

      var ctx = heatmapCanvas.getContext('2d');
      var metricName = heatmapMetricSelect ? heatmapMetricSelect.value : metrics[0].name;

      var paramX = parameters[0];
      var paramY = parameters[1];

      var xValues = [];
      var yValues = [];
      var startX = Math.min(paramX.start, paramX.end);
      var endX = Math.max(paramX.start, paramX.end);
      var stepX = Math.max(0.1, Math.abs(paramX.step));
      for (var vx = startX; vx <= endX + stepX / 100; vx += stepX) {
        xValues.push(Math.round(vx * 100) / 100);
      }

      var startY = Math.min(paramY.start, paramY.end);
      var endY = Math.max(paramY.start, paramY.end);
      var stepY = Math.max(0.1, Math.abs(paramY.step));
      for (var vy = startY; vy <= endY + stepY / 100; vy += stepY) {
        yValues.push(Math.round(vy * 100) / 100);
      }

      var cellSize = 60;
      var labelHeight = 40;
      var labelWidth = 60;
      var padding = 20;

      var width = labelWidth + xValues.length * cellSize + padding;
      var height = labelHeight + yValues.length * cellSize + padding;

      heatmapCanvas.width = width;
      heatmapCanvas.height = height;

      ctx.fillStyle = '#1e1e2e';
      ctx.fillRect(0, 0, width, height);

      var valueMap = {};
      var minVal = Infinity;
      var maxVal = -Infinity;

      for (var r = 0; r < results.length; r++) {
        var res = results[r];
        if (res.error) continue;

        var xVal = null, yVal = null;
        for (var c = 0; c < res.combo.length; c++) {
          if (res.combo[c].param.id === paramX.id) xVal = res.combo[c].value;
          if (res.combo[c].param.id === paramY.id) yVal = res.combo[c].value;
        }
        if (xVal === null || yVal === null) continue;

        var val = res.metrics[metricName] || 0;
        valueMap[xVal + '_' + yVal] = val;
        minVal = Math.min(minVal, val);
        maxVal = Math.max(maxVal, val);
      }

      if (minVal === Infinity) minVal = 0;
      if (maxVal === -Infinity) maxVal = 1;
      if (minVal === maxVal) maxVal = minVal + 1;

      ctx.font = '11px ' + getComputedStyle(document.body).fontFamily;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#a6adc8';

      for (var i = 0; i < xValues.length; i++) {
        var x = labelWidth + i * cellSize + cellSize / 2;
        ctx.fillText(xValues[i], x, labelHeight / 2);
      }

      ctx.textAlign = 'right';
      for (var j = 0; j < yValues.length; j++) {
        var y = labelHeight + j * cellSize + cellSize / 2;
        ctx.fillText(yValues[j], labelWidth - 8, y);
      }

      for (var i = 0; i < xValues.length; i++) {
        for (var j = 0; j < yValues.length; j++) {
          var x = labelWidth + i * cellSize;
          var y = labelHeight + j * cellSize;
          var key = xValues[i] + '_' + yValues[j];
          var val = valueMap[key];

          if (val === undefined) {
            ctx.fillStyle = '#313244';
          } else {
            var ratio = (val - minVal) / (maxVal - minVal);
            ctx.fillStyle = getHeatmapColor(ratio);
          }

          ctx.fillRect(x + 1, y + 1, cellSize - 2, cellSize - 2);

          if (val !== undefined) {
            ctx.fillStyle = ratio > 0.5 ? '#1e1e2e' : '#cdd6f4';
            ctx.textAlign = 'center';
            ctx.fillText(val, x + cellSize / 2, y + cellSize / 2);
          }
        }
      }

      ctx.textAlign = 'center';
      ctx.fillStyle = '#89b4fa';
      ctx.font = '12px ' + getComputedStyle(document.body).fontFamily;
      ctx.fillText(paramX.name, width / 2, height - 8);

      ctx.save();
      ctx.translate(12, height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(paramY.name, 0, 0);
      ctx.restore();

      heatmapCanvas.onclick = function(e) {
        var rect = heatmapCanvas.getBoundingClientRect();
        var clickX = e.clientX - rect.left;
        var clickY = e.clientY - rect.top;

        var i = Math.floor((clickX - labelWidth) / cellSize);
        var j = Math.floor((clickY - labelHeight) / cellSize);

        if (i >= 0 && i < xValues.length && j >= 0 && j < yValues.length) {
          var targetX = xValues[i];
          var targetY = yValues[j];

          for (var r = 0; r < results.length; r++) {
            var res = results[r];
            var xVal = null, yVal = null;
            for (var c = 0; c < res.combo.length; c++) {
              if (res.combo[c].param.id === paramX.id) xVal = res.combo[c].value;
              if (res.combo[c].param.id === paramY.id) yVal = res.combo[c].value;
            }
            if (xVal === targetX && yVal === targetY) {
              loadResultWaveform(r, results);
              break;
            }
          }
        }
      };
    }

    function getHeatmapColor(ratio) {
      var r = Math.round(243 * ratio + 137 * (1 - ratio));
      var g = Math.round(139 * ratio + 180 * (1 - ratio));
      var b = Math.round(168 * ratio + 250 * (1 - ratio));
      return 'rgb(' + r + ',' + g + ',' + b + ')';
    }

    function loadResultWaveform(idx, sortedResults) {
      selectedResultIndex = idx;
      var result = sortedResults[idx];
      if (!result || !result.fullResult) return;

      var msg = result.fullResult;

      var rows = document.querySelectorAll('.result-row');
      rows.forEach(function(row) {
        row.classList.remove('selected');
      });
      var selectedRow = document.querySelector('.result-row[data-idx="' + idx + '"]');
      if (selectedRow) selectedRow.classList.add('selected');

      if (msg.type === 'result' || msg.signalNames) {
        viewer.setData(msg);
        if (msg.coverageData) {
          showCoverageReport(msg.coverageData);
          coveragePanel.classList.remove('hidden');
        }
        if (msg.assertions && msg.assertions.length > 0) {
          showAssertionsReport(msg.assertions, msg.assertionStatus, msg.assertionViolations);
          assertionsPanel.classList.remove('hidden');
        }
      }

      sweepResultsDialog.classList.add('hidden');
    }

    return {
      init: init
    };
  })();

  ParamSweepEngine.init();

  var WatchExpressionEngine = (function() {

    var editingWatchId = null;

    function init() {
      var btnAddWatch = document.getElementById('btn-add-watch');
      if (btnAddWatch) {
        btnAddWatch.addEventListener('click', showAddWatchDialog);
      }

      var btnConfirmWatch = document.getElementById('btn-confirm-watch');
      if (btnConfirmWatch) {
        btnConfirmWatch.addEventListener('click', confirmAddWatch);
      }

      var btnCancelWatch = document.getElementById('btn-cancel-watch');
      if (btnCancelWatch) {
        btnCancelWatch.addEventListener('click', hideAddWatchDialog);
      }

      var btnConfirmEditWatch = document.getElementById('btn-confirm-edit-watch');
      if (btnConfirmEditWatch) {
        btnConfirmEditWatch.addEventListener('click', confirmEditWatch);
      }

      var btnCancelEditWatch = document.getElementById('btn-cancel-edit-watch');
      if (btnCancelEditWatch) {
        btnCancelEditWatch.addEventListener('click', hideEditWatchDialog);
      }

      var dialogCloseBtns = document.querySelectorAll('[data-dialog="add-watch-dialog"]');
      dialogCloseBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
          hideAddWatchDialog();
        });
      });

      var editDialogCloseBtns = document.querySelectorAll('[data-dialog="edit-watch-dialog"]');
      editDialogCloseBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
          hideEditWatchDialog();
        });
      });

      createContextMenu();

      viewer.onEditWatch = function(probeId) {
        showEditWatchDialog(probeId);
      };

      viewer.onWatchContextMenu = function(x, y, probeId) {
        showWatchContextMenu(x, y, probeId);
      };
    }

    function showAddWatchDialog() {
      var dialog = document.getElementById('add-watch-dialog');
      if (!dialog) return;

      document.getElementById('watch-name-input').value = '';
      document.getElementById('watch-expr-input').value = '';
      dialog.classList.remove('hidden');
      document.getElementById('watch-name-input').focus();
    }

    function hideAddWatchDialog() {
      var dialog = document.getElementById('add-watch-dialog');
      if (dialog) {
        dialog.classList.add('hidden');
      }
    }

    function confirmAddWatch() {
      var name = document.getElementById('watch-name-input').value.trim();
      var expr = document.getElementById('watch-expr-input').value.trim();

      if (!name) {
        alert('Please enter a watch name');
        return;
      }
      if (!expr) {
        alert('Please enter an expression');
        return;
      }

      var result = viewer.addWatchProbe(name, expr);
      if (!result.success) {
        alert('Error: ' + result.error);
        return;
      }

      hideAddWatchDialog();
    }

    function showEditWatchDialog(probeId) {
      var dialog = document.getElementById('edit-watch-dialog');
      if (!dialog) return;

      var probe = viewer.watchProbes.find(function(p) { return p.id === probeId; });
      if (!probe) return;

      editingWatchId = probeId;
      document.getElementById('edit-watch-name-input').value = probe.name;
      document.getElementById('edit-watch-expr-input').value = probe.expression;
      dialog.classList.remove('hidden');
      document.getElementById('edit-watch-expr-input').focus();
    }

    function hideEditWatchDialog() {
      var dialog = document.getElementById('edit-watch-dialog');
      if (dialog) {
        dialog.classList.add('hidden');
      }
      editingWatchId = null;
    }

    function confirmEditWatch() {
      if (!editingWatchId) return;

      var name = document.getElementById('edit-watch-name-input').value.trim();
      var expr = document.getElementById('edit-watch-expr-input').value.trim();

      if (!name) {
        alert('Please enter a watch name');
        return;
      }
      if (!expr) {
        alert('Please enter an expression');
        return;
      }

      var result = viewer.updateWatchProbe(editingWatchId, name, expr);
      if (!result.success) {
        alert('Error: ' + result.error);
        return;
      }

      hideEditWatchDialog();
    }

    function createContextMenu() {
      var menu = document.createElement('div');
      menu.id = 'watch-context-menu';
      menu.className = 'hidden';
      menu.innerHTML =
        '<div class="menu-item" data-action="edit">✏️ Edit Expression</div>' +
        '<div class="menu-item" data-action="copy">📋 Copy Expression</div>' +
        '<div class="menu-item menu-danger" data-action="delete">🗑️ Delete Watch</div>';
      document.body.appendChild(menu);

      menu.querySelectorAll('.menu-item').forEach(function(item) {
        item.addEventListener('click', function() {
          var action = this.dataset.action;
          var probeId = menu.dataset.probeId;
          handleContextMenuAction(action, probeId);
          menu.classList.add('hidden');
        });
      });

      document.addEventListener('click', function(e) {
        if (!menu.contains(e.target)) {
          menu.classList.add('hidden');
        }
      });
    }

    function showWatchContextMenu(x, y, probeId) {
      var menu = document.getElementById('watch-context-menu');
      if (!menu) return;

      menu.dataset.probeId = probeId;
      menu.style.left = x + 'px';
      menu.style.top = y + 'px';
      menu.classList.remove('hidden');
    }

    function handleContextMenuAction(action, probeId) {
      var probe = viewer.watchProbes.find(function(p) { return p.id === probeId; });
      if (!probe) return;

      switch (action) {
        case 'edit':
          showEditWatchDialog(probeId);
          break;
        case 'copy':
          navigator.clipboard.writeText(probe.expression).then(function() {
          }).catch(function(err) {
            console.error('Failed to copy:', err);
          });
          break;
        case 'delete':
          if (confirm('Delete watch "' + probe.name + '"?')) {
            viewer.deleteWatchProbe(probeId);
          }
          break;
      }
    }

    return {
      init: init
    };

  })();

  WatchExpressionEngine.init();

})();
