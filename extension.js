"use strict";
var vscode = require('vscode');
var nodeResolve = require('nodeResolve');
var os = require('os');
var path = require('path');
var fs = require('fs');

var cmdOpen = (os.platform() === 'darwin' ? "Cmd" : "Ctrl") + " + click to open";
var nodeRequireDecoration = vscode.window.createTextEditorDecorationType({
	textDecoration: 'underline',
	color: '#0000ff'
});

function setDecoration(editor, nodeRequire) {
	let hovers = nodeRequire.elements.filter(element => element.target)
		.map(element => {
			let start = editor.document.positionAt(element.start);
			let end = editor.document.positionAt(element.start + element.name.length);
			let result = {
				range: new vscode.Range(start, end),
				hoverMessage: cmdOpen
			};
			return result;
		});
	editor.setDecorations(nodeRequireDecoration, hovers);
}

function NodeRequire(text) {
	this.elements = nodeResolve.findAll(text);
}
NodeRequire.prototype.updateLocations = function(text) {
	this.elements = nodeResolve.findAll(text);
};
NodeRequire.prototype.setLens = function(disposable) {
	this.lens = disposable;
};
NodeRequire.prototype.resolveAll = function(baseName) {
	var promises = this.elements.map(element => {
		return new Promise(resolve => {
			element.target = nodeResolve.resolve(element.name, baseName);
			if (!element.target) element.target = false;
			resolve();
		});
	});
	//drop the ones we don't want
	return Promise.all(promises)
		.then(() => {
			this.elements = this.elements.filter(elem => elem.target !== elem.name);
		});
};

NodeRequire.prototype.getAbsoluteName = function(posn) {
	return new Promise(resolve => {
		var choice = null;
		this.elements.some(el => {
			if (el.start > posn) return true;
			choice = el;
		});
		//this may still return nothing. But that just means it isn't ready yet.
		if (choice && choice.start + choice.name.length >= posn) return resolve(choice.target);
		resolve();
	});
};
var nodeObjects = {};

function filterToValidNode(editor) {
	if (!editor) return;
	if (editor.document.languageId !== 'javascript') return;
	return true;
}
var nodeNewProvider = {
	provideCodeLenses: function(doc) {
		var nreq = nodeObjects[doc.fileName];
		if (!nreq || !nreq.elements) return;
		var lensed = nreq.elements.filter(elem => elem.target === false);
		var rtn = lensed.map(elem => {
			let start = doc.positionAt(elem.start);
			let end = doc.positionAt(elem.start + elem.name.length);
			var title;
			if (elem.name.startsWith("../") || elem.name.startsWith('./') ||
				path.isAbsolute(elem.name)) {
				title = "Create missing module file: '" + elem.name;
				if (!elem.name.endsWith('.js')) title += ".js";
				title += "'";

			} else title = "Create missing node module: '" + elem.name + "'";
			return new vscode.CodeLens(new vscode.Range(start, end), {
				title: title,
				command: "HookyQR.CreateModule",
				arguments: [elem.name]
			});
		});
		return rtn;
	}
};

function setLensIfRequired(fName) {
	//if any of the elements are null, we provide a code lense
	//at anytime we can destroy this and bring up another
	var nreq = nodeObjects[fName];
	if (!nreq || nreq.lens) return;
	var needLens = nreq.elements.some(elem => elem.target === false);
	if (!needLens) return;
	nreq.setLens(vscode.languages.registerCodeLensProvider('javascript', nodeNewProvider));
}

function resetLens(fName) {
	if (!fName) return;
	if (!nodeObjects[fName]) return;
	if (nodeObjects[fName].lens) {
		nodeObjects[fName].lens.dispose();
		delete nodeObjects[fName].lens;
	}
	setLensIfRequired(fName);
}

function setNodeRequire(editor) {
	if (!filterToValidNode(editor)) return;
	var text = editor.document.getText();
	var nreq = nodeObjects[editor.document.fileName];
	if (!nreq) nreq = nodeObjects[editor.document.fileName] = new NodeRequire(text);
	else nreq.updateLocations(text);

	nreq.resolveAll(editor.document.fileName)
		.then(() => setDecoration(editor, nreq))
		.then(() => setLensIfRequired(editor.document.fileName));
}

