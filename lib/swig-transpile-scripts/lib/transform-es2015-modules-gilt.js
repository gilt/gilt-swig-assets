// NOTE: Modified version of babel-plugin-transform-es2015-modules-amd
/* eslint-disable */

/*istanbul ignore next*/"use strict";

exports.__esModule = true;

var _create = require("babel-runtime/core-js/object/create");

var _create2 = _interopRequireDefault(_create);

exports.default = function ( /*istanbul ignore next*/_ref) {
  /*istanbul ignore next*/var t = _ref.types;

  function isValidRequireCall(path) {
    if (!path.isCallExpression()) return false;
    if (!path.get("callee").isIdentifier({ name: "require" })) return false;
    if (path.scope.getBinding("require")) return false;

    var args = path.get("arguments");
    if (args.length !== 1) return false;

    var arg = args[0];
    if (!arg.isStringLiteral()) return false;

    return true;
  }

  var amdVisitor = { /*istanbul ignore next*/
    ReferencedIdentifier: function ReferencedIdentifier(_ref2) {
      /*istanbul ignore next*/var node = _ref2.node;
      /*istanbul ignore next*/var scope = _ref2.scope;

      if (node.name === "exports" && !scope.getBinding("exports")) {
        this.hasExports = true;
      }

      if (node.name === "module" && !scope.getBinding("module")) {
        this.hasModule = true;
      }
    },
    /*istanbul ignore next*/CallExpression: function CallExpression(path) {
      if (!isValidRequireCall(path)) return;
      this.bareSources.push(path.node.arguments[0]);
      path.remove();
    },
    /*istanbul ignore next*/VariableDeclarator: function VariableDeclarator(path) {
      var id = path.get("id");
      if (!id.isIdentifier()) return;

      var init = path.get("init");
      if (!isValidRequireCall(init)) return;

      var source = init.node.arguments[0];
      this.sourceNames[source.value] = true;
      this.sources.push([id.node, source]);

      path.remove();
    }
  };

  return {
    inherits: require("babel-plugin-transform-es2015-modules-commonjs-simple"),

    /*istanbul ignore next*/pre: function pre() {
      // source strings
      this.sources = [];
      this.sourceNames = /*istanbul ignore next*/(0, _create2.default)(null);

      // bare sources
      this.bareSources = [];

      this.hasExports = false;
      this.hasModule = false;
    },


    visitor: {
      Program: { /*istanbul ignore next*/
        exit: function exit(path) {
          /*istanbul ignore next*/
          var _this = this;
          var needsTheWrap = true;

          if (this.ran) return;
          this.ran = true;

          path.traverse(amdVisitor, this);

          var params = this.sources.map(function (source) /*istanbul ignore next*/{
            return source[0];
          });
          var sources = this.sources.map(function (source) /*istanbul ignore next*/{
            return source[1];
          });

          sources = sources.concat(this.bareSources.filter(function (str) {
            return ! /*istanbul ignore next*/_this.sourceNames[str.value];
          }));

          var moduleName = this.getModuleName();
          if (moduleName) moduleName = t.stringLiteral(moduleName);

          /*istanbul ignore next*/var node = path.node;
          const firstNode = node.body.shift();
          if (firstNode.expression &&
              firstNode.expression.callee &&
              firstNode.expression.callee.object.name === 'Object' &&
              firstNode.expression.callee.property.name === 'defineProperty'
          ) {
            // NOTE: We are processing an ES6 module with at least an export
            node.body.unshift({
              'type': 'VariableDeclaration',
              'declarations': [
                {
                  'type': 'VariableDeclarator',
                  'id': {
                    'type': 'Identifier',
                    'name': 'exports'
                  },
                  'init': {
                    'type': 'ObjectExpression',
                    'properties': []
                  }
                }
              ],
              'kind': 'var'
            });

            // NOTE: This limits us to just one export per module, but it is
            // necessary to keep retrocompatibility with the current codebase
            node.body.push({
              'type': 'ReturnStatement',
                'argument': {
                  'type': 'Identifier',
                  'name': 'exports.default'
                }
              })
          } else {
            node.body.unshift(firstNode);

            if (!sources.length) {
              // NOTE: We are not an ES6 module at all. Must remove the wrapper.
              needsTheWrap = false;
            }
          }

          var factory = buildFactory({
            PARAMS: params,
            BODY: node.body
          });
          factory.expression.body.directives = node.directives;
          node.directives = [];

          if (needsTheWrap) {
            node.body = [buildDefine({
              MODULE_NAME: moduleName,
              SOURCES: sources,
              FACTORY: factory
            })];
          }
        }
      }
    }
  };
};

var /*istanbul ignore next*/_babelTemplate = require("babel-template");

/*istanbul ignore next*/

var _babelTemplate2 = _interopRequireDefault(_babelTemplate);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

var buildDefine = /*istanbul ignore next*/(0, _babelTemplate2.default)( /*istanbul ignore next*/"\n  gilt.define(MODULE_NAME, [SOURCES], FACTORY);\n");

var buildFactory = /*istanbul ignore next*/(0, _babelTemplate2.default)( /*istanbul ignore next*/"\n  (function (PARAMS) {\n    BODY;\n  })\n");

/*istanbul ignore next*/module.exports = exports["default"];
