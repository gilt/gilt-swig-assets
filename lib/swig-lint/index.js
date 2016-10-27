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

  // TODO:
  // module name
  // js and less dependencies
  // merge conflict markers /^[<>=]{7}/ + file names snake_case, no hypens
  // console.log /console\.(log|debug|info|warn|error)\(/

  // /
  //   createModule
  //   \s*\(\s*      # begin method params
  //   (?:
  //     \{\s*
  //       (?:global\s*:\s*["'][\w\$]+["']\s*,\s*)?
  //       amd\s*:\s*
  //         ("|')         # open quote around module name
  //           ([\w\.\/]+) # module name
  //         \1            # close quote
  //       (?:\s*,\s*global\s*:\s*["'][\w\$]+["'])?
  //     \s*\}
  //   |
  //     ("|')         # open quote around module name
  //       ([\w\.\/]+) # module name
  //     \3            # close quote
  //   )
  //   \s*,\s*
  // /x

const
  eslint = require('gulp-eslint'),
  fs = require('fs'),
  path = require('path');

module.exports = function lintersSetup(gulp, swig) {
  if (!swig.pkg) {
    return;
  }

  swig.tell('lint', { description: 'Lints Gilt front-end assets.' });

  let paths;

  gulp.task('lint-setup', (done) => {
    let
      baseName,
      baseSource;

    function source (type, extension) {
      return baseSource
              .replace(/\{type\}/g, type)
              .replace(/\{extension\}/g, extension);
    }

    if (swig.project.type === 'webapp') {
      baseName = path.basename(swig.target.path);
      baseSource = path.join(swig.target.path, 'public/{type}/', baseName, '/src/**/*.{extension}');
    } else {
      baseSource = path.join(swig.target.path, '/**/*.{extension}');
    }

    paths = {
      js: source('js', '{js,jsx}'),
      css: source('css', '{css,less}'),
      templates: source('templates', 'handlebars')
    };

    // we never want to lint reset.less|css files since they'll almost always have linting errors
    if (swig.project.type === 'webapp') {
      paths.css = [
        paths.css,
        '!' + path.join(swig.target.path,
          'public/css/',
          baseName,
          '/src/**/reset.{css,less}'
        )
      ];
    }

    // some hacky shit so that package-version task can be loaded
    // normally from another file, but still have access to this.
    // minor minor namespace pollution for simplicity. please don't follow this pattern.
    swig.linter = { paths: paths };

    done();
  });

  // load some of our misc linting tasks
  require('./lib/tasks/package-version')(gulp, swig);
  require('./lib/tasks/old-require')(gulp, swig);

  gulp.task('lint-script', ['lint-setup'], () => {
    swig.log.task('Linting Javascript', { noNewline: true });

    let eslintrc = path.join(__dirname, '.eslintrc.yml');
    const
      localEslintrc = [
        '.eslintrc.js',
        '.eslintrc.yml',
        '.eslintrc.yaml',
        '.eslintrc.json',
        '.eslintrc'
      ].map(f => path.join(process.cwd(), f)).find(f => fs.existsSync(f)),

      failReporter = require('./lib/reporters/eslint-fail-reporter')(gulp, swig);

    if (localEslintrc) {
      eslintrc = localEslintrc;
      swig.log.info('', 'Using local .eslintrc config');
    }

    if (swig.pkg.eslintConfig) {
      eslintrc = swig.pkg.eslintConfig;
      swig.log.info('', 'Using local package.json eslintConfig');
    }

    return gulp.src([
      paths.js,
      `!${path.dirname(paths.js)}/runner/**/*.*`
    ])
    .pipe(eslint(eslintrc))
    .pipe(eslint.format('node_modules/eslint-codeframe-formatter'))
    .pipe(failReporter());
  });

  gulp.task('lint-css', ['lint-setup'], () => {
    swig.log.task('Linting CSS and LESS');

    const
      buffer = require('gulp-buffer'),
      lesshint = require('gulp-lesshint'),
      reporter = require('./lib/reporters/lesshint-reporter')(swig);

    return gulp.src(paths.css)
      .pipe(buffer())
      .pipe(lesshint({
        configPath: path.join(__dirname, '.lesshintrc')
      }))
      .on('error', () => {})
      .pipe(reporter);
  });

  gulp.task('lint-handlebars', ['lint-setup'], () => {
    swig.log.task('Linting Handlebars Templates');

    const
      handlebars = require('gulp-handlebars'),
      reporter = require('./lib/reporters/handlebars-reporter')(swig);

    return gulp.src(paths.templates)
      .pipe(handlebars())
      .on('error', reporter.fail)
      .pipe(reporter);
  });

  gulp.task('lint', (done) => {
    swig.seq(
      'lint-package-version',
      'lint-old-require',
      'dependencies', // from swig-deps
      'lint-script',
      'lint-css',
      'lint-handlebars',
      done
    );
  });
};
