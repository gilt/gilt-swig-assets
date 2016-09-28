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

  var babel = require('gulp-babel'),
    path = require('path'),
    tap = require('gulp-tap'),
    plumber = require('gulp-plumber'),
    map = require('gulp-sourcemaps'),
    _ = require('underscore'),
    transformModules = require('../common/es6-modules-transform'),
    basePath = path.join(swig.target.path, '/public/'),
    reactCompDest = 'app/';

  swig.tell('transform-jsx', {
    description: 'Transforms the JSX in the source folder to javascript.'
  });


  gulp.task('transform-jsx', function () {

    // JSX folder is stored in the public/js/web-whatever/src/jsx folder
    // It gets transpiled to public/js/web-whatever/src/react_views (with the same folder structure as the jsx folder)
    var from = path.join(basePath, '/js/', swig.target.name, '/src/**/*.jsx'),
      to = path.join(basePath, '/js/', swig.target.name, '/' + reactCompDest);

    swig.log('');
    swig.log.task('Transforming JSX using Babel');

    return gulp.src(from)
      .pipe(plumber())
      .pipe(map.init({
        loadMaps: true
      }))
      .pipe(tap(function (file) {
        swig.log.info('', 'Transforming: ' + path.basename(file.path));
      }))
      .pipe(babel({
        plugins: [
          'transform-react-jsx'
        ]
      }))
      .pipe(transformModules({
        dest: reactCompDest,
        targetName: swig.target.name
      }))
      .pipe(map.write('.'))
      .pipe(gulp.dest(to));
  });


  gulp.task('watch-jsx', function () {
    // Watch JS/JSX and files
    var watchFolder = path.join(basePath, '/js/', swig.target.name, '/src/**/*.jsx');
    // if we are being invoked by swig run, only watch the folders if we have a watch-jsx parameter
    if (_.contains(swig.argv._, 'run')) {
      if (!swig.argv['watch-jsx']) {
        return;
      }
    }
    swig.log.task('Watching JSX Folder ' + watchFolder);
    gulp.watch(watchFolder, ['transform-jsx']);

  });
};
