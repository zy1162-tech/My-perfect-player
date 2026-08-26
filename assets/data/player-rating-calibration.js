/* Perfect Player — centralized rating calibration (season / peak / rookie / current). */
(function (global) {
  'use strict';

  var VERSION = '20260826-rating-calibration-v2';
  var BANDS = [
    { min:96, max:99, label:'历史级 / 统治级' },
    { min:93, max:95, label:'MVP 级' },
    { min:89, max:92, label:'最佳阵容级' },
    { min:85, max:88, label:'全明星级' },
    { min:80, max:84, label:'高水平首发' },
    { min:75, max:79, label:'轮换 / 普通首发' },
    { min:70, max:74, label:'替补' }
  ];

  function clamp(value, low, high) {
    value = Math.round(Number(value) || low);
    return Math.max(low, Math.min(high, value));
  }
  function nameKey(value) {
    var text = String(value || '').trim().replace(/amar['’\- ]e/ig, 'amare');
    if (text.normalize) text = text.normalize('NFKD');
    return text.replace(/[\u0300-\u036f]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  }
  function keyed(source) {
    var result = {};
    Object.keys(source || {}).forEach(function (name) { result[nameKey(name)] = source[name]; });
    return result;
  }

  // These are target-season evaluations, not copied edition ratings. The source
  // rating remains on every player as _sourceOvr for audit and save compatibility.
  var ERA_OPENING_OVERRIDES = {
    2003:keyed({
      "Amar'e Stoudemire":{ seasonOvr:85, targetAge:21, peakOvr:92, reference:'2003-04 season breakout; age/role/production calibration' },
      'Zydrunas Ilgauskas':{ seasonOvr:84, reference:'2003-04 All-Star-level starting center season' },
      'Michael Redd':{ seasonOvr:86, reference:'2003-04 All-Star scoring season' },
      'Tony Parker':{ seasonOvr:84, peakOvr:95, reference:'2003-04 high-level starter; modern historical peak cross-check' },
      'Andrei Kirilenko':{ seasonOvr:87, peakOvr:90, reference:'2003-04 All-Star and elite two-way season' },
      'Primož Brezec':{ seasonOvr:70, reference:'2003-04 end-of-bench active-roster calibration' },
        'Fred Jones':{ seasonOvr:71, reference:'2003-04 active-roster guard calibration' },
      'Jamison Brewer':{ seasonOvr:70, reference:'2003-04 end-of-bench active-roster calibration' }
    }),
    2010:keyed({
      'Monta Ellis':{ seasonOvr:85, peakOvr:88, reference:'2010-11 primary scorer workload' },
      'Tyreke Evans':{ seasonOvr:82, peakOvr:86, reference:'2010-11 lead-guard season after rookie peak' },
      'Danilo Gallinari':{ seasonOvr:80, peakOvr:84, reference:'2010-11 starting wing production' },
      'Stephen Curry':{ seasonOvr:82, peakOvr:98, reference:'2010-11 sophomore season; peak calibrated separately' },
      'Andrew Bogut':{ seasonOvr:84, peakOvr:87, reference:'2010-11 elite interior defense and starting-center role' },
      'Marc Gasol':{ seasonOvr:83, peakOvr:93, reference:'2010-11 high-level starter; later DPOY/All-NBA peak' },
      'James Harden':{ seasonOvr:80, peakOvr:96, reference:'2010-11 high-value sixth-man season; peak calibrated separately' },
      'Russell Westbrook':{ seasonOvr:89, peakOvr:95, reference:'2010-11 All-NBA second-team season' }
    }),
    2016:keyed({
      'Kristaps Porzingis':{ seasonOvr:84, peakOvr:90, reference:'2016-17 second-season starting big' },
      'Nikola Jokic':{ seasonOvr:86, peakOvr:98, reference:'2016-17 breakout creator season; peak calibrated separately' },
      'Devin Booker':{ seasonOvr:82, peakOvr:94, reference:'2016-17 high-volume young scorer season' },
      'Zach LaVine':{ seasonOvr:82, peakOvr:88, reference:'2016-17 pre-injury scoring breakout' },
      'Giannis Antetokounmpo':{ seasonOvr:91, peakOvr:98, reference:'2016-17 All-NBA second-team two-way leap' }
    })
  };

  var PEAK_OVERRIDES = keyed({
    "Amar'e Stoudemire":92,
    'Charles Barkley':96,
    'Marc Gasol':93,
    'Reggie Miller':92,
    'Vince Carter':96,
    'Tony Parker':95,
    'Donovan Mitchell':93,
    'Tony Allen':85,
    'Andrei Kirilenko':90,
    'Stephen Curry':98,
    'Nikola Jokic':98,
    'Devin Booker':94
  });

  function roleEstimate(row) {
    var line = row && row.seasonLine || {};
    var mpg = Math.max(0, Math.min(48, Number(line.mpg) || 0));
    var ppg = Math.max(0, Math.min(45, Number(line.ppg) || 0));
    var per = Number(line.per);
    var perTerm = isFinite(per) ? Math.max(-2, Math.min(3, (per - 12) * 0.2)) : 0;
    // This is only a reference-season role signal. It is never used as a target-
    // season OVR by itself, especially for tiny samples.
    return clamp(62 + mpg * 0.48 + Math.min(4, ppg * 0.14) + perTerm, 58, 84);
  }
  function modernScaleBaseline(sourceOvr) {
    // Old edition ratings are a relative-order reference, not a hard floor.
    // Translate them continuously onto the product bands without flattening 60s.
    if (sourceOvr < 65) return sourceOvr;                    // true fringe remains at its relative baseline
    if (sourceOvr < 70) return sourceOvr + 0.25;             // role evidence, not a flat floor, decides rotation entry
    if (sourceOvr < 80) return sourceOvr;                    // preserve ordinary-starter ordering
    return 80 + (sourceOvr - 80) * 0.85;                     // modest high-end compression
  }

  function calibrateEra(row, context) {
    context = context || {};
    var sourceOvr = clamp(context.sourceOvr != null ? context.sourceOvr : (row && (row.ovr != null ? row.ovr : row.rating)), 45, 99);
    var kind = context.kind || 'season';
    var targetAge = clamp(context.targetAge != null ? context.targetAge : (row && row.age), 18, 49);
    var peakOverride = PEAK_OVERRIDES[nameKey(row && (row.nameEn || row.nameEN || row.name))];
    if (kind === 'rookie') {
      return {
        sourceOvr:sourceOvr,
        seasonOvr:sourceOvr,
        rookieOvr:sourceOvr,
        peakOvr:peakOverride || null,
        targetAge:targetAge,
        adjusted:false,
        reference:{ version:VERSION, kind:'rookie', basis:'draft-class rookie OVR + potential/curve' }
      };
    }
    var era = Number(context.eraStart) || 0;
    var override = ERA_OPENING_OVERRIDES[era] && ERA_OPENING_OVERRIDES[era][nameKey(row && (row.nameEn || row.nameEN || row.name))];
    var line = row && row.seasonLine || {};
    var ageDelta = targetAge <= 23 && Number(line.mpg) >= 12 ? 1 : (targetAge >= 34 && Number(line.mpg) < 28 ? -1 : 0);
    var estimated = roleEstimate(row);
    var minutes = Math.max(0, Number(line.games) || 0) * Math.max(0, Number(line.mpg) || 0);
    var reliability = Math.min(1, minutes / 1600);
    var baseline = modernScaleBaseline(sourceOvr);
    var performanceAdjustment = Math.max(-3, Math.min(3, (estimated - baseline) * reliability));
    var seasonOvr = override ? override.seasonOvr : baseline + performanceAdjustment + ageDelta;
    seasonOvr = clamp(seasonOvr, 50, 99);
    return {
      sourceOvr:sourceOvr,
      seasonOvr:seasonOvr,
      rookieOvr:null,
      peakOvr:(override && override.peakOvr) || peakOverride || null,
      targetAge:(override && override.targetAge) || targetAge,
      adjusted:seasonOvr !== sourceOvr || !!override,
      reference:{
        version:VERSION,
        kind:'season',
        targetSeason:era ? (era + '-' + String(era + 1).slice(-2)) : '',
        referenceSeason:era ? ((era - 1) + '-' + String(era).slice(-2)) : '',
        basis:override ? override.reference : 'conservative modern-scale source-rank translation + strongly sample-shrunk reference-season role adjustment',
        baseline:Math.round(baseline * 10) / 10,
        roleEstimate:estimated,
        sampleMinutes:Math.round(minutes),
        reliability:Math.round(reliability * 1000) / 1000,
        performanceAdjustment:Math.round(performanceAdjustment * 10) / 10,
        override:!!override
      }
    };
  }

  function peakFor(name, fallback) {
    var value = PEAK_OVERRIDES[nameKey(name)];
    return value != null ? Number(value) : (fallback == null ? null : Number(fallback));
  }
  function bandFor(ovr) {
    ovr = Number(ovr) || 0;
    for (var i = 0; i < BANDS.length; i++) if (ovr >= BANDS[i].min) return BANDS[i].label;
    return '发展 / 边缘轮换';
  }

  global.PP_RATING_CALIBRATION = {
    version:VERSION,
    bands:BANDS,
    eraOpeningOverrides:ERA_OPENING_OVERRIDES,
    peakOverrides:PEAK_OVERRIDES,
    nameKey:nameKey,
    roleEstimate:roleEstimate,
    calibrateEra:calibrateEra,
    peakFor:peakFor,
    bandFor:bandFor
  };
})(window);
