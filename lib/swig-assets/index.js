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
    co = require('co'),
    fs = require('fs'),
    mime = require('mime'),
    path = require('path'),
    s3 = require('s3'),
    thunkify = require('thunkify'),
    waterfall = require('async-waterfall'),

    tagName = swig.pkg.name + '-' + swig.pkg.version + '-assets',
    git;

  swig.tell('assets-deploy', {
    description: 'Deploys Gilt front-end assets.',
    flags: {
      '--force': 'Force the deploy, by skipping the Assets Version Check'
    }
  });

  gulp.task('assets-setup', function (done) {

    swig.log.task('Preparing to Deploy Assets');

    if (!swig.rc || !swig.rc.s3) {
      swig.log();
      swig.log.error('.swigrc', '~/.swigrc is missing the s3 property. You need that value to continue.' +
        '\n\n            You can grab an updated .swigrc file from /web/tools/config/user/.swigrc or add the value manually.'.bold);
      process.exit(1);
    }

    var err = false,
      errs = [];

    // make sure our config has all the values we'll need
    _.each(['bucket', 'accessKey', 'assetsDir', 'secretKey'], function (property) {
      if (!swig.rc.s3[property]) {
        err = true;
        errs.push('~/.swigrc is missing the s3.' + property + ' property. You need that value to continue.');
      }
    })

    if (err) {
      swig.log();
      swig.log.error('.swigrc', errs.join('\n            '));
      swig.log('\n            You can grab an updated .swigrc file from /web/tools/config/user/.swigrc or add the missing value(s) manually.'.bold)
      process.exit(1);
    }

    done();
  });

  gulp.task('assets-check-version', [ 'assets-setup' ], co(function *() {

    git = require('simple-git')(swig.target.path);
    git.exec = thunkify(git._run);

    if (swig.argv.force) {
      swig.log('');
      swig.log.task('Skipping the Assets Version Check');
      swig.log.warn('', 'The --force is strong with this one.\n');

      var question = 'Are you sure you want to force this deploy? (y/n)'.white,
        answer = yield swig.log.prompt(swig.log.padLeft(question, 1));

      if (!answer || (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes')) {
        swig.log();
        swig.log('(╯°□°）╯︵ ┻━┻)  Allllrighty then.');
        process.exit(1);
      }
      else {
        swig.log();
        swig.log('BRING IT ON, CUPCAKE!  ᕦ(ò_ó*)ᕤ\n');
      }

      return;
    }

    swig.log('');
    swig.log.task('Checking Assets Version');
    swig.log.info('', 'Looking for Git tag: ' + tagName);

    var result;

    // Make sure all our tags are up to date first
    yield git.exec('fetch --tags');
    // get the list of tags
    result = yield git.exec('tag');
    result = result.split('\n');

    if (_.contains(result, tagName)) {
      swig.log();
      swig.log.error('swig-assets',
        'It looks like you\'ve already deployed the assets for this version.\n   The tag: ' + tagName + ', already exists.\n' +
        '   If you believe that was in error, you can delete the tag and try again, or use the --force flag\n' +
        '   but tread carefully!'.bold
      );
      process.exit(1);
    }

    swig.log.info('', 'Tag is new. We\'re good to go.');

  }));

  gulp.task('assets-s3', function (done) {

    // https://s3.amazonaws.com/gilt-assets/a/js/web-x-domain/0.0.13/main.full.min.js
    // is the same as
    // https://cdn5.giltcdn.com/a/js/web-x-domain/0.0.13/main.full.min.js
    // where 'gilt-assets' is the bucket name

    swig.log('');
    swig.log.task('Deploying Assets to S3');
    swig.log.info('', 'Assets @ https://s3.amazonaws.com/gilt-assets/');

    var s3 = require('s3'),
      basePath = path.join(swig.target.path, '/public/{{dir}}', swig.target.name),
      directories = [ 'css', 'img', 'js', 'templates' ],
      client = s3.createClient({
        s3Options: {
          accessKeyId: swig.rc.s3.accessKey,
          secretAccessKey: swig.rc.s3.secretKey
        }
      }),
      tasks = [];

    _.each(directories, function (dir) {
      tasks.push(function (callback) {
        var params = {
          localDir: basePath.replace('{{dir}}', dir),
          deleteRemoved: true,
          s3Params: {
            Bucket: swig.rc.s3.bucket,
            // eg. /a/js/web-checkout/0.1.1/
            Prefix: path.join(swig.rc.s3.assetsDir, dir, swig.target.name, swig.pkg.version)
          },
          getS3Params: function(localFile, stat, callback) {
            var mimeType = mime.lookup(localFile);

            // file is .js or .css AND charset is not already present in mimeType
            if (/\.(?:css|js)$/.test(localFile) && !/charset=/.test(mimeType)) {
              mimeType += '; charset=utf-8';
            }
            callback(null, { 'ContentType': mimeType });
          }
        },
        uploader = client.uploadDir(params),
        progressBegan = false,
        lastPercent = '';

        swig.log();
        swig.log.task('Syncing ' + params.localDir.grey);

        uploader.on('error', function (err) {
          // don't worry about ugly output here.
          swig.log();
          swig.log.error('deploy-s3', err.stack);
        });

        uploader.on('progress', function () {
          if (uploader.progressAmount <= 0) {
            if (!progressBegan) {
              progressBegan = true;
              lastPercent = '0%';
              var preamble = swig.log.symbols.info + '  Progress ' + swig.log.symbols.start + swig.log.symbols.start + ' ' + lastPercent.white;
              swig.log.write(swig.log.padLeft(preamble, 1));
            }
            return;
          }

          var percent = parseInt((uploader.progressAmount / uploader.progressTotal) * 100, 10),
            backspace = (new Array(lastPercent.length + 1)).join('\b');

          lastPercent = percent + '%';

          swig.log.write(backspace + lastPercent.white);
        });

        uploader.on('end', function () {
          var backspace = (new Array(lastPercent.length + 1)).join('\b');

          swig.log.write(backspace + '100%\n'.green);
          swig.log.info('', 'Directory Synced to: ' + params.s3Params.Prefix.grey);

          callback(null);
        });

      });
    });

    waterfall(tasks, function (callback) {
      done();
    });

  });

  /*
   * @note: We only create the git tag if we made it this far.
  */
  gulp.task('assets-tag-version', [ 'assets-s3' ], co(function *() {

    swig.log('');
    swig.log.task('Tagging Assets Version');

    swig.log.info('', 'Fetching Tags');
    var result = yield git.exec('fetch --tags'),
      skipPush = false;

    swig.log.info('', 'Tagging: ' + tagName);

    try {
      result = yield git.exec('tag ' + tagName);
    }
    catch (e) {
      skipPush = true;
      swig.log.error('', e);
    }

    if (!skipPush) {
      swig.log.info('', 'Pushing Tags');
      result = yield git.exec('push --tags');
    }
    else {
      swig.log.warn('', 'Skipping Pushing Tags. Disregard this warning if you used --force, and didn\'nt delete the tag prior.');
    }

  }));

  /*
   * @note:
   *  Order of Operation:
   *    - assets-check-version
   *    - install
   *    - lint
   *    - spec
   *    - bundle
   *    - merge-css
   *    - assets-setup
   *    - assets-s3
   *    - assets-tag-version
  */
  gulp.task('assets-deploy', function (done) {

    swig.seq(
      'assets-check-version',
      'install',
      'spec', // spec lints before running specs
      'bundle',
      'merge-css',
      'minify',
      'assets-tag-version',
      done);
  });

};
