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
    globby = require('globby'),
    less = require('gulp-less'),
    rename = require('gulp-rename'),
    fs = require('fs');

  // we're not going to tell swig about this task
  // since it's used primarily by other tasks and really
  // shouldn't need to be used outside of that pipeline.

  gulp.task('merge-css', function () {

    swig.log('');
    swig.log.task('Merging LESS and CSS Files');

    var basePath = path.join(swig.target.path, '/public/css/', swig.target.name),
      glob = [
        path.join(basePath, '/*.{less,css}'),
        // exclude src or min files that have already been merged
        '!' + path.join(basePath, '/*.{min,src}.{less,css}')
      ];

    return gulp.src(glob)
      .pipe(less({ paths: [ basePath ], relativeUrls: false }))
      .pipe(rename({ suffix: '.src' }))
      .pipe(gulp.dest(basePath));

  });

};
