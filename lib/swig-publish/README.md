# swig-publish
Swig plugin that allows for a super easy way to publish NPM modules.

## Installation

```
npm install -D @gilt-tech/swig-publish
```

or, if you are really kool:

```
yarn add -D @gilt-tech/swig-publish
```

## Usage
This plugin will add the task `publish` to the [`swig`][1] CLI.

Once you have it installed, you have to organize your modules codebase, like so:

```
modules-repo
 - src
   + moduleA
   - moduleB
     package.json
     ...
 package.json // <-- where the swig package is installed
```

You can then ask `swig` to publish one of the modules with a simple command:

```
swig publish -m <module-name>
```

This will instruct `swig` to search inside the `src` folder for a module, which
`package.json` property `name` matches the given `module-name`, and then
publish the new version of it on NPM.

## CLI options

`--module <module-name>`, `-m <module-name>` (required):

This one tells the `publish` plugin which module it has to process.

`--beta` (optional):

This will instruct the `publish` plugin to create a `*-beta` version of the
module you want to publish, and publish it on the `beta` dist tag of NPM.

It also checks if there is an already published beta version with the same
semver number, and if so, it asks the user if it should override it with a new
beta version.


[1]:https://www.npmjs.com/package/@gilt-tech/swig
