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
  const replace = require('./lib/gulp-replace-with-sourcemaps');
  const cleancss = require('gulp-clean-css');
  const postcss = require('gulp-postcss');
  const inlineImports = require('postcss-import');
  const sourcemaps = require('gulp-sourcemaps');
  const tap = require('gulp-tap');
  const handlebars = require('gulp-handlebars');
  const basePath = path.join(swig.target.path, '/public/');

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
    const targetName = swig.target.name;
    const glob = path.join(basePath, '/css/', targetName, '/*.src.css');
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
    const searchRE = new RegExp(`url\\('?"?(\\/a)?(\\/img\\/)(${
        targetName})(\\/[^\\)'"]+)'?"?\\)`, 'ig');
    const replaceFn = () => {
      const min = 1;
      const max = 4;
      const srv = Math.floor(Math.random() * (max - (min + 1))) + min;

      // $2 = image directory
      // $4 = asset name
      return `url(//a${srv}.giltcdn.com/a$2${targetName}/${swig.pkg.version}$4)`;
    };

    swig.log('');
    swig.log.task('Minifying CSS using CleanCSS');

    return gulp.src(glob)
      .pipe(tap((file) => {
        swig.log.info('', `Minifying: ${path.basename(file.path).grey}`);
      }))
      .pipe(sourcemaps.init({
        loadMaps: true
      }))

      .pipe(postcss([inlineImports]))

      .pipe(autoprefixer(autoprefixerCfg))

      .pipe(replace(searchRE, replaceFn))

      .pipe(cleancss())

      .pipe(rename(renameFile))
      .pipe(sourcemaps.write('.'))
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
