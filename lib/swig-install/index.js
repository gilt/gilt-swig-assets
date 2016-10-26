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
    path = require('path'),
    fs = require('fs'),
    co = require('co'),
    installCommand = swig.argv.useYarn
        ? 'yarn install --json'
        : 'npm install --loglevel=info --parseable=true 2>&1',
    buffer,
    errors,
    regex = {
      requested: /npm http[s]? request GET (.+)/,
      installed: /npm info lifecycle (.+)~install: (\@gilt-tech\/(.+)\@([\d|\.]+))$/,
      error: /npm ERR! code (.+)/,
      fourohfour: /npm ERR! 404 Not found : (\@gilt-tech\/.+)/,
      noversion: /npm ERR! No compatible version found\: (.+)/,
      yarnModule: /\@gilt-tech\/(.+)\@\~?\^?([\d|\.|\*]+)/
    },
    downloaded = [];

  swig.tell('install', { description: 'Installs and organizes Gilt front-end assets. aka. ui-install' });

  // processes output from npm install commands
  function process (line) {
    if (swig.argv.useYarn) {
      try {
        const l = JSON.parse(line);
        if (l.type === 'step') swig.log.info(null, l.data.message)
        if (l.type === 'activityTick') {
          if (regex.yarnModule.test(l.data.name)) {
            moduleName = l.data.name.replace(regex.yarnModule, '$1 v$1');

            if (!_.contains(downloaded, moduleName)) {
              downloaded.push(moduleName);

              swig.log(swig.log.strip(swig.log.symbols.download).green + '  ' + moduleName);
            }
          }
        }
      } catch (e) {
        // NOTE: Some output lines throw an error during JSON.parse.
        // Just ignoring them for now.
      }
      return;
    }

    line = swig.log.strip(line).trim();

    swig.log.verbose(line);

    var matches,
      moduleName;

    if (regex.requested.test(line)) {
      moduleName = line.replace(regex.requested, '$1');

      swig.log.verbose(swig.log.padding + swig.log.padding + '→'.white + '  ' + moduleName);
    }
    else if (regex.installed.test(line)) {
      moduleName = line.replace(regex.installed, '$3 v$4');

      if (!_.contains(downloaded, moduleName)) {
        downloaded.push(moduleName);

        swig.log(swig.log.strip(swig.log.symbols.download).green + '  ' + moduleName);
      }
    }
    else if (regex.fourohfour.test(line)) {
      swig.log();
      swig.log.error('install', 'Module not found: ' + line.replace(regex.fourohfour, '$1'));
    }
    else if (regex.noversion.test(line)) {
      swig.log();
      swig.log.error('install', line.replace(regex.noversion, '$1'));
      swig.log('\nTry specifying a different version. use `npm view <module>` to display available versions for a module.\n');
    }
    else if (regex.error.test(line)) {
      swig.log();
      swig.log.error('install', line.replace(regex.error, '$1'));
    }
  }

  function * local() {
    if (swig.argv.module) {
      swig.log.info('', 'Skipping Node Modules');
      return;
    }

    var pkg = swig.pkg;

    swig.log();
    swig.log.task('Installing Node Modules');

    if (!pkg.dependencies || _.isEmpty(pkg.dependencies)) {
      swig.log.warn(null, 'package.json doesn\'t contain any dependencies, nothing to install.\n');
      return;
    }

    var output = yield swig.exec(installCommand, null, {
      stdout: function (data) {
        process(data);
      }
    });

    if (!downloaded.length) {
      swig.log.info(null, 'Node Modules are up to date.');
    }

    if (output.stdout.indexOf('not ok') > -1 || output.stdout.indexOf('ERR!') > -1){
      swig.log.error('install:local', 'One or more modules failed to install from npm.\n ' +
        swig.log.padLeft('For more info, look here: ' + path.join(swig.target.path, 'npm_debug.log').grey, 7));
    }
  }

  function * ui () {
    var pkg = swig.pkg;

    swig.log();
    swig.log.task('Installing Gilt UI Dependencies');

    if (!swig.argv.module && (!pkg.gilt || !pkg.gilt.uiDependencies)) {
      swig.log.warn(null, 'package.json doesn\'t contain any uiDependencies, nothing to install.\n');
      return;
    }

    var commands = [
      'cd ' + swig.temp,
      'rm -rf node_modules',
      installCommand + (swig.argv.useYarn ? ' --no-lockfile' : '')
    ];

    var output = yield swig.exec(commands.join('; '), null, {
      stdout: function (data) {
        process(data);
      }
    });

    if (output.stdout.indexOf('not ok') > -1 || output.stdout.indexOf('ERR!') > -1){
      swig.log.error('install:ui', 'One or more modules failed to install from npm.\n ' +
        swig.log.padLeft('For more info, look here: ' + path.join(swig.temp, 'npm_debug.log').grey, 7));
    }
  }

  // this is a plain old noop task for conditionally executing install.
  gulp.task('install-noop', function (done) {
    done();
  });

  gulp.task('install', co(function * () {

    if (!swig.pkg) {
      swig.log.error('install', 'Couldn\'t find package.json, not installing anything.');
      return;
    }

    var processPublic = require('./lib/public-directory')(gulp, swig),
      packageMerge = require('./lib/package-merge')(gulp, swig),
      mergeModules = require('./lib/merge-modules')(gulp, swig);

    packageMerge();
    yield local();
    yield ui();
    mergeModules();
    processPublic();

  }));
};
