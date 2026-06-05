var WaveformViewer = (function() {

  var SIGNAL_HEIGHT = 40;
  var BUS_HEIGHT = 60;
  var DECODER_HEIGHT = 32;
  var SIGNAL_PADDING = 4;
  var HIGH_Y_OFFSET = 6;
  var LOW_Y_OFFSET = 32;
  var TRANSITION_WIDTH = 3;
  var DIAMOND_WIDTH = 8;
  var SIGNAL_LABEL_WIDTH = 200;
  var TIME_AXIS_HEIGHT = 28;
  var GLITCH_OVERLAY_ALPHA = 0.3;
  var MAX_BUS_WIDTH = 16;

  var DOMAIN_COLORS = [
    { bg: 'rgba(137, 180, 250, 0.12)', line: '#89b4fa', name: 'Blue' },
    { bg: 'rgba(166, 227, 161, 0.12)', line: '#a6e3a1', name: 'Green' },
    { bg: 'rgba(250, 179, 135, 0.12)', line: '#fab387', name: 'Orange' },
    { bg: 'rgba(245, 194, 231, 0.12)', line: '#f5c2e7', name: 'Pink' },
    { bg: 'rgba(203, 166, 247, 0.12)', line: '#cba6f7', name: 'Purple' },
    { bg: 'rgba(148, 226, 213, 0.12)', line: '#94e2d5', name: 'Teal' }
  ];

  var COLORS = {
    bg: '#1e1e2e',
    grid: '#2a2a3c',
    gridMajor: '#363650',
    highLine: '#a6e3a1',
    lowLine: '#585b70',
    transLine: '#89b4fa',
    highlightLine: '#f9e2af',
    sourceTrace: '#89b4fa',
    glitchFill: 'rgba(243, 139, 168, 0.35)',
    glitchBorder: '#f38ba8',
    cursorLine: 'rgba(137, 180, 250, 0.6)',
    timeText: '#6c7086',
    timeTextMajor: '#a6adc8',
    clockColor: '#a6e3a1',
    busFill: 'rgba(137, 180, 250, 0.25)',
    busBorder: '#89b4fa',
    busText: '#cdd6f4',
    diamond: '#89b4fa',
    decoderFrame: 'rgba(166, 227, 161, 0.3)',
    decoderBorder: '#a6e3a1',
    decoderText: '#a6e3a1',
    decoderGap: '#45475a',
    cdcLine: 'rgba(250, 179, 135, 0.7)',
    cdcIndicator: '#fab387',
    assertionLine: 'rgba(243, 139, 168, 0.8)',
    assertionFill: 'rgba(243, 139, 168, 0.15)',
    assertionHighlight: 'rgba(243, 139, 168, 0.3)',
    assertionBorder: '#f38ba8'
  };

  var CURSOR_A_COLOR = '#89b4fa';
  var CURSOR_B_COLOR = '#fab387';
  var SEARCH_MARKER_COLOR = '#f9e2af';
  var CURSOR_HIT_RADIUS = 8;

  function Viewer(canvas, signalListEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.signalListEl = signalListEl;
    this.timeAxisEl = document.getElementById('time-axis');

    this.data = null;
    this.signalNames = [];
    this.signalMap = {};
    this.waveforms = {};
    this.glitches = [];
    this.cdcViolations = [];
    this.clocks = [];
    this.clockSignals = {};
    this.domainColorMap = {};
    this.depGraph = null;
    this.coverageData = null;
    this.assertions = [];
    this.assertionViolations = [];
    this.assertionStatus = {};
    this.highlightedAssertion = null;

    this.snapshots = [];
    this.maxSnapshots = 5;
    this.compareMode = false;
    this.compareSnapshot = null;
    this.diffResults = null;

    this.signalGroups = [];
    this.ungroupedSignals = [];
    this.collapsedGroups = {};
    this.filterText = '';
    this.filterDebounceTimer = null;
    this.dragType = null;
    this.draggedId = null;

    this.buses = [];
    this.decoders = {};
    this.busWaveforms = {};

    this.pixelsPerNs = 4;
    this.scrollX = 0;
    this.scrollY = 0;

    this.hoveredSignal = null;
    this.hoveredTime = -1;
    this.hoveredFrame = null;
    this.hoveredCDC = null;
    this.hoveredAssertionViolation = null;
    this.highlightedSignal = null;
    this.sourceSignals = {};

    this.mouseX = -1;
    this.mouseY = -1;

    this.cursorATime = -1;
    this.cursorBTime = -1;
    this.cursorPlacementMode = null;
    this.cursorDragging = null;
    this.cursorDragStartX = 0;
    this.cursorDragStartTime = 0;
    this._wasCursorDrag = false;

    this.searchMarkers = [];
    this.activeSearchIndex = -1;
    this.onCursorPlaced = null;

    this.devicePixelRatio = window.devicePixelRatio || 1;

    var self = this;
    this.canvas.addEventListener('wheel', function(e) { self.onWheel(e); }, { passive: false });
    this.canvas.addEventListener('mousemove', function(e) { self.onMouseMove(e); });
    this.canvas.addEventListener('mouseleave', function(e) { self.onMouseLeave(e); });
    this.canvas.addEventListener('mousedown', function(e) { self.onMouseDown(e); });
    this.canvas.addEventListener('mouseup', function(e) { self.onMouseUp(e); });
    this.canvas.addEventListener('click', function(e) { self.onClick(e); });
    this.canvas.addEventListener('contextmenu', function(e) { self.onContextMenu(e); });

    this.resizeObserver = new ResizeObserver(function() { self.resize(); self.draw(); });
    this.resizeObserver.observe(this.canvas.parentElement);
  }

  Viewer.prototype.setData = function(result) {
    this.signalNames = result.signalNames || [];
    this.signalMap = result.signalMap || {};
    this.waveforms = result.waveforms || {};
    this.glitches = result.glitches || [];
    this.cdcViolations = result.cdcViolations || [];
    this.clocks = result.clocks || [];
    this.depGraph = result.depGraph || null;
    this.coverageData = result.coverageData || null;
    this.assertions = result.assertions || [];
    this.assertionViolations = result.assertionViolations || [];
    this.assertionStatus = result.assertionStatus || {};
    this.highlightedAssertion = null;

    this.clockSignals = {};
    for (var ci = 0; ci < this.clocks.length; ci++) {
      this.clockSignals[this.clocks[ci].name] = this.clocks[ci];
    }

    this.domainColorMap = {};
    var domainIdx = 0;
    for (var si = 0; si < this.signalNames.length; si++) {
      var sigName = this.signalNames[si];
      var sig = this.signalMap[sigName];
      if (sig && sig.clockDomain && !this.domainColorMap[sig.clockDomain]) {
        this.domainColorMap[sig.clockDomain] = DOMAIN_COLORS[domainIdx % DOMAIN_COLORS.length];
        domainIdx++;
      }
    }

    this.signalGroups = [];
    this.collapsedGroups = {};
    this.filterText = '';
    this.ungroupedSignals = [];
    for (var si = 0; si < this.signalNames.length; si++) {
      if (!this.clockSignals[this.signalNames[si]]) {
        this.ungroupedSignals.push(this.signalNames[si]);
      }
    }

    this.rebuildAllBuses();
    this.buildSignalLabels();
    this.resize();
    this.draw();
  };

  Viewer.prototype.clear = function() {
    this.data = null;
    this.signalNames = [];
    this.signalMap = {};
    this.waveforms = {};
    this.glitches = [];
    this.cdcViolations = [];
    this.depGraph = null;
    this.buses = [];
    this.decoders = {};
    this.busWaveforms = {};
    this.highlightedSignal = null;
    this.sourceSignals = {};
    this.assertions = [];
    this.assertionViolations = [];
    this.assertionStatus = {};
    this.highlightedAssertion = null;
    this.hoveredAssertionViolation = null;
    this.signalGroups = [];
    this.ungroupedSignals = [];
    this.collapsedGroups = {};
    this.filterText = '';
    this.signalListEl.innerHTML = '';
    this.resize();
    this.draw();
  };

  Viewer.prototype.createBus = function(name, bitSignals) {
    if (bitSignals.length === 0 || bitSignals.length > MAX_BUS_WIDTH) return false;
    if (this.buses.find(function(b) { return b.name === name; })) return false;

    var bus = {
      name: name,
      bits: bitSignals,
      width: bitSignals.length,
      type: 'bus'
    };

    this.buses.push(bus);
    this.buildBusWaveform(bus);
    this.buildSignalLabels();
    this.resize();
    this.draw();
    return true;
  };

  Viewer.prototype.deleteBus = function(busName) {
    var idx = this.buses.findIndex(function(b) { return b.name === busName; });
    if (idx === -1) return false;

    this.buses.splice(idx, 1);
    delete this.busWaveforms[busName];
    delete this.decoders[busName];
    this.buildSignalLabels();
    this.resize();
    this.draw();
    return true;
  };

  Viewer.prototype.buildBusWaveform = function(bus) {
    var allTimes = [];
    var bitWfs = [];

    for (var bi = 0; bi < bus.bits.length; bi++) {
      var bitName = bus.bits[bi];
      var wf = this.waveforms[bitName] || [];
      bitWfs.push(wf);
      for (var wi = 0; wi < wf.length; wi++) {
        allTimes.push(wf[wi].time);
      }
    }

    allTimes = allTimes.sort(function(a, b) { return a - b; });
    allTimes = allTimes.filter(function(t, i, arr) { return i === 0 || t !== arr[i - 1]; });

    var busWf = [];
    var lastValue = 0;

    for (var ti = 0; ti < allTimes.length; ti++) {
      var t = allTimes[ti];
      var value = 0;

      for (var bi = 0; bi < bus.bits.length; bi++) {
        var bitVal = this.getValueAtTime(bus.bits[bi], t);
        if (bitVal === 1) {
          value |= (1 << bi);
        }
      }

      if (busWf.length === 0 || value !== lastValue) {
        busWf.push({ time: t, value: value });
        lastValue = value;
      }
    }

    this.busWaveforms[bus.name] = busWf;
  };

  Viewer.prototype.rebuildAllBuses = function() {
    for (var i = 0; i < this.buses.length; i++) {
      this.buildBusWaveform(this.buses[i]);
    }
  };

  Viewer.prototype.matchesFilter = function(name) {
    if (!this.filterText) return true;
    return name.toLowerCase().indexOf(this.filterText.toLowerCase()) !== -1;
  };

  Viewer.prototype.getGroupVisibleSignals = function(group) {
    var self = this;
    return group.signals.filter(function(s) { return self.matchesFilter(s); });
  };

  Viewer.prototype.getAllDisplayNames = function() {
    var names = [];
    var self = this;

    for (var ci = 0; ci < this.clocks.length; ci++) {
      var clockName = this.clocks[ci].name;
      if (this.matchesFilter(clockName)) {
        names.push({ name: clockName, type: 'signal' });
      }
    }

    for (var gi = 0; gi < this.signalGroups.length; gi++) {
      var group = this.signalGroups[gi];
      var visibleSignals = this.getGroupVisibleSignals(group);
      if (this.filterText && visibleSignals.length === 0) continue;

      names.push({ name: group.id, type: 'group-header', groupName: group.name });

      if (!this.collapsedGroups[group.id]) {
        for (var si = 0; si < group.signals.length; si++) {
          var sigName = group.signals[si];
          if (this.matchesFilter(sigName)) {
            names.push({ name: sigName, type: 'signal', groupId: group.id });
          }
        }
      }
    }

    var visibleUngrouped = this.ungroupedSignals.filter(function(s) {
      return self.matchesFilter(s);
    });
    if (visibleUngrouped.length > 0) {
      for (var ui = 0; ui < visibleUngrouped.length; ui++) {
        names.push({ name: visibleUngrouped[ui], type: 'signal' });
      }
    }

    for (var j = 0; j < this.buses.length; j++) {
      if (this.matchesFilter(this.buses[j].name)) {
        names.push({ name: this.buses[j].name, type: 'bus' });
      }
    }

    return names;
  };

  var GROUP_HEADER_HEIGHT = 32;

  Viewer.prototype.getDisplayItemHeight = function(item) {
    if (item.type === 'group-header') {
      return GROUP_HEADER_HEIGHT;
    }
    if (item.type === 'bus') {
      var height = BUS_HEIGHT;
      if (this.decoders[item.name]) {
        height += DECODER_HEIGHT;
      }
      return height;
    }
    return SIGNAL_HEIGHT;
  };

  Viewer.prototype.getDisplayItemY = function(itemName) {
    var allItems = this.getAllDisplayNames();
    var y = 0;
    for (var i = 0; i < allItems.length; i++) {
      if (allItems[i].name === itemName) {
        return y;
      }
      y += this.getDisplayItemHeight(allItems[i]);
    }
    return -1;
  };

  Viewer.prototype.getTotalHeight = function() {
    var allItems = this.getAllDisplayNames();
    var h = 0;
    for (var i = 0; i < allItems.length; i++) {
      h += this.getDisplayItemHeight(allItems[i]);
    }
    return h;
  };

  Viewer.prototype.getItemAtY = function(y) {
    var allItems = this.getAllDisplayNames();
    var currentY = 0;
    for (var i = 0; i < allItems.length; i++) {
      var itemH = this.getDisplayItemHeight(allItems[i]);
      if (y >= currentY && y < currentY + itemH) {
        return {
          item: allItems[i],
          offsetY: y - currentY,
          index: i
        };
      }
      currentY += itemH;
    }
    return null;
  };

  Viewer.prototype.createSignalLabel = function(name, cdcSignalMap) {
    var self = this;
    var sig = this.signalMap[name] || {};
    var label = document.createElement('div');
    label.className = 'signal-label';
    label.dataset.signal = name;
    label.dataset.type = 'signal';
    label.draggable = true;

    if (this.compareMode && this.diffResults && this.diffResults.signalDiffs[name]) {
      var diffInfo = this.diffResults.signalDiffs[name];
      if (diffInfo.status === 'same') {
        label.classList.add('signal-diff-same');
      } else if (diffInfo.status === 'different') {
        label.classList.add('signal-diff-different');
      } else if (diffInfo.status === 'new') {
        label.classList.add('signal-diff-new');
      } else if (diffInfo.status === 'deleted') {
        label.classList.add('signal-diff-deleted');
      }
    }

    var covStatus = 'normal';
    var toggleCount = 0;
    var toggleStats = (this.coverageData && CoverageAnalyzer.extractStats(this.coverageData.toggleCoverage)) || {};
    if (toggleStats[name]) {
      var tc = toggleStats[name];
      toggleCount = tc.toggleCount || 0;
      covStatus = tc.status || 'normal';
      if (tc.status === 'uncovered' || tc.status === 'stuck') {
        label.classList.add('signal-uncovered');
      }
    }

    if (sig.clockDomain && this.domainColorMap[sig.clockDomain]) {
      label.style.borderLeft = '3px solid ' + this.domainColorMap[sig.clockDomain].line;
      label.style.background = this.domainColorMap[sig.clockDomain].bg;
    }

    if (this.compareMode) {
      var diffIcon = document.createElement('span');
      diffIcon.className = 'diff-icon';
      if (this.diffResults && this.diffResults.signalDiffs[name]) {
        var diffInfo = this.diffResults.signalDiffs[name];
        if (diffInfo.status === 'same') {
          diffIcon.textContent = '=';
          diffIcon.title = '信号完全相同';
          diffIcon.classList.add('diff-same');
        } else if (diffInfo.status === 'different') {
          diffIcon.textContent = '≠';
          diffIcon.title = '信号存在差异';
          diffIcon.classList.add('diff-different');
        } else if (diffInfo.status === 'new') {
          diffIcon.textContent = '+';
          diffIcon.title = '新增信号';
          diffIcon.classList.add('diff-new');
        } else if (diffInfo.status === 'deleted') {
          diffIcon.textContent = '−';
          diffIcon.title = '已删除信号';
          diffIcon.classList.add('diff-deleted');
        }
      }
      label.appendChild(diffIcon);
    }

    var nameSpan = document.createElement('span');
    nameSpan.textContent = name;
    nameSpan.className = 'signal-name';
    label.appendChild(nameSpan);

    var toggleSpan = document.createElement('span');
    toggleSpan.className = 'toggle-count';
    if (!this.clockSignals[name]) {
      toggleSpan.textContent = toggleCount + 'T';
    }
    label.appendChild(toggleSpan);

    var typeSpan = document.createElement('span');
    typeSpan.className = 'signal-type';
    if (this.clockSignals[name]) {
      typeSpan.className += ' type-clk';
      typeSpan.textContent = 'CLK';
      label.draggable = false;
    } else if (sig.isReg) {
      typeSpan.className += ' type-reg';
      typeSpan.textContent = 'REG';
    } else if (sig.type === 'input') {
      typeSpan.className += ' type-input';
      typeSpan.textContent = 'IN';
    } else {
      typeSpan.className += ' type-wire';
      typeSpan.textContent = 'WIRE';
    }
    label.appendChild(typeSpan);

    if (this.compareMode && this.diffResults && this.diffResults.signalDiffs[name]) {
      var diffInfo = this.diffResults.signalDiffs[name];
      if (diffInfo.status === 'different' && diffInfo.diffPercent > 0) {
        var diffPercentSpan = document.createElement('span');
        diffPercentSpan.className = 'diff-percent-badge';
        diffPercentSpan.textContent = 'Δ' + diffInfo.diffPercent + '%';
        diffPercentSpan.title = '差异时间占比';
        label.appendChild(diffPercentSpan);
      }
    }

    var hasGlitch = false;
    for (var g = 0; g < this.glitches.length; g++) {
      if (this.glitches[g].signal === name) { hasGlitch = true; break; }
    }
    if (hasGlitch) {
      var glitchInd = document.createElement('span');
      glitchInd.className = 'glitch-indicator';
      glitchInd.textContent = '⚠';
      label.appendChild(glitchInd);
    }

    if (cdcSignalMap[name]) {
      var cdcInd = document.createElement('span');
      cdcInd.className = 'cdc-indicator';
      cdcInd.textContent = '⚡';
      cdcInd.title = '跨时钟域传递 (' + cdcSignalMap[name].length + ')';
      cdcInd.dataset.signal = name;
      cdcInd.addEventListener('click', function(e) {
        e.stopPropagation();
        var sigName = this.dataset.signal;
        self.showCDCDetail(sigName, cdcSignalMap[sigName]);
      });
      label.appendChild(cdcInd);
    }

    label.addEventListener('click', function() {
      var sigName = this.dataset.signal;
      self.toggleHighlight(sigName);
    });

    return label;
  };

  Viewer.prototype.createGroupHeader = function(group) {
    var self = this;
    var header = document.createElement('div');
    header.className = 'group-header';
    header.dataset.groupId = group.id;
    header.draggable = true;

    if (this.collapsedGroups[group.id]) {
      header.classList.add('collapsed');
    }

    var toggle = document.createElement('span');
    toggle.className = 'group-toggle';
    toggle.textContent = '▼';
    header.appendChild(toggle);

    var nameSpan = document.createElement('span');
    nameSpan.className = 'group-name';
    nameSpan.textContent = group.name;
    header.appendChild(nameSpan);

    var dragStartPos = { x: 0, y: 0 };
    var isDragging = false;

    header.addEventListener('mousedown', function(e) {
      dragStartPos = { x: e.clientX, y: e.clientY };
      isDragging = false;
    });

    header.addEventListener('click', function(e) {
      if (!isDragging) {
        self.toggleGroup(group.id);
      }
    });

    header.addEventListener('dragstart', function(e) {
      isDragging = true;
    });

    header.addEventListener('contextmenu', function(e) {
      e.preventDefault();
      e.stopPropagation();
      self.showGroupContextMenu(e.clientX, e.clientY, group.id);
    });

    return header;
  };

  Viewer.prototype.buildSignalLabels = function() {
    var innerEl = document.getElementById('signal-list-inner');
    if (!innerEl) innerEl = this.signalListEl;
    innerEl.innerHTML = '';
    var self = this;

    var cdcSignalMap = {};
    for (var vi = 0; vi < this.cdcViolations.length; vi++) {
      var vio = this.cdcViolations[vi];
      for (var si = 0; si < vio.signals.length; si++) {
        if (!cdcSignalMap[vio.signals[si]]) {
          cdcSignalMap[vio.signals[si]] = [];
        }
        cdcSignalMap[vio.signals[si]].push(vio);
      }
    }

    for (var ci = 0; ci < this.clocks.length; ci++) {
      var clockName = this.clocks[ci].name;
      if (this.matchesFilter(clockName)) {
        innerEl.appendChild(this.createSignalLabel(clockName, cdcSignalMap));
      }
    }

    for (var gi = 0; gi < this.signalGroups.length; gi++) {
      var group = this.signalGroups[gi];
      var visibleSignals = this.getGroupVisibleSignals(group);
      if (this.filterText && visibleSignals.length === 0) continue;

      var groupEl = document.createElement('div');
      groupEl.className = 'signal-group';
      groupEl.dataset.groupId = group.id;

      var header = this.createGroupHeader(group);
      groupEl.appendChild(header);

      var signalsContainer = document.createElement('div');
      signalsContainer.className = 'group-signals';

      if (!this.collapsedGroups[group.id]) {
        for (var si = 0; si < group.signals.length; si++) {
          var sigName = group.signals[si];
          if (this.matchesFilter(sigName)) {
            signalsContainer.appendChild(this.createSignalLabel(sigName, cdcSignalMap));
          }
        }
      }
      groupEl.appendChild(signalsContainer);
      innerEl.appendChild(groupEl);
    }

    var visibleUngrouped = this.ungroupedSignals.filter(function(s) {
      return self.matchesFilter(s);
    });
    if (visibleUngrouped.length > 0) {
      var ungroupedSection = document.createElement('div');
      ungroupedSection.className = 'ungrouped-section';

      if (!this.filterText) {
        var ungroupedHeader = document.createElement('div');
        ungroupedHeader.className = 'ungrouped-header';
        ungroupedHeader.textContent = '未分组';
        ungroupedSection.appendChild(ungroupedHeader);
      }

      for (var ui = 0; ui < visibleUngrouped.length; ui++) {
        ungroupedSection.appendChild(this.createSignalLabel(visibleUngrouped[ui], cdcSignalMap));
      }
      innerEl.appendChild(ungroupedSection);
    }

    for (var j = 0; j < this.buses.length; j++) {
      var bus = this.buses[j];
      if (!this.matchesFilter(bus.name)) continue;

      var busLabel = document.createElement('div');
      busLabel.className = 'signal-label bus-label';
      busLabel.dataset.signal = bus.name;
      busLabel.dataset.type = 'bus';

      var height = BUS_HEIGHT;
      if (this.decoders[bus.name]) {
        height += DECODER_HEIGHT;
      }
      busLabel.style.height = height + 'px';

      var busNameSpan = document.createElement('span');
      busNameSpan.textContent = bus.name;
      busLabel.appendChild(busNameSpan);

      var busTypeSpan = document.createElement('span');
      busTypeSpan.className = 'signal-type type-bus';
      busTypeSpan.textContent = bus.width + 'bit';
      busLabel.appendChild(busTypeSpan);

      busLabel.addEventListener('click', function() {
        var sigName = this.dataset.signal;
        self.toggleHighlight(sigName);
      });

      innerEl.appendChild(busLabel);
    }

    this.setupDragAndDrop();
  };

  Viewer.prototype.attachDecoder = function(busName, decoderConfig) {
    var bus = this.buses.find(function(b) { return b.name === busName; });
    if (!bus) return false;

    this.decoders[busName] = {
      config: decoderConfig,
      frames: []
    };

    this.decodeBus(busName);
    this.buildSignalLabels();
    this.resize();
    this.draw();
    return true;
  };

  Viewer.prototype.detachDecoder = function(busName) {
    if (!this.decoders[busName]) return false;
    delete this.decoders[busName];
    this.buildSignalLabels();
    this.resize();
    this.draw();
    return true;
  };

  Viewer.prototype.decodeBus = function(busName) {
    var decoder = this.decoders[busName];
    if (!decoder) return;

    var busWf = this.busWaveforms[busName] || [];
    if (busWf.length === 0) return;

    var config = decoder.config;
    var frames = [];
    var frameIdx = 0;
    var inFrame = false;
    var frameStart = 0;
    var frameValues = [];

    for (var i = 0; i < busWf.length; i++) {
      var evt = busWf[i];

      if (!inFrame) {
        if (evt.value === config.startValue) {
          inFrame = true;
          frameStart = evt.time;
          frameValues = [{ time: evt.time, value: evt.value }];
        }
      } else {
        frameValues.push({ time: evt.time, value: evt.value });

        var frameEnd = false;
        if (config.endType === 'fixed') {
          var duration = evt.time - frameStart;
          if (duration >= config.frameLength) {
            frameEnd = true;
          }
        } else if (config.endType === 'value') {
          if (evt.value === config.endValue) {
            frameEnd = true;
          }
        }

        if (frameEnd) {
          var frame = this.parseFrame(frameValues, config, frameIdx);
          frames.push(frame);
          frameIdx++;
          inFrame = false;
          frameValues = [];
        }
      }
    }

    if (inFrame && frameValues.length > 0) {
      var partialFrame = this.parseFrame(frameValues, config, frameIdx);
      partialFrame.incomplete = true;
      frames.push(partialFrame);
    }

    decoder.frames = frames;
  };

  Viewer.prototype.parseFrame = function(values, config, frameIdx) {
    var frame = {
      index: frameIdx,
      startTime: values[0].time,
      endTime: values[values.length - 1].time,
      fields: [],
      rawValues: values
    };

    var lastValue = values[values.length - 1].value;

    for (var f = 0; f < config.fields.length; f++) {
      var field = config.fields[f];
      var mask = ((1 << (field.high - field.low + 1)) - 1) << field.low;
      var fieldValue = (lastValue & mask) >> field.low;

      frame.fields.push({
        name: field.name,
        high: field.high,
        low: field.low,
        value: fieldValue,
        hex: '0x' + fieldValue.toString(16).toUpperCase(),
        bin: fieldValue.toString(2).padStart(field.high - field.low + 1, '0')
      });
    }

    return frame;
  };

  Viewer.prototype.toggleHighlight = function(signalName) {
    if (this.highlightedSignal === signalName) {
      this.highlightedSignal = null;
      this.sourceSignals = {};
    } else {
      this.highlightedSignal = signalName;
      this.sourceSignals = {};

      var bus = this.buses.find(function(b) { return b.name === signalName; });
      if (bus) {
        for (var bi = 0; bi < bus.bits.length; bi++) {
          this.sourceSignals[bus.bits[bi]] = true;
        }
      } else if (this.depGraph && this.depGraph.signalSources[signalName]) {
        var inputs = this.depGraph.signalSources[signalName].inputs || [];
        for (var i = 0; i < inputs.length; i++) {
          this.sourceSignals[inputs[i]] = true;
        }
        this.traceSources(inputs);
      }
    }

    var labels = this.signalListEl.querySelectorAll('.signal-label');
    for (var j = 0; j < labels.length; j++) {
      var ln = labels[j].dataset.signal;
      labels[j].classList.toggle('highlighted',
        ln === this.highlightedSignal || this.sourceSignals[ln]);
    }

    this.draw();
    this.updateMeasurementPanel();
  };

  Viewer.prototype.traceSources = function(signals, depth) {
    depth = depth || 0;
    if (depth > 5) return;
    for (var i = 0; i < signals.length; i++) {
      var sig = signals[i];
      this.sourceSignals[sig] = true;
      if (this.depGraph && this.depGraph.signalSources[sig]) {
        var inputs = this.depGraph.signalSources[sig].inputs || [];
        this.traceSources(inputs, depth + 1);
      }
    }
  };

  Viewer.prototype.resize = function() {
    var parent = this.canvas.parentElement;
    if (!parent) return;
    var rect = parent.getBoundingClientRect();
    var w = rect.width - SIGNAL_LABEL_WIDTH;
    var h = rect.height - TIME_AXIS_HEIGHT;

    this.canvas.style.position = 'absolute';
    this.canvas.style.left = SIGNAL_LABEL_WIDTH + 'px';
    this.canvas.style.top = TIME_AXIS_HEIGHT + 'px';
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';

    this.canvas.width = Math.floor(w * this.devicePixelRatio);
    this.canvas.height = Math.floor(h * this.devicePixelRatio);

    this.displayWidth = w;
    this.displayHeight = h;
  };

  Viewer.prototype.onWheel = function(e) {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      var oldPpn = this.pixelsPerNs;
      var zoomFactor = e.deltaY > 0 ? 0.85 : 1.18;
      this.pixelsPerNs = Math.max(0.5, Math.min(50, this.pixelsPerNs * zoomFactor));

      var rect = this.canvas.getBoundingClientRect();
      var mouseX = e.clientX - rect.left;
      var mouseTime = (mouseX + this.scrollX) / oldPpn;
      this.scrollX = mouseTime * this.pixelsPerNs - mouseX;
      this.scrollX = Math.max(0, this.scrollX);
    } else if (e.shiftKey) {
      this.scrollX = Math.max(0, this.scrollX + e.deltaY);
    } else {
      this.scrollY += e.deltaY * 0.5;
      this.scrollY = Math.max(0, this.scrollY);
    }
    this.draw();
  };

  Viewer.prototype.onMouseMove = function(e) {
    var rect = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;

    if (this.cursorDragging) {
      var dx = this.mouseX - this.cursorDragStartX;
      var newTime = this.cursorDragStartTime + dx / this.pixelsPerNs;
      newTime = Math.max(0, newTime);

      if (this.cursorDragging === 'A') {
        this.cursorATime = newTime;
      } else {
        this.cursorBTime = newTime;
      }

      this.draw();
      return;
    }

    if (!this.cursorPlacementMode) {
      var hitCursor = this.hitTestCursor(this.mouseX);
      if (hitCursor) {
        this.canvas.style.cursor = 'ew-resize';
      } else {
        this.canvas.style.cursor = 'crosshair';
      }
    }

    this.hoveredTime = (this.mouseX + this.scrollX) / this.pixelsPerNs;
    this.hoveredFrame = null;
    this.hoveredAssertionViolation = this.findAssertionViolationAtMouse(this.mouseX);

    var y = this.mouseY + this.scrollY;
    var itemInfo = this.getItemAtY(y);

    if (itemInfo) {
      this.hoveredSignal = itemInfo.item.name;

      if (itemInfo.item.type === 'bus' && this.decoders[itemInfo.item.name]) {
        if (itemInfo.offsetY < DECODER_HEIGHT) {
          var decoder = this.decoders[itemInfo.item.name];
          for (var fi = 0; fi < decoder.frames.length; fi++) {
            var frame = decoder.frames[fi];
            if (this.hoveredTime >= frame.startTime && this.hoveredTime <= frame.endTime) {
              this.hoveredFrame = { busName: itemInfo.item.name, frame: frame };
              break;
            }
          }
        }
      }
    } else {
      this.hoveredSignal = null;
    }

    this.draw();
  };

  Viewer.prototype.onMouseLeave = function() {
    this.mouseX = -1;
    this.mouseY = -1;
    this.hoveredSignal = null;
    this.hoveredTime = -1;
    this.hoveredFrame = null;
    this.draw();
  };

  Viewer.prototype.onClick = function(e) {
    if (this.cursorPlacementMode) return;
    if (this._wasCursorDrag) {
      this._wasCursorDrag = false;
      return;
    }

    var rect = this.canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;
    var clickTime = (mx + this.scrollX) / this.pixelsPerNs;

    var y = my + this.scrollY;
    var itemInfo = this.getItemAtY(y);

    if (itemInfo) {
      var itemName = itemInfo.item.name;

      if (itemInfo.item.type === 'bus' && this.decoders[itemName]) {
        if (itemInfo.offsetY < DECODER_HEIGHT) {
          var decoder = this.decoders[itemName];
          for (var fi = 0; fi < decoder.frames.length; fi++) {
            var frame = decoder.frames[fi];
            if (clickTime >= frame.startTime && clickTime <= frame.endTime) {
              this.showFrameDetail(frame, itemName);
              return;
            }
          }
        }
      }

      if (itemInfo.item.type === 'signal') {
        var clickedGlitch = null;
        for (var g = 0; g < this.glitches.length; g++) {
          var gl = this.glitches[g];
          if (gl.signal === itemName && clickTime >= gl.startTime && clickTime <= gl.endTime) {
            this.showGlitchDetail(gl);
            break;
          }
        }
      }

      this.toggleHighlight(itemName);
    }
  };

  Viewer.prototype.onContextMenu = function(e) {
    e.preventDefault();
    var rect = this.canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;

    var y = my + this.scrollY;
    var itemInfo = this.getItemAtY(y);

    this.showContextMenu(e.clientX, e.clientY, itemInfo);
  };

  Viewer.prototype.showContextMenu = function(x, y, itemInfo) {
    var self = this;
    var existing = document.getElementById('context-menu');
    if (existing) existing.remove();

    var menu = document.createElement('div');
    menu.id = 'context-menu';
    menu.className = 'context-menu';

    var html = '';

    if (!itemInfo || itemInfo.item.type === 'signal') {
      html += '<div class="menu-item" data-action="createBus">Create Bus...</div>';
    }

    if (itemInfo && itemInfo.item.type === 'bus') {
      html += '<div class="menu-item" data-action="attachDecoder" data-bus="' + itemInfo.item.name + '">Attach Decoder...</div>';
      html += '<div class="menu-item" data-action="deleteBus" data-bus="' + itemInfo.item.name + '">Delete Bus</div>';
      if (this.decoders[itemInfo.item.name]) {
        html += '<div class="menu-item" data-action="detachDecoder" data-bus="' + itemInfo.item.name + '">Detach Decoder</div>';
      }
    }

    menu.innerHTML = html;

    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    document.body.appendChild(menu);

    menu.querySelectorAll('.menu-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var action = this.dataset.action;
        var busName = this.dataset.bus;
        menu.remove();

        if (action === 'createBus') {
          self.showCreateBusDialog();
        } else if (action === 'deleteBus') {
          self.deleteBus(busName);
        } else if (action === 'attachDecoder') {
          self.showAttachDecoderDialog(busName);
        } else if (action === 'detachDecoder') {
          self.detachDecoder(busName);
        }
      });
    });

    setTimeout(function() {
      document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 10);
  };

  Viewer.prototype.showFrameDetail = function(frame, busName) {
    var detailEl = document.getElementById('frame-detail');
    if (!detailEl) return;

    var bodyEl = document.getElementById('frame-detail-body');
    detailEl.classList.remove('hidden');

    var html = '<p>Bus: <span class="frame-bus">' + busName + '</span></p>';
    html += '<p>Frame: <span class="frame-index">F' + frame.index + '</span></p>';
    html += '<p>Time: <span class="frame-time">' + frame.startTime + 'ns ~ ' + frame.endTime + 'ns</span></p>';

    if (frame.incomplete) {
      html += '<p style="color:#f38ba8;">⚠ Incomplete frame</p>';
    }

    html += '<p style="margin-top:8px;font-weight:600;">Fields:</p>';
    html += '<table class="frame-fields">';
    html += '<tr><th>Field</th><th>Bits</th><th>Bin</th><th>Hex</th><th>Dec</th></tr>';

    for (var f = 0; f < frame.fields.length; f++) {
      var field = frame.fields[f];
      html += '<tr>';
      html += '<td>' + field.name + '</td>';
      html += '<td>[' + field.high + ':' + field.low + ']</td>';
      html += '<td class="mono">0b' + field.bin + '</td>';
      html += '<td class="mono">' + field.hex + '</td>';
      html += '<td class="mono">' + field.value + '</td>';
      html += '</tr>';
    }

    html += '</table>';

    bodyEl.innerHTML = html;
  };

  Viewer.prototype.showGlitchDetail = function(glitch) {
    var detailEl = document.getElementById('glitch-detail');
    var bodyEl = document.getElementById('glitch-detail-body');
    detailEl.classList.remove('hidden');

    var html = '<p>Signal: <span class="glitch-signal">' + glitch.signal + '</span></p>';
    html += '<p>Time: <span class="glitch-time">' + glitch.startTime + 'ns ~ ' + glitch.endTime + 'ns</span></p>';
    html += '<p>Glitch value: ' + glitch.glitchValue + ', Stable value: ' + glitch.stableValue + '</p>';
    html += '<p style="margin-top:8px;font-weight:600;">Delay path analysis:</p>';

    for (var i = 0; i < glitch.paths.length; i++) {
      var path = glitch.paths[i];
      html += '<div class="glitch-path">';
      html += path.trace.join(' → ');
      html += ' (delay: ' + path.delay + 'ns';
      if (path.delayDiff !== undefined) {
        html += ', <span class="delay-diff">Δ=' + path.delayDiff + 'ns</span>';
      }
      html += ')</div>';
    }

    bodyEl.innerHTML = html;
  };

  Viewer.prototype.showCDCDetail = function(signal, violations) {
    var detailEl = document.getElementById('cdc-detail');
    var bodyEl = document.getElementById('cdc-detail-body');
    detailEl.classList.remove('hidden');

    var html = '<p>Signal: <span class="cdc-signal">' + signal + '</span></p>';
    html += '<p style="margin-top:8px;font-weight:600;">跨时钟域路径:</p>';

    for (var i = 0; i < violations.length; i++) {
      var vio = violations[i];
      html += '<div class="cdc-path">';
      html += '<div class="cdc-path-header">';
      html += '<span class="cdc-domain" style="color:' + (this.domainColorMap[vio.sourceDomain] || {}).line + '">' + vio.sourceDomain + '</span>';
      html += ' → ';
      html += '<span class="cdc-domain" style="color:' + (this.domainColorMap[vio.destDomain] || {}).line + '">' + vio.destDomain + '</span>';
      if (vio.hasSynchronizer) {
        html += ' <span style="color:#a6e3a1;">✓ 已同步</span>';
      } else {
        html += ' <span style="color:#f38ba8;">⚠ 未同步</span>';
      }
      html += '</div>';
      html += '<div class="cdc-path-detail">';
      html += vio.path.join(' → ');
      html += '</div>';
      html += '</div>';
    }

    bodyEl.innerHTML = html;
  };

  Viewer.prototype.draw = function() {
    var ctx = this.ctx;
    var w = this.displayWidth;
    var h = this.displayHeight;

    if (!w || !h) return;

    ctx.save();
    ctx.scale(this.devicePixelRatio, this.devicePixelRatio);

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    this.drawGrid(ctx, w, h);
    this.drawDomainBackgrounds(ctx, w, h);
    this.drawSignals(ctx, w, h);
    this.drawGlitches(ctx, w, h);
    this.drawAssertionMarkers(ctx, w, h);
    this.drawCDCMarkers(ctx, w, h);
    this.drawSearchMarkers(ctx, w, h);
    this.drawDualCursors(ctx, w, h);

    if (this.mouseX >= 0 && this.mouseY >= 0 && !this.cursorDragging) {
      this.drawCursor(ctx, w, h);
    }

    ctx.restore();

    this.drawTimeAxis();
    this.updateTooltip();
    this.updateSignalListScroll();
  };

  Viewer.prototype.drawTimeAxis = function() {
    if (!this.timeAxisEl) return;
    var startTime = this.scrollX / this.pixelsPerNs;
    var canvasWidth = this.displayWidth;
    var endTime = (this.scrollX + canvasWidth) / this.pixelsPerNs;
    var step = this.calcGridStep(this.pixelsPerNs);

    var html = '';
    var t = Math.floor(startTime / step) * step;
    while (t <= endTime) {
      var x = t * this.pixelsPerNs - this.scrollX;
      if (x >= 0 && x <= canvasWidth) {
        var isMajor = (t % (step * 5) === 0);
        html += '<span style="position:absolute;left:' + x + 'px;top:2px;font-size:10px;font-family:monospace;color:' +
          (isMajor ? '#a6adc8' : '#6c7086') + ';white-space:nowrap;">' + t + 'ns</span>';
      }
      t += step;
    }
    this.timeAxisEl.innerHTML = html;
  };

  Viewer.prototype.drawGrid = function(ctx, w, h) {
    var startTime = this.scrollX / this.pixelsPerNs;
    var endTime = (this.scrollX + w) / this.pixelsPerNs;

    var step = this.calcGridStep(this.pixelsPerNs);

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.5;

    var t = Math.floor(startTime / step) * step;
    while (t <= endTime) {
      var x = t * this.pixelsPerNs - this.scrollX;
      if (x >= 0 && x <= w) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
      t += step;
    }

    ctx.strokeStyle = COLORS.grid;
    ctx.lineWidth = 0.3;

    var allItems = this.getAllDisplayNames();
    var currentY = 0;
    for (var i = 0; i < allItems.length; i++) {
      var itemH = this.getDisplayItemHeight(allItems[i]);
      var y = currentY - this.scrollY;
      if (y >= 0 && y <= h) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      currentY += itemH;
    }
  };

  Viewer.prototype.calcGridStep = function(ppn) {
    var steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 500, 1000];
    var minPixelStep = 50;
    for (var i = 0; i < steps.length; i++) {
      if (steps[i] * ppn >= minPixelStep) return steps[i];
    }
    return steps[steps.length - 1];
  };

  Viewer.prototype.drawDomainBackgrounds = function(ctx, w, h) {
    var allItems = this.getAllDisplayNames();
    var currentY = 0;

    for (var i = 0; i < allItems.length; i++) {
      var item = allItems[i];
      var itemH = this.getDisplayItemHeight(item);
      var y = currentY - this.scrollY;

      if (y + itemH >= 0 && y <= h && item.type !== 'bus' && item.type !== 'group-header') {
        var sig = this.signalMap[item.name];
        if (sig && sig.clockDomain && this.domainColorMap[sig.clockDomain]) {
          ctx.fillStyle = this.domainColorMap[sig.clockDomain].bg;
          ctx.fillRect(0, y, w, itemH);
        }
      }

      currentY += itemH;
    }
  };

  Viewer.prototype.drawAssertionMarkers = function(ctx, w, h) {
    if (this.assertionViolations.length === 0) return;

    var startTime = this.scrollX / this.pixelsPerNs;
    var endTime = (this.scrollX + w) / this.pixelsPerNs;

    var violationIntervals = {};
    for (var ai = 0; ai < this.assertions.length; ai++) {
      var assertion = this.assertions[ai];
      var assertId = assertion.id;
      var status = this.assertionStatus[assertId];
      if (!status || status.passed) continue;

      var violations = this.assertionViolations.filter(function(v) {
        return v.assertId === assertId;
      });
      if (violations.length === 0) continue;

      var intervals = [];
      var intervalStart = violations[0].time;
      var lastTime = violations[0].time;

      for (var vi = 1; vi < violations.length; vi++) {
        var v = violations[vi];
        if (v.time - lastTime > 1) {
          intervals.push({ start: intervalStart, end: lastTime });
          intervalStart = v.time;
        }
        lastTime = v.time;
      }
      intervals.push({ start: intervalStart, end: lastTime });

      violationIntervals[assertId] = {
        assertion: assertion,
        intervals: intervals,
        violations: violations
      };
    }

    for (var aid in violationIntervals) {
      if (!violationIntervals.hasOwnProperty(aid)) continue;
      var data = violationIntervals[aid];
      var isHighlighted = this.highlightedAssertion === aid;

      for (var ii = 0; ii < data.intervals.length; ii++) {
        var interval = data.intervals[ii];
        if (interval.end < startTime || interval.start > endTime) continue;

        var startX = interval.start * this.pixelsPerNs - this.scrollX;
        var endX = interval.end * this.pixelsPerNs - this.scrollX;

        startX = Math.max(0, startX);
        endX = Math.min(w, endX);

        if (isHighlighted) {
          ctx.fillStyle = COLORS.assertionHighlight;
        } else {
          ctx.fillStyle = COLORS.assertionFill;
        }
        ctx.fillRect(startX, 0, endX - startX, h);

        ctx.strokeStyle = COLORS.assertionLine;
        ctx.lineWidth = isHighlighted ? 2.5 : 1.5;
        ctx.beginPath();
        ctx.moveTo(startX, 0);
        ctx.lineTo(startX, h);
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(endX, 0);
        ctx.lineTo(endX, h);
        ctx.stroke();
      }

      for (var vi2 = 0; vi2 < data.violations.length; vi2++) {
        var vio = data.violations[vi2];
        if (vio.time < startTime || vio.time > endTime) continue;

        var x = vio.time * this.pixelsPerNs - this.scrollX;
        var isHovered = this.hoveredAssertionViolation &&
          this.hoveredAssertionViolation.assertId === vio.assertId &&
          this.hoveredAssertionViolation.time === vio.time;

        ctx.strokeStyle = isHovered ? COLORS.assertionBorder : COLORS.assertionLine;
        ctx.lineWidth = isHovered ? 3 : 2;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
    }
  };

  Viewer.prototype.drawCDCMarkers = function(ctx, w, h) {
    var startTime = this.scrollX / this.pixelsPerNs;
    var endTime = (this.scrollX + w) / this.pixelsPerNs;

    var cdcTimes = {};
    for (var vi = 0; vi < this.cdcViolations.length; vi++) {
      var vio = this.cdcViolations[vi];
      if (vio.hasSynchronizer) continue;
      var wf = this.waveforms[vio.sourceReg];
      if (wf) {
        for (var wi = 1; wi < wf.length; wi++) {
          var evt = wf[wi];
          if (evt.time >= startTime && evt.time <= endTime) {
            var prev = wf[wi - 1];
            if (prev.value !== evt.value) {
              cdcTimes[evt.time] = cdcTimes[evt.time] || [];
              if (cdcTimes[evt.time].indexOf(vio.sourceReg) === -1) {
                cdcTimes[evt.time].push(vio.sourceReg);
              }
            }
          }
        }
      }
    }

    ctx.strokeStyle = COLORS.cdcLine;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 3]);
    ctx.font = 'bold 10px ' + (window.getComputedStyle(document.body).fontFamily || 'monospace');
    ctx.fillStyle = COLORS.cdcIndicator;

    for (var t in cdcTimes) {
      if (!cdcTimes.hasOwnProperty(t)) continue;
      var x = parseFloat(t) * this.pixelsPerNs - this.scrollX;
      if (x >= 0 && x <= w) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();

        ctx.save();
        ctx.translate(x + 4, 12);
        ctx.fillText('⚡CDC', 0, 0);
        ctx.restore();
      }
    }

    ctx.setLineDash([]);
  };

  Viewer.prototype.drawSignals = function(ctx, w, h) {
    var allItems = this.getAllDisplayNames();
    var currentY = 0;

    for (var i = 0; i < allItems.length; i++) {
      var item = allItems[i];
      var itemH = this.getDisplayItemHeight(item);
      var y = currentY - this.scrollY;

      if (y + itemH >= 0 && y <= h) {
        if (item.type === 'group-header') {
          ctx.fillStyle = COLORS.bg;
          ctx.fillRect(0, y, w, itemH);
          ctx.strokeStyle = COLORS.gridMajor;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, y + itemH);
          ctx.lineTo(w, y + itemH);
          ctx.stroke();

          ctx.fillStyle = COLORS.gridMajor;
          ctx.font = 'bold 11px ' + (window.getComputedStyle(document.body).fontFamily || 'monospace');
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(item.groupName || '', 8, y + itemH / 2);
        } else if (item.type === 'bus') {
          if (this.compareMode && this.compareSnapshot) {
            this.drawDiffHighlights(ctx, item.name, y, w);
          }
          if (this.decoders[item.name]) {
            this.drawDecoderLayer(ctx, item.name, y, w);
            this.drawBusWaveform(ctx, item.name, y + DECODER_HEIGHT, w);
          } else {
            this.drawBusWaveform(ctx, item.name, y, w);
          }
        } else {
          if (this.compareMode && this.compareSnapshot) {
            this.drawSnapshotWaveform(ctx, item.name, y, w);
            this.drawDiffHighlights(ctx, item.name, y, w);
          }
          this.drawSignalWaveform(ctx, item.name, y, w);
        }
      }

      currentY += itemH;
    }
  };

  Viewer.prototype.drawBusWaveform = function(ctx, busName, baseY, canvasW) {
    var bus = this.buses.find(function(b) { return b.name === busName; });
    if (!bus) return;

    var wf = this.busWaveforms[busName];
    if (!wf || wf.length === 0) return;

    var isHighlighted = busName === this.highlightedSignal;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, baseY, canvasW, BUS_HEIGHT);
    ctx.clip();

    var topY = baseY + 8;
    var bottomY = baseY + BUS_HEIGHT - 8;
    var midY = baseY + BUS_HEIGHT / 2;

    var startTime = this.scrollX / this.pixelsPerNs;
    var endTime = (this.scrollX + canvasW) / this.pixelsPerNs;

    var fillColor = isHighlighted ? 'rgba(249, 226, 175, 0.3)' : COLORS.busFill;
    var borderColor = isHighlighted ? COLORS.highlightLine : COLORS.busBorder;

    ctx.fillStyle = fillColor;
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = isHighlighted ? 2.5 : 1.5;

    var firstEvent = wf[0];
    var lastEvent = wf[wf.length - 1];
    var firstX = Math.max(-100, firstEvent.time * this.pixelsPerNs - this.scrollX);
    var lastX = Math.min(canvasW + 100, lastEvent.time * this.pixelsPerNs - this.scrollX);

    ctx.beginPath();
    ctx.moveTo(firstX, topY);
    ctx.lineTo(lastX, topY);
    ctx.lineTo(lastX, bottomY);
    ctx.lineTo(firstX, bottomY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = borderColor;
    ctx.fillStyle = borderColor;
    ctx.lineWidth = 1.5;

    for (var wi = 1; wi < wf.length; wi++) {
      var evt = wf[wi];
      if (evt.time < startTime - 10) continue;
      if (evt.time > endTime + 10) break;

      var x = evt.time * this.pixelsPerNs - this.scrollX;
      var diamondW = Math.min(DIAMOND_WIDTH, this.pixelsPerNs * 0.6);

      ctx.beginPath();
      ctx.moveTo(x - diamondW, topY);
      ctx.lineTo(x, midY - 4);
      ctx.lineTo(x + diamondW, topY);
      ctx.moveTo(x - diamondW, bottomY);
      ctx.lineTo(x, midY + 4);
      ctx.lineTo(x + diamondW, bottomY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x, midY - 4);
      ctx.lineTo(x, midY + 4);
      ctx.stroke();
    }

    var minCharWidth = 30;
    if (this.pixelsPerNs >= 1.5) {
      ctx.fillStyle = COLORS.busText;
      ctx.font = '12px ' + (window.getComputedStyle(document.body).fontFamily || 'monospace');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      for (var wi = 0; wi < wf.length; wi++) {
        var evt = wf[wi];
        var nextEvt = wf[wi + 1];
        var evtStart = Math.max(startTime, evt.time);
        var evtEnd = nextEvt ? Math.min(endTime, nextEvt.time) : endTime;

        var xStart = evtStart * this.pixelsPerNs - this.scrollX;
        var xEnd = evtEnd * this.pixelsPerNs - this.scrollX;
        var segmentWidth = xEnd - xStart;

        if (segmentWidth >= minCharWidth) {
          var xMid = (xStart + xEnd) / 2;
          var hexStr = bus.width + "'h" + evt.value.toString(16).toUpperCase();
          ctx.fillText(hexStr, xMid, midY);
        }
      }
    }

    ctx.restore();
  };

  Viewer.prototype.drawDecoderLayer = function(ctx, busName, baseY, canvasW) {
    var decoder = this.decoders[busName];
    if (!decoder) return;

    var frames = decoder.frames;
    if (frames.length === 0) return;

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, baseY, canvasW, DECODER_HEIGHT);
    ctx.clip();

    var startTime = this.scrollX / this.pixelsPerNs;
    var endTime = (this.scrollX + canvasW) / this.pixelsPerNs;

    var midY = baseY + DECODER_HEIGHT / 2;

    ctx.strokeStyle = COLORS.decoderGap;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    ctx.moveTo(0, midY);
    ctx.lineTo(canvasW, midY);
    ctx.stroke();
    ctx.setLineDash([]);

    for (var fi = 0; fi < frames.length; fi++) {
      var frame = frames[fi];
      if (frame.endTime < startTime - 10) continue;
      if (frame.startTime > endTime + 10) break;

      var startX = frame.startTime * this.pixelsPerNs - this.scrollX;
      var endX = frame.endTime * this.pixelsPerNs - this.scrollX;
      var frameW = endX - startX;

      if (frameW < 20) continue;

      startX = Math.max(2, startX);
      endX = Math.min(canvasW - 2, endX);

      var isHovered = this.hoveredFrame && this.hoveredFrame.frame === frame;

      ctx.fillStyle = isHovered ? 'rgba(166, 227, 161, 0.5)' : COLORS.decoderFrame;
      ctx.strokeStyle = isHovered ? COLORS.decoderText : COLORS.decoderBorder;
      ctx.lineWidth = isHovered ? 2 : 1.5;

      var radius = 4;
      var rectX = startX;
      var rectY = baseY + 4;
      var rectW = endX - startX;
      var rectH = DECODER_HEIGHT - 8;

      ctx.beginPath();
      ctx.moveTo(rectX + radius, rectY);
      ctx.lineTo(rectX + rectW - radius, rectY);
      ctx.quadraticCurveTo(rectX + rectW, rectY, rectX + rectW, rectY + radius);
      ctx.lineTo(rectX + rectW, rectY + rectH - radius);
      ctx.quadraticCurveTo(rectX + rectW, rectY + rectH, rectX + rectW - radius, rectY + rectH);
      ctx.lineTo(rectX + radius, rectY + rectH);
      ctx.quadraticCurveTo(rectX, rectY + rectH, rectX, rectY + rectH - radius);
      ctx.lineTo(rectX, rectY + radius);
      ctx.quadraticCurveTo(rectX, rectY, rectX + radius, rectY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      if (frameW > 50) {
        ctx.fillStyle = COLORS.decoderText;
        ctx.font = '11px ' + (window.getComputedStyle(document.body).fontFamily || 'monospace');
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        var label = 'F' + frame.index;
        if (frame.fields.length > 0 && frameW > 80) {
          var firstField = frame.fields[0];
          label += ': ' + firstField.name + '=' + firstField.value;
        }
        ctx.fillText(label, (startX + endX) / 2, midY);
      }
    }

    ctx.restore();
  };

  Viewer.prototype.drawSignalWaveform = function(ctx, name, baseY, canvasW) {
    var wf = this.waveforms[name];
    if (!wf || wf.length === 0) return;

    var isHighlighted = name === this.highlightedSignal;
    var isSource = this.sourceSignals[name];
    var isClk = this.clockSignals[name];
    var sig = this.signalMap[name];
    var domainColor = sig && sig.clockDomain ? this.domainColorMap[sig.clockDomain] : null;

    var covStatus = 'normal';
    var waveToggleStats = (this.coverageData && CoverageAnalyzer.extractStats(this.coverageData.toggleCoverage)) || {};
    if (waveToggleStats[name]) {
      covStatus = waveToggleStats[name].status || 'normal';
    }

    var isUncovered = covStatus === 'uncovered' || covStatus === 'stuck';

    ctx.save();

    ctx.beginPath();
    ctx.rect(0, baseY, canvasW, SIGNAL_HEIGHT);
    ctx.clip();

    var highY = baseY + HIGH_Y_OFFSET;
    var lowY = baseY + LOW_Y_OFFSET;
    var transW = Math.min(TRANSITION_WIDTH, this.pixelsPerNs * 0.8);

    var lineColor = COLORS.lowLine;
    if (isHighlighted) {
      lineColor = COLORS.highlightLine;
    } else if (isClk) {
      lineColor = COLORS.clockColor;
    } else if (isSource) {
      lineColor = COLORS.sourceTrace;
    } else if (domainColor) {
      lineColor = domainColor.line;
    }

    if (isUncovered && !isHighlighted && !isClk) {
      lineColor = '#585b70';
      ctx.globalAlpha = 0.5;
    }

    var fillColor = isClk ? 'rgba(166, 227, 161, 0.08)' :
      isHighlighted ? 'rgba(249, 226, 175, 0.08)' :
      isSource ? 'rgba(137, 180, 250, 0.05)' : null;

    ctx.lineWidth = isHighlighted ? 2.5 : (isSource ? 1.5 : 1.5);
    ctx.strokeStyle = lineColor;

    if (isUncovered && !isHighlighted) {
      ctx.setLineDash([6, 4]);
    } else if (isSource && !isHighlighted) {
      ctx.setLineDash([4, 3]);
    }

    ctx.beginPath();

    var startTime = this.scrollX / this.pixelsPerNs;
    var endTime = (this.scrollX + canvasW) / this.pixelsPerNs;

    var firstDrawn = false;
    var prevVal = 0;
    var prevX = 0;
    var prevY = lowY;

    for (var wi = 0; wi < wf.length; wi++) {
      var evt = wf[wi];
      if (evt.time > endTime + 10) break;

      var x = evt.time * this.pixelsPerNs - this.scrollX;
      var targetY = evt.value ? highY : lowY;

      if (!firstDrawn) {
        if (wi === 0) {
          var initX = Math.max(0, x - 1000);
          ctx.moveTo(initX, targetY);
          ctx.lineTo(x, targetY);
        } else {
          var prevEvt = wf[wi - 1];
          var prevEvtY = prevEvt.value ? highY : lowY;
          var prevEvtX = prevEvt.time * this.pixelsPerNs - this.scrollX;
          ctx.moveTo(prevEvtX, prevEvtY);
          ctx.lineTo(x - transW, prevEvtY);
          ctx.lineTo(x, targetY);
        }
        firstDrawn = true;
      } else {
        ctx.lineTo(x - transW, prevY);
        ctx.lineTo(x, targetY);
      }

      prevVal = evt.value;
      prevX = x;
      prevY = targetY;
    }

    if (firstDrawn) {
      ctx.lineTo(canvasW + 10, prevY);
    }

    ctx.stroke();

    if (isSource && !isHighlighted) {
      ctx.setLineDash([]);
    }

    if (fillColor && firstDrawn) {
      ctx.beginPath();
      firstDrawn = false;
      for (var fi = 0; fi < wf.length; fi++) {
        var fevt = wf[fi];
        if (fevt.time > endTime + 10) break;
        var fx = fevt.time * this.pixelsPerNs - this.scrollX;
        var ftargetY = fevt.value ? highY : lowY;

        if (!firstDrawn) {
          if (fi === 0) {
            ctx.moveTo(Math.max(0, fx - 1000), ftargetY);
            ctx.lineTo(fx, ftargetY);
          } else {
            var fprev = wf[fi - 1];
            var fprevY = fprev.value ? highY : lowY;
            var fprevX = fprev.time * this.pixelsPerNs - this.scrollX;
            ctx.moveTo(fprevX, fprevY);
            ctx.lineTo(fx - transW, fprevY);
            ctx.lineTo(fx, ftargetY);
          }
          firstDrawn = true;
        } else {
          ctx.lineTo(fx - transW, prevY);
          ctx.lineTo(fx, ftargetY);
        }
        prevY = ftargetY;
      }
      if (firstDrawn) {
        ctx.lineTo(canvasW + 10, prevY);
        ctx.lineTo(canvasW + 10, baseY + SIGNAL_HEIGHT);
        ctx.lineTo(0, baseY + SIGNAL_HEIGHT);
        ctx.closePath();
        ctx.fillStyle = fillColor;
        ctx.fill();
      }
    }

    ctx.restore();
  };

  Viewer.prototype.drawGlitches = function(ctx, w, h) {
    for (var i = 0; i < this.glitches.length; i++) {
      var gl = this.glitches[i];
      var sigIdx = this.signalNames.indexOf(gl.signal);
      if (sigIdx === -1) continue;

      var baseY = sigIdx * SIGNAL_HEIGHT - this.scrollY;
      if (baseY + SIGNAL_HEIGHT < 0 || baseY > h) continue;

      var startX = gl.startTime * this.pixelsPerNs - this.scrollX;
      var endX = gl.endTime * this.pixelsPerNs - this.scrollX;

      if (endX < 0 || startX > w) continue;

      startX = Math.max(0, startX);
      endX = Math.min(w, endX);

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, baseY, w, SIGNAL_HEIGHT);
      ctx.clip();

      ctx.fillStyle = COLORS.glitchFill;
      ctx.fillRect(startX, baseY, endX - startX, SIGNAL_HEIGHT);

      ctx.strokeStyle = COLORS.glitchBorder;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 2]);
      ctx.strokeRect(startX, baseY, endX - startX, SIGNAL_HEIGHT);
      ctx.setLineDash([]);

      ctx.restore();
    }
  };

  Viewer.prototype.drawCursor = function(ctx, w, h) {
    var x = this.mouseX;

    ctx.strokeStyle = COLORS.cursorLine;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.setLineDash([]);

    if (this.hoveredSignal) {
      var itemY = this.getDisplayItemY(this.hoveredSignal);
      if (itemY !== -1) {
        var allItems = this.getAllDisplayNames();
        var item = allItems.find(function(i) { return i.name === this.hoveredSignal; }.bind(this));
        if (item) {
          var y = itemY - this.scrollY;
          var itemH = this.getDisplayItemHeight(item);
          ctx.fillStyle = 'rgba(137, 180, 250, 0.05)';
          ctx.fillRect(0, y, w, itemH);
        }
      }
    }
  };

  Viewer.prototype.updateTooltip = function() {
    var tooltip = document.getElementById('cursor-tooltip');
    var time = (this.mouseX + this.scrollX) / this.pixelsPerNs;

    if (this.hoveredAssertionViolation) {
      tooltip.classList.remove('hidden');
      var vio = this.hoveredAssertionViolation;
      var assertion = this.assertions.find(function(a) { return a.id === vio.assertId; });
      var desc = assertion ? assertion.description : vio.assertId;

      var html = '<div class="assertion-tooltip">';
      html += '<div class="assertion-tooltip-header">⚠ Assertion Violation</div>';
      html += '<div class="assertion-tooltip-time">Time: ' + vio.time.toFixed(1) + 'ns</div>';
      html += '<div class="assertion-tooltip-desc">' + desc + '</div>';
      html += '<div class="assertion-tooltip-signals">';
      for (var sigName in vio.signalValues) {
        if (vio.signalValues.hasOwnProperty(sigName)) {
          html += '<span class="tt-bit">' + sigName + '=' + vio.signalValues[sigName] + '</span>';
        }
      }
      html += '</div></div>';

      tooltip.innerHTML = html;

      var canvasRect = this.canvas.getBoundingClientRect();
      var panelRect = this.canvas.parentElement.getBoundingClientRect();
      var tx = this.mouseX + canvasRect.left - panelRect.left + SIGNAL_LABEL_WIDTH + 12;
      var ty = this.mouseY + canvasRect.top - panelRect.top - 10;

      tooltip.style.left = tx + 'px';
      tooltip.style.top = ty + 'px';
      return;
    }

    if (this.mouseX < 0 || this.mouseY < 0 || !this.hoveredSignal) {
      tooltip.classList.add('hidden');
      return;
    }

    tooltip.classList.remove('hidden');

    var html = '<span class="tt-time">' + time.toFixed(1) + 'ns</span> ' +
      '<span class="tt-signal">' + this.hoveredSignal + '</span> ';

    var bus = this.buses.find(function(b) { return b.name === this.hoveredSignal; }.bind(this));

    if (bus) {
      var busValue = this.getBusValueAtTime(bus.name, time);
      html += '<span class="tt-value">= ' + bus.width + "'h" + busValue.toString(16).toUpperCase() + '</span>';
      html += '<div class="tt-bits">';
      for (var bi = 0; bi < bus.bits.length; bi++) {
        var bitVal = this.getValueAtTime(bus.bits[bi], time);
        html += '<span class="tt-bit">' + bus.bits[bi] + '=' + bitVal + '</span>';
      }
      html += '</div>';
    } else {
      var value = this.getValueAtTime(this.hoveredSignal, time);
      html += '<span class="tt-value">= ' + value + '</span>';
    }

    tooltip.innerHTML = html;

    var canvasRect = this.canvas.getBoundingClientRect();
    var panelRect = this.canvas.parentElement.getBoundingClientRect();
    var tx = this.mouseX + canvasRect.left - panelRect.left + SIGNAL_LABEL_WIDTH + 12;
    var ty = this.mouseY + canvasRect.top - panelRect.top - 10;

    tooltip.style.left = tx + 'px';
    tooltip.style.top = ty + 'px';
  };

  Viewer.prototype.getBusValueAtTime = function(busName, time) {
    var bus = this.buses.find(function(b) { return b.name === busName; });
    if (!bus) return 0;

    var value = 0;
    for (var bi = 0; bi < bus.bits.length; bi++) {
      var bitVal = this.getValueAtTime(bus.bits[bi], time);
      if (bitVal === 1) {
        value |= (1 << bi);
      }
    }
    return value;
  };

  Viewer.prototype.showCreateBusDialog = function() {
    var self = this;
    var dialog = document.getElementById('create-bus-dialog');
    if (!dialog) return;

    var bitList = document.getElementById('bus-bit-list');
    bitList.innerHTML = '';

    var availableSignals = this.signalNames.filter(function(s) {
      return s !== 'clk';
    });

    for (var i = 0; i < availableSignals.length; i++) {
      var sigName = availableSignals[i];
      var defaultPos = Math.min(i, 15);
      var item = document.createElement('div');
      item.className = 'bus-bit-item';
      var options = '';
      for (var p = 0; p < 16; p++) {
        var label = p === 0 ? 'bit 0 (LSB)' : (p === 15 ? 'bit 15 (MSB)' : 'bit ' + p);
        var selected = p === defaultPos ? ' selected' : '';
        options += '<option value="' + p + '"' + selected + '>' + label + '</option>';
      }
      item.innerHTML =
        '<input type="checkbox" id="bit-' + i + '" value="' + sigName + '">' +
        '<label for="bit-' + i + '">' + sigName + '</label>' +
        '<select class="bit-position" data-signal="' + sigName + '">' +
        options +
        '</select>';
      bitList.appendChild(item);
    }

    document.getElementById('bus-name-input').value = '';
    dialog.classList.remove('hidden');

    var createBtn = document.getElementById('btn-create-bus');
    var cancelBtn = document.getElementById('btn-cancel-bus');

    createBtn.onclick = function() {
      var busName = document.getElementById('bus-name-input').value.trim();
      if (!busName) {
        alert('请输入总线名称');
        return;
      }

      var checkedBits = [];
      bitList.querySelectorAll('input[type="checkbox"]:checked').forEach(function(cb) {
        var signal = cb.value;
        var position = parseInt(bitList.querySelector('.bit-position[data-signal="' + signal + '"]').value);
        checkedBits.push({ signal: signal, position: position });
      });

      if (checkedBits.length === 0) {
        alert('请至少选择一个信号');
        return;
      }

      checkedBits.sort(function(a, b) { return a.position - b.position; });
      var bitSignals = checkedBits.map(function(b) { return b.signal; });

      if (self.createBus(busName, bitSignals)) {
        dialog.classList.add('hidden');
      } else {
        alert('创建总线失败，名称可能已存在');
      }
    };

    cancelBtn.onclick = function() {
      dialog.classList.add('hidden');
    };
  };

  Viewer.prototype.showAttachDecoderDialog = function(busName) {
    var self = this;
    var bus = this.buses.find(function(b) { return b.name === busName; });
    if (!bus) return;

    var dialog = document.getElementById('attach-decoder-dialog');
    if (!dialog) return;

    document.getElementById('decoder-bus-name').textContent = busName;
    document.getElementById('decoder-start-value').value = '0';
    document.getElementById('decoder-end-type').value = 'value';
    document.getElementById('decoder-end-value').value = '15';
    document.getElementById('decoder-fixed-length').value = '10';

    var fieldsContainer = document.getElementById('decoder-fields');
    fieldsContainer.innerHTML = '';
    this.addDecoderFieldRow(fieldsContainer, bus.width);

    dialog.classList.remove('hidden');

    document.getElementById('btn-add-field').onclick = function() {
      self.addDecoderFieldRow(fieldsContainer, bus.width);
    };

    document.getElementById('btn-create-decoder').onclick = function() {
      var startValue = parseInt(document.getElementById('decoder-start-value').value, 10);
      var endType = document.getElementById('decoder-end-type').value;
      var endValue = parseInt(document.getElementById('decoder-end-value').value, 10);
      var fixedLength = parseInt(document.getElementById('decoder-fixed-length').value, 10);

      var fields = [];
      fieldsContainer.querySelectorAll('.decoder-field-row').forEach(function(row) {
        var name = row.querySelector('.field-name').value.trim();
        var high = parseInt(row.querySelector('.field-high').value, 10);
        var low = parseInt(row.querySelector('.field-low').value, 10);
        if (name && !isNaN(high) && !isNaN(low)) {
          fields.push({ name: name, high: Math.max(high, low), low: Math.min(high, low) });
        }
      });

      if (fields.length === 0) {
        alert('请至少定义一个字段');
        return;
      }

      var config = {
        startValue: startValue,
        endType: endType,
        endValue: endValue,
        frameLength: fixedLength,
        fields: fields
      };

      self.attachDecoder(busName, config);
      dialog.classList.add('hidden');
    };

    document.getElementById('btn-cancel-decoder').onclick = function() {
      dialog.classList.add('hidden');
    };
  };

  Viewer.prototype.addDecoderFieldRow = function(container, busWidth) {
    var row = document.createElement('div');
    row.className = 'decoder-field-row';
    row.innerHTML =
      '<input type="text" class="field-name" placeholder="字段名" style="width:80px;">' +
      '<span>bit</span>' +
      '<input type="number" class="field-high" min="0" max="' + (busWidth - 1) + '" value="' + (busWidth - 1) + '" style="width:50px;">' +
      '<span>:</span>' +
      '<input type="number" class="field-low" min="0" max="' + (busWidth - 1) + '" value="0" style="width:50px;">' +
      '<button class="btn btn-small remove-field" type="button" style="padding:2px 6px;">✕</button>';
    container.appendChild(row);

    row.querySelector('.remove-field').onclick = function() {
      row.remove();
    };
  };

  Viewer.prototype.getValueAtTime = function(signal, time) {
    var wf = this.waveforms[signal];
    if (!wf || wf.length === 0) return 'x';

    var val = 0;
    for (var i = 0; i < wf.length; i++) {
      if (wf[i].time <= time) {
        val = wf[i].value;
      } else {
        break;
      }
    }
    return val;
  };

  Viewer.prototype.drawDualCursors = function(ctx, w, h) {
    if (this.cursorATime >= 0) {
      this.drawSingleCursor(ctx, w, h, this.cursorATime, CURSOR_A_COLOR, 'A');
    }
    if (this.cursorBTime >= 0) {
      this.drawSingleCursor(ctx, w, h, this.cursorBTime, CURSOR_B_COLOR, 'B');
    }

    if (this.cursorATime >= 0 && this.cursorBTime >= 0) {
      var xA = this.cursorATime * this.pixelsPerNs - this.scrollX;
      var xB = this.cursorBTime * this.pixelsPerNs - this.scrollX;
      var xLeft = Math.min(xA, xB);
      var xRight = Math.max(xA, xB);

      if (xRight >= 0 && xLeft <= w) {
        ctx.fillStyle = 'rgba(137, 180, 250, 0.04)';
        ctx.fillRect(Math.max(0, xLeft), 0, Math.min(w, xRight) - Math.max(0, xLeft), h);
      }
    }
  };

  Viewer.prototype.drawSingleCursor = function(ctx, w, h, time, color, label) {
    var x = time * this.pixelsPerNs - this.scrollX;
    if (x < -20 || x > w + 20) return;

    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = color;
    ctx.font = 'bold 10px ' + (window.getComputedStyle(document.body).fontFamily || 'monospace');

    var timeStr = time.toFixed(2) + 'ns';
    var labelText = label + ': ' + timeStr;
    var textW = ctx.measureText(labelText).width;

    var bgX = x - textW / 2 - 4;
    if (bgX < 2) bgX = 2;
    if (bgX + textW + 8 > w) bgX = w - textW - 10;

    ctx.fillStyle = 'rgba(30, 30, 46, 0.85)';
    ctx.fillRect(bgX, 2, textW + 8, 14);
    ctx.fillStyle = color;
    ctx.fillText(labelText, bgX + 4, 13);
  };

  Viewer.prototype.drawSearchMarkers = function(ctx, w, h) {
    if (this.searchMarkers.length === 0) return;

    var startTime = this.scrollX / this.pixelsPerNs;
    var endTime = (this.scrollX + w) / this.pixelsPerNs;

    ctx.font = 'bold 10px ' + (window.getComputedStyle(document.body).fontFamily || 'monospace');

    for (var i = 0; i < this.searchMarkers.length; i++) {
      var marker = this.searchMarkers[i];
      if (marker.time < startTime - 10 || marker.time > endTime + 10) continue;

      var x = marker.time * this.pixelsPerNs - this.scrollX;
      var isActive = (i === this.activeSearchIndex);

      var triSize = isActive ? 8 : 6;

      ctx.fillStyle = isActive ? SEARCH_MARKER_COLOR : 'rgba(249, 226, 175, 0.6)';
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x - triSize, triSize * 1.5);
      ctx.lineTo(x + triSize, triSize * 1.5);
      ctx.closePath();
      ctx.fill();

      if (isActive) {
        ctx.strokeStyle = SEARCH_MARKER_COLOR;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x, triSize * 1.5);
        ctx.lineTo(x, h);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  };

  Viewer.prototype.onMouseDown = function(e) {
    if (e.button !== 0) return;

    var rect = this.canvas.getBoundingClientRect();
    var mx = e.clientX - rect.left;
    var my = e.clientY - rect.top;

    if (this.cursorPlacementMode) {
      var time = (mx + this.scrollX) / this.pixelsPerNs;
      time = Math.max(0, time);

      if (this.cursorPlacementMode === 'A') {
        this.cursorATime = time;
      } else if (this.cursorPlacementMode === 'B') {
        this.cursorBTime = time;
      }

      this.cursorPlacementMode = null;
      this.canvas.style.cursor = 'crosshair';
      this.updateMeasurementPanel();
      this.draw();
      if (this.onCursorPlaced) this.onCursorPlaced();
      return;
    }

    var hitCursor = this.hitTestCursor(mx);
    if (hitCursor) {
      this.cursorDragging = hitCursor;
      this.cursorDragStartX = mx;
      if (hitCursor === 'A') {
        this.cursorDragStartTime = this.cursorATime;
      } else {
        this.cursorDragStartTime = this.cursorBTime;
      }
      this.canvas.style.cursor = 'ew-resize';
      e.preventDefault();
      e.stopPropagation();
    }
  };

  Viewer.prototype.onMouseUp = function(e) {
    if (this.cursorDragging) {
      this._wasCursorDrag = true;
      this.cursorDragging = null;
      this.canvas.style.cursor = 'crosshair';
      this.updateMeasurementPanel();
      this.draw();
    }
  };

  Viewer.prototype.hitTestCursor = function(mx) {
    if (this.cursorATime >= 0) {
      var xA = this.cursorATime * this.pixelsPerNs - this.scrollX;
      if (Math.abs(mx - xA) <= CURSOR_HIT_RADIUS) return 'A';
    }
    if (this.cursorBTime >= 0) {
      var xB = this.cursorBTime * this.pixelsPerNs - this.scrollX;
      if (Math.abs(mx - xB) <= CURSOR_HIT_RADIUS) return 'B';
    }
    return null;
  };

  Viewer.prototype.updateMeasurementPanel = function() {
    var panel = document.getElementById('measurement-panel');
    if (!panel) return;

    if (this.cursorATime < 0 || this.cursorBTime < 0) {
      panel.classList.add('hidden');
      return;
    }

    panel.classList.remove('hidden');

    document.getElementById('meas-time-a').textContent = this.cursorATime.toFixed(2) + 'ns';
    document.getElementById('meas-time-b').textContent = this.cursorBTime.toFixed(2) + 'ns';

    var deltaT = Math.abs(this.cursorBTime - this.cursorATime);
    document.getElementById('meas-delta-t').textContent = deltaT.toFixed(2) + 'ns';

    var clockPeriod = 10;
    if (this.clocks && this.clocks.length > 0) {
      clockPeriod = this.clocks[0].period || 10;
    }
    var cycles = deltaT / clockPeriod;
    document.getElementById('meas-cycles').textContent = cycles.toFixed(2) + ' (' + clockPeriod + 'ns)';

    var signalName = this.highlightedSignal || '';
    if (signalName && this.waveforms[signalName]) {
      document.getElementById('meas-signal-name').textContent = signalName;
      var edges = this.countEdges(signalName, this.cursorATime, this.cursorBTime);
      document.getElementById('meas-rise-count').textContent = String(edges.rise);
      document.getElementById('meas-fall-count').textContent = String(edges.fall);

      if (deltaT > 0) {
        var totalToggles = edges.rise + edges.fall;
        var freq = (totalToggles / 2) / deltaT;
        document.getElementById('meas-freq').textContent = freq.toFixed(4) + ' GHz';
      } else {
        document.getElementById('meas-freq').textContent = '--';
      }
    } else {
      document.getElementById('meas-signal-name').textContent = signalName || '(none)';
      document.getElementById('meas-rise-count').textContent = '--';
      document.getElementById('meas-fall-count').textContent = '--';
      document.getElementById('meas-freq').textContent = '--';
    }
  };

  Viewer.prototype.countEdges = function(signal, startTime, endTime) {
    var wf = this.waveforms[signal];
    if (!wf || wf.length < 2) return { rise: 0, fall: 0 };

    var tMin = Math.min(startTime, endTime);
    var tMax = Math.max(startTime, endTime);
    var rise = 0;
    var fall = 0;

    for (var i = 1; i < wf.length; i++) {
      if (wf[i].time > tMax) break;
      if (wf[i].time <= tMin) continue;

      var prevVal = wf[i - 1].value;
      var curVal = wf[i].value;

      if (prevVal === 0 && curVal === 1) rise++;
      else if (prevVal === 1 && curVal === 0) fall++;
    }

    return { rise: rise, fall: fall };
  };

  Viewer.prototype.findEdges = function(signal, edgeType) {
    var wf = this.waveforms[signal];
    if (!wf || wf.length < 2) return [];

    var edges = [];
    for (var i = 1; i < wf.length; i++) {
      var prevVal = wf[i - 1].value;
      var curVal = wf[i].value;

      if (edgeType === 'rise' && prevVal === 0 && curVal === 1) {
        edges.push(wf[i].time);
      } else if (edgeType === 'fall' && prevVal === 1 && curVal === 0) {
        edges.push(wf[i].time);
      }
    }
    return edges;
  };

  Viewer.prototype.clearCursors = function() {
    this.cursorATime = -1;
    this.cursorBTime = -1;
    this.cursorPlacementMode = null;
    this.cursorDragging = null;
    this.updateMeasurementPanel();
    this.draw();
  };

  Viewer.prototype.setPlacementMode = function(mode) {
    this.cursorPlacementMode = mode;
    this.canvas.style.cursor = 'crosshair';
  };

  Viewer.prototype.setSearchMarkers = function(markers) {
    this.searchMarkers = markers;
    this.activeSearchIndex = -1;
    this.draw();
  };

  Viewer.prototype.navigateToSearchResult = function(index) {
    if (index < 0 || index >= this.searchMarkers.length) return;
    this.activeSearchIndex = index;

    var targetTime = this.searchMarkers[index].time;
    var centerX = this.displayWidth / 2;
    this.scrollX = targetTime * this.pixelsPerNs - centerX;
    this.scrollX = Math.max(0, this.scrollX);

    this.draw();
  };

  Viewer.prototype.getHighlightedSignalName = function() {
    return this.highlightedSignal;
  };

  Viewer.prototype.highlightAssertion = function(assertId) {
    if (this.highlightedAssertion === assertId) {
      this.highlightedAssertion = null;
    } else {
      this.highlightedAssertion = assertId;
    }
    this.draw();
  };

  Viewer.prototype.navigateToAssertionViolation = function(assertId) {
    var status = this.assertionStatus[assertId];
    if (!status || status.firstViolationTime === null) return;

    var targetTime = status.firstViolationTime;
    this.highlightedAssertion = assertId;
    this.cursorATime = targetTime;

    var centerX = this.displayWidth / 2;
    this.scrollX = targetTime * this.pixelsPerNs - centerX;
    this.scrollX = Math.max(0, this.scrollX);

    this.draw();
    this.updateMeasurementPanel();
  };

  Viewer.prototype.findAssertionViolationAtMouse = function(mouseX) {
    for (var i = 0; i < this.assertionViolations.length; i++) {
      var vio = this.assertionViolations[i];
      var markerX = vio.time * this.pixelsPerNs - this.scrollX;
      if (Math.abs(markerX - mouseX) <= 3) {
        return vio;
      }
    }
    return null;
  };

  Viewer.prototype.updateSignalListScroll = function() {
    this.signalListEl.parentElement.scrollTop = this.scrollY;
  };

  Viewer.prototype.toggleGroup = function(groupId) {
    if (this.collapsedGroups[groupId]) {
      delete this.collapsedGroups[groupId];
    } else {
      this.collapsedGroups[groupId] = true;
    }
    this.buildSignalLabels();
    this.resize();
    this.draw();
  };

  Viewer.prototype.createNewGroup = function(name) {
    var id = 'group_' + Date.now();
    this.signalGroups.push({
      id: id,
      name: name || 'New Group',
      signals: []
    });
    this.buildSignalLabels();
    this.resize();
    this.draw();
  };

  Viewer.prototype.renameGroup = function(groupId, newName) {
    var group = this.signalGroups.find(function(g) { return g.id === groupId; });
    if (group) {
      group.name = newName;
      this.buildSignalLabels();
      this.resize();
      this.draw();
    }
  };

  Viewer.prototype.deleteGroup = function(groupId) {
    var idx = this.signalGroups.findIndex(function(g) { return g.id === groupId; });
    if (idx !== -1) {
      var group = this.signalGroups[idx];
      for (var i = 0; i < group.signals.length; i++) {
        this.ungroupedSignals.push(group.signals[i]);
      }
      this.signalGroups.splice(idx, 1);
      delete this.collapsedGroups[groupId];
      this.buildSignalLabels();
      this.resize();
      this.draw();
    }
  };

  Viewer.prototype.showGroupContextMenu = function(x, y, groupId) {
    var self = this;
    var existing = document.getElementById('group-context-menu');
    if (existing) existing.remove();

    var menu = document.createElement('div');
    menu.id = 'group-context-menu';
    menu.className = 'group-context-menu';

    menu.innerHTML =
      '<div class="menu-item" data-action="rename">重命名</div>' +
      '<div class="menu-item" data-action="delete" style="color:#f38ba8;">删除组</div>';

    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    document.body.appendChild(menu);

    menu.querySelectorAll('.menu-item').forEach(function(item) {
      item.addEventListener('click', function() {
        var action = this.dataset.action;
        menu.remove();

        if (action === 'rename') {
          var newName = prompt('输入新的组名:');
          if (newName && newName.trim()) {
            self.renameGroup(groupId, newName.trim());
          }
        } else if (action === 'delete') {
          self.deleteGroup(groupId);
        }
      });
    });

    setTimeout(function() {
      document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target)) {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 10);
  };

  Viewer.prototype.setFilterText = function(text) {
    var self = this;
    if (this.filterDebounceTimer) {
      clearTimeout(this.filterDebounceTimer);
    }
    this.filterDebounceTimer = setTimeout(function() {
      self.filterText = text;
      self.buildSignalLabels();
      self.resize();
      self.draw();
    }, 200);
  };

  Viewer.prototype.getSignalLocation = function(signalName) {
    for (var gi = 0; gi < this.signalGroups.length; gi++) {
      var group = this.signalGroups[gi];
      var idx = group.signals.indexOf(signalName);
      if (idx !== -1) {
        return { type: 'group', groupId: group.id, index: idx };
      }
    }
    var ungroupedIdx = this.ungroupedSignals.indexOf(signalName);
    if (ungroupedIdx !== -1) {
      return { type: 'ungrouped', index: ungroupedIdx };
    }
    return null;
  };

  Viewer.prototype.removeSignal = function(signalName) {
    var loc = this.getSignalLocation(signalName);
    if (!loc) return false;

    if (loc.type === 'group') {
      var group = this.signalGroups.find(function(g) { return g.id === loc.groupId; });
      if (group) {
        group.signals.splice(loc.index, 1);
        return true;
      }
    } else if (loc.type === 'ungrouped') {
      this.ungroupedSignals.splice(loc.index, 1);
      return true;
    }
    return false;
  };

  Viewer.prototype.moveSignalToGroup = function(signalName, targetGroupId, targetIndex) {
    var loc = this.getSignalLocation(signalName);
    if (!loc) return false;

    var inTargetGroup = loc.type === 'group' && loc.groupId === targetGroupId;

    if (targetGroupId === null) {
      this.removeSignal(signalName);
      var insertIdx = targetIndex === -1 ? this.ungroupedSignals.length : targetIndex;
      this.ungroupedSignals.splice(insertIdx, 0, signalName);
    } else {
      var targetGroup = this.signalGroups.find(function(g) { return g.id === targetGroupId; });
      if (!targetGroup) return false;

      if (inTargetGroup) {
        var oldIndex = targetGroup.signals.indexOf(signalName);
        targetGroup.signals.splice(oldIndex, 1);
        if (targetIndex > oldIndex) targetIndex--;
      } else {
        this.removeSignal(signalName);
      }
      var insertIdx = targetIndex === -1 ? targetGroup.signals.length : targetIndex;
      targetGroup.signals.splice(insertIdx, 0, signalName);
    }

    this.buildSignalLabels();
    this.resize();
    this.draw();
    return true;
  };

  Viewer.prototype.moveGroup = function(groupId, targetIndex) {
    var idx = this.signalGroups.findIndex(function(g) { return g.id === groupId; });
    if (idx === -1) return false;

    var adjustedTarget = targetIndex;
    if (targetIndex > idx) adjustedTarget--;

    if (idx === adjustedTarget) return true;

    var group = this.signalGroups[idx];
    this.signalGroups.splice(idx, 1);
    this.signalGroups.splice(adjustedTarget, 0, group);

    this.buildSignalLabels();
    this.resize();
    this.draw();
    return true;
  };

  Viewer.prototype.clearDragOverClasses = function() {
    var innerEl = document.getElementById('signal-list-inner');
    if (!innerEl) return;
    var elements = innerEl.querySelectorAll('.drag-over-top, .drag-over-bottom, .drag-over');
    for (var i = 0; i < elements.length; i++) {
      elements[i].classList.remove('drag-over-top', 'drag-over-bottom', 'drag-over');
    }
  };

  Viewer.prototype.setupDragAndDrop = function() {
    var self = this;
    var innerEl = document.getElementById('signal-list-inner');
    if (!innerEl) innerEl = this.signalListEl;

    self.dragType = null;
    self.draggedId = null;

    innerEl.querySelectorAll('.signal-label, .group-header').forEach(function(el) {
      el.addEventListener('dragstart', function(e) {
        if (this.classList.contains('signal-label')) {
          self.dragType = 'signal';
          self.draggedId = this.dataset.signal;
        } else if (this.classList.contains('group-header')) {
          self.dragType = 'group';
          self.draggedId = this.dataset.groupId;
        }
        this.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', self.draggedId);
        e.stopPropagation();
      });

      el.addEventListener('dragend', function(e) {
        this.classList.remove('dragging');
        self.clearDragOverClasses();
        self.dragType = null;
        self.draggedId = null;
        e.stopPropagation();
      });

      el.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';

        self.clearDragOverClasses();

        var rect = this.getBoundingClientRect();
        var midY = rect.top + rect.height / 2;
        var isTop = e.clientY < midY;

        if (self.dragType === 'signal') {
          if (this.classList.contains('signal-label') && !self.clockSignals[this.dataset.signal]) {
            this.classList.add(isTop ? 'drag-over-top' : 'drag-over-bottom');
          } else if (this.classList.contains('group-header')) {
            this.classList.add(isTop ? 'drag-over-top' : 'drag-over-bottom');
          }
        } else if (self.dragType === 'group') {
          if (this.classList.contains('group-header')) {
            this.classList.add(isTop ? 'drag-over-top' : 'drag-over-bottom');
          }
        }
      });

      el.addEventListener('dragleave', function(e) {
        self.clearDragOverClasses();
        e.stopPropagation();
      });

      el.addEventListener('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        self.clearDragOverClasses();

        if (!self.dragType || !self.draggedId) return;

        var rect = this.getBoundingClientRect();
        var midY = rect.top + rect.height / 2;
        var isTop = e.clientY < midY;

        if (self.dragType === 'signal') {
          if (this.classList.contains('signal-label')) {
            var targetSignal = this.dataset.signal;
            if (self.clockSignals[targetSignal]) return;
            if (targetSignal === self.draggedId) return;

            var targetLoc = self.getSignalLocation(targetSignal);
            if (targetLoc) {
              var targetIndex = isTop ? targetLoc.index : targetLoc.index + 1;
              var targetGroupId = targetLoc.type === 'group' ? targetLoc.groupId : null;
              self.moveSignalToGroup(self.draggedId, targetGroupId, targetIndex);
            }
          } else if (this.classList.contains('group-header')) {
            var targetGroupId = this.dataset.groupId;
            var groupIdx = self.signalGroups.findIndex(function(g) { return g.id === targetGroupId; });
            if (isTop) {
              if (groupIdx === 0) {
                self.moveSignalToGroup(self.draggedId, null, 0);
              } else {
                var prevGroup = self.signalGroups[groupIdx - 1];
                self.moveSignalToGroup(self.draggedId, prevGroup.id, prevGroup.signals.length);
              }
            } else {
              self.moveSignalToGroup(self.draggedId, targetGroupId, 0);
            }
          }
        } else if (self.dragType === 'group' && this.classList.contains('group-header')) {
          var targetGroupId = this.dataset.groupId;
          if (targetGroupId === self.draggedId) return;

          var targetGroupIdx = self.signalGroups.findIndex(function(g) { return g.id === targetGroupId; });
          var insertIdx = isTop ? targetGroupIdx : targetGroupIdx + 1;
          self.moveGroup(self.draggedId, insertIdx);
        }

        self.dragType = null;
        self.draggedId = null;
      });
    });

    var ungroupedSection = innerEl.querySelector('.ungrouped-section');
    if (ungroupedSection) {
      ungroupedSection.addEventListener('dragover', function(e) {
        if (self.dragType !== 'signal') return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        self.clearDragOverClasses();
        ungroupedSection.classList.add('drag-over-bottom');
      });

      ungroupedSection.addEventListener('dragleave', function(e) {
        self.clearDragOverClasses();
        e.stopPropagation();
      });

      ungroupedSection.addEventListener('drop', function(e) {
        if (self.dragType !== 'signal') return;
        e.preventDefault();
        e.stopPropagation();
        self.clearDragOverClasses();
        self.moveSignalToGroup(self.draggedId, null, -1);
        self.dragType = null;
        self.draggedId = null;
      });
    }

    var signalList = document.getElementById('signal-list');
    if (signalList) {
      signalList.addEventListener('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
      });

      signalList.addEventListener('drop', function(e) {
        if (self.dragType !== 'signal') return;
        e.preventDefault();
        e.stopPropagation();
        self.clearDragOverClasses();
        self.moveSignalToGroup(self.draggedId, null, -1);
        self.dragType = null;
        self.draggedId = null;
      });
    }
  };

  Viewer.prototype.deepClone = function(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) {
      return obj.map(function(item) { return this.deepClone(item); }.bind(this));
    }
    var cloned = {};
    for (var key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }
    return cloned;
  };

  Viewer.prototype.saveSnapshot = function(name) {
    if (!this.waveforms || Object.keys(this.waveforms).length === 0) {
      return false;
    }

    var timestamp = new Date().toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).replace(/\//g, '-');

    var snapshot = {
      id: 'snap_' + Date.now(),
      name: name || ('Snapshot ' + timestamp),
      createdAt: Date.now(),
      signalNames: this.deepClone(this.signalNames),
      signalMap: this.deepClone(this.signalMap),
      waveforms: this.deepClone(this.waveforms),
      clocks: this.deepClone(this.clocks),
      buses: this.deepClone(this.buses),
      busWaveforms: this.deepClone(this.busWaveforms)
    };

    this.snapshots.push(snapshot);

    while (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    this.updateSnapshotCount();
    return true;
  };

  Viewer.prototype.deleteSnapshot = function(snapshotId) {
    var idx = this.snapshots.findIndex(function(s) { return s.id === snapshotId; });
    if (idx !== -1) {
      this.snapshots.splice(idx, 1);
      if (this.compareMode && this.compareSnapshot && this.compareSnapshot.id === snapshotId) {
        this.exitCompareMode();
      }
      this.updateSnapshotCount();
    }
  };

  Viewer.prototype.updateSnapshotCount = function() {
    var countEl = document.getElementById('snapshot-count');
    if (countEl) {
      countEl.textContent = this.snapshots.length + '/' + this.maxSnapshots;
    }
  };

  Viewer.prototype.enterCompareMode = function(snapshotId) {
    var snapshot = this.snapshots.find(function(s) { return s.id === snapshotId; });
    if (!snapshot) return false;

    this.compareMode = true;
    this.compareSnapshot = snapshot;
    this.computeDifferences();
    this.buildSignalLabels();
    this.draw();
    this.showDiffSummary();
    return true;
  };

  Viewer.prototype.exitCompareMode = function() {
    this.compareMode = false;
    this.compareSnapshot = null;
    this.diffResults = null;
    this.buildSignalLabels();
    this.draw();
    this.hideDiffSummary();
  };

  Viewer.prototype.getSignalValueAtTime = function(waveforms, signalName, time) {
    var wf = waveforms[signalName];
    if (!wf || wf.length === 0) return 'x';

    var val = wf[0].value;
    for (var i = 0; i < wf.length; i++) {
      if (wf[i].time <= time) {
        val = wf[i].value;
      } else {
        break;
      }
    }
    return val;
  };

  Viewer.prototype.getWaveformEndTime = function(waveforms) {
    var maxTime = 0;
    for (var sigName in waveforms) {
      if (waveforms.hasOwnProperty(sigName)) {
        var wf = waveforms[sigName];
        if (wf && wf.length > 0) {
          var lastTime = wf[wf.length - 1].time;
          if (lastTime > maxTime) maxTime = lastTime;
        }
      }
    }
    return maxTime;
  };

  Viewer.prototype.computeDifferences = function() {
    if (!this.compareMode || !this.compareSnapshot) return;

    var snapWaveforms = this.compareSnapshot.waveforms;
    var currWaveforms = this.waveforms;

    var allSignalNames = {};
    for (var i = 0; i < this.signalNames.length; i++) {
      allSignalNames[this.signalNames[i]] = 'current';
    }
    for (var j = 0; j < this.compareSnapshot.signalNames.length; j++) {
      var snapName = this.compareSnapshot.signalNames[j];
      if (!allSignalNames[snapName]) {
        allSignalNames[snapName] = 'deleted';
      } else {
        allSignalNames[snapName] = 'both';
      }
    }

    var maxCurrTime = this.getWaveformEndTime(currWaveforms);
    var maxSnapTime = this.getWaveformEndTime(snapWaveforms);
    var maxTime = Math.max(maxCurrTime, maxSnapTime);

    var diffResults = {
      signalDiffs: {},
      totalSignals: 0,
      diffSignals: 0,
      firstDiffTime: null,
      deletedSignals: [],
      newSignals: []
    };

    var sampleInterval = Math.max(1, Math.floor(maxTime / 1000));
    if (sampleInterval < 1) sampleInterval = 1;

    for (var sigName in allSignalNames) {
      if (!allSignalNames.hasOwnProperty(sigName)) continue;

      var sigStatus = allSignalNames[sigName];
      diffResults.totalSignals++;

      if (sigStatus === 'deleted') {
        diffResults.deletedSignals.push(sigName);
        diffResults.signalDiffs[sigName] = {
          status: 'deleted',
          diffIntervals: [],
          diffPercent: 100
        };
        diffResults.diffSignals++;
      } else if (sigStatus === 'current' && !snapWaveforms[sigName]) {
        diffResults.newSignals.push(sigName);
        diffResults.signalDiffs[sigName] = {
          status: 'new',
          diffIntervals: [],
          diffPercent: 100
        };
        diffResults.diffSignals++;
      } else {
        var currWf = currWaveforms[sigName];
        var snapWf = snapWaveforms[sigName];

        if (!currWf || !snapWf) continue;

        var diffIntervals = [];
        var inDiff = false;
        var diffStart = 0;
        var totalDiffTime = 0;
        var firstSignalDiffTime = null;

        for (var t = 0; t <= maxTime; t += sampleInterval) {
          var currVal = this.getSignalValueAtTime(currWaveforms, sigName, t);
          var snapVal = this.getSignalValueAtTime(snapWaveforms, sigName, t);

          if (currVal !== snapVal) {
            if (!inDiff) {
              inDiff = true;
              diffStart = t;
              if (firstSignalDiffTime === null) firstSignalDiffTime = t;
              if (diffResults.firstDiffTime === null || t < diffResults.firstDiffTime) {
                diffResults.firstDiffTime = t;
              }
            }
          } else {
            if (inDiff) {
              inDiff = false;
              diffIntervals.push({ start: diffStart, end: t });
              totalDiffTime += (t - diffStart);
            }
          }
        }

        if (inDiff) {
          diffIntervals.push({ start: diffStart, end: maxTime });
          totalDiffTime += (maxTime - diffStart);
        }

        var diffPercent = maxTime > 0 ? Math.round((totalDiffTime / maxTime) * 100) : 0;

        diffResults.signalDiffs[sigName] = {
          status: diffIntervals.length > 0 ? 'different' : 'same',
          diffIntervals: diffIntervals,
          diffPercent: diffPercent,
          firstDiffTime: firstSignalDiffTime
        };

        if (diffIntervals.length > 0) {
          diffResults.diffSignals++;
        }
      }
    }

    this.diffResults = diffResults;
  };

  Viewer.prototype.drawSnapshotWaveform = function(ctx, name, baseY, canvasW) {
    if (!this.compareSnapshot) return;

    var snapWaveforms = this.compareSnapshot.waveforms;
    var wf = snapWaveforms[name];
    if (!wf || wf.length === 0) return;

    ctx.save();
    ctx.globalAlpha = 0.3;

    ctx.beginPath();
    ctx.rect(0, baseY, canvasW, SIGNAL_HEIGHT);
    ctx.clip();

    var highY = baseY + HIGH_Y_OFFSET;
    var lowY = baseY + LOW_Y_OFFSET;
    var transW = Math.min(TRANSITION_WIDTH, this.pixelsPerNs * 0.8);

    ctx.strokeStyle = '#6c7086';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);

    ctx.beginPath();

    var startTime = this.scrollX / this.pixelsPerNs;
    var endTime = (this.scrollX + canvasW) / this.pixelsPerNs;

    var firstDrawn = false;
    var prevY = lowY;

    for (var wi = 0; wi < wf.length; wi++) {
      var evt = wf[wi];
      if (evt.time > endTime + 10) break;

      var x = evt.time * this.pixelsPerNs - this.scrollX;
      var targetY = evt.value ? highY : lowY;

      if (!firstDrawn) {
        if (wi === 0) {
          var initX = Math.max(0, x - 1000);
          ctx.moveTo(initX, targetY);
          ctx.lineTo(x, targetY);
        } else {
          var prevEvt = wf[wi - 1];
          var prevEvtY = prevEvt.value ? highY : lowY;
          var prevEvtX = prevEvt.time * this.pixelsPerNs - this.scrollX;
          ctx.moveTo(prevEvtX, prevEvtY);
          ctx.lineTo(x - transW, prevEvtY);
          ctx.lineTo(x, targetY);
        }
        firstDrawn = true;
      } else {
        ctx.lineTo(x - transW, prevY);
        ctx.lineTo(x, targetY);
      }

      prevY = targetY;
    }

    if (firstDrawn) {
      ctx.lineTo(canvasW + 10, prevY);
    }

    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  };

  Viewer.prototype.drawDiffHighlights = function(ctx, name, baseY, canvasW) {
    if (!this.diffResults || !this.diffResults.signalDiffs[name]) return;

    var diffInfo = this.diffResults.signalDiffs[name];
    if (diffInfo.status !== 'different') return;

    var startTime = this.scrollX / this.pixelsPerNs;
    var endTime = (this.scrollX + canvasW) / this.pixelsPerNs;

    ctx.save();

    for (var i = 0; i < diffInfo.diffIntervals.length; i++) {
      var interval = diffInfo.diffIntervals[i];
      if (interval.end < startTime || interval.start > endTime) continue;

      var startX = interval.start * this.pixelsPerNs - this.scrollX;
      var endX = interval.end * this.pixelsPerNs - this.scrollX;

      startX = Math.max(0, startX);
      endX = Math.min(canvasW, endX);

      ctx.fillStyle = 'rgba(250, 179, 135, 0.25)';
      ctx.fillRect(startX, baseY, endX - startX, SIGNAL_HEIGHT);

      ctx.strokeStyle = 'rgba(250, 179, 135, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);

      var startVisible = interval.start >= startTime && interval.start <= endTime;
      var endVisible = interval.end >= startTime && interval.end <= endTime;

      if (startVisible) {
        ctx.beginPath();
        ctx.moveTo(startX, baseY);
        ctx.lineTo(startX, baseY + SIGNAL_HEIGHT);
        ctx.stroke();
      }

      if (endVisible) {
        ctx.beginPath();
        ctx.moveTo(endX, baseY);
        ctx.lineTo(endX, baseY + SIGNAL_HEIGHT);
        ctx.stroke();
      }
    }

    ctx.setLineDash([]);
    ctx.restore();
  };

  Viewer.prototype.showDiffSummary = function() {
    var panel = document.getElementById('diff-summary-panel');
    if (!panel || !this.diffResults) return;

    panel.classList.remove('hidden');

    var self = this;
    var bodyEl = document.getElementById('diff-summary-body');
    if (!bodyEl) return;

    var html = '';
    html += '<div class="diff-summary-stat">';
    html += '<span class="diff-stat-label">差异信号:</span>';
    html += '<span class="diff-stat-value" style="color:' + (this.diffResults.diffSignals > 0 ? '#f38ba8' : '#a6e3a1') + ';">';
    html += this.diffResults.diffSignals + '/' + this.diffResults.totalSignals;
    html += '</span></div>';

    if (this.diffResults.firstDiffTime !== null) {
      html += '<div class="diff-summary-stat">';
      html += '<span class="diff-stat-label">首个差异:</span>';
      html += '<span class="diff-stat-value mono">' + this.diffResults.firstDiffTime + 'ns</span>';
      html += '</div>';
    }

    if (this.diffResults.newSignals.length > 0) {
      html += '<div class="diff-summary-section">';
      html += '<div class="diff-section-header" style="color:#89b4fa;">✚ 新增信号 (' + this.diffResults.newSignals.length + ')</div>';
      for (var ni = 0; ni < this.diffResults.newSignals.length; ni++) {
        html += '<div class="diff-signal-item new-signal">' + this.diffResults.newSignals[ni] + '</div>';
      }
      html += '</div>';
    }

    if (this.diffResults.deletedSignals.length > 0) {
      html += '<div class="diff-summary-section">';
      html += '<div class="diff-section-header" style="color:#6c7086;">✖ 已删除 (' + this.diffResults.deletedSignals.length + ')</div>';
      for (var di = 0; di < this.diffResults.deletedSignals.length; di++) {
        html += '<div class="diff-signal-item deleted-signal">' + this.diffResults.deletedSignals[di] + '</div>';
      }
      html += '</div>';
    }

    var diffSignalsList = [];
    for (var sigName in this.diffResults.signalDiffs) {
      if (!this.diffResults.signalDiffs.hasOwnProperty(sigName)) continue;
      var diff = this.diffResults.signalDiffs[sigName];
      if (diff.status === 'different') {
        diffSignalsList.push({ name: sigName, diff: diff });
      }
    }

    diffSignalsList.sort(function(a, b) {
      return b.diff.diffPercent - a.diff.diffPercent;
    });

    if (diffSignalsList.length > 0) {
      html += '<div class="diff-summary-section">';
      html += '<div class="diff-section-header" style="color:#fab387;">⚠ 差异信号</div>';
      for (var si = 0; si < diffSignalsList.length; si++) {
        var item = diffSignalsList[si];
        html += '<div class="diff-signal-item clickable" data-signal="' + item.name + '">';
        html += '<span class="diff-signal-name">' + item.name + '</span>';
        html += '<span class="diff-percent">Δ' + item.diff.diffPercent + '%</span>';
        html += '</div>';
      }
      html += '</div>';
    }

    bodyEl.innerHTML = html;

    bodyEl.querySelectorAll('.diff-signal-item.clickable').forEach(function(el) {
      el.addEventListener('click', function() {
        var sigName = this.dataset.signal;
        self.navigateToFirstDiff(sigName);
      });
    });
  };

  Viewer.prototype.hideDiffSummary = function() {
    var panel = document.getElementById('diff-summary-panel');
    if (panel) {
      panel.classList.add('hidden');
    }
  };

  Viewer.prototype.navigateToFirstDiff = function(signalName) {
    if (!this.diffResults || !this.diffResults.signalDiffs[signalName]) return;

    var diffInfo = this.diffResults.signalDiffs[signalName];
    if (diffInfo.firstDiffTime === null) return;

    var targetTime = diffInfo.firstDiffTime;
    var centerX = this.displayWidth / 2;
    this.scrollX = targetTime * this.pixelsPerNs - centerX;
    this.scrollX = Math.max(0, this.scrollX);

    this.highlightedSignal = signalName;
    this.buildSignalLabels();
    this.draw();
  };

  return Viewer;

})();
