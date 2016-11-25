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

// handles writing of main.less in /public
module.exports = function (gulp, swig, paths, azModules) {

  // dependencies.less should be in topoclogical order, not a-z
  var _ = require('underscore'),
    fs = require('fs'),
    glob = require('glob'),
    path = require('path'),
    now = (new Date()).toString(),
    content = '/* Generated: ' + now + '\n   This file is auto-generated during ui:install\n   It is inadvisable to write to it directly */\n',
    depsPath = path.join(paths.css, 'dependencies.less'),
    mainCssPath = path.join(paths.css, 'main.less'),
    modPathName,
    sourcePath;

    _.uniq(azModules, function (mod) { return mod.name; }).forEach(function (mod) {
      modPathName = mod.name.replace(/\./g, '/');
      sourcePath = path.join(mod.path, '/css');

      glob.sync(path.join(sourcePath, '/**/*.*')).forEach(function (file) {
        var relative = modPathName + '/' + path.relative(sourcePath, file);

        // if thing.css and thing.less exist, take the css.
        // swig publishes both css and less files, that's why we perform this check
        if (path.extname(file) === '.less' && fs.existsSync(file.replace('.less', '.css'))) {
          swig.log.verbose('Skipping: ' + relative.grey);
          return;
        }

        content += '@import () "' + relative + '";\n'
      });
    });

    swig.log.info('', 'Writing dependencies.less');
    swig.log.verbose(depsPath);

    fs.writeFileSync(depsPath, content);

    if (!fs.existsSync(mainCssPath)) {
      swig.log();
      swig.log.info('', 'Didn\'t find main.less, Writing main.less');

      content = '// Generated: ' + now + '\n@import "dependencies.less";';
      fs.writeFileSync(mainCssPath, content);

      swig.log.verbose(swig.log.padLeft(' ' + mainCssPath + '\n', 1));
    }
    else {
      swig.log.info('', 'main.less already exists, skipping it.');
    }

};