function dropNodeRequire(document) {
	delete nodeObjects[document.fileName];
}
var nodeProvider = {
	provideDefinition: function(doc, posn) {
		var nodeSet = nodeObjects[doc.fileName];
		if (!nodeSet) return;
		return nodeSet.getAbsoluteName(doc.offsetAt(posn))
			.then(target => {
				if (target === false) return;
				if (!target) return;
				return new vscode.Location(vscode.Uri.file(target), new vscode.Range(0, 0, 0, 0));
			});
	}
};

var changeTimer = 0;

function fileExists(name) {
	return new Promise((resolve, reject) => {
		fs.stat(name, (err, stat) => {
			if (err && err.code === 'ENOENT') return resolve();
			if (err) return reject(err);
			if (stat.isFile()) return resolve("file");
			if (stat.isDirectory()) return resolve("dir");
			return resolve("special");
		});
	});
}

function mkDir(name) {
	return new Promise((resolve, reject) => {
		fs.mkdir(name, err => {
			if (err) reject(err);
			else resolve(name);
		});
	});
}

function ensureDir(name) {
	return fileExists(name)
		.then(exists => {
			if (exists === 'dir') return name;
			if (!exists) return mkDir(name);
			var e = new Error("Not a directory at: " + name);
			e.code = "EEXIST";
			throw e;
		});
}

function mkNewFile(name, data) {
	data = data || "";
	return fileExists(name)
		.then(isFile => {
			if (isFile) {
				var e = new Error(name + " already exists.");
				e.code = "EEXIST";
				throw e;
			}
			return new Promise((resolve, reject) => {
				fs.writeFile(name, data, err => {
					if (err) reject(err);
					else resolve(name);
				});
			});
		});
}

function autoJSName(name) {
	if (!name.endsWith('.js') && !name.endsWith('.json') && !name.endsWith('.node')) name += ".js";
	return name;
}

function pretty(obj, deep) {
	deep = deep || 0;
	var t = "";
	for (let i = 0; i < deep; i++) {
		t += "\t";
	}
	if (Array.isArray(obj)) {
		return t + '[\n' +
			obj.map(o => pretty(o, deep + 1))
			.join('\n') +
			t + ']\n';
	}
	if (typeof obj === 'string') return '"' + obj + '"';
	if (typeof obj === 'number') return obj.toString;
	if (typeof obj === 'boolean') return obj ? "true" : "false";
	if (typeof obj !== 'object') return '""';//what ever this is, we're not dealing with it
	var keys = Object.keys(obj);
	if (keys.length === 0) return "{}\n";
	var strs = keys.map(a => '"' + a + '": ' + pretty(obj[a], deep + 1));
	return "{\n\t" + strs.join(",\n\t" + t) + "\n" + t + "}\n";
}

