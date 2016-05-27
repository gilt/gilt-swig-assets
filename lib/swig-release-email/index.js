module.exports = function (gulp, swig) {

  var _ = require('underscore'),
    path = require('path'),
    fs = require('fs'),
    co = require('co'),
    git = require('co-exec'),
    mustache = require('mustache'),
    gutil = require('gulp-util'),
    thunkify = require('thunkify'),
    // inline = thunkify(require('inline-css')),
    Minimize = require('minimize');

  swig.tell('release-email', {
    description: 'Sends an email to the organization, informing of a new module version.\nUse this task only in the event of a prior failure.',
    flags: {
      '--module, --m': 'Specifies the target module, within the working directory, to email about.'
    }
  });

  function * gitDiff (previousTag) {

    swig.log.info('', 'Fetching Diff');

    // git diff tracking_api.signal_direct-0.1.0 -- /github/ui-tracking/src/tracking_api/signal_direct

    var command = 'git diff ' + previousTag + ' -- ' + swig.target.path,
      results = yield git(command, { cwd: swig.target.path });

    return results;
  }

  function * gitLog (previousTag, currentTag) {

    swig.log.info('', 'Fetching Log for ' + currentTag);

    // git log tracking_api.signal_direct-0.1.0..tracking_api.signal_direct-0.1.1 -- /github/ui-tracking/src/tracking_api/signal_direct

    var command = 'git log ' + previousTag.trim() + '..' + currentTag.trim() + ' -- ' + swig.target.path,
      results = yield git(command, { cwd: swig.target.path });

    return results;
  }

  function * gitTag () {

    swig.log.info('', 'Fetching Tags');

    // git tag -l "tracking_api.signal_direct*" --sort=-refname
    var command = 'git tag -l --sort=-v:refname | egrep \'' + swig.argv.module + '-(?:[0-9].?)+$\'',
      results = yield git(command, { cwd: swig.target.path }),
      bits = results.split('\n'),
      prev = bits.length > 1 ? bits[1] : null,
      current = bits.length > 0 ? bits[0] : 'HEAD',
      isNewModule = false;

    if (!prev) {
      // git describe --abbrev=0 --tags tracking_api.signal_direct-0.1.1^
      command = 'git describe --abbrev=0 --tags ' + current + '^';
      results = yield git(command, { cwd: swig.target.path });
      prev = results;
      isNewModule = true;
    }

    return { previous: prev.trim(), current: current.trim(), isNewModule: isNewModule };
  }

  function * gitEmail () {

    swig.log.info('', 'Fetching Author\'s Email Address');

    var address = yield git('git config --get user.email', { cwd: swig.target.path }),
      name = yield git('git config --get user.name', { cwd: swig.target.path });

    return '"' + name.trim() + '" <' + address.trim() + '>';
  }

  function fill (slots) {
    return slots > 0 ? new Array(slots) : [];
  }

  function render (diff) {

    var result = '',
      data = _.extend(diff, {}),
      template = fs.readFileSync(path.join(__dirname, 'templates/email.handlebars'), 'utf-8');

    _.each(diff.files, function (file) {

      var deletes = file.deletions,
        adds = file.additions,
        normals = 0,
        difference;

      // create the github style adds/deletes block graph
      if (file.additions + file.deletions > 5) {
        difference = (deletes + adds) / 5; // we prefer to only show 5 blocks, round up

        adds = Math.round(adds / difference);
        deletes = Math.round(deletes / difference);

        if (deletes >= 5 ) {
          adds = 0;
        }
        else if (adds >= 5) {
          deletes = 0;
        }
      }
      else {
        normals = 5 - (adds + deletes);
      }

      file.graph = { plus: fill(adds), minus: fill(deletes), normal: fill(normals) };
      file.total = file.additions + file.deletions;
    });

    data.repo = swig.target.repo;
    data.commits = data.commits
                    .replace(/<(.*)>/g, '&lt;<a href="mailto:$1">$1</a>&gt;')
                    .replace(/\b((?:https?|ftp):\/\/[a-z0-9-+&@#\/%?=~_|!:,.;]*[a-z0-9-+&@#\/%=~_|])/g, '<a href="$1">$1</a>')
                    .replace(/\b([A-Z]+-\d+)\b/, '<a href="https://jira.gilt.com/browse/$1">$1</a>')
                    .replace(/(commit )([0-9a-f]{5,40})/, '$1<a href="https://gerrit.gilt.com/gitweb.cgi?p=' + data.repo + '.git;a=commit;h=$2">$2</a>')
                    .replace(/(Change-Id: |commit )([A-Z][a-f\d]{40})/, '$1<a href="https://gerrit.gilt.com/#/q/$2,n,z">$2</a>')
                    .replace(/(Author: )((\w|\s)+)/, '$1<strong>$2</strong>')
                    .replace(/(Date: )((\w|\s|\d|\:|\-)+)/, '$1<strong>$2</strong>')
                    .replace(/\n/g, '<br/>');

    result = mustache.render(template, data);

    // TODO: use new gerrit link
    //https://gerrit.gilt.com/gitweb.cgi?p=ui-cart.git;a=commitdiff;h=ea1be58b100c5549ff4d2078be19aa819b8c0164

    return result;
  }

  gulp.task('release-email', co(function * () {

    if (!swig.argv.module) {
      swig.log.error('', 'release-email is only for use with modules. please specify the --module argument.');
      return;
    }

    // if the version contains a hypen, then assume that we're publishing
    // a test version. test versions shouldn't have emails sent to the org
    if (swig.pkg.version.indexOf('-') > 0) {
      swig.log.info('', 'Skipping release email since this is a test version.');
      return;
    }

    swig.log.task('Generating Module Release Email');

    var tags = yield gitTag(),
      log = yield gitLog(tags.previous, tags.current),
      rawDiff = yield gitDiff(tags.previous),
      sender = yield gitEmail(),
      minimize = new Minimize({
        empty: false,
        spare: false,
        quotes: true
      }),
      recipients = [], //'federal-ui-alerts@gilt.com'
      subject,
      inline,
      result,
      diff,
      html;

      swig.log.info('', 'Parsing Diff');

      diff = swig.diff(rawDiff);
      diff = _.extend(diff, {
        moduleName: swig.argv.module,
        toVersion: swig.pkg.version,
        fromVersion: tags.previous.replace(swig.argv.module + '-', '')
      });

      swig.log.info('', 'Rending HTML');

      diff.commits = log;

      html = render(diff);

      if (swig.argv.debug) {
        fs.writeFileSync(path.join(__dirname, 'email.html'), html);
      }

      inline = thunkify(function (html, options, callback) {

        //https://github.com/jonkemp/inline-css
        require('inline-css')(html, options)
          .then(function (html) {
            callback(null, html);
          },
          function (err) {
            callback(err, null);
          });
      });

      html = yield inline(html, {
        applyStyleTags: true,
        removeStyleTags: true,
        url: 'file://'
      });

      // remove class="" attributes since we no longer need them.
      html = html.replace(/\s*(?:\s+class)\s*=\s*"[^"]*"/g, '');

      // replace other annoying things to make the html smaller.
      html = html.replace(/\&apos\;/g, '\'');
      html = html.replace(/\&quote\;/g, '"');
      html = html.replace(/\&\#x25A0\;/g, '■'); // the inliner replaces these

      if (swig.argv.debug) {
        fs.writeFileSync(path.join(__dirname, 'email-inlined.html'), html);
      }

      // gmail has a 102k limit on html content before it starts "clipping" it.
      // this greatly reduces the size of the html file.
      minimize.parse = thunkify(minimize.parse);
      html = yield minimize.parse(html);

      // remove <code data-remove>. we have to have that in there
      // so Minimize will leave the whitespace alone
      html = html.replace(/\<code data\-remove\>/g, '');
      html = html.replace(/\<\/code\>\<\/td\>/g, '');

      if (swig.argv.debug) {
        fs.writeFileSync(path.join(__dirname, 'email-min.html'), html);
      }

      swig.log();
      swig.log.task('Sending Email');

      if (swig.pkg.maintainers && _.isArray(swig.pkg.maintainers)) {
        swig.pkg.maintainers.forEach(function (maint) {
          if (maint.email) {
            recipients.push('"' + maint.name + '" <' + maint.email + '>');
          }
        });
      }

      if (swig.pkg.contributors && _.isArray(swig.pkg.contributors)) {
        swig.pkg.contributors.forEach(function (contrib) {
          if (contributor.email) {
            recipients.push('"' + contrib.name + '" <' + contrib.email + '>');
          }
        });
      }

      recipients.push(sender, 'feck@gilt.com');
      recipients = _.uniq(recipients);
      subject = '[module][' + swig.target.repo + '] ';

      if (tags.isNewModule) {
        subject += 'New Module: ' + diff.moduleName + ' v' + diff.toVersion;
      }
      else {
        subject += diff.moduleName + ': v' + diff.fromVersion + ' → v' + diff.toVersion;
      }

      try {
        result = yield swig.email({
          from: 'swig-noreply@gilt.com',
          to: recipients,
          replyTo: recipients,
          subject: subject,
          text: '',
          html: html
        });

        swig.log.info('', 'Email sent.');
      }
      catch (e) {
        swig.log.error('', 'Unable to send the release email. You can retry using the `swig release-email` command.');
      }
  }));

};
