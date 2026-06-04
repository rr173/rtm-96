importScripts('parser.js', 'simulator.js', 'coverage.js');

self.onmessage = function(e) {
  var data = e.data;

  if (data.type === 'simulate') {
    try {
      var parseResult = CircuitParser.parse(data.source);

      if (parseResult.errors && parseResult.errors.length > 0) {
        self.postMessage({
          type: 'parseError',
          errors: parseResult.errors
        });
        return;
      }

      var netlist = parseResult.data;

      if (!netlist.signals.clk) {
        netlist.signals.clk = { name: 'clk', type: 'clk', isReg: false };
      }

      var result = Simulator.simulate(
        netlist,
        data.clockPeriod || 10,
        data.simDuration || 200,
        data.gateDelay || 1
      );

      var coverageData;
      try {
        if (typeof CoverageAnalyzer !== 'undefined' && CoverageAnalyzer.runFullAnalysis) {
          coverageData = CoverageAnalyzer.runFullAnalysis(result, netlist);
        } else {
          console.error('CoverageAnalyzer not available in worker');
          coverageData = null;
        }
      } catch (covErr) {
        console.error('Coverage analysis error:', covErr);
        coverageData = null;
      }

      self.postMessage({
        type: 'result',
        signalNames: result.signalNames,
        signalMap: result.signalMap,
        waveforms: result.waveforms,
        glitches: result.glitches,
        cdcViolations: result.cdcViolations,
        clocks: result.clocks,
        depGraph: {
          combDeps: result.depGraph.combDeps,
          reverseDeps: result.depGraph.reverseDeps,
          signalSources: result.depGraph.signalSources,
          topoOrder: result.depGraph.topoOrder
        },
        branches: result.branches,
        branchHits: result.branchHits,
        coverageData: coverageData,
        assertions: result.assertions,
        assertionStatus: result.assertionStatus,
        assertionViolations: result.assertionViolations,
        netlist: netlist
      });
    } catch (err) {
      self.postMessage({
        type: 'error',
        message: err.message || String(err)
      });
    }
  }
};
