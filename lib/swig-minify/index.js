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
  const uglify = require('gulp-uglify');
  const rename = require('gulp-rename');
  const replace = require('gulp-replace');
  const cleancss = require('gulp-clean-css');
  const sourcemaps = require('gulp-sourcemaps');
  const tap = require('gulp-tap');
  const rimraf = require('rimraf');
  const handlebars = require('gulp-handlebars');
  const bless = require('gulp-bless');
  const basePath = path.join(swig.target.path, '/public/');

  // we're not going to tell swig about this task
  // since it's used primarily by other tasks and really
  // shouldn't need to be used outside of that pipeline.

  function renameFile (file) {
    file.basename = `${file.basename.replace('.src', '')}.min`;
    return file;
  }

  gulp.task('minify-js', () => {
    const glob = path.join(basePath, '/js/', swig.target.name, '/*.src.js');

    swig.log('');
    swig.log.task('Minifying Javascript using Uglify');

    return gulp.src(glob)
      .pipe(tap((file) => {
        swig.log.info('', `Minifying: ${path.basename(file.path).grey}`);
      }))
      .pipe(sourcemaps.init({
        loadMaps: true
      }))
      .pipe(uglify())
      .pipe(rename(renameFile))
      .pipe(sourcemaps.write('.'))
      .pipe(gulp.dest(path.dirname(glob)));
  });

  gulp.task('minify-css', ['minify-js'], () => {
    const glob = path.join(basePath, '/css/', swig.target.name, '/*.src.css');
    const blackMagic = new RegExp(`url\\((\\/a)?(\\/img\\/)(${swig.target.name})(\\/[^\\)]+)\\)`, 'ig');

      // turns this:
      //  /img/web-mosaic/nav/footer/footer-sprite.png
      // into this:
      //  //assets[n].giltcdn.com/img/web-mosaic/1.0.0/nav/footer/footer-sprite.png
    const replaceFn = function (match, leading, imgDir, target, asset) {
      const min = 1;
      const max = 4;
      const assetServer = Math.floor(Math.random() * (max - (min + 1))) + min;
      const result = `url(//a${assetServer}.giltcdn.com/a${imgDir}${target}/${swig.pkg.version}${asset})`;

      return result;
    };

    swig.log('');
    swig.log.task('Minifying CSS using CleanCSS');

    return gulp.src(glob)
      .pipe(tap((file) => {
        swig.log.info('', `Minifying: ${path.basename(file.path).grey}`);
      }))
      .pipe(cleancss())
      .pipe(replace(blackMagic, replaceFn))
      .pipe(rename(renameFile))
      //
      // IE9 cannot handle more than 4096 selectors per file.
      // So we need to Bless the CSS. Involves counting selectors and if there
      //  are > 4096, splitting the css into 2 files and adding
      // and import.
      //
      // ** Important to note, Bless 4 UNMINIFIES css so we are using
      //  gulp-bless 3.0.3 and not upgrading to 3.1
      //
      .pipe(tap((file) => {
        swig.log.info('', `Blessing CSS: ${path.basename(file.path).grey}`);
      }))
      .pipe(bless({
        cacheBuster: false,
        noCleanup: true
      }))
      .pipe(gulp.dest(path.dirname(glob)));
  });

  gulp.task('minify-templates', ['minify-css'], () => {
  /*
    NOTE: ui-build used handlebars@1.0.12
          The precompile output from 1.0.0 to 2.0.0 changed significantly
          and was not backwards compatible.
          Handlebars is now at version 3.0.0.
          We're using 1.0.12 and telling gulp-handlebars to use the same
          version so that the output matches ui-build.
          This should be updated at some point in the future.
  */

    const templatesPath = path.join(basePath, '/templates/', swig.target.name);
    const glob = path.join(templatesPath, '/**/*.handlebars');

    swig.log('');
    swig.log.task('Precompiling Handlebars Templates');

    return gulp.src(glob)
      .pipe(tap((file) => {
        swig.log.info('', `Precompiling: ${file.path.replace(`${templatesPath}/`, '').grey}`);
      }))
      .pipe(handlebars({
        handlebars: require('handlebars'),
        compilerOptions: {
          simple: true,
          root: `public/templates/${swig.target.name}`
        }
      }))
      .pipe(rename((file) => {
        file.basename = file.basename.replace(templatesPath, '');
        return file;
      }))
      .pipe(gulp.dest(path.join(basePath, '/js/', swig.target.name, '/templates')));
  });

  gulp.task('minify', ['minify-templates'], (done) => {
    done();

    // minify-js
    // minify-css
    // minify-templates
    // done
  });
};
