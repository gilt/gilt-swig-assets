'use strict';

// modified from https://github.com/lazd/gulp-replace/blob/master/index.js

// NOTE: Few things to keep in mind
//  - It supports only Buffer transformations (Stream coming in future, maybe)
//  - It only works with unminified code (or if it is the first transformation
//    in the pipe; requires a bit of investigation)

var Transform = require('readable-stream/transform');
var istextorbinary = require('istextorbinary');
var Replacer = require('./regex-replacer.js');
var applySourceMap = require('vinyl-sourcemaps-apply');
var path = require('path');

module.exports = function(searchRE, replacement, options) {
  return new Transform({
    objectMode: true,
    transform: function(file, enc, callback) {
      if (file.isNull()) {
        return callback(null, file);
      }

      function doReplace() {
        const replacer = new Replacer(searchRE, replacement);

        if (file.isStream()) {
          console.warn('gulp-replace-asset-url: Stream transformation not supported, yet.');

          return callback(null, file);
        }

        if (file.isBuffer()) {
          const result = replacer.replace(String(file.contents),
              path.basename(file.path));
          file.contents = new Buffer(result.code);

          if (file.sourceMap) {
            applySourceMap(file, result.map);
          }

          return callback(null, file);
        }

        callback(null, file);
      }

      if (options && options.skipBinary) {
        istextorbinary.isText(file.path, file.contents, function(err, result) {
          if (err) {
            return callback(err, file);
          }

          if (!result) {
            callback(null, file);
          } else {
            doReplace();
          }
        });

        return;
      }

      doReplace();
    }
  });
};
