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
    fs = require('fs'),
    path = require('path'),
    glob = require('globby'),
    rimraf = require('rimraf'),
    thunkify = require('thunkify'),
    co = require('co'),

    git,
    npmCommand,
    tagName,
    targetPath,
    files;

  function * gitPublisher () {

    swig.log.info('', 'Fetching Author\'s Email Address');

    var address = yield git.exec('config --get user.email'),
      name = yield git.exec('config --get user.name');

    return { name: name.trim(), email: address.trim() };
  }

  // checks package.json properties 'maintainers' and 'publishedBy' for the
  // current user and adds them if they're not found.
  function * checkPublisher (tempPath) {
    var publisher = yield gitPublisher(),
      publisherFound = false,
      packagePath,
      packageJson;

    git = git || require('simple-git')(swig.target.path);

    swig.log();
    swig.log.task('Checking publisher info');

    if (!swig.pkg.maintainers) {
      swig.pkg.maintainers = [];
    }

    _.each(swig.pkg.maintainers, function (m) {
      if (m.email === publisher.email) {
        publisherFound = true;
      }
    });

    if (!publisherFound) {
      swig.log.info('', 'Adding ' + publisher.email + ' to "maintainers"');
      swig.pkg.maintainers.push(publisher);
    }

    if (!swig.pkg.publishedBy || !swig.pkg.publishedBy.email || swig.pkg.publishedBy.email !== publisher.email) {
      swig.log.info('', 'Marking package published by ' + publisher.email);
      publisherFound = false; // re-use this flag
      swig.pkg.publishedBy = publisher;
    }

    if (!publisherFound) {
      packageJson = JSON.stringify(swig.pkg, null, 2);
      packagePath = path.join(swig.target.path, 'package.json');
      fs.writeFileSync(packagePath, packageJson, 'utf-8');
      swig.pkg = require(packagePath);

      swig.log.verbose('Writing publisher info to: ' + path.join(tempPath, 'package.json').grey);
      swig.fs._fs.copySync(packagePath, path.join(tempPath, 'package.json'));

      // after package.json destined for publish has been safely copied away, lets restore the original from version control
      yield git.exec('checkout -- ' + packagePath);
    }

    return publisher;
  }

  swig.tell('publish', {
    description: 'Publishes a Gilt UI Module, providing linting and spec automation.',
    flags: {
      '--module, --m': 'Specifies the target module to publish within the working directory.'
    }
  });

  gulp.task('publish-verify-clean', co(function * () {

    git = require('simple-git')(swig.target.path);
    git.exec = thunkify(git._run);

    swig.log('');
    swig.log.task('Checking Repo State');

    var result = yield git.exec('status --porcelain ' + swig.target.path);

    if (result.length) {
      swig.log.error('', 'All files within a module directory will be published.');
      swig.log.error('', 'As such, we need a clean directory to work with.');
      swig.log.error('', 'Please commit your module changes and try again.');
      process.exit(1);
    }
    else {
      swig.log.info('', 'Module directory is clean.');
    }
  }));

  gulp.task('publish-verify', ['publish-verify-clean'], function (done) {

    var pkgPath,
      result;

    swig.log();
    swig.log.task('Verifying before Publishing');

    tagName = swig.target.name + '-' + swig.pkg.version;

    swig.log.info('', 'Verifying Arguments');

    if (!swig.argv.module && swig.argv.m) {
      swig.argv.module = swig.argv.m;
    }

    if (!swig.argv.module && !swig.argv.m) {
      swig.error('publish-verify', 'You must define a module to publish with either the --module or --m flag.');
      process.exit(1);
    }

    targetPath = swig.target.path;

    swig.log.info('', 'Verifying Target');

    if (!fs.existsSync(targetPath)) {
      swig.error('publish-verify', 'The ' + swig.argv.module + ' module specified doesn\'t exist here.');
      process.exit(1);
    }

    swig.log.info('', 'Verifying package.json');

    pkgPath = path.join(targetPath, '/package.json');

    if (!fs.existsSync(pkgPath)) {
      swig.error('publish-verify', 'You cannot publish a module without a package.json file.');
      process.exit(1);
    }

    done();
  });

  gulp.task('publish-check-version', ['publish-verify'], co(function * () {

    swig.log('');
    swig.log.task('Checking Module Version');
    swig.log.info('', 'Looking for Git tag: ' + tagName);

    try {

      var result = yield git.exec('tag');
      result = result.split('\n');

      if (_.contains(result, tagName)) {
        swig.log.error('publish-verify',
          'It looks like you\'ve already published this module.\n   The tag: ' + tagName + ', already exists.\n' +
          '   If you believe that was in error, you can delete the tag and try again, but tread carefully!'
        );
        process.exit(1);
      }
    }
    catch (e) {
      swig.log.error('[publish-tag]', 'Failed to tag ' + (swig.pkg.name + '@' + swig.pkg.version).magenta + '\n  ' + e);
      process.exit(1);
    }

    swig.log.success('', 'Tag is new. We\'re good to go.');
  }));

  gulp.task('publish-npm', ['publish-check-version'], co(function * () {

    var tempPath = path.join(swig.temp, '/publish/', swig.target.name),
      tagFlag = '',
      result,
      streamResult,
      contents;

    if (fs.existsSync(tempPath)) {
      rimraf.sync(path.normalize(tempPath));
    }

    swig.fs.mkdir(tempPath);
    swig.fs.copyAll(targetPath, tempPath);
    swig.fs._fs.copySync(path.join(__dirname, 'npmignore.dotfile'), path.join(tempPath, '.npmignore'));

    // replace $$PACKAGE_VERSION$$ with the actual version from package.json
    files = glob.sync(path.join(tempPath, '/**/*.js'));

    swig.log();
    swig.log.task('Replacing $$PACKAGE_VERSION$$');

    _.each(files, co(function * (file) {
      swig.log.info('', file.replace(tempPath, '').grey);

      contents = fs.readFileSync(file, 'utf-8');
      contents = contents.replace('$$PACKAGE_VERSION$$', swig.pkg.version);

      fs.writeFileSync(file, contents, 'utf-8');
    }));

    // remove extended attributes
    files = glob.sync(path.join(tempPath, '/**/*'));

    swig.log();
    swig.log.task('Removing extended attributes');

    _.each(files, co(function * (file) {
      swig.log.info('', file.replace(tempPath, '').grey);
      result = yield swig.exec('xattr -c ' + file);
    }));

    yield checkPublisher(tempPath);

    // if the version contains a hypen, then assume that we're publishing
    // a test version. this keeps the module from being tagged as `latest`
    // in the registry.
    if (swig.pkg.version.indexOf('-') > 0) {
      tagFlag = ' --tag=test'; // leading space is important
    }

    try {

      // run npm against the temp module location, redirect stderr to stdout
      npmCommand = [
        'cd ' + tempPath,
        'npm publish .' + tagFlag + ' --loglevel=info 2>&1'
      ].join('; ');

      swig.log.info('', 'NPM Command:\n  ' + npmCommand.split('; ').join(';\n  '));
      swig.log.info('', 'Publishing Module');

      result = yield swig.exec(npmCommand, null, {
        stdout: function (data) {
          streamResult += data;

          if(swig.argv.verbose) {
            console.log(data);
          }
        }
      });

      if (!result.stdout.indexOf('npm info ok')) {
        swig.log.error('', 'Sad Pandas. Publish Failed.');

        if (streamResult) {
          swig.log.info('', 'Command Output:\n    ' + streamResult.split('\n').join('\n    ').grey);
        }
      }
      else {
        swig.log.success('', 'Module published to npm successfully.');
      }
    }
    catch (e) {
      swig.log();
      swig.log.error('', 'Sad Pandas. Publish Failed:');
      swig.log.error('', e.stack);
      if (streamResult) {
        swig.log.info('', 'Command Output:\n    ' + streamResult.split('\n').join('\n    ').grey);
      }
      process.exit(1);
    }

  }));

  gulp.task('publish-tag-version', ['publish-npm'], co(function * () {

    swig.log('');
    swig.log.task('Tagging Module Version');

    var result;

    try {

      swig.log.info('', 'Fetching Tags');
      result = yield git.exec('fetch --tags');

      swig.log.info('', 'Tagging: ' + tagName);
      result = yield git.exec('tag ' + tagName);

      swig.log.info('', 'Pushing Tags');
      result = yield git.exec('push --tags');
    }
    catch (e) {
      swig.log.error('[publish-tag-version]', 'Failed to tag ' + (swig.pkg.name + '@' + swig.pkg.version).magenta + '\n  ' + e);
      process.exit(1);
    };

    swig.log();
  }));

  /*
   * @note:
   *  Order of Operations
   *    - lint
   *    - spec
   *    - publish-verify
   *    - publish-check-version
   *    - publish-npm
   *    - publish-tag-version
   *    - release-email
  */
  gulp.task('publish', function (done) {
    swig.seq(
      'spec',
      'publish-tag-version',
      'release-email',
      done);
  });

};
