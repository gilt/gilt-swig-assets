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

  if (!swig.pkg) {
    return;
  }

  var _ = require('underscore'),
    fs = require('fs'),
    path = require('path'),
    glob = require('globby'),
    concat = require('gulp-concat'),
    tap = require('gulp-tap'),
    wrap = require('gulp-wrap'),
    scripts = [],
    fixtures = [],
    packageName = _.isEmpty(swig.pkg) ? '' : swig.pkg.name.replace('@gilt-tech/', ''),
    specsPath = '',
    tempPath = '',
    requireBasePath = '',
    servers, // populated by mock-apidoc task

    waterfall = [
      'lint',
      'spec-before',
      'spec-templates',
      'spec-mock-apidoc',
      'spec-run'
    ];

  swig.tell('spec', {
    description: 'Runs specs (tests, expectations) for UI Modules and web apps.',
    flags: {
      '--module, --m': 'Specifies the target module to run specs for, within the working directory.\nIf not specified, the task assumes the working directory is a web app.',
      '--targetExperience': 'Optional. The target experience to run specs for;\nfull, intermediate, or minimal',
      '--browser' : 'Optional. Opens the specs in a browser window instead of running them in the console.',
      '--verbose' : 'Optional. Shows additional infomration on the process, including console output from PhantomJS.'
    }
  });

  function copyModules (paths, tempPath) {

    swig.log.info('', 'Copying modules to /public...');
    swig.log.verbose('');

    var destPath,
      sourcePath,
      modPathName;

    _.each(modules, function (modPath, name) {
      modPathName = name.replace(/\./g, '/');

      _.each(paths, function (p, pathName) {
        sourcePath = path.join(modPath, pathName);

        swig.log.verbose('\n[copy] copying: ' + sourcePath);

        if (fs.existsSync(sourcePath)) {
          destPath = path.join(p, modPathName);
          swig.fs.mkdir(destPath);
          swig.fs.copyAll(sourcePath, destPath.replace('@gilt-tech/', ''));
          swig.log.verbose('[copy] copied: ' + destPath);
        }
      })
    });

    swig.log.success(null, 'Done\n');
  }

  gulp.task('spec-setup', function (done) {

    swig.log.task('Initializing Specs');

    swig.log.info('', 'Enumerating Dependencies...');

    // add main.js to the mix.
    var mainJsPath = path.join(swig.target.path, 'public/js/', packageName, 'main.js');

    // main.js is created in the system tempdir for modules.
    if (swig.project.type !== 'webapp') {
      mainJsPath = path.join(swig.temp, 'install', packageName, 'public/js', packageName, 'main.js');
    }

    scripts.push(mainJsPath);

    specsPath = path.join(swig.target.path, 'public/spec/', packageName),
    requireBasePath = path.join(swig.target.path, 'public/js/', packageName);

    if (swig.project.type !== 'webapp') {
      // if we're in a ui-* modules repo
      tempPath = path.join(swig.temp, 'install', packageName);
      specsPath = path.join(swig.target.path, 'spec/');
      requireBasePath = path.join(tempPath, 'public/js', packageName);

      // what we're doing here is telling require to use the files local to /js
      // for the module first, rather than what's in the temp ui-install dir.
      scripts = scripts.concat(glob.sync(path.join(swig.target.path, 'js/**/*.js')));
    }

    // load any fixtures in /specs/fixtures
    gulp
      .src(path.join(specsPath, '/fixtures/**/*.json'))
      .pipe(tap(function(file, t) {
        try {
          var json = JSON.parse(file.contents);
          // condense the fixture to a single line, unless --verbose is used
          fixtures.push({
            name: path.basename(file.path).replace(path.extname(file.path), ''),
            fixture: swig.argv.verbose ? JSON.stringify(json, null, 2) : JSON.stringify(json)
          });
        }
        catch (e) {
          console.log(e);
        }
      }))
      .on('end', done);
  });

  gulp.task('spec-mock-apidoc', ['spec-setup'], function (done) {

    swig.log.info('', 'Enumerating Mock API (apidoc)');

    var tap = require('gulp-tap'),
      mock = require('./lib/mock-apidoc.js');

    gulp.src(path.join(swig.target.path, '/json/mock/**/*.json'))
      .pipe(mock())
      .pipe(tap(function(file, t) {
        try {
          var fileServers = JSON.parse(file.contents);
          servers = _.filter(_.union(servers, fileServers), function(a) { return typeof a !== 'undefined'; });
        }
        catch (e) {
          console.log(e);
        }
      }))
      .on('end', done);
  });

  gulp.task('spec-templates', ['spec-mock-apidoc'], function (done) {

    swig.log.info('', 'Enumerating Templates...');

    var handlebars = require('handlebars'),
      template = path.join(__dirname, '/templates/handlebars-template.lodash'),
      hbsPath = path.join(swig.target.path, 'public/templates/', packageName, 'src'),
      destPath = path.join(swig.target.path, 'public/spec/', packageName, '/runner'),
      tempPath,
      fileCount = 0,
      hbsGlob = [];

    if (swig.project.type !== 'webapp') {
      hbsPath = path.join(swig.target.path, 'templates');
      destPath = path.join(swig.target.path, 'spec/runner');

      // it's a bit wonky for modules, but follows webapp structure
      tempPath = path.join(swig.temp, 'install', swig.argv.module, 'public/templates/', swig.argv.module);
    }

    hbsGlob = [
      path.join(hbsPath, '/**/*.handlebars'),
      '!' + path.join(hbsPath, '/**/dom.chassis/*.handlebars'),
      '!' + path.join(hbsPath, '/**/nav.unified/*.handlebars'),
      '!' + path.join(hbsPath, '/**/nav.footer/*.handlebars')
    ];

    if (swig.project.type !== 'webapp') {
      hbsGlob.push(
        // plus all the templates from all the dependencies
        path.join(tempPath, '/**/*.handlebars'),
        // except for 'this' module's templates, because we want easy live editing.
        '!' + path.join(tempPath, swig.argv.module.split('.')[0], '/**/*.handlebars')
      );
    }

    gulp.src(hbsGlob)
      .pipe(tap(function (file, t) {

        var contents = file.contents.toString(),
          ast = handlebars.parse(contents),
          compiled = handlebars.precompile(ast, {}).toString(),
          basePath = path.join(path.dirname(file.path), '/../../'),
          fileName = path.basename(file.path, path.extname(file.path)),
          moduleName = packageName.replace(/\./g, '/');

        // if we're dealing with a template from the temp install path
        if (basePath.indexOf('/var') === 0) {
          moduleName = file.path
                           .replace(basePath, '')
                           .replace('/' + path.basename(file.path), '')
                           .trim('/');
        }

        if (swig.project.type === 'webapp') {
          moduleName = 'src';
          fileName = file.path.replace(hbsPath, '');
          fileName = fileName.replace(path.extname(fileName), '').substring(1);
        }

        compiled = compiled.split('\n').join('\n    ');

        file.contents = new Buffer(
          '\n  Handlebars.templates[\'' + moduleName + '/' + fileName + '\'] = Handlebars.template(\n    ' +
          compiled +
          '\n  );',
          'utf-8'
        );

        fileCount++;
      }))
      .pipe(concat('templates.js'))
      .pipe(wrap({ src: path.join(__dirname, '/templates/handlebars-template.lodash') }))
      .pipe(gulp.dest(destPath))
      .on('end', function () {
        if (fileCount > 0) {
          scripts.push(path.join(destPath.replace('@gilt-tech/', ''), 'templates.js'));
        }
        done();
      });
  });

  gulp.task('spec-run', ['spec-templates'], function (done) {

    var defaultFramework = 'jasmine',
      framework = defaultFramework,
      impl,
      options = {},
      specFiles = [],
      specs = [],
      runnerPath;

    runnerPath = path.join(specsPath, '/runner');

    if (!fs.existsSync(runnerPath)) {
      fs.mkdirSync(runnerPath);
    }

    swig.log.info('', 'Specs Running From: ' + runnerPath.grey);

    if (swig.pkg.gilt && swig.pkg.gilt.specs && swig.pkg.gilt.specs.framework){
      framework = swig.pkg.gilt.specs.framework;
    }

    try {
      swig.log.info('', 'Loading ' + framework + '...');

      impl = require('./lib/frameworks/' + framework.toLowerCase());
    }
    catch (e) {
      if (e.code === 'MODULE_NOT_FOUND') {
        swig.log.error('spec', 'Spec Library: ' + framework + ', hasn\'t been implemented.');
        swig.log(e);
      }
      else {
        throw e;
      }
    }

    swig.log.info('', 'Enumerating Specs...');

    // enum all of the files in the specs directory
    specFiles = glob.sync(path.join(specsPath, '/**/*.js'));

    // the file names should correspond with the name of the module used in gilt.define
    // this is used to `require` the test files and THEN launch mocha/jasmin/other
    _.each(specFiles, function (file) {
      specs.push('\'' + path.basename(file, path.extname(file)) + '\'');
    });

    options = {
      baseUrl: requireBasePath,
      fixtures: fixtures,
      runnerPath: runnerPath,
      scripts: scripts,
      servers: servers,
      specs: specs.join(','),
      specsPath: specsPath,
      specFiles: specFiles,
      targetExperience: swig.argv.targetExperience || 'full',
      useColors: (swig.argv.pretty !== 'false'),
      verbose: Boolean(swig.argv.verbose || false)
    };

    // fire our specs implementation (jasmine, mocha, etc..)
    var stream = impl(gulp, swig, options).on('error', function () {
      swig.log.error('specs-run', 'The specs were unsuccessfully run. Please see the console output above.');
      swig.log.error('specs-run', 'Rerun with the --verbose option if no errors appear.');
      swig.log.error('specs-run', 'You may also debug in a browser by opening: ' + runnerPath.grey);
      process.exit(1);
    });

    if (swig.argv.browser) {
      var open = require('open');
      open('file://' + path.join(runnerPath, 'runner.html'));

      swig.log.warn('', 'Skipping specs run, opening specs in browser.')
    }

    return stream;
  });

  gulp.task('spec', function (done) {

    var specsPath = path.join(swig.target.path, 'public/spec/', packageName),
      installTask = 'install-noop',
      specTasks;

    if (swig.project.type !== 'webapp') {
      // if we're in a ui-* modules repo
      specsPath = path.join(swig.target.path, 'spec/');
    }

    if (swig.argv.module || swig.argv.m) {
      // tell `install` that we need devDependencies too. this needs to be executed BEFORE install.
      swig.argv.devDependencies = true;
      installTask = 'install';
    }
    specTasks = [installTask, 'lint'];

    if (!(swig.argv.module || swig.argv.m) && swig.tasks['transpile-scripts']) {
      specTasks.push('transpile-scripts');
    }

    if (!fs.existsSync(specsPath)) {
      specTasks.push(
        function () {
          swig.log.task('Imagining That Specs Exist');
          swig.log.info('', 'Aw boo. No specs to run!');

          done();
        }
      );
      swig.seq.apply(this, specTasks);

      return;
    } else {
      specTasks.push('spec-run');
      specTasks.push(done);
    }

    swig.seq.apply(this, specTasks);

  });
};
