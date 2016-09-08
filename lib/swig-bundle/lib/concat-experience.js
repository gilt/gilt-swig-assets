// modified from https://raw.githubusercontent.com/wearefractal/gulp-concat/master/index.js

'use strict';

var through = require('through2'),
  path = require('path'),
  gutil = require('gulp-util'),
  PluginError = gutil.PluginError,
  File = gutil.File,
  Concat = require('concat-with-sourcemaps'),
  applySourceMap = require('vinyl-sourcemaps-apply'),
  SourceMapGenerator = require('source-map').SourceMapGenerator,
  sprintf = require('sprintf-js').sprintf;

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

  var isUsingSourceMaps = false,
    firstFile,
    fileName,
    concat,
    toc = ['/*', '  Table of Contents - ┬──┬﻿ ¯\\_(ツ)', ''];

  if (typeof file === 'string') {
    fileName = file;
  }
  else if (typeof file.path === 'string') {
    fileName = path.basename(file.path);
    firstFile = new File(file);
  }
  else {
    throw new PluginError('gulp-concat', 'Missing path in file options for gulp-concat');
  }

  function fixName (modulePath) {
    modulePath = modulePath
                  .replace(options.basePath, '')
                  .substring(1)
                  .replace(/\//g, '.');

    var parts = modulePath.split('.');

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
    return sprintf('%' + (howMany) + 's%s', '', what);
  }

  function bufferContents (file, enc, cb) {
    // ignore empty files
    if (file.isNull()) {
      cb();
      return;
    }

    // we dont do streams (yet)
    if (file.isStream()) {
      this.emit('error', new PluginError('gulp-concat',  'Streaming not supported'));
      cb();
      return;
    }

    // enable sourcemap support for concat
    // if a sourcemap initialized file comes in
    if (file.sourceMap && isUsingSourceMaps === false) {
      isUsingSourceMaps = true;
    }

    // set first file if not already set
    if (!firstFile) {
      firstFile = file;
    }

    // construct concat instance
    if (!concat) {
      concat = new Concat(isUsingSourceMaps, fileName, options.newLine);
    }

    options.modules.forEach(function (module) {

      if (module.path === file.path) {
        file.contents = new Buffer(module.script);
      }
    });

    var fileLength = file.contents.toString().split('\n').length;
    toc.push({ name: fixName(file.path), length: fileLength });

    // add file to concat instance
    concat.add(file.relative, file.contents, file.sourceMap);
    cb();
  }

  function applyTocSourceMap (code, fileName, toc) {
    const map = new SourceMapGenerator({
      file: fileName
    });
    // NOTE: Incrementing by 2, to consider the extra new lines
    const linesOffset = toc.length + 2;
    const contents = code.isBuffer() ? String(code.contents) : code;
    const codeLines = (contents.match(/\n/g) || []).length + 1;

    for (let i = 1; i < codeLines; i++) {
      map.addMapping({
        source: fileName,
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
    applySourceMap(code, map.toString());
  }

  function endStream (cb) {
    // no files passed in, no file goes out
    if (!firstFile || !concat) {
      cb();
      return;
    }

    var joinedFile,
      lastLine = toc.length + 3, // for extra \n
      tocOutput = '',
      longestLine = 0;

    // if file options was a file path
    // clone everything from the first file
    if (typeof file === 'string') {
      joinedFile = firstFile.clone({contents: false});
      joinedFile.path = path.join(firstFile.base, file);
    }
    else {
      joinedFile = firstFile;
    }

    joinedFile.contents = concat.content;

    toc.push('*/\n');

    toc.forEach(function (line) {
      if (line.name && line.name.length > longestLine) {
        longestLine = line.name.length;
      }
    });

    toc.forEach(function (line) {
      if (line.name && line.length) {
        tocOutput += '  ' + line.name + '  ';
        tocOutput += pad(lastLine.toString(), (longestLine - line.name.length));

        lastLine += line.length;
      }
      else {
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
    }
    else {
      joinedFile = toc + joinedFile;
    }

    this.push(joinedFile);
    cb();
  }

  return through.obj(bufferContents, endStream);
};
