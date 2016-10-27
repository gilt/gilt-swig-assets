'use strict';

// modified from https://bitbucket.org/lsystems/regexp-sourcemaps
// Changed:
//  - Added possibility to pass a function as a replacement parameter
//    Use case: The replacement string must contain different values on each
//    replacement loop, like a random number.

const SourceNode = require('source-map').SourceNode;

const lineMatcher = /\n/gm;
const varMatcher = /\$({([\d]+)}|[\d]+)/gm;

// Handle a position in a file
function Position(file, line, column) {
  this.file = file;
  this.line = line || 1;
  this.column = column || 0;
}

// Advance in the file to move the cursor after content
Position.prototype.forward = function(content) {
  const lines = content.split(lineMatcher);

  if (lines.length <= 1) {
    this.column += content.length;
  } else {
    this.line += lines.length - 1;
    this.column = lines[lines.length - 1].length;
  }

  return this;
};

// Add content to a node (needs to be added line per line)
Position.prototype.add = function(node, content, autoForward) {
  autoForward = autoForward === undefined ? true : !!autoForward;

  const pos = autoForward ? this : new Position(this.file, this.line, this.column);

  let sub;

  let lastIndex = lineMatcher.lastIndex = 0;
  while (lineMatcher.exec(content)) {
    sub = content.substring(lastIndex, lineMatcher.lastIndex);
    node.add(new SourceNode(pos.line, pos.column, pos.file, sub));
    pos.forward(sub);
    lastIndex = lineMatcher.lastIndex;
  }

  if (lastIndex < content.length) {
    sub = content.substring(lastIndex);
    node.add(new SourceNode(pos.line, pos.column, pos.file, sub));
    pos.forward(sub);
  }

  return this;
};

// Regexp replacer with sourcemap support
const Replacer = module.exports = function Replacer(regexp, replace, regexpName) {
  // Handle params
  if (typeof replace !== 'string') {
    if (typeof replace !== 'function') {
      throw new Error('replace parameter must be of type "string" or "function"');
    }
    if (typeof replace() !== 'string') {
      throw new Error('replace function must return a "string"');
    }
  }

  this.$regexp = regexp;
  this.$replace = replace;
  this.$regexpName = !regexpName ? null : `regexp/${regexpName}`;
};

// Create a replace node depending on the current pos & match
Replacer.prototype.createReplaceNode = function(pos, match) {
  const node = new SourceNode();
  let varMatch;
  const replacePos = new Position(this.$regexpName);
  const $replace = typeof this.$replace === 'function'
      ? this.$replace()
      : this.$replace;

  let lastIndex = varMatcher.lastIndex = 0;
  // eslint-disable-next-line
  while ((varMatch = varMatcher.exec($replace))) {
    const parValue = match[varMatch[2] || varMatch[1]];
    if (varMatch.index > lastIndex) {
      replacePos.add(node, $replace.substring(lastIndex, varMatch.index));
    }

    pos.add(node, parValue, false);
    lastIndex = varMatcher.lastIndex;
  }
  if (lastIndex < $replace.length) {
    replacePos.add(node, $replace.substring(lastIndex));
  }

  return node;
};

// Replace the provided content
Replacer.prototype.replace = function(content, file) {
  file = file || 'content';

  const filePos = new Position(file);

  let match;
  // Create the base node & add sources
  const node = new SourceNode();
  node.setSourceContent(file, content);
  if (this.$regexpName) {
    node.setSourceContent(this.$regexpName, this.$replace);
  }

  let lastIndex = this.$regexp.lastIndex = 0;

  // eslint-disable-next-line
  while ((match = this.$regexp.exec(content))) {
    if (match.index > lastIndex) {
      filePos.add(node, content.substring(lastIndex, match.index));
    }

    node.add(this.createReplaceNode(filePos, match));
    filePos.forward(match[0]);

    // Move
    lastIndex = this.$regexp.lastIndex || match.index + match[0].length;

    // Handle empty match
    if (!match[0].length) {
      ++this.$regexp.lastIndex;
    }

    // Handle global flag
    if (!this.$regexp.global) break;
  }

  if (lastIndex < content.length) {
    filePos.add(node, content.substring(lastIndex));
  }

  const res = node.toStringWithSourceMap({ file });
  res.map = res.map.toJSON();
  return res;
};