function doCreateModule(name) {
	//if name is a context, we need to get an input
	if (Array.isArray(name)) name = name[0];
	if (typeof name !== 'string') name = null;
	if (!vscode.window.activeTextEditor) {
		//show error
		return;
	}
	if (!vscode.window.activeTextEditor.document) {
		//show error
		return;
	}
	var sourceEditor = vscode.window.activeTextEditor;
	var baseName = path.dirname(vscode.window.activeTextEditor.document.fileName);

	var prom = Promise.resolve(name);
	if (!name) {
		//setting prom straight to the result of the vscode call doesn't work
		//it complains later about the exception not being caught. (if there is one)
		prom = prom.then(() => vscode.window.showInputBox({
			prompt: "Please provide a name for the module.",
			placeHolder: "Starting with './' creates a file in the same directory."
		}));
	}
	return prom.then(name => {
			if (!name) return;
			if (name.startsWith("./") || name.startsWith("../")) {
				//create locally.
				name = autoJSName(name);
				name = baseName + path.sep + name;
				return mkNewFile(name);
			}
			//node mod must be valid
			baseName += path.sep + "node_modules";
			var cfg = vscode.workspace.getConfiguration('CreateModule');
			return ensureDir(baseName)
				.then(() => {
					//how should we make it? false,true,'index'
					if (name.endsWith('.js') || name.endsWith('.json') || name.endsWith('.node')) {
						return "file";
					}
					if (cfg.packageType === 'ask') {
						var choices = [{
							label: "With package.json",
							description: "Create as a full package. Default package info can be set in your user/workspace settings.",
							value: "package"
										}, {
							label: "With index.js",
							description: "Create as a package, but with no package.json.",
							value: "index"
										}, {
							label: name + ".js",
							description: "Create as a file only.",
							value: "file"
										}];
						return vscode.window.showQuickPick(choices, {
								matchOnDescription: true,
								placeHolder: "Please choose the type of creation you would like"
							})
							.then(choice => choice.value);
					}
					return cfg.packageType;
				})
				.then(type => {
					if (type === 'file') {
						name = autoJSName(name);
						return mkNewFile(baseName + path.sep + name);
					}
					baseName += path.sep + name;
					//at this point, if the directory exists, it's bad
					return fileExists(baseName)
						.then(exists => {
							if (exists) {
								var e = new Error("Target output already exists: " + baseName);
								e.code = "EEXIST";
								throw e;
							}
						})
						.then(() => mkDir(baseName))
						.then(() => {
							if (type === "index") {
								return mkNewFile(baseName + path.sep + "index.js");
							}
							var pkg = cfg.packageDefaults;
							for (let a in pkg) {
								pkg[a] = pkg[a].replace(/\[name\]/g, name);
							}
							if (!pkg.main) pkg.main = 'index.js';
							//create the package file
							return mkNewFile(baseName + path.sep + "package.json", pretty(pkg))
								.then(pkgFile => {
									var mainFilePaths = pkg.main.split('/'); //it's not the path.sep here
									var tail = mainFilePaths.pop();
									tail = autoJSName(tail);
									var finalPoint = Promise.resolve(baseName);
									mainFilePaths.forEach(segment => {
										finalPoint = finalPoint.then(currentPath => ensureDir(currentPath + path.sep + segment));
									});
									return finalPoint.then(finalDir => mkNewFile(finalDir + path.sep + tail))
										.then(outFile => [pkgFile, outFile]);
								});
						});
				});
		})
		.then(files => {
			if (!files) return;
			//at this point, I have the files
			if (typeof files === "string") files = [files];
			if (sourceEditor) resetLens(sourceEditor.document.fileName);
			//now open the created files
			//the text editors aren't stored in any particular order,
			//so we just open in number 1 and 2 and be happy with that.
			var pos = 0;
			//we don't care about any of the errors in here,
			//but if we don't 'catch' them, they make a mess
			files.forEach(f => {
				vscode.workspace.openTextDocument(f)
					.then(doc => {
						vscode.window.showTextDocument(doc, 1 + (pos % 3))
							.then(() => {}, () => {});
						pos++;
					})
					.then(() => {}, () => {});
			});
		})
		.catch(error => {
			if (error.message) error = error.message;
			vscode.window.showErrorMessage(error);
		});
}

function activate(context) {
	vscode.window.onDidChangeActiveTextEditor(editor => {
		setNodeRequire(editor);
	});

	vscode.workspace.onDidChangeTextDocument(() => {
		//put this on a time delay
		if (changeTimer) clearTimeout(changeTimer);
		changeTimer = setTimeout(() => setNodeRequire(vscode.window.activeTextEditor), 200);
	});
	vscode.workspace.onDidOpenTextDocument(() => {
		setNodeRequire(vscode.window.activeTextEditor);
	});
	vscode.workspace.onDidCloseTextDocument(document => {
		dropNodeRequire(document);
	});
	var prov = vscode.languages.registerDefinitionProvider("javascript", nodeProvider);
	context.subscriptions.push(prov);
	prov = vscode.commands.registerCommand('HookyQR.CreateModule', doCreateModule);
	context.subscriptions.push(prov);
}
exports.activate = activate;
