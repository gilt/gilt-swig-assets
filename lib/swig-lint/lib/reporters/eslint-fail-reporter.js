
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

  var maxWarnings = 10;

  return function reporter () {

    var through = require('through2'),
      gutil = require('gulp-util'),
      fileCount = 0,
      errorCount = 0,
      hasErrors = false;

    return through.obj(function (file, enc, cb) {
      if (file.isNull()) {
        cb(null, file);
        return;
      }

      if (file.isStream()) {
        cb(new gutil.PluginError('swig-lint:reporter', 'Streaming not supported'));
        return;
      }

      if (file.eslint && !file.eslint.ignored) {
        fileCount++;
      }

      if (file.eslint && file.eslint.messages.length && !file.eslint.ignored) {
        errorCount += file.eslint.messages.length;

        if (!hasErrors) {
          hasErrors = file.eslint.errorCount > 0;
        }
      }

      cb(null, file);
    },
    function flush (cb) {
      if (hasErrors) {
        swig.log.error('lint-script', 'Please correct errors in ' + 'red'.red + ' before proceeding.');
        process.exit(1);
      } else if (errorCount > maxWarnings) {
        swig.log.error('lint-script', 'You\'ve got ' + errorCount.toString().magenta + ' warnings.\nPlease do some cleanup before proceeding.');
        process.exit(2);
      } else {
        if (fileCount){
          swig.log.info('', fileCount + ' files lint-free.\n');
        } else {
          swig.log.info('', 'No files to lint.\n');
        }
        cb();
      }
    });
  };
};
