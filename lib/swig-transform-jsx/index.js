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
    _ = require('underscore'),
    basePath = path.join(swig.target.path, '/public/');

  swig.tell('transform-jsx', {
    description: 'Transforms the JSX in the source folder to javascript.'
  });

  gulp.task('transform-jsx', function () {

    // JSX folder is stored in the public/js/web-whatever/src/jsx folder
    // It gets transpiled to public/js/web-whatever/src/react_views (with the same folder structure as the jsx folder)
    var from = path.join(basePath, '/js/', swig.target.name, '/src/jsx/**/*.jsx'),
      to = path.join(basePath, '/js/', swig.target.name, '/src/react_views/');

    swig.log('');
    swig.log.task('Transforming JSX using Babel');

    return gulp.src(from).
    pipe(tap(function (file) {
      swig.log.info('', 'Transforming: ' + path.basename(file.path));
    })).
    pipe(babel({
      plugins: ['transform-react-jsx']
    })).
    pipe(gulp.dest(to));
  });


  gulp.task('watch-jsx', function () {
    // Watch JS/JSX and files
    var watchFolder = path.join(basePath, '/js/', swig.target.name, '/src/jsx/**/*.jsx');
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
