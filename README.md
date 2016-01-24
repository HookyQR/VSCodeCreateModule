# Create Module for VS Code 

[![Build Status](https://api.travis-ci.org/HookyQR/VSCodeCreateModule.svg?branch=master)](https://travis-ci.org/HookyQR/VSCodeCreateModule)

Create Module for VS Code provides two primary functions:

1. It allows you to open module files directly from the `require()` call. It won't allow you to open node core modules.
2. It also helps you to create modules that don't exist yet. Just type `require('{new_module}')`. This extension will let you know it doesn't exits, and offer to create if for you.
	- This function is also available as a command, with the shortcut `Ctrl+y` or `Cmd+y` on MacOS.

The default options for this extension are as follows:

```json
"CreateModule.packageType": "package",

"CreateModule.supportES6modules": false,

"CreateModule.packageDefaults": {
		"name": "[name]",
		"version": "0.0.1",
		"main": "lib/[name]"
}
```

`packageType` can be any of: 

- `"package"`: Create a module folder in node_modules with the defaults as set in the `packageDefaults` setting. Also create the file presented by the `"main"` element of that setting.
- `"index"`: Create a module folder in node_modules with an `index.js` file in it.
- `"file"`: Just create a file named `{new_module}.js` in the node_modules folder.
- `"ask"`: Open a dialog and ask for one of the options above.

Set `supportES6modules` boolean flag to `true` to also provide creation of `.js` extended files (and links to existing files) from lines such as:
```javascript
import abc from "abc";
import * from 'lib/xyz';
import {sum, pi} from "lib/math";
```

`packageDefaults` can have any fields available in a standard node `package.json` file.
At the first level of `packageDefaults` you can use the string `[name]` to specify where you want the new module's name to be entered.

### Special cases
- If `{new_module}` is an absolute or relative path, the file will be created there. (The same way node would look for it)
- If `{new_module}` ends in one of the valid extension (`.js`, `.json`, `.node`) the `"file"` mode will always be used.
- Creation from an ES6 style import will always create a file rather than a node package.
- Omission of an extension (for a pathed, or `"file"` mode creation) will cause `.js` to be added.
- `. .. ./ and ../` are ignored when provided on their own in a require call. (Stops early suggestion to create bogus modules.)


## Known issues:
* Occasionally triggers a VS Code error: <br>
	`Unable to open 'package.json': Unable to open the file because the associated text model is undefined.`<br>
	Doesn't affect the file creation, just opening.


## Changes:
### 0.0.5: 25 Jan 2016
* Optionally support ES6 module `import` key word. Fixes [Issue #3 ES6 imports support](https://github.com/HookyQR/VSCodeCreateModule/issues/3)

### 0.0.4: 25 Jan 2016
* Drop color change completely. Fixes [Issue #1 Please remove blue color](https://github.com/HookyQR/VSCodeCreateModule/issues/1)

### 0.0.3: 23 Jan 2016
* Improve readability in dark themes. Link color is set to the same as the default vs-dark theme. (#4E94CE) [Issue #1 Please remove blue color](https://github.com/HookyQR/VSCodeCreateModule/issues/1)
* Added ignoring of `. .. ./ ../` for link and generation display. (When that is the only path provided.)

### 0.0.2: 30 Dec 2015
* Improved codeLens handling. No longer duplicates creation suggestions.
* Improved rendering on first load. Previously only the active file would display the codeLens correctly.
* Improved error handling. VS Code error trigger is now unlikely. (Please let us know if you still get it.)

