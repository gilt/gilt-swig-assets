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
    co = require('co'),
    exec = require('co-exec'),
    path = require('path'),
    globby = require('globby'),
    fs = require('fs'),
    uglify = require('gulp-uglify'),
    rename = require('gulp-rename'),
    replace = require('./lib/gulp-replace-with-sourcemaps'),
    cleancss = require('gulp-clean-css'),
    sourcemaps = require('gulp-sourcemaps'),
    tap = require('gulp-tap'),
    rimraf = require('rimraf'),
    handlebars = require('gulp-handlebars'),
    bless = require('gulp-bless'),
    basePath = path.join(swig.target.path, '/public/');

  // we're not going to tell swig about this task
  // since it's used primarily by other tasks and really
  // shouldn't need to be used outside of that pipeline.

  function renameFile (path) {
    path.basename = path.basename.replace('.src', '') + '.min';
    return path;
  }

  gulp.task('minify-js', function () {

    var glob = path.join(basePath, '/js/', swig.target.name, '/*.src.js');

    swig.log('');
    swig.log.task('Minifying Javascript using Uglify');

    return gulp.src(glob)
      .pipe(tap(function (file) {
        swig.log.info('', 'Minifying: ' + path.basename(file.path).grey);
      }))
      .pipe(sourcemaps.init({
        loadMaps: true
      }))
      .pipe(uglify())
      .pipe(rename(renameFile))
      .pipe(sourcemaps.write('.'))
      .pipe(gulp.dest(path.dirname(glob)))
  });

  gulp.task('minify-css', ['minify-js'], function () {
    const targetName = swig.target.name;
    const glob = path.join(basePath, '/css/', targetName, '/*.src.css');

    const searchRE = new RegExp('url\\((\\/a)?(\\/img\\/)(' +
        targetName + ')(\\/[^\\)]+)\\)', 'ig');
    const replaceFn = () => {
      const min = 1;
      const max = 4;
      const srv = Math.floor(Math.random() * (max - min + 1)) + min;

      // $2 = image directory
      // $4 = asset name
      return `url(//a${srv}.giltcdn.com/a$2${targetName}/${swig.pkg.version}$4)`;
    };

    swig.log('');
    swig.log.task('Minifying CSS using CleanCSS');

    return gulp.src(glob)
      .pipe(tap(function (file) {
        swig.log.info('', 'Minifying: ' + path.basename(file.path).grey);
      }))
      .pipe(sourcemaps.init({
        loadMaps: true
      }))

      .pipe(replace(searchRE, replaceFn))

      .pipe(cleancss())

      .pipe(rename(renameFile))

      // IE9 cannot handle more than 4096 selectors per file.
      // So we need to Bless the CSS. Involves counting selectors and if there are > 4096, splitting the css into 2 files and adding
      // and import.
      //
      // ** Important to note, Bless 4 UNMINIFIES css so we are using gulp-bless 3.0.3 and not upgrading to 3.1
      .pipe(tap(function (file) {
        swig.log.info('', 'Blessing CSS: ' + path.basename(file.path).grey);
      }))

      // TODO: bless seems to be stopping the gulp-sourcemaps to work
      // .pipe(bless({
      //   cacheBuster: false,
      //   noCleanup: true
      // }))
      //
      .pipe(sourcemaps.write('.'))
      .pipe(gulp.dest(path.dirname(glob)))
  });

  gulp.task('minify-templates', ['minify-css'], function () {

  /*
    NOTE: ui-build used handlebars@1.0.12
          The precompile output from 1.0.0 to 2.0.0 changed significantly
          and was not backwards compatible.
          Handlebars is now at version 3.0.0.
          We're using 1.0.12 and telling gulp-handlebars to use the same
          version so that the output matches ui-build.
          This should be updated at some point in the future.
  */

    var templatesPath = path.join(basePath, '/templates/', swig.target.name),
      glob = path.join(templatesPath, '/**/*.handlebars');

    swig.log('');
    swig.log.task('Precompiling Handlebars Templates');

    return gulp.src(glob)
      .pipe(tap(function (file) {
        swig.log.info('', 'Precompiling: ' + file.path.replace(templatesPath + '/', '').grey);
      }))
      .pipe(handlebars({
        handlebars: require('handlebars'),
        compilerOptions: {
          simple: true,
          root: 'public/templates/' + swig.target.name
        }
      }))
      .pipe(rename(function (path) {
        path.basename = path.basename.replace(templatesPath, '');
        return path;
      }))
      .pipe(gulp.dest(path.join(basePath, '/js/', swig.target.name, '/templates')))
  });

  gulp.task('minify', ['minify-templates'], function (done) {
    done();

    // minify-js
    // minify-css
    // minify-templates
    // done
  });

};
