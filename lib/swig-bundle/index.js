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

  BUNDLING RULES
  - targetExperiences: ['intermediate', 'full']
    - only shows up in intermediate or full
  - everything goes into flat files

  main.[exp].[src|min].js
  - modules are scanned for target experiences
  - if they are part of a bundle, skip
  - modules (and their deps) with target exps are placed into the corresponding main.[exp] file
  - modules without are placed in all three target exps

  [module].[exp].[src|min].js
  - modules which declare a bundle
  - the root declaring module, and it's deps are placed into [module].[exp] file.
  - if a dependency already exists in the main.**.js file, skip the dep.

  NOTES
  - this is going to require setting up objects first:
  - produce dependency graph
  - populate main.all

  main: {
    full: [],
    intermediate: [],
    minimum: [],
    all: [],
    bundled: []
  }

  main.all will be populated first.
  main.bundled will be populated second, iterating through main.all.
  main.all will remove anything which is also in main.bundled
  main.[exp] populated based on main.all
    - anything without a target exp will be in all three exps.

  [bundle]: {
    full: [],
    intermediate: [],
    minimum: []
  }

  bundle created based on main.bundled.
*/

module.exports = function (gulp, swig) {

  var _ = require('underscore'),
    co = require('co'),
    exec = require('co-exec'),
    path = require('path'),
    globby = require('globby'),
    fs = require('fs'),
    merge = require('merge-stream'),
    concat = require('./lib/concat-experience'),

    basePath = path.join(swig.target.path, '/public/js/', swig.target.name),

    modules = {
      full: [],
      intermediate: [],
      minimal: [],
      all: [],
      bundles: [],
      dependencies: {},
      flatDependencies: [],
      bundled: {}
    };

  swig.tell('bundle', { description: 'Bundles Gilt javascript assets.' });

  function indent (what) {
    var result = '';
    _.each(what.split('\n'), function (line) {
      if (line.trim().length) {
        result += '  ' + line + '\n';
      }
      else {
        result += '\n';
      }
    });
    return result.trim();
  }

  // This is a stub of the gilt_define module's methods
  // that we're going to use to pull info from the modules.
  // faster than an AST and isn't an insanely massive regex.
  var gilt = {
    define: function swigGiltDefine (name, deps, method, options) {
      options = options || {};

      var result = {
        moduleName: name,
        definedDependencies: deps,
        targetExperiences: options.targetExperiences,
        bundle: options.bundle,
        script: method.toString()
      };

      // since arguments.callee won't work here, let's re-wrap the module definition.
      result.script = 'gilt.define(\n' +
        '  \'' + result.moduleName + '\',\n  ' +
        indent(JSON.stringify(result.definedDependencies, null, 2).replace(/"/g, '\'')) + ',\n' +
        result.script + ',\n  ' +
        JSON.stringify(options).replace(/"/g, '\'') +
        '\n);\n';

      evalResults.push(result);
    }
  },
  evalResults = [],

  // for the older modules that aren't using gilt.define
  createModule = gilt.define;

  // uses npm to tell us which modules are installed
  // we run this on the node_modules directory in temp because npm can make sense of it.
  function * getDependencyGraph (name) {
    var commands = [
        'cd ' + swig.temp,
        'npm la --json --quiet' + (name || '')
      ],
      raw = yield swig.exec(commands.join('; ')),
      result = JSON.parse(raw.stdout);

    cleanTree(result);

    return result.dependencies;
  }

  function cleanTree (object) {
    _.each(object, function (value, property) {
      if (property !== 'dependencies') {
        delete object[property];

        _.each(object.dependencies, function (dep) {
          cleanTree(dep);
        });
      }
    });
  }

  function examineModules () {
    var bundles = [],
      glob = [
        path.join(swig.target.path, '/public/js/**/*.js'),

        // NOTE: exlcuding src/ as we want to fetch from the new app/ folder
        '!' + path.join(swig.target.path, '/public/js/**/src/**/*.js'),

        '!' + path.join(swig.target.path, '/public/js/**/internal/**/*.js'),
        '!' + path.join(swig.target.path, '/public/js/**/vendor/**/*.js'),
        '!' + path.join(swig.target.path, '/public/js/**/{main,bundles}*.js'),
        '!' + path.join(swig.target.path, '/public/js/**/*{src,min}.js'),
        '!' + path.join(swig.target.path, '/public/js/**/templates/**/*.js'),
      ];

    _.each(globby.sync(glob), function (file) {
      var content = fs.readFileSync(file, { encoding: 'utf-8' });

      // THE SKY IS FALLING.
      // We can actually run this at about 36k operations per second
      // so this is incredibly fast and on par with a massive regex
      // that everyone hates.
      try {
        eval(content);
      }
      catch (e) {
        swig.log.error('swig-bundle:examineModules', 'An error ocurred while evaluating: ' + file.grey);
        swig.log.info('', e);
        process.exit(1);
      }

      _.each(evalResults, function (result) {

        result.path = file;

        if (result.targetExperiences) {

          _.each(result.targetExperiences, function (experience) {
            modules[experience].push(result);
          });
        }
        else {
          modules.all.push(result);
        }

        if (result.bundle) {

          // a module with multiple experiences which declares a bundle
          // will result in dupes, unless we check for it.
          var existing = _.find(bundles, function (bundle) {
            return bundle.name === result.bundle;
          });

          if (!existing) {
            result.dependencies = {};
            result.exclusiveDependencies = [];
            result.name = result.bundle;

            bundles.push(result);
          }
          else {
            // if it exists, we want to make sure that we have all of the defined deps
            // from the code as well, because a requirejs module could have a dep on a submodule.
            existing.definedDependencies = existing.definedDependencies.concat(result.definedDependencies);
          }
        }
      });

      // clear the temporary results container for the next file.
      evalResults = [];
    });

    return bundles;
  }

  function getBundleDependencies (bundle, deps) {
    deps = deps || modules.dependencies;

    _.each(deps, function (object, moduleName) {

      // sometimes modules are REALLY REALLY DUMB and like to name their
      // primary require module things like nav.unified.nav instead of
      // nav.unified(.unified). We need to check for that case, sadly.
      var shortName = bundle.moduleName.split('.');
      shortName.splice(-1);
      shortName = shortName.join('.');

      if (bundle.moduleName === moduleName || shortName === moduleName) {
        bundle.dependencies = object.dependencies;
      }
      else {
        getBundleDependencies(bundle, object)
      }
    });
  }

  function flattenDependencies (deps) {
    deps = deps || modules.dependencies;

    _.each(deps, function (dep, moduleName) {
      modules.flatDependencies.push(moduleName);

      flattenDependencies(dep.dependencies);
    });
  }

  function flattenBundleDependencies (bundle, deps) {
    deps = deps || bundle.dependencies;

    _.each(deps, function (dep, moduleName) {
        bundle.exclusiveDependencies.push(moduleName);

      flattenBundleDependencies(bundle, dep.dependencies);
    });
  }

  function findExclusiveDependencies (bundle) {

    _.each(bundle.dependencies, function (moduleName) {
      var spokenFor = _.contains(modules.bundles.spokenFor, moduleName);

      if (!spokenFor) {
        modules.bundles.spokenFor.push(moduleName);
        bundle.exclusiveDependencies.push(moduleName);
      }
    });
  }

  function cleanDependencies (deps) {

    // these are already present in main.js
    deps = _.difference(deps, [
      '@gilt-tech/internal.require',
      '@gilt-tech/internal.gilt_require',
      '@gilt-tech/internal.json',
      '@gilt-tech/internal.modernizr',
      '@gilt-tech/internal.browser_detect',
      '@gilt-tech/internal.less',
      '@gilt-tech/internal.picturefill'
    ]);

    deps = _.uniq(deps);
    deps = _.sortBy(deps, function (moduleName) { return moduleName; })

    return deps;
  }

  function findBundleDependencies () {
    _.each(modules.bundles, function (bundle) {
      getBundleDependencies(bundle);

      flattenBundleDependencies(bundle);

      bundle.dependencies = bundle.exclusiveDependencies;
      bundle.dependencies = bundle.dependencies.concat(bundle.definedDependencies);
      bundle.exclusiveDependencies = [];

      bundle.dependencies = cleanDependencies(bundle.dependencies);

      findExclusiveDependencies(bundle);
    });
  }

  function buildBundle (glob, bundle) {

    bundle = bundle || { name: 'main' };

    var streams = _.map([ 'full', 'intermediate', 'minimal' ], function (experience) {

      var stream =
        gulp.src(glob)

          // tell our custom concat plugin to build this main file and check the target
          // experiences in the modules collection var for any experiences for a particular
          // filename/module.
          .pipe(concat(bundle.name + '.' + experience + '.src.js', {
            basePath: basePath,
            experience: experience,
            modules: modules[experience]
          }))
          .pipe(gulp.dest(basePath));

      return stream;
    });

    return merge.apply(this, streams);
  }

  gulp.task('bundle-setup', co(function *() {

    swig.log.task('Building Dependency Graph');

    modules.dependencies = yield getDependencyGraph();

    swig.log.task('Examining Modules for Bundles and Experiences')

    modules.bundles = examineModules();

    // rather than having underscore flatten bundles' exclusive deps for a
    // subsequent check, we'll add any deps that are added to a bundle's
    // exclusive deps to this collection for easy reference.
    modules.bundles.spokenFor = [];

    swig.log.task('Finding Bundled Dependencies');

    findBundleDependencies();

    swig.log.task('Flattening Dependencies');

    // turn the nested tree into a flat array
    flattenDependencies();

    swig.log.task('Cleaning Dependencies');

    // remove duplicates, alphabetize
    modules.flatDependencies = cleanDependencies(modules.flatDependencies);

    swig.log.task('Removing Bundles from Dependencies');

    // remove any deps that match bundles
    modules.flatDependencies = _.reject(modules.flatDependencies, function (moduleName) {
      var result = _.find(modules.bundles, function (bundle) {
        return bundle.moduleName === moduleName;
      });

      return !_.isUndefined(result);
    });

    swig.log.task('Removing Exclusve Bundle Dependencies');

    // remove any deps that are exclusive to a bundle
    modules.flatDependencies = _.reject(modules.flatDependencies, function (moduleName) {
      var result = false;

      _.each(modules.bundles, function (bundle) {
        _.each(bundle.exclusiveDependencies, function (depName) {
          if (moduleName === depName) {
            result = true;
          }
        });
      });

      return result;
    });

    swig.log.task('Writing bundles.js');

    var bundles = {};

    // build a simple mapping object for requireJS to use
    _.each(modules.bundles, function (bundle) {
      _.each(bundle.exclusiveDependencies, function (dep) {
        bundles[dep] = bundle.name;
      });
    });

    bundles = 'gilt.bundle(' +
              JSON.stringify(bundles, null, 2) +
              ');\n'

    fs.writeFileSync(path.join(basePath, 'bundles.js'), bundles);

    // leave this here for debuggin
    // fs.writeFileSync('app-dependencies.json', JSON.stringify(modules.dependencies, null, 2));
    // fs.writeFileSync('app-dependencies-flat.json', JSON.stringify(modules.flatDependencies, null, 2));
    // fs.writeFileSync('app-bundles.json', JSON.stringify(modules.bundles, null, 2));

  }));

  gulp.task('bundle-bundles', ['bundle-setup'], function () {

    var streams = _.map(modules.bundles, function (bundle) {

      swig.log.task('Bundling ' + bundle.name);

      var glob = [];

      // add the module requesting the bundle to the end
      bundle.exclusiveDependencies.push(bundle.moduleName);
      // and mark is as spoken For
      modules.bundles.spokenFor.push(bundle.moduleName);

      // add all of the exclusive bundle deps to the mix
      _.each(bundle.exclusiveDependencies, function (moduleName) {
        var parts = moduleName.split('.'),
          modulePath;

        if (parts.length > 2) {
          // eg. nav.unified.notification > nav/unified/notification.js
          modulePath = parts.join('/');
        }
        else {
          // eg. vendor.kairos > vendor/kairos/kairos.js
          parts.push(parts[parts.length - 1]);
          modulePath = parts.join('/');
        }

        modulePath = path.join(basePath, modulePath + '.js').replace('@gilt-tech/', '');

        glob.push(modulePath);
      });

      return buildBundle(glob, bundle);
    });

    // return a merged stream of all the bundle streams
    // this forces gulp to wait for completion
    return merge.apply(this, streams);
  });

  gulp.task('bundle', ['bundle-bundles'], function () {

    swig.log.task('Bundling Main');

    // put together the main.[exp].src.js bundle
    var
      // save time by just reusing main.js that the `install` task already created.
      mainPath = path.join(basePath, 'main.js'),
      bundlesPath = path.join(basePath, 'bundles.js'),
      glob = [ mainPath, bundlesPath ];

    _.each(modules.flatDependencies, function (moduleName) {
      moduleName = moduleName.replace('@gilt-tech/', '');

      var spokenFor = _.contains(modules.bundles.spokenFor, moduleName),
        modulePath = moduleName.replace(/\./g, '/');

      if (spokenFor) {
        return;
      }

      modulePath = path.join(basePath, modulePath, '/**/*.js');

      glob.push(modulePath);
    });

    // add the /src/ directory to the mix
    // glob.push(path.join(basePath, '/src/**/*.js'));

    // add the app/ directory to the mix
    glob.push(path.join(basePath, '/app/**/*.js'));

    return buildBundle(glob);
  });

};
