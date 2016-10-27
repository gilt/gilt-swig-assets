'use strict';

// modified from https://github.com/lazd/gulp-replace/blob/master/index.js

// NOTE: Few things to keep in mind
//  - It supports only Buffer transformations (Stream coming in future, maybe)
//  - It only works with unminified code (or if it is the first transformation
//    in the pipe; requires a bit of investigation)

const Transform = require('readable-stream/transform');
const istextorbinary = require('istextorbinary');
const Replacer = require('./regex-replacer.js');
const applySourceMap = require('vinyl-sourcemaps-apply');
const path = require('path');

module.exports = function(searchRE, replacement, options) {
  return new Transform({
    objectMode: true,
    // eslint-disable-next-line
    transform(file, enc, callback) {
      if (file.isNull()) {
        return callback(null, file);
      }

      // eslint-disable-next-line
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
        // eslint-disable-next-line
        istextorbinary.isText(file.path, file.contents, (err, result) => {
          if (err) {
            return callback(err, file);
          }

          if (!result) {
            callback(null, file);
          } else {
            doReplace();
          }
        });

        // eslint-disable-next-line
        return;
      }

      doReplace();
    }
  });
};
