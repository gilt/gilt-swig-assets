'use strict';
/*
 ________  ___       __   ___  ________
|\   ____\|\  \     |\  \|\  \|\   ____\
\ \  \___|\ \  \    \ \  \ \  \ \  \___|
 \ \_____  \ \  \  __\ \  \ \  \ \  \  ___
  \|____|\  \ \  \|\__\_\  \ \  \ \  \|\  \
    ____\_\  \ \____________\ \__\ \_______\
   |\_________\|____________|\|__|\|_______|
   \|_________|

   It's delicious.
   Brought to you by the fine folks at Gilt (http://github.com/gilt)
*/

module.exports = function (gulp, swig) {

  var _ = require('underscore'),
    david = require('david'),
    thunkify = require('thunkify'),
    co = require('co'),

    warned = false;

  swig.tell('deps', { description: 'Checks for the latest version of npm dependencies.' });

  function report (type, results) {
    var rows = [
      [swig.log.padLeft(type.cyan, 2), 'package.json'.cyan, 'latest'.cyan.bold]
    ];

    Object.keys(results).forEach(function (depName) {
      var dep = results[depName];

      // we don't care about * values, they'll always be latest
      if (dep.required === '*') {
        return;
      }

      rows.push([swig.log.padLeft(depName, 2), dep.required.red, (dep.stable || '?').green]);
    });

    if (rows.length) {
      // a little hack to make the tables uniform in width
      rows.push([new Array(41).join(' '), '']);

      swig.log.table(rows);
    }
  }

  gulp.task('deps', ['dependencies'], function (done) {
    done();
  });

  // use a passive-aggressive delay so the user is forced to stare at that message
  // for a bit. that means someone is making a concious choice not to update
  // using a separate task is hackey but effective, since yielding a thunk on setTimeout
  // seems to be killing the execution of subsequent gulp tasks.
  gulp.task('dependencies', ['check-dependencies'], function (done) {
    if (warned) {
      setTimeout(done, 3000);
    }
    else {
      swig.log.info('', 'Dependencies up to date.\n');
      done();
    }
  });

  gulp.task('check-dependencies', co(function * () {

    swig.log.task('Checking status of project Dependencies');

    var depTypes = {
        dependencies: swig.pkg.dependencies,
        devDependencies: swig.pkg.devDependencies,
        lazyDependencies: swig.pkg.lazyDependencies,
        specDependencies: swig.pkg.specDependencies,
        uiDependencies: swig.pkg.uiDependencies
      },
      // this follows the same options that david's cli uses by default
      davidOptions = {
        stable: true,
        loose: true,
      },
      results = {},
      manifest,
      getUpdatedDependencies = thunkify(david.getUpdatedDependencies);

    for (var type in depTypes) {

      // all new apps should be setup this way, but older stuff
      // is accounted for in `depTypes`s declaration.
      if (swig.pkg.gilt) {
        if (swig.pkg.gilt[type]) {
          depTypes[type] = swig.pkg.gilt[type];
        }
      }

      manifest = { dependencies: depTypes[type] };

      try {
        results[type] = yield getUpdatedDependencies(manifest, davidOptions) || [];
      }
      catch (e) {
        swig.log.error('swig-deps', e.toString());
        results[type] = {};
      }

      if (!Object.keys(results[type]).length) {
        continue;
      }
      else {
        if (!warned) {
          warned = true;
          swig.log();
          swig.log.warn('Dependency Warning', 'One or more dependencies are out of date! Please update them!');
          swig.log();
        }
      }

      report(type, results[type]);
    }

    if (warned) {
      swig.log.warn('Pondering on that for a moment', ' [hit CTL+C to stop and update]');
      swig.log();
    }

  }));
};
