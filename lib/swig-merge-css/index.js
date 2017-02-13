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
  const path = require('path');
  const less = require('gulp-less');
  const rename = require('gulp-rename');
  const sourcemaps = require('gulp-sourcemaps');
  const autoprefixer = require('gulp-autoprefixer');
  const autoprefixerCfg = {
    // https://github.com/postcss/autoprefixer#options
    browsers: [
      "last 2 versions",
      "Explorer >= 10",
      "iOS >= 8"
    ],
    // should Autoprefixer [remove outdated] prefixes. Default is true.
    remove: true
  };

  gulp.task('merge-css', () => {
    swig.log('');
    swig.log.task('Merging LESS and CSS Files');

    const basePublicPath = path.join(swig.target.path, '/public');
    const basePath = path.join(basePublicPath, '/css', swig.target.name);
    const glob = [
      path.join(basePath, '/*.{less,css}'),
      // exclude src or min files that have already been merged
      `!${path.join(basePath, '/*.{min,src}.{less,css}')}`
    ];

    return gulp.src(glob, { base: basePublicPath })
      .pipe(sourcemaps.init({
        loadMaps: true
      }))
      .pipe(less({ paths: [basePath], relativeUrls: false }))
      .pipe(autoprefixer(autoprefixerCfg))
      .pipe(rename({suffix: '.src'}))
      .pipe(sourcemaps.write('.'))
      .pipe(gulp.dest(basePublicPath));
  });
};
