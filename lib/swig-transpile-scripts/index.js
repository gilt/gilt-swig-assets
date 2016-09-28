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

  const babel = require('gulp-babel'),
    path = require('path'),
    tap = require('gulp-tap'),
    plumber = require('gulp-plumber'),
    replace = require('gulp-replace'),
    map = require('gulp-sourcemaps'),
    _ = require('underscore'),
    basePath = path.join(swig.target.path, '/public/'),
    srcDir = `${swig.target.name}/src/`,
    dest = 'app/',
    depsRE = /gilt.define\(([\w\W]*?)\[([\w\W]*?)\]/,
    transformModules = require('./lib/transform-es2015-modules-gilt');

  function normalizeModuleName(path) {
    return path.replace(/\.\.\//g, '')
        .replace(/\.\//, '')
        .replace(/\.jsx$|\.js$/, '')
        .replace(/\//g, '.')
        .replace(/(\.[\w\-_]+)\1$/, '$1');
  }

  function replaceSrc(str) {
    return str.replace('src.react_views', 'app.jsx').replace('src.', 'app.');
  }

  swig.tell('transpile-scripts', {
    description: 'Transpile ES* scripts into ES5 scripts.'
  });


  gulp.task('transpile-scripts', function () {
    const from = path.join(basePath, '/js/', swig.target.name, '/src/**/*.{js,jsx}');
    const to = path.join(basePath, '/js/', swig.target.name, '/' + dest);

    swig.log('');
    swig.log.task('Transpiling scripts using Babel');
    swig.log.info('[ Current trnaspilations: JSX, ES6 Modules ]');

    return gulp.src(from)
      .pipe(plumber())
      .pipe(map.init({
        loadMaps: true
      }))
      .pipe(tap(function (file) {
        swig.log.info('', 'Transpiling: ' + path.basename(file.path));
      }))

      .pipe(babel({
        moduleIds: true,
        getModuleId: (id) => `${dest}${id}`.replace(/\//g, '.'),
        resolveModuleSource: (src, file) => {
          const fullPath = path.resolve(path.dirname(file), src);
          if (fullPath.includes(srcDir)) {
            // NOTE: We can comfortable assume that we are in our src/ folder
            const cleanSrc = normalizeModuleName(fullPath.slice(fullPath.indexOf(srcDir) + srcDir.length))
            return `${dest}${cleanSrc}`.replace(/\//g, '.');
          }
          // NOTE: We are probably importing some "global" module
          if (fullPath.includes(`node_modules`)) {
            console.warn('gilt.define limitations do not allow us to correctly import modules from the node_module folder.');
            console.warn('Please, make sure to have this module published in the @gilt-tech ui-vendor repository, before you start to use it,');
          }
          return normalizeModuleName(src);
        },
        plugins: [
          'syntax-flow',
          'syntax-object-rest-spread',
          'syntax-class-properties',

          'transform-react-jsx',

          // TODO: Add more transpilations

          transformModules
        ]
      }))

      // NOTE: Needed for retrocompatibility
      .pipe(replace(depsRE, function(str, $1, $2) {
        return `gilt.define(${replaceSrc($1)}[${replaceSrc($2)}]`;
      }))

      .pipe(map.write('.'))
      .pipe(gulp.dest(to));
  });


  gulp.task('watch-scripts', function () {
    // Watch JS/JSX and files
    const watchFolder = path.join(basePath, '/js/', swig.target.name, '/src/**/*.js');
    // if we are being invoked by swig run, only watch the folders if we have a watch-jsx parameter
    if (_.contains(swig.argv._, 'run')) {
      if (!swig.argv['watch-scripts']) {
        return;
      }
    }
    swig.log.task('Watching scripts Folder ' + watchFolder);
    gulp.watch(watchFolder, ['transpile-scripts']);
  });
};
