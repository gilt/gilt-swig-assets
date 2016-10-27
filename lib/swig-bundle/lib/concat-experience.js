// modified from https://raw.githubusercontent.com/wearefractal/gulp-concat/master/index.js

'use strict';

const through = require('through2');
const path = require('path');
const gutil = require('gulp-util');
const Concat = require('concat-with-sourcemaps');
const applySourceMap = require('vinyl-sourcemaps-apply');
const SourceMapGenerator = require('source-map').SourceMapGenerator;
const sprintf = require('sprintf-js').sprintf;

const File = gutil.File;
const PluginError = gutil.PluginError;

// file can be a vinyl file object or a string
// when a string it will construct a new one
module.exports = function (file, options) {
  if (!file) {
    throw new PluginError('gulp-concat', 'Missing file optionsion for gulp-concat');
  }

  options = options || {};

  // to preserve existing |undefined| behaviour and to introduce |newLine: ""| for binaries
  if (typeof options.newLine !== 'string') {
    options.newLine = gutil.linefeed;
  }

  const toc = ['/*', '  Table of Contents - ┬──┬﻿ ¯\\_(ツ)', ''];
  let isUsingSourceMaps = false;
  let firstFile;
  let fileName;
  let concat;

  if (typeof file === 'string') {
    fileName = file;
  } else if (typeof file.path === 'string') {
    fileName = path.basename(file.path);
    firstFile = new File(file);
  } else {
    throw new PluginError('gulp-concat', 'Missing path in file options for gulp-concat');
  }

  function fixName (modulePath) {
    modulePath = modulePath
                  .replace(options.basePath, '')
                  .substring(1)
                  .replace(/\//g, '.');

    const parts = modulePath.split('.');

    // remove '.js' from the module name
    if (parts[parts.length - 1] === 'js' && modulePath !== 'main.js') {
      parts.splice(-1, 1);
    }

    // if the last segment equals the first, then remove it.
    // eg. common.cart.cart.js
    if (parts[parts.length - 1] === parts[parts.length - 2]) {
      parts.splice(-1, 1);
    }

    return parts.join('.');
  }

  function pad (what, howMany) {
    return sprintf(`%${howMany}s%s`, '', what);
  }

  function bufferContents (_file, enc, cb) {
    // ignore empty files
    if (_file.isNull()) {
      cb();
      return;
    }

    // we dont do streams (yet)
    if (_file.isStream()) {
      this.emit('error', new PluginError('gulp-concat', 'Streaming not supported'));
      cb();
      return;
    }

    // enable sourcemap support for concat
    // if a sourcemap initialized _file comes in
    if (_file.sourceMap && isUsingSourceMaps === false) {
      isUsingSourceMaps = true;
    }

    // set first _file if not already set
    if (!firstFile) {
      firstFile = _file;
    }

    // construct concat instance
    if (!concat) {
      concat = new Concat(isUsingSourceMaps, fileName, options.newLine);
    }

    options.modules.forEach((module) => {
      if (module.path === _file.path) {
        _file.contents = new Buffer(module.script);
      }
    });

    const fileLength = _file.contents.toString().split('\n').length;
    toc.push({ name: fixName(_file.path), length: fileLength });

    // add _file to concat instance
    concat.add(_file.relative, _file.contents, _file.sourceMap);
    cb();
  }

  function applyTocSourceMap (code, _fileName, _toc) {
    const sourceMap = new SourceMapGenerator({
      file: _fileName
    });
    // NOTE: Incrementing by 2, to consider the extra new lines
    const linesOffset = _toc.length + 2;
    const contents = code.isBuffer() ? String(code.contents) : code;
    const codeLines = (contents.match(/\n/g) || []).length + 1;

    for (let i = 1; i < codeLines; i++) {
      sourceMap.addMapping({
        source: _fileName,
        original: {
          line: i,
          column: 0
        },
        generated: {
          line: i + linesOffset,
          column: 0
        }
      });
    }
    applySourceMap(code, sourceMap.toString());
  }

  function endStream (cb) {
    // no files passed in, no file goes out
    if (!firstFile || !concat) {
      cb();
      return;
    }

    let joinedFile;
    let lastLine = toc.length + 3; // for extra \n
    let tocOutput = '';
    let longestLine = 0;

    // if file options was a file path
    // clone everything from the first file
    if (typeof file === 'string') {
      joinedFile = firstFile.clone({ contents: false });
      joinedFile.path = path.join(firstFile.base, file);
    } else {
      joinedFile = firstFile;
    }

    joinedFile.contents = concat.content;

    toc.push('*/\n');

    toc.forEach((line) => {
      if (line.name && line.name.length > longestLine) {
        longestLine = line.name.length;
      }
    });

    toc.forEach((line) => {
      if (line.name && line.length) {
        tocOutput += `  ${line.name}  `;
        tocOutput += pad(lastLine.toString(), (longestLine - line.name.length));

        lastLine += line.length;
      } else {
        tocOutput += line;
      }

      tocOutput += '\n';
    });

    tocOutput += '\n';

    if (concat.sourceMapping) {
      applySourceMap(joinedFile, concat.sourceMap);
      applyTocSourceMap(joinedFile, file, toc);
    }

    if (joinedFile.isBuffer()) {
      joinedFile.contents = new Buffer(tocOutput + joinedFile.contents.toString());
    } else {
      joinedFile = toc + joinedFile;
    }

    this.push(joinedFile);
    cb();
  }

  return through.obj(bufferContents, endStream);
};
