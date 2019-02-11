/**
 * gpu.js
 * http://gpu.rocks/
 *
 * GPU Accelerated JavaScript
 *
 * @version 2.0.0
 * @date Sun Feb 10 2019 22:55:24 GMT-0500 (Eastern Standard Time)
 *
 * @license MIT
 * The MIT License
 *
 * Copyright (c) 2019 gpu.js Team
 */(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){

},{}],2:[function(require,module,exports){
'use strict';

function mock1D() {
  const row = [];
  for (let x = 0; x < this.output.x; x++) {
    this.thread.x = x;
    this.thread.y = 0;
    this.thread.z = 0;
    row.push(this._fn.apply(this, arguments));
  }
  return row;
}

function mock2D() {
  const matrix = [];
  for (let y = 0; y < this.output.y; y++) {
    const row = [];
    for (let x = 0; x < this.output.x; x++) {
      this.thread.x = x;
      this.thread.y = y;
      this.thread.z = 0;
      row.push(this._fn.apply(this, arguments));
    }
    matrix.push(row);
  }
  return matrix;
}

function mock3D() {
  const cube = [];
  for (let z = 0; z < this.output.z; z++) {
    const matrix = [];
    for (let y = 0; y < this.output.y; y++) {
      const row = [];
      for (let x = 0; x < this.output.x; x++) {
        this.thread.x = x;
        this.thread.y = y;
        this.thread.z = z;
        row.push(this._fn.apply(this, arguments));
      }
      matrix.push(row);
    }
    cube.push(matrix);
  }
  return cube;
}

module.exports = function gpuMock(fn, options) {
  let contextOutput = null;
  if (options.output.length) {
    if (options.output.length === 3) {
      contextOutput = { x: options.output[0], y: options.output[1], z: options.output[2] };
    } else if (options.output.length === 2) {
      contextOutput = { x: options.output[0], y: options.output[1] };
    } else {
      contextOutput = { x: options.output[0] };
    }
  } else {
    contextOutput = options.output;
  }

  const context = {
    _fn: fn,
    constants: options.constants,
    output: contextOutput,
    thread: {
      x: 0,
      y: 0,
      z: 0
    }
  };

  if (contextOutput.z) {
    return mock3D.bind(context);
  } else if (contextOutput.y) {
    return mock2D.bind(context);
  } else {
    return mock1D.bind(context);
  }
};

},{}],3:[function(require,module,exports){
const {
	utils
} = require('./utils');

function alias(name, source) {
	const fnString = source.toString();
	return new Function(`return function ${ name } (${ utils.getArgumentNamesFromString(fnString).join(', ') }) {
  ${ utils.getFunctionBodyFromString(fnString) }
}`)();
}

module.exports = {
	alias
};
},{"./utils":28}],4:[function(require,module,exports){
const {
	FunctionNode
} = require('../function-node');

class CPUFunctionNode extends FunctionNode {
	astFunctionExpression(ast, retArr) {

		if (!this.isRootKernel) {
			retArr.push('function');
			retArr.push(' ');
			retArr.push(this.name);
			retArr.push('(');

			for (let i = 0; i < this.argumentNames.length; ++i) {
				const argumentName = this.argumentNames[i];

				if (i > 0) {
					retArr.push(', ');
				}
				retArr.push('user_');
				retArr.push(argumentName);
			}

			retArr.push(') {\n');
		}

		for (let i = 0; i < ast.body.body.length; ++i) {
			this.astGeneric(ast.body.body[i], retArr);
			retArr.push('\n');
		}

		if (!this.isRootKernel) {
			retArr.push('}\n');
		}
		return retArr;
	}

	astReturnStatement(ast, retArr) {
		if (this.isRootKernel) {
			retArr.push('kernelResult = ');
			this.astGeneric(ast.argument, retArr);
			retArr.push(';');
		} else if (this.isSubKernel) {
			retArr.push(`subKernelResult_${ this.name } = `);
			this.astGeneric(ast.argument, retArr);
			retArr.push(';');
			retArr.push(`return subKernelResult_${ this.name };`);
		} else {
			retArr.push('return ');
			this.astGeneric(ast.argument, retArr);
			retArr.push(';');
		}
		return retArr;
	}

	astLiteral(ast, retArr) {

		if (isNaN(ast.value)) {
			throw this.astErrorOutput(
				'Non-numeric literal not supported : ' + ast.value,
				ast
			);
		}

		retArr.push(ast.value);

		return retArr;
	}

	astBinaryExpression(ast, retArr) {
		retArr.push('(');
		this.astGeneric(ast.left, retArr);
		retArr.push(ast.operator);
		this.astGeneric(ast.right, retArr);
		retArr.push(')');
		return retArr;
	}

	astIdentifierExpression(idtNode, retArr) {
		if (idtNode.type !== 'Identifier') {
			throw this.astErrorOutput(
				'IdentifierExpression - not an Identifier',
				idtNode
			);
		}

		switch (idtNode.name) {
			case 'Infinity':
				retArr.push('Infinity');
				break;
			default:
				if (this.constants && this.constants.hasOwnProperty(idtNode.name)) {
					retArr.push('constants_' + idtNode.name);
				} else {
					const name = this.getUserArgumentName(idtNode.name);
					const type = this.getType(idtNode);
					if (name && type && this.parent && type !== 'Number' && type !== 'Integer' && type !== 'LiteralInteger') {
						retArr.push('user_' + name);
					} else {
						retArr.push('user_' + idtNode.name);
					}
				}
		}

		return retArr;
	}

	astForStatement(forNode, retArr) {
		if (forNode.type !== 'ForStatement') {
			throw this.astErrorOutput('Invalid for statement', forNode);
		}

		const initArr = [];
		const testArr = [];
		const updateArr = [];
		const bodyArr = [];
		let isSafe = null;

		if (forNode.init) {
			this.pushState('in-for-loop-init');
			this.astGeneric(forNode.init, initArr);
			for (let i = 0; i < initArr.length; i++) {
				if (initArr[i].includes && initArr[i].includes(',')) {
					isSafe = false;
				}
			}
			this.popState('in-for-loop-init');
		} else {
			isSafe = false;
		}

		if (forNode.test) {
			this.astGeneric(forNode.test, testArr);
		} else {
			isSafe = false;
		}

		if (forNode.update) {
			this.astGeneric(forNode.update, updateArr);
		} else {
			isSafe = false;
		}

		if (forNode.body) {
			this.pushState('loop-body');
			this.astGeneric(forNode.body, bodyArr);
			this.popState('loop-body');
		}

		if (isSafe === null) {
			isSafe = this.isSafe(forNode.init) && this.isSafe(forNode.test);
		}

		if (isSafe) {
			retArr.push(`for (${initArr.join('')};${testArr.join('')};${updateArr.join('')}){\n`);
			retArr.push(bodyArr.join(''));
			retArr.push('}\n');
		} else {
			const iVariableName = this.getInternalVariableName('safeI');
			if (initArr.length > 0) {
				retArr.push(initArr.join(''), ';\n');
			}
			retArr.push(`for (int ${iVariableName}=0;${iVariableName}<LOOP_MAX;${iVariableName}++){\n`);
			if (testArr.length > 0) {
				retArr.push(`if (!${testArr.join('')}) break;\n`);
			}
			retArr.push(bodyArr.join(''));
			retArr.push(`\n${updateArr.join('')};`);
			retArr.push('}\n');
		}
		return retArr;
	}

	astWhileStatement(whileNode, retArr) {
		if (whileNode.type !== 'WhileStatement') {
			throw this.astErrorOutput(
				'Invalid while statement',
				whileNode
			);
		}

		retArr.push('for (let i = 0; i < LOOP_MAX; i++) {');
		retArr.push('if (');
		this.astGeneric(whileNode.test, retArr);
		retArr.push(') {\n');
		this.astGeneric(whileNode.body, retArr);
		retArr.push('} else {\n');
		retArr.push('break;\n');
		retArr.push('}\n');
		retArr.push('}\n');

		return retArr;
	}

	astDoWhileStatement(doWhileNode, retArr) {
		if (doWhileNode.type !== 'DoWhileStatement') {
			throw this.astErrorOutput(
				'Invalid while statement',
				doWhileNode
			);
		}

		retArr.push('for (let i = 0; i < LOOP_MAX; i++) {');
		this.astGeneric(doWhileNode.body, retArr);
		retArr.push('if (!');
		this.astGeneric(doWhileNode.test, retArr);
		retArr.push(') {\n');
		retArr.push('break;\n');
		retArr.push('}\n');
		retArr.push('}\n');

		return retArr;

	}

	astAssignmentExpression(assNode, retArr) {
		this.astGeneric(assNode.left, retArr);
		retArr.push(assNode.operator);
		this.astGeneric(assNode.right, retArr);
		return retArr;
	}

	astBlockStatement(bNode, retArr) {
		if (!this.isState('loop-body')) {
			retArr.push('{\n');
		}
		for (let i = 0; i < bNode.body.length; i++) {
			this.astGeneric(bNode.body[i], retArr);
		}
		if (!this.isState('loop-body')) {
			retArr.push('}\n');
		}
		return retArr;
	}

	astVariableDeclaration(varDecNode, retArr) {
		if (varDecNode.kind === 'var') {
			this.varWarn();
		}
		retArr.push(`${varDecNode.kind} `);
		const firstDeclaration = varDecNode.declarations[0];
		const type = this.getType(firstDeclaration.init);
		for (let i = 0; i < varDecNode.declarations.length; i++) {
			this.declarations[varDecNode.declarations[i].id.name] = {
				type,
				dependencies: {
					constants: [],
					arguments: []
				},
				isUnsafe: false
			};
			if (i > 0) {
				retArr.push(',');
			}
			this.astGeneric(varDecNode.declarations[i], retArr);
		}
		if (!this.isState('in-for-loop-init')) {
			retArr.push(';');
		}
		return retArr;
	}

	astIfStatement(ifNode, retArr) {
		retArr.push('if (');
		this.astGeneric(ifNode.test, retArr);
		retArr.push(')');
		if (ifNode.consequent.type === 'BlockStatement') {
			this.astGeneric(ifNode.consequent, retArr);
		} else {
			retArr.push(' {\n');
			this.astGeneric(ifNode.consequent, retArr);
			retArr.push('\n}\n');
		}

		if (ifNode.alternate) {
			retArr.push('else ');
			if (ifNode.alternate.type === 'BlockStatement') {
				this.astGeneric(ifNode.alternate, retArr);
			} else {
				retArr.push(' {\n');
				this.astGeneric(ifNode.alternate, retArr);
				retArr.push('\n}\n');
			}
		}
		return retArr;

	}

	astThisExpression(tNode, retArr) {
		retArr.push('_this');
		return retArr;
	}

	astMemberExpression(mNode, retArr) {
		const {
			signature,
			type,
			property,
			xProperty,
			yProperty,
			zProperty,
			name,
			origin
		} = this.getMemberExpressionDetails(mNode);
		switch (signature) {
			case 'this.thread.value':
				retArr.push(`_this.thread.${ name }`);
				return retArr;
			case 'this.output.value':
				switch (name) {
					case 'x':
						retArr.push(this.output[0]);
						break;
					case 'y':
						retArr.push(this.output[1]);
						break;
					case 'z':
						retArr.push(this.output[2]);
						break;
					default:
						throw this.astErrorOutput('Unexpected expression', mNode);
				}
				return retArr;
			case 'value':
				throw this.astErrorOutput('Unexpected expression', mNode);
			case 'value[]':
			case 'value[][]':
			case 'value[][][]':
			case 'value.value':
				if (origin === 'Math') {
					retArr.push(Math[name]);
					return retArr;
				}
				switch (property) {
					case 'r':
						retArr.push(`user_${ name }[0]`);
						return retArr;
					case 'g':
						retArr.push(`user_${ name }[1]`);
						return retArr;
					case 'b':
						retArr.push(`user_${ name }[2]`);
						return retArr;
					case 'a':
						retArr.push(`user_${ name }[3]`);
						return retArr;
				}
				break;
			case 'this.constants.value':
			case 'this.constants.value[]':
			case 'this.constants.value[][]':
			case 'this.constants.value[][][]':
				break;
			case 'fn()[]':
				this.astGeneric(mNode.object, retArr);
				retArr.push('[');
				this.astGeneric(mNode.property, retArr);
				retArr.push(']');
				return retArr;
			default:
				throw this.astErrorOutput('Unexpected expression', mNode);
		}

		if (type === 'Number' || type === 'Integer') {
			retArr.push(`${origin}_${name}`);
			return retArr;
		}

		let synonymName;
		if (this.parent) {
			synonymName = this.getUserArgumentName(name);
		}

		const markupName = `${origin}_${synonymName || name}`;

		switch (type) {
			case 'Array(2)':
			case 'Array(3)':
			case 'Array(4)':
			case 'HTMLImageArray':
			case 'ArrayTexture(4)':
			case 'HTMLImage':
			default:
				const isInput = this.isInput(synonymName || name);
				retArr.push(`${ markupName }`);
				if (zProperty && yProperty) {
					if (isInput) {
						const size = this.argumentSizes[this.argumentNames.indexOf(name)];
						retArr.push('[(');
						this.astGeneric(zProperty, retArr);
						retArr.push(`*${ size[1] * size[0]})+(`);
						this.astGeneric(yProperty, retArr);
						retArr.push(`*${ size[0] })+`);
						this.astGeneric(xProperty, retArr);
						retArr.push(']');
					} else {
						retArr.push('[');
						this.astGeneric(zProperty, retArr);
						retArr.push(']');
						retArr.push('[');
						this.astGeneric(yProperty, retArr);
						retArr.push(']');
						retArr.push('[');
						this.astGeneric(xProperty, retArr);
						retArr.push(']');
					}
				} else if (yProperty) {
					if (isInput) {
						const size = this.argumentSizes[this.argumentNames.indexOf(name)];
						retArr.push('[(');
						this.astGeneric(yProperty, retArr);
						retArr.push(`*${ size[0] })+`);
						this.astGeneric(xProperty, retArr);
						retArr.push(']');
					} else {
						retArr.push('[');
						this.astGeneric(yProperty, retArr);
						retArr.push(']');
						retArr.push('[');
						this.astGeneric(xProperty, retArr);
						retArr.push(']');
					}
				} else {
					retArr.push('[');
					this.astGeneric(xProperty, retArr);
					retArr.push(']');
				}
		}
		return retArr;
	}

	astCallExpression(ast, retArr) {
		if (ast.callee) {
			let funcName = this.astMemberExpressionUnroll(ast.callee);

			if (this.calledFunctions.indexOf(funcName) < 0) {
				this.calledFunctions.push(funcName);
			}
			if (!this.calledFunctionsArguments[funcName]) {
				this.calledFunctionsArguments[funcName] = [];
			}

			const functionArguments = [];
			this.calledFunctionsArguments[funcName].push(functionArguments);

			retArr.push(funcName);

			retArr.push('(');

			for (let i = 0; i < ast.arguments.length; ++i) {
				const argument = ast.arguments[i];
				if (i > 0) {
					retArr.push(', ');
				}
				this.astGeneric(argument, retArr);
				const argumentType = this.getType(argument);
				if (argumentType) {
					functionArguments.push({
						name: argument.name || null,
						type: argumentType
					});
				} else {
					functionArguments.push(null);
				}
			}

			retArr.push(')');

			return retArr;
		}

		throw this.astErrorOutput(
			'Unknown CallExpression',
			ast
		);
	}

	astArrayExpression(arrNode, retArr) {
		const arrLen = arrNode.elements.length;

		retArr.push('[');
		for (let i = 0; i < arrLen; ++i) {
			if (i > 0) {
				retArr.push(', ');
			}
			const subNode = arrNode.elements[i];
			this.astGeneric(subNode, retArr)
		}
		retArr.push(']');

		return retArr;
	}

	astDebuggerStatement(arrNode, retArr) {
		retArr.push('debugger;');
		return retArr;
	}

	varWarn() {
		console.warn('var declarations are not supported, weird things happen.  Use const or let');
	}
}

module.exports = {
	CPUFunctionNode
};
},{"../function-node":8}],5:[function(require,module,exports){
const {
	utils
} = require('../../utils');
const {
	kernelRunShortcut
} = require('../../kernel-run-shortcut');

function removeFnNoise(fn) {
	if (/^function /.test(fn)) {
		fn = fn.substring(9);
	}
	return fn.replace(/[_]typeof/g, 'typeof');
}

function removeNoise(str) {
	return str
		.replace(/^[A-Za-z]+/, 'function')
		.replace(/[_]typeof/g, 'typeof');
}

function cpuKernelString(cpuKernel, name) {
	return `() => {
    ${ kernelRunShortcut.toString() };
    const utils = {
      allPropertiesOf: ${ removeNoise(utils.allPropertiesOf.toString()) },
      clone: ${ removeNoise(utils.clone.toString()) },
    };
    let Input = function() {};
    class ${ name || 'Kernel' } {
      constructor() {        
        this.argumentsLength = 0;
        this.canvas = null;
        this.context = null;
        this.built = false;
        this.program = null;
        this.argumentNames = ${ JSON.stringify(cpuKernel.argumentNames) };
        this.argumentTypes = ${ JSON.stringify(cpuKernel.argumentTypes) };
        this.argumentSizes = ${ JSON.stringify(cpuKernel.argumentSizes) };
        this.output = ${ JSON.stringify(cpuKernel.output) };
        this._kernelString = \`${ cpuKernel._kernelString }\`;
        this.output = ${ JSON.stringify(cpuKernel.output) };
		    this.run = function() {
          this.run = null;
          this.build(arguments);
          return this.run.apply(this, arguments);
        }.bind(this);
        this.thread = {
          x: 0,
          y: 0,
          z: 0
        };
      }
      setCanvas(canvas) { this.canvas = canvas; return this; }
      setContext(context) { this.context = context; return this; }
      setInput(Type) { Input = Type; }
      ${ removeFnNoise(cpuKernel.build.toString()) }
      setupArguments() {}
      ${ removeFnNoise(cpuKernel.setupConstants.toString()) }
      run () { ${ cpuKernel.kernelString } }
      getKernelString() { return this._kernelString; }
      ${ removeFnNoise(cpuKernel.validateSettings.toString()) }
      ${ removeFnNoise(cpuKernel.checkOutput.toString()) }
    };
    return kernelRunShortcut(new Kernel());
  };`;
}

module.exports = {
	cpuKernelString
};
},{"../../kernel-run-shortcut":25,"../../utils":28}],6:[function(require,module,exports){
const {
	Kernel
} = require('../kernel');
const {
	FunctionBuilder
} = require('../function-builder');
const {
	CPUFunctionNode
} = require('./function-node');
const {
	utils
} = require('../../utils');
const {
	cpuKernelString
} = require('./kernel-string');

class CPUKernel extends Kernel {
	static getFeatures() {
		return this.features;
	}
	static get features() {
		return Object.freeze({
			kernelMap: true,
			isIntegerDivisionAccurate: true
		});
	}
	static get isSupported() {
		return true;
	}
	static isContextMatch(context) {
		return false;
	}
	static get mode() {
		return 'cpu';
	}

	constructor(source, settings) {
		super(source, settings);

		this.mergeSettings(source.settings || settings);

		this._imageData = null;
		this._colorData = null;
		this._kernelString = null;
		this.thread = {
			x: 0,
			y: 0,
			z: 0
		};

		this.run = function() { 
			this.run = null;
			this.build.apply(this, arguments);
			return this.run.apply(this, arguments);
		}.bind(this);
	}

	initCanvas() {
		if (typeof document !== 'undefined') {
			return document.createElement('canvas');
		} else if (typeof OffscreenCanvas !== 'undefined') {
			return new OffscreenCanvas(0, 0);
		}
	}

	initContext() {
		if (!this.canvas) return null;
		return this.canvas.getContext('2d');
	}

	initPlugins(settings) {
		return [];
	}

	validateSettings() {
		if (!this.output || this.output.length === 0) {
			if (arguments.length !== 1) {
				throw 'Auto dimensions only supported for kernels with only one input';
			}

			const argType = utils.getVariableType(arguments[0]);
			if (argType === 'Array') {
				this.output = utils.getDimensions(argType);
			} else if (argType === 'NumberTexture' || argType === 'ArrayTexture(4)') {
				this.output = arguments[0].output;
			} else {
				throw 'Auto dimensions not supported for input type: ' + argType;
			}
		}

		this.checkOutput();
	}

	build() {
		this.setupConstants();
		this.setupArguments(arguments);
		this.validateSettings();

		if (this.graphical) {
			const {
				canvas,
				output
			} = this;
			if (!canvas) {
				throw new Error('no canvas available for using graphical output');
			}
			const width = output[0];
			const height = output[1] || 1;
			canvas.width = width;
			canvas.height = height;
			this._imageData = this.context.createImageData(width, height);
			this._colorData = new Uint8ClampedArray(width * height * 4);
		}

		const kernelString = this.getKernelString();
		this.kernelString = kernelString;

		if (this.debug) {
			console.log('Function output:');
			console.log(kernelString);
		}

		try {
			this.run = new Function([], kernelString).bind(this)();
		} catch (e) {
			console.error('An error occurred compiling the javascript: ', e);
		}
	}

	color(r, g, b, a) {
		if (typeof a === 'undefined') {
			a = 1;
		}

		r = Math.floor(r * 255);
		g = Math.floor(g * 255);
		b = Math.floor(b * 255);
		a = Math.floor(a * 255);

		const width = this.output[0];
		const height = this.output[1];

		const x = this.thread.x;
		const y = height - this.thread.y - 1;

		const index = x + y * width;

		this._colorData[index * 4 + 0] = r;
		this._colorData[index * 4 + 1] = g;
		this._colorData[index * 4 + 2] = b;
		this._colorData[index * 4 + 3] = a;
	}

	getKernelString() {
		if (this._kernelString !== null) return this._kernelString;

		const functionBuilder = FunctionBuilder.fromKernel(this, CPUFunctionNode);

		let prototypes = functionBuilder.getPrototypes('kernel');
		let kernel = null;
		if (prototypes.length > 1) {
			prototypes = prototypes.filter(fn => {
				if (/^function/.test(fn)) return fn;
				kernel = fn;
				return false;
			})
		} else {
			kernel = prototypes.shift();
		}
		const kernelString = this._kernelString = `
		const LOOP_MAX = ${ this._getLoopMaxString() }
		const constants = this.constants;
		const _this = this;
    return function (${ this.argumentNames.map(argumentName => 'user_' + argumentName).join(', ') }) {
      ${ this._processConstants() }
      ${ this._processArguments() }
      ${ this._kernelLoop(kernel) }
      if (this.graphical) {
        this._imageData.data.set(this._colorData);
        this.context.putImageData(this._imageData, 0, 0);
        return;
      }
      ${ this._kernelOutput() }
      ${ prototypes.length > 0 ? prototypes.join('\n') : '' }
    }.bind(this);`;
		return kernelString;
	}

	toString() {
		return cpuKernelString(this);
	}

	_getLoopMaxString() {
		return (
			this.loopMaxIterations ?
			` ${ parseInt(this.loopMaxIterations) };\n` :
			' 1000;\n'
		);
	}

	_processConstants() {
		if (!this.constants) return '';

		const result = [];
		for (let p in this.constants) {
			const type = this.constantTypes[p];
			switch (type) {
				case 'HTMLImage':
					result.push(`  const constants_${p} = this._imageTo2DArray(this.constants.${p});`);
					break;
				case 'HTMLImageArray':
					result.push(`  const constants_${p} = this._imageTo3DArray(this.constants.${p});`);
					break;
				case 'Input':
					result.push(`  const constants_${p} = this.constants.${p}.value;`);
					break;
				default:
					result.push(`  const constants_${p} = this.constants.${p};`);
			}
		}
		return result.join('\n');
	}

	_processArguments() {
		const result = [];
		for (let i = 0; i < this.argumentTypes.length; i++) {
			switch (this.argumentTypes[i]) {
				case 'HTMLImage':
					result.push(`  user_${this.argumentNames[i]} = this._imageTo2DArray(user_${this.argumentNames[i]});`);
					break;
				case 'HTMLImageArray':
					result.push(`  user_${this.argumentNames[i]} = this._imageTo3DArray(user_${this.argumentNames[i]});`);
					break;
				case 'Input':
					result.push(`  user_${this.argumentNames[i]} = user_${this.argumentNames[i]}.value;`);
					break;
			}
		}
		return result.join(';\n');
	}

	_imageTo2DArray(image) {
		const canvas = this.canvas;
		if (canvas.width < image.width) {
			canvas.width = image.width;
		}
		if (canvas.height < image.height) {
			canvas.height = image.height;
		}
		const ctx = this.context;
		ctx.drawImage(image, 0, 0, image.width, image.height);
		const pixelsData = ctx.getImageData(0, 0, image.width, image.height).data;
		const imageArray = new Array(image.height);
		let index = 0;
		for (let y = image.height - 1; y >= 0; y--) {
			imageArray[y] = new Array(image.width);
			for (let x = 0; x < image.width; x++) {
				const r = pixelsData[index++] / 255;
				const g = pixelsData[index++] / 255;
				const b = pixelsData[index++] / 255;
				const a = pixelsData[index++] / 255;
				imageArray[y][x] = [r, g, b, a];
			}
		}
		return imageArray;
	}

	_imageTo3DArray(images) {
		const imagesArray = new Array(images.length);
		for (let i = 0; i < images.length; i++) {
			imagesArray[i] = this._imageTo2DArray(images[i]);
		}
		return imagesArray;
	}

	_kernelLoop(kernelString) {
		switch (this.output.length) {
			case 1:
				return this._kernel1DLoop(kernelString);
			case 2:
				return this._kernel2DLoop(kernelString);
			case 3:
				return this._kernel3DLoop(kernelString);
			default:
				throw new Error('unsupported size kernel');
		}
	}

	_kernel1DLoop(kernelString) {
		const {
			output
		} = this;
		return `const result = new Float32Array(${ output[0] });
    ${ this._mapSubKernels(subKernel => `let subKernelResult_${ subKernel.name };`).join('\n') }
		${ this._mapSubKernels(subKernel => `const result_${ subKernel.name } = new Float32Array(${ output[0] });\n`).join('') }
    for (let x = 0; x < ${ output[0] }; x++) {
      this.thread.x = x;
      this.thread.y = 0;
      this.thread.z = 0;
      let kernelResult;
      ${ kernelString }
      result[x] = kernelResult;
      ${ this._mapSubKernels(subKernel => `result_${ subKernel.name }[x] = subKernelResult_${ subKernel.name };\n`).join('') }
    }`;
	}

	_kernel2DLoop(kernelString) {
		const {
			output
		} = this;
		return `const result = new Array(${ output[1] });
    ${ this._mapSubKernels(subKernel => `let subKernelResult_${ subKernel.name };`).join('\n') }
    ${ this._mapSubKernels(subKernel => `const result_${ subKernel.name } = new Array(${ output[1] });\n`).join('') }
    for (let y = 0; y < ${ output[1] }; y++) {
      this.thread.z = 0;
      this.thread.y = y;
      const resultX = result[y] = new Float32Array(${ output[0] });
      ${ this._mapSubKernels(subKernel => `const result_${ subKernel.name }X = result_${subKernel.name}[y] = new Float32Array(${ output[0] });\n`).join('') }
      for (let x = 0; x < ${ output[0] }; x++) {
      	this.thread.x = x;
        let kernelResult;
        ${ kernelString }
        resultX[x] = kernelResult;
        ${ this._mapSubKernels(subKernel => `result_${ subKernel.name }X[x] = subKernelResult_${ subKernel.name };\n`).join('') }
      }
    }`;
	}

	_kernel3DLoop(kernelString) {
		const {
			output
		} = this;
		return `const result = new Array(${ output[2] });
    ${ this._mapSubKernels(subKernel => `let subKernelResult_${ subKernel.name };`).join('\n') }
    ${ this._mapSubKernels(subKernel => `const result_${ subKernel.name } = new Array(${ output[2] });\n`).join('') }
    for (let z = 0; z < ${ output[2] }; z++) {
      this.thread.z = z;
      const resultY = result[z] = new Array(${ output[1] });
      ${ this._mapSubKernels(subKernel => `const result_${ subKernel.name }Y = result_${subKernel.name}[z] = new Array(${ output[1] });\n`).join('') }
      for (let y = 0; y < ${ output[1] }; y++) {
        this.thread.y = y;
        const resultX = resultY[y] = new Float32Array(${ output[0] });
        ${ this._mapSubKernels(subKernel => `const result_${ subKernel.name }X = result_${subKernel.name}Y[y] = new Float32Array(${ output[0] });\n`).join('') }
        for (let x = 0; x < ${ output[0] }; x++) {
        	this.thread.x = x;
          let kernelResult;
          ${ kernelString }
          resultX[x] = kernelResult;
          ${ this._mapSubKernels(subKernel => `result_${ subKernel.name }X[x] = subKernelResult_${ subKernel.name };\n`).join('') }
        }
      }
    }`;
	}

	_kernelOutput() {
		if (!this.subKernels) {
			return 'return result;';
		}
		return `return {
      result: result,
      ${ this.subKernels.map(subKernel => `${ subKernel.property }: result_${ subKernel.name }`).join(',\n') }
    };`;
	}

	_mapSubKernels(fn) {
		return this.subKernels === null ? [''] :
			this.subKernels.map(fn);
	}

	destroy(removeCanvasReference) {
		if (removeCanvasReference) {
			delete this.canvas;
		}
	}

	static destroyContext(context) {}

	toJSON() {
		const json = super.toJSON();
		json.functionNodes = FunctionBuilder.fromKernel(this, CPUFunctionNode).toJSON();
		return json;
	}
}

module.exports = {
	CPUKernel
};
},{"../../utils":28,"../function-builder":7,"../kernel":11,"./function-node":4,"./kernel-string":5}],7:[function(require,module,exports){
class FunctionBuilder {
	static fromKernel(kernel, FunctionNode, extraNodeOptions) {
		const {
			argumentNames,
			argumentTypes,
			argumentSizes,
			constants,
			constantTypes,
			debug,
			loopMaxIterations,
			nativeFunctions,
			output,
			plugins,
			source,
			subKernels,
			functions,
		} = kernel;

		const onNestedFunction = (fnString, returnType) => {
			functionBuilder.addFunctionNode(new FunctionNode(fnString, Object.assign({}, nodeOptions, {
				returnType
			})));
		};

		const lookupReturnType = (functionName) => {
			return functionBuilder.lookupReturnType(functionName);
		};

		const nodeOptions = Object.assign({
			isRootKernel: false,
			onNestedFunction,
			lookupReturnType,
			constants,
			constantTypes,
			debug,
			loopMaxIterations,
			output,
			plugins,
		}, extraNodeOptions || {});

		const rootNodeOptions = Object.assign({}, nodeOptions, {
			isRootKernel: true,
			name: 'kernel',
			argumentNames,
			argumentTypes,
			argumentSizes,
		});

		if (typeof source === 'object' && source.functionNodes) {
			return new FunctionBuilder().fromJSON(source.functionNodes, FunctionNode);
		}

		const rootNode = new FunctionNode(source, rootNodeOptions);

		let functionNodes = null;
		if (functions) {
			functionNodes = functions.map((fn) => new FunctionNode(fn.source, {
				returnType: fn.returnType,
				argumentTypes: fn.argumentTypes,
				output,
				plugins,
				constants,
				constantTypes,
			}));
		}

		let subKernelNodes = null;
		if (subKernels) {
			subKernelNodes = subKernels.map((subKernel) => {
				const {
					name,
					source
				} = subKernel;
				return new FunctionNode(source, Object.assign({}, nodeOptions, {
					name,
					isSubKernel: true,
					isRootKernel: false
				}));
			});
		}

		const functionBuilder = new FunctionBuilder({
			rootNode,
			functionNodes,
			nativeFunctions,
			subKernelNodes
		});

		return functionBuilder;
	}

	constructor(settings) {
		settings = settings || {};
		this.rootNode = settings.rootNode;
		this.functionNodes = settings.functionNodes || [];
		this.subKernelNodes = settings.subKernelNodes || [];
		this.nativeFunctions = settings.nativeFunctions || [];
		this.functionMap = {};
		this.nativeFunctionNames = [];

		if (this.rootNode) {
			this.functionMap['kernel'] = this.rootNode;
		}

		if (this.functionNodes) {
			for (let i = 0; i < this.functionNodes.length; i++) {
				this.functionMap[this.functionNodes[i].name] = this.functionNodes[i];
			}
		}

		if (this.subKernelNodes) {
			for (let i = 0; i < this.subKernelNodes.length; i++) {
				this.functionMap[this.subKernelNodes[i].name] = this.subKernelNodes[i];
			}
		}

		if (this.nativeFunctions) {
			for (let i = 0; i < this.nativeFunctions.length; i++) {
				this.nativeFunctionNames.push(this.nativeFunctions[i].name);
			}
		}
	}

	addFunctionNode(functionNode) {
		this.functionMap[functionNode.name] = functionNode;
		if (functionNode.isRootKernel) {
			this.rootNode = functionNode;
		}
	}

	traceFunctionCalls(functionName, retList, parent) {
		functionName = functionName || 'kernel';
		retList = retList || [];

		if (this.nativeFunctionNames.indexOf(functionName) > -1) {
			if (retList.indexOf(functionName) >= 0) {
			} else {
				retList.push(functionName);
			}
			return retList;
		}

		const functionNode = this.functionMap[functionName];
		if (functionNode) {
			const functionIndex = retList.indexOf(functionName);
			if (functionIndex === -1) {
				retList.push(functionName);
				if (parent) {
					functionNode.parent = parent;
				}
				functionNode.toString(); 
				for (let i = 0; i < functionNode.calledFunctions.length; ++i) {
					this.traceFunctionCalls(functionNode.calledFunctions[i], retList, functionNode);
				}
			} else {
				const dependantFunctionName = retList.splice(functionIndex, 1)[0];
				retList.push(dependantFunctionName);
			}
		}

		return retList;
	}

	getPrototypeString(functionName) {
		return this.getPrototypes(functionName).join('\n');
	}

	getPrototypes(functionName) {
		if (this.rootNode) {
			this.rootNode.toString();
		}
		if (functionName) {
			return this.getPrototypesFromFunctionNames(this.traceFunctionCalls(functionName, []).reverse());
		}
		return this.getPrototypesFromFunctionNames(Object.keys(this.functionMap));
	}

	getStringFromFunctionNames(functionList) {
		const ret = [];
		for (let i = 0; i < functionList.length; ++i) {
			const node = this.functionMap[functionList[i]];
			if (node) {
				ret.push(this.functionMap[functionList[i]].toString());
			}
		}
		return ret.join('\n');
	}

	getPrototypesFromFunctionNames(functionList) {
		const ret = [];
		for (let i = 0; i < functionList.length; ++i) {
			const functionName = functionList[i];
			const functionIndex = this.nativeFunctionNames.indexOf(functionName);
			if (functionIndex > -1) {
				ret.push(this.nativeFunctions[functionIndex].source);
				continue;
			}
			const node = this.functionMap[functionName];
			if (node) {
				ret.push(node.toString());
			}
		}
		return ret;
	}

	toJSON() {
		return this.traceFunctionCalls(this.rootNode.name).reverse().map(name => {
			if (this.nativeFunctions[name]) {
				return {
					name,
					source: this.nativeFunctions[name]
				};
			} else if (this.functionMap[name]) {
				return this.functionMap[name].toJSON();
			} else {
				throw new Error(`function ${ name } not found`);
			}
		});
	}

	fromJSON(jsonFunctionNodes, FunctionNode) {
		this.functionMap = {};
		for (let i = 0; i < jsonFunctionNodes.length; i++) {
			const jsonFunctionNode = jsonFunctionNodes[i];
			this.functionMap[jsonFunctionNode.settings.name] = new FunctionNode(jsonFunctionNode.ast, jsonFunctionNode.settings);
		}
		return this;
	}

	getString(functionName) {
		if (functionName) {
			return this.getStringFromFunctionNames(this.traceFunctionCalls(functionName).reverse());
		}
		return this.getStringFromFunctionNames(Object.keys(this.functionMap));
	}

	lookupReturnType(functionName) {
		const node = this.functionMap[functionName];
		if (node && node.returnType) {
			return node.returnType;
		}
		return null;
	}
}

module.exports = {
	FunctionBuilder
};
},{}],8:[function(require,module,exports){
const {
	utils
} = require('../utils');
const acorn = require('acorn');

class FunctionNode {
	constructor(source, settings) {
		if (!source) {
			throw new Error('source parameter is missing');
		}
		settings = settings || {};

		this.source = source;
		this.name = typeof source === 'string' ? settings.isRootKernel ?
			'kernel' :
			(settings.name || utils.getFunctionNameFromString(source)) : null;
		this.calledFunctions = [];
		this.calledFunctionsArguments = {};
		this.constants = {};
		this.constantTypes = {};
		this.isRootKernel = false;
		this.isSubKernel = false;
		this.parent = null;
		this.debug = null;
		this.declarations = {};
		this.states = [];
		this.lookupReturnType = null;
		this.onNestedFunction = null;
		this.loopMaxIterations = null;
		this.argumentNames = (typeof this.source === 'string' ? utils.getArgumentNamesFromString(this.source) : null);
		this.argumentTypes = [];
		this.argumentSizes = [];
		this.returnType = null;
		this.output = [];
		this.plugins = null;

		if (settings) {
			for (const p in settings) {
				if (!settings.hasOwnProperty(p)) continue;
				if (!this.hasOwnProperty(p)) continue;
				this[p] = settings[p];
			}
		}

		if (!this.returnType) {
			this.returnType = 'Number';
		}

		this.validate();
		this._string = null;
		this._internalVariableNames = {};
	}

	validate() {
		if (typeof this.source !== 'string') {
			throw new Error('this.source not a string');
		}

		if (!utils.isFunctionString(this.source)) {
			throw new Error('this.source not a function string');
		}

		if (!this.name) {
			throw new Error('this.name could not be set');
		}

		if (this.argumentTypes.length > 0 && this.argumentTypes.length !== this.argumentNames.length) {
			throw new Error(`argumentTypes count of ${ this.argumentTypes.length } exceeds ${ this.argumentNames.length }`);
		}

		if (this.output.length < 1) {
			throw new Error('this.output is not big enough');
		}
	}

	isIdentifierConstant(name) {
		if (!this.constants) return false;
		return this.constants.hasOwnProperty(name);
	}

	isInput(argumentName) {
		return this.argumentTypes[this.argumentNames.indexOf(argumentName)] === 'Input';
	}

	pushState(state) {
		this.states.push(state);
	}

	popState(state) {
		if (this.state !== state) {
			throw new Error(`Cannot popState ${ state } when in ${ this.state }`);
		}
		this.states.pop();
	}

	isState(state) {
		return this.state === state;
	}

	get state() {
		return this.states[this.states.length - 1];
	}

	astMemberExpressionUnroll(ast) {
		if (ast.type === 'Identifier') {
			return ast.name;
		} else if (ast.type === 'ThisExpression') {
			return 'this';
		}

		if (ast.type === 'MemberExpression') {
			if (ast.object && ast.property) {
				if (ast.object.hasOwnProperty('name') && ast.object.name[0] === '_') {
					return this.astMemberExpressionUnroll(ast.property);
				}

				return (
					this.astMemberExpressionUnroll(ast.object) +
					'.' +
					this.astMemberExpressionUnroll(ast.property)
				);
			}
		}

		if (ast.hasOwnProperty('expressions')) {
			const firstExpression = ast.expressions[0];
			if (firstExpression.type === 'Literal' && firstExpression.value === 0 && ast.expressions.length === 2) {
				return this.astMemberExpressionUnroll(ast.expressions[1]);
			}
		}

		throw this.astErrorOutput('Unknown astMemberExpressionUnroll', ast);
	}

	getJsAST(inParser) {
		if (typeof this.source === 'object') {
			return this.ast = this.source;
		}

		inParser = inParser || acorn;
		if (inParser === null) {
			throw 'Missing JS to AST parser';
		}

		const ast = Object.freeze(inParser.parse(`const parser_${ this.name } = ${ this.source };`, {
			locations: true
		}));
		const functionAST = ast.body[0].declarations[0].init;
		if (!ast) {
			throw new Error('Failed to parse JS code');
		}

		return this.ast = functionAST;
	}

	getVariableType(name) {
		let type = null;
		const argumentIndex = this.argumentNames.indexOf(name);
		if (argumentIndex === -1) {
			if (this.declarations[name]) {
				return this.declarations[name].type;
			}
		} else {
			const argumentType = this.argumentTypes[argumentIndex];
			if (argumentType) {
				type = argumentType;
			} else if (this.parent) {
				const calledFunctionArguments = this.parent.calledFunctionsArguments[this.name];
				for (let i = 0; i < calledFunctionArguments.length; i++) {
					const calledFunctionArgument = calledFunctionArguments[i];
					if (calledFunctionArgument[argumentIndex] !== null) {
						type = calledFunctionArgument[argumentIndex].type;
						this.argumentTypes[argumentIndex] = type;
						break;
					}
				}
			}
		}
		if (!type) {
		}
		return type;
	}

	getConstantType(constantName) {
		if (this.constantTypes[constantName]) {
			const type = this.constantTypes[constantName];
			if (type === 'Float') {
				return 'Number';
			} else {
				return type;
			}
		}
		return null;
	}

	getUserArgumentName(name) {
		const argumentIndex = this.argumentNames.indexOf(name);
		if (argumentIndex === -1) return null;
		if (!this.parent || this.isRootKernel) return null;
		const calledFunctionArguments = this.parent.calledFunctionsArguments[this.name];
		for (let i = 0; i < calledFunctionArguments.length; i++) {
			const calledFunctionArgument = calledFunctionArguments[i];
			const argument = calledFunctionArgument[argumentIndex];
			if (argument && argument.type !== 'Integer' && argument.type !== 'LiteralInteger' && argument.type !== 'Number') {
				return argument.name;
			}
		}
		return null;
	}

	toString() {
		if (this._string) return this._string;
		return this._string = this.astGeneric(this.getJsAST(), []).join('').trim();
	}

	toJSON() {
		const settings = {
			source: this.source,
			name: this.name,
			constants: this.constants,
			constantTypes: this.constantTypes,
			isRootKernel: this.isRootKernel,
			isSubKernel: this.isSubKernel,
			debug: this.debug,
			output: this.output,
			loopMaxIterations: this.loopMaxIterations,
			argumentNames: this.argumentNames,
			argumentTypes: this.argumentTypes,
			argumentSizes: this.argumentSizes,
			returnType: this.returnType
		};

		return {
			ast: this.ast,
			settings
		};
	}

	getType(ast) {
		if (Array.isArray(ast)) {
			return this.getType(ast[ast.length - 1]);
		}
		switch (ast.type) {
			case 'BlockStatement':
				return this.getType(ast.body);
			case 'ArrayExpression':
				return `Array(${ ast.elements.length })`;
			case 'Literal':
				if (Number.isInteger(ast.value)) {
					return 'LiteralInteger';
				} else {
					return 'Number';
				}
			case 'CallExpression':
				if (this.isAstMathFunction(ast)) {
					return 'Number';
				}
				return ast.callee && ast.callee.name && this.lookupReturnType ? this.lookupReturnType(ast.callee.name) : null;
			case 'BinaryExpression':
				if (ast.operator === '%') {
					return 'Number';
				} else if (ast.operator === '>' || ast.operator === '<') {
					return 'Boolean';
				}
				const type = this.getType(ast.left);
				return typeLookupMap[type] || type;
			case 'UpdateExpression':
				return this.getType(ast.argument);
			case 'UnaryExpression':
				return this.getType(ast.argument);
			case 'VariableDeclaration':
				return this.getType(ast.declarations[0]);
			case 'VariableDeclarator':
				return this.getType(ast.id);
			case 'Identifier':
				if (this.isAstVariable(ast)) {
					const signature = this.getVariableSignature(ast);
					if (signature === 'value') {
						if (this.argumentNames.indexOf(ast.name) > -1) {
							return this.getVariableType(ast.name);
						} else if (this.declarations[ast.name]) {
							return this.declarations[ast.name].type;
						}
					}
				}
				if (ast.name === 'Infinity') {
					return 'Integer';
				}
				return null;
			case 'ReturnStatement':
				return this.getType(ast.argument);
			case 'MemberExpression':
				if (this.isAstMathFunction(ast)) {
					switch (ast.property.name) {
						case 'ceil':
							return 'Integer';
						case 'floor':
							return 'Integer';
						case 'round':
							return 'Integer';
					}
					return 'Number';
				}
				if (this.isAstVariable(ast)) {
					const variableSignature = this.getVariableSignature(ast);
					switch (variableSignature) {
						case 'value[]':
							return typeLookupMap[this.getVariableType(ast.object.name)];
						case 'value[][]':
							return typeLookupMap[this.getVariableType(ast.object.object.name)];
						case 'value[][][]':
							return typeLookupMap[this.getVariableType(ast.object.object.object.name)];
						case 'this.thread.value':
							return 'Integer';
						case 'this.output.value':
							return 'Integer';
						case 'this.constants.value':
							return this.getConstantType(ast.property.name);
						case 'this.constants.value[]':
							return typeLookupMap[this.getConstantType(ast.object.property.name)];
						case 'this.constants.value[][]':
							return typeLookupMap[this.getConstantType(ast.object.object.property.name)];
						case 'this.constants.value[][][]':
							return typeLookupMap[this.getConstantType(ast.object.object.object.property.name)];
						case 'fn()[]':
							return typeLookupMap[this.getType(ast.object)];
						case 'fn()[][]':
							return typeLookupMap[this.getType(ast.object)];
						case 'fn()[][][]':
							return typeLookupMap[this.getType(ast.object)];
						case 'value.value':
							if (this.isAstMathVariable(ast)) {
								return 'Number';
							}
							switch (ast.property.name) {
								case 'r':
									return typeLookupMap[this.getVariableType(ast.object.name)];
								case 'g':
									return typeLookupMap[this.getVariableType(ast.object.name)];
								case 'b':
									return typeLookupMap[this.getVariableType(ast.object.name)];
								case 'a':
									return typeLookupMap[this.getVariableType(ast.object.name)];
							}
					}
					throw this.astErrorOutput('Unhandled getType MemberExpression', ast);
				}
				throw this.astErrorOutput('Unhandled getType MemberExpression', ast);
			case 'FunctionDeclaration':
				return this.getType(ast.body);
			case 'ConditionalExpression':
				return this.getType(ast.consequent);
			default:
				throw this.astErrorOutput(`Unhandled getType Type "${ ast.type }"`, ast);
		}
	}

	isAstMathVariable(ast) {
		const mathProperties = [
			'E',
			'PI',
			'SQRT2',
			'SQRT1_2',
			'LN2',
			'LN10',
			'LOG2E',
			'LOG10E',
		];
		return ast.type === 'MemberExpression' &&
			ast.object && ast.object.type === 'Identifier' &&
			ast.object.name === 'Math' &&
			ast.property &&
			ast.property.type === 'Identifier' &&
			mathProperties.indexOf(ast.property.name) > -1;
	}

	isAstMathFunction(ast) {
		const mathFunctions = [
			'abs',
			'acos',
			'asin',
			'atan',
			'atan2',
			'ceil',
			'cos',
			'exp',
			'floor',
			'log',
			'log2',
			'max',
			'min',
			'pow',
			'random',
			'round',
			'sign',
			'sin',
			'sqrt',
			'tan',
		];
		return ast.type === 'CallExpression' &&
			ast.callee &&
			ast.callee.type === 'MemberExpression' &&
			ast.callee.object &&
			ast.callee.object.type === 'Identifier' &&
			ast.callee.object.name === 'Math' &&
			ast.callee.property &&
			ast.callee.property.type === 'Identifier' &&
			mathFunctions.indexOf(ast.callee.property.name) > -1;
	}

	isAstVariable(ast) {
		return ast.type === 'Identifier' || ast.type === 'MemberExpression';
	}

	isSafe(ast) {
		return this.isSafeDependencies(this.getDependencies(ast));
	}

	isSafeDependencies(dependencies) {
		return dependencies && dependencies.every ? dependencies.every(dependency => dependency.isSafe) : true;
	}

	getDependencies(ast, dependencies, isNotSafe) {
		if (!dependencies) {
			dependencies = [];
		}
		if (!ast) return null;
		if (Array.isArray(ast)) {
			for (let i = 0; i < ast.length; i++) {
				this.getDependencies(ast[i], dependencies, isNotSafe);
			}
			return dependencies;
		}
		switch (ast.type) {
			case 'Literal':
				dependencies.push({
					origin: 'literal',
					value: ast.value,
					isSafe: isNotSafe === true ? false : ast.value > -Infinity && ast.value < Infinity && !isNaN(ast.value)
				});
				break;
			case 'VariableDeclarator':
				return this.getDependencies(ast.init, dependencies, isNotSafe);
			case 'Identifier':
				if (this.declarations[ast.name]) {
					dependencies.push({
						name: ast.name,
						origin: 'declaration',
						isSafe: isNotSafe ? false : this.isSafeDependencies(this.declarations[ast.name].dependencies),
					});
				} else if (this.argumentNames.indexOf(ast.name) > -1) {
					dependencies.push({
						name: ast.name,
						origin: 'argument',
						isSafe: false,
					});
				}
				break;
			case 'FunctionDeclaration':
				return this.getDependencies(ast.body.body[ast.body.body.length - 1], dependencies, isNotSafe);
			case 'ReturnStatement':
				return this.getDependencies(ast.argument, dependencies);
			case 'BinaryExpression':
				isNotSafe = (ast.operator === '/' || ast.operator === '*');
				this.getDependencies(ast.left, dependencies, isNotSafe);
				this.getDependencies(ast.right, dependencies, isNotSafe);
				return dependencies;
			case 'UpdateExpression':
				return this.getDependencies(ast.argument, dependencies, isNotSafe);
			case 'VariableDeclaration':
				return this.getDependencies(ast.declarations, dependencies, isNotSafe);
			case 'ArrayExpression':
				dependencies.push({
					origin: 'declaration',
					isSafe: true,
				});
				return dependencies;
			case 'CallExpression':
				dependencies.push({
					origin: 'function',
					isSafe: true,
				});
				return dependencies;
			case 'MemberExpression':
				const details = this.getMemberExpressionDetails(ast);
				if (details) {
					return details.type;
				}
			default:
				throw this.astErrorOutput(`Unhandled type ${ ast.type } in getAllVariables`, ast);
		}
		return dependencies;
	}

	getVariableSignature(ast) {
		if (!this.isAstVariable(ast)) {
			throw new Error(`ast of type "${ ast.type }" is not a variable signature`);
		}
		if (ast.type === 'Identifier') {
			return 'value';
		}
		const signature = [];
		while (true) {
			if (!ast) break;
			if (ast.computed) {
				signature.push('[]');
			} else if (ast.type === 'ThisExpression') {
				signature.unshift('this');
			} else if (ast.property && ast.property.name) {
				if (
					ast.property.name === 'x' ||
					ast.property.name === 'y' ||
					ast.property.name === 'z'
				) {
					signature.unshift('.value');
				} else if (
					ast.property.name === 'constants' ||
					ast.property.name === 'thread' ||
					ast.property.name === 'output'
				) {
					signature.unshift('.' + ast.property.name);
				} else {
					signature.unshift('.value');
				}
			} else if (ast.name) {
				signature.unshift('value');
			} else if (ast.callee && ast.callee.name) {
				signature.unshift('fn()');
			} else {
				signature.unshift('unknown');
			}
			ast = ast.object;
		}

		const signatureString = signature.join('');
		const allowedExpressions = [
			'value',
			'value[]',
			'value[][]',
			'value[][][]',
			'value.value',
			'this.thread.value',
			'this.output.value',
			'this.constants.value',
			'this.constants.value[]',
			'this.constants.value[][]',
			'this.constants.value[][][]',
			'fn()[]',
			'fn()[][]',
			'fn()[][][]',
		];
		if (allowedExpressions.indexOf(signatureString) > -1) {
			return signatureString;
		}
		return null;
	}

	build() {
		return this.toString().length > 0;
	}

	astGeneric(ast, retArr) {
		if (ast === null) {
			throw this.astErrorOutput('NULL ast', ast);
		} else {
			if (Array.isArray(ast)) {
				for (let i = 0; i < ast.length; i++) {
					this.astGeneric(ast[i], retArr);
				}
				return retArr;
			}

			switch (ast.type) {
				case 'FunctionDeclaration':
					return this.astFunctionDeclaration(ast, retArr);
				case 'FunctionExpression':
					return this.astFunctionExpression(ast, retArr);
				case 'ReturnStatement':
					return this.astReturnStatement(ast, retArr);
				case 'Literal':
					return this.astLiteral(ast, retArr);
				case 'BinaryExpression':
					return this.astBinaryExpression(ast, retArr);
				case 'Identifier':
					return this.astIdentifierExpression(ast, retArr);
				case 'AssignmentExpression':
					return this.astAssignmentExpression(ast, retArr);
				case 'ExpressionStatement':
					return this.astExpressionStatement(ast, retArr);
				case 'EmptyStatement':
					return this.astEmptyStatement(ast, retArr);
				case 'BlockStatement':
					return this.astBlockStatement(ast, retArr);
				case 'IfStatement':
					return this.astIfStatement(ast, retArr);
				case 'BreakStatement':
					return this.astBreakStatement(ast, retArr);
				case 'ContinueStatement':
					return this.astContinueStatement(ast, retArr);
				case 'ForStatement':
					return this.astForStatement(ast, retArr);
				case 'WhileStatement':
					return this.astWhileStatement(ast, retArr);
				case 'DoWhileStatement':
					return this.astDoWhileStatement(ast, retArr);
				case 'VariableDeclaration':
					return this.astVariableDeclaration(ast, retArr);
				case 'VariableDeclarator':
					return this.astVariableDeclarator(ast, retArr);
				case 'ThisExpression':
					return this.astThisExpression(ast, retArr);
				case 'SequenceExpression':
					return this.astSequenceExpression(ast, retArr);
				case 'UnaryExpression':
					return this.astUnaryExpression(ast, retArr);
				case 'UpdateExpression':
					return this.astUpdateExpression(ast, retArr);
				case 'LogicalExpression':
					return this.astLogicalExpression(ast, retArr);
				case 'MemberExpression':
					return this.astMemberExpression(ast, retArr);
				case 'CallExpression':
					return this.astCallExpression(ast, retArr);
				case 'ArrayExpression':
					return this.astArrayExpression(ast, retArr);
				case 'DebuggerStatement':
					return this.astDebuggerStatement(ast, retArr);
				case 'ConditionalExpression':
					return this.astConditionalExpression(ast, retArr);
			}

			throw this.astErrorOutput('Unknown ast type : ' + ast.type, ast);
		}
	}
	astErrorOutput(error, ast) {
		if (typeof this.source !== 'string') {
			return new Error(error);
		}

		const debugString = utils.getAstString(this.source, ast);
		const leadingSource = this.source.substr(ast.start);
		const splitLines = leadingSource.split(/\n/);
		const lineBefore = splitLines.length > 0 ? splitLines[splitLines.length - 1] : 0;
		return new Error(`${error} on line ${ splitLines.length }, position ${ lineBefore.length }:\n ${ debugString }`);
	}

	astDebuggerStatement(arrNode, retArr) {
		return retArr;
	}

	astConditionalExpression(ast, retArr) {
		if (ast.type !== 'ConditionalExpression') {
			throw this.astErrorOutput('Not a conditional expression', ast);
		}
		retArr.push('(');
		this.astGeneric(ast.test, retArr);
		retArr.push('?');
		this.astGeneric(ast.consequent, retArr);
		retArr.push(':');
		this.astGeneric(ast.alternate, retArr);
		retArr.push(')');
		return retArr;
	}
	astFunctionDeclaration(ast, retArr) {
		if (this.onNestedFunction) {
			let returnType = this.getType(ast);
			if (returnType === 'LiteralInteger') {
				returnType = 'Number';
			}
			this.onNestedFunction(utils.getAstString(this.source, ast), returnType);
		}
		return retArr;
	}
	astFunctionExpression(ast, retArr) {
		return retArr;
	}
	astReturnStatement(ast, retArr) {
		return retArr;
	}
	astLiteral(ast, retArr) {
		return retArr;
	}
	astBinaryExpression(ast, retArr) {
		return retArr;
	}
	astIdentifierExpression(ast, retArr) {
		return retArr;
	}
	astAssignmentExpression(ast, retArr) {
		return retArr;
	}
	astExpressionStatement(esNode, retArr) {
		this.astGeneric(esNode.expression, retArr);
		retArr.push(';');
		return retArr;
	}
	astEmptyStatement(eNode, retArr) {
		return retArr;
	}
	astBlockStatement(ast, retArr) {
		return retArr;
	}
	astIfStatement(ast, retArr) {
		return retArr;
	}
	astBreakStatement(brNode, retArr) {
		retArr.push('break;');
		return retArr;
	}
	astContinueStatement(crNode, retArr) {
		retArr.push('continue;\n');
		return retArr;
	}
	astForStatement(ast, retArr) {
		return retArr;
	}
	astWhileStatement(ast, retArr) {
		return retArr;
	}
	astDoWhileStatement(ast, retArr) {
		return retArr;
	}
	astVariableDeclaration(varDecNode, retArr) {
		const declarations = varDecNode.declarations;
		if (!declarations || !declarations[0] || !declarations[0].init) {
			throw this.astErrorOutput('Unexpected expression', varDecNode);
		}
		const result = [];
		const firstDeclaration = declarations[0];
		const init = firstDeclaration.init;
		let type = this.isState('in-for-loop-init') ? 'Integer' : this.getType(init);
		if (type === 'LiteralInteger') {
			type = 'Number';
		}
		const markupType = typeMap[type];
		if (!markupType) {
			throw this.astErrorOutput(`Markup type ${ markupType } not handled`, varDecNode);
		}
		let dependencies = this.getDependencies(firstDeclaration.init);
		this.declarations[firstDeclaration.id.name] = Object.freeze({
			type,
			dependencies,
			isSafe: dependencies.every(dependency => dependency.isSafe)
		});
		const initResult = [`${type} user_${firstDeclaration.id.name}=`];
		this.astGeneric(init, initResult);
		result.push(initResult.join(''));

		for (let i = 1; i < declarations.length; i++) {
			const declaration = declarations[i];
			dependencies = this.getDependencies(declaration);
			this.declarations[declaration.id.name] = Object.freeze({
				type,
				dependencies,
				isSafe: false
			});
			this.astGeneric(declaration, result);
		}

		retArr.push(retArr, result.join(','));
		retArr.push(';');
		return retArr;
	}
	astVariableDeclarator(iVarDecNode, retArr) {
		this.astGeneric(iVarDecNode.id, retArr);
		if (iVarDecNode.init !== null) {
			retArr.push('=');
			this.astGeneric(iVarDecNode.init, retArr);
		}
		return retArr;
	}
	astThisExpression(ast, retArr) {
		return retArr;
	}
	astSequenceExpression(sNode, retArr) {
		for (let i = 0; i < sNode.expressions.length; i++) {
			if (i > 0) {
				retArr.push(',');
			}
			this.astGeneric(sNode.expressions, retArr);
		}
		return retArr;
	}
	astUnaryExpression(uNode, retArr) {
		if (uNode.prefix) {
			retArr.push(uNode.operator);
			this.astGeneric(uNode.argument, retArr);
		} else {
			this.astGeneric(uNode.argument, retArr);
			retArr.push(uNode.operator);
		}

		return retArr;
	}
	astUpdateExpression(uNode, retArr) {
		if (uNode.prefix) {
			retArr.push(uNode.operator);
			this.astGeneric(uNode.argument, retArr);
		} else {
			this.astGeneric(uNode.argument, retArr);
			retArr.push(uNode.operator);
		}

		return retArr;
	}
	astLogicalExpression(logNode, retArr) {
		retArr.push('(');
		this.astGeneric(logNode.left, retArr);
		retArr.push(logNode.operator);
		this.astGeneric(logNode.right, retArr);
		retArr.push(')');
		return retArr;
	}
	astMemberExpression(ast, retArr) {
		return retArr;
	}
	astCallExpression(ast, retArr) {
		return retArr;
	}
	astArrayExpression(ast, retArr) {
		return retArr;
	}

	getMemberExpressionDetails(ast) {
		if (ast.type !== 'MemberExpression') {
			throw this.astErrorOutput(`Expression ${ ast.type } not a MemberExpression`, ast);
		}
		let name = null;
		let type = null;
		const variableSignature = this.getVariableSignature(ast);
		switch (variableSignature) {
			case 'value':
				return null;
			case 'this.thread.value':
			case 'this.output.value':
				return {
					signature: variableSignature,
					type: 'Integer',
					name: ast.property.name
				};
			case 'value[]':
				if (typeof ast.object.name !== 'string') {
					throw this.astErrorOutput('Unexpected expression', ast);
				}
				name = ast.object.name;
				return {
					name,
					origin: 'user',
					signature: variableSignature,
					type: this.getVariableType(name),
					xProperty: ast.property
				};
			case 'value[][]':
				if (typeof ast.object.object.name !== 'string') {
					throw this.astErrorOutput('Unexpected expression', ast);
				}
				name = ast.object.object.name;
				return {
					name,
					origin: 'user',
					signature: variableSignature,
					type: this.getVariableType(name),
					yProperty: ast.object.property,
					xProperty: ast.property,
				};
			case 'value[][][]':
				if (typeof ast.object.object.object.name !== 'string') {
					throw this.astErrorOutput('Unexpected expression', ast);
				}
				name = ast.object.object.object.name;
				return {
					name,
					origin: 'user',
					signature: variableSignature,
					type: this.getVariableType(name),
					zProperty: ast.object.object.property,
					yProperty: ast.object.property,
					xProperty: ast.property,
				};
			case 'value.value':
				if (typeof ast.property.name !== 'string') {
					throw this.astErrorOutput('Unexpected expression', ast);
				}
				if (this.isAstMathVariable(ast)) {
					name = ast.property.name;
					return {
						name,
						origin: 'Math',
						type: 'Number',
						signature: variableSignature,
					};
				}
				switch (ast.property.name) {
					case 'r':
					case 'g':
					case 'b':
					case 'a':
						name = ast.object.name;
						return {
							name,
							property: ast.property.name,
							origin: 'user',
							signature: variableSignature,
							type: 'Number'
						};
					default:
						throw this.astErrorOutput('Unexpected expression', ast);
				}
			case 'this.constants.value':
				if (typeof ast.property.name !== 'string') {
					throw this.astErrorOutput('Unexpected expression', ast);
				}
				name = ast.property.name;
				type = this.getConstantType(name);
				if (!type) {
					throw this.astErrorOutput('Constant has no type', ast);
				}
				return {
					name,
					type,
					origin: 'constants',
					signature: variableSignature,
				};
			case 'this.constants.value[]':
				if (typeof ast.object.property.name !== 'string') {
					throw this.astErrorOutput('Unexpected expression', ast);
				}
				name = ast.object.property.name;
				type = this.getConstantType(name);
				if (!type) {
					throw this.astErrorOutput('Constant has no type', ast);
				}
				return {
					name,
					type,
					origin: 'constants',
					signature: variableSignature,
					xProperty: ast.property,
				};
			case 'this.constants.value[][]':
				{
					if (typeof ast.object.object.property.name !== 'string') {
						throw this.astErrorOutput('Unexpected expression', ast);
					}
					name = ast.object.object.property.name;
					type = this.getConstantType(name);
					if (!type) {
						throw this.astErrorOutput('Constant has no type', ast);
					}
					return {
						name,
						type,
						origin: 'constants',
						signature: variableSignature,
						yProperty: ast.object.property,
						xProperty: ast.property,
					};
				}
			case 'this.constants.value[][][]':
				{
					if (typeof ast.object.object.object.property.name !== 'string') {
						throw this.astErrorOutput('Unexpected expression', ast);
					}
					name = ast.object.object.object.property.name;
					type = this.getConstantType(name);
					if (!type) {
						throw this.astErrorOutput('Constant has no type', ast);
					}
					return {
						name,
						type,
						origin: 'constants',
						signature: variableSignature,
						zProperty: ast.object.object.property,
						yProperty: ast.object.property,
						xProperty: ast.property,
					};
				}
			case 'fn()[]':
				return {
					signature: variableSignature,
					property: ast.property
				};
			default:
				throw this.astErrorOutput('Unexpected expression', ast);
		}
	}

	getInternalVariableName(name) {
		if (!this._internalVariableNames.hasOwnProperty(name)) {
			this._internalVariableNames[name] = 0;
		}
		this._internalVariableNames[name]++;
		if (this._internalVariableNames[name] === 1) {
			return name;
		}
		return name + this._internalVariableNames[name];
	}
}

const typeLookupMap = {
	'Array': 'Number',
	'Array(2)': 'Number',
	'Array(3)': 'Number',
	'Array(4)': 'Number',
	'Array2D': 'Number',
	'Array3D': 'Number',
	'HTMLImage': 'Array(4)',
	'HTMLImageArray': 'Array(4)',
	'NumberTexture': 'Number',
	'ArrayTexture(4)': 'Array(4)',
};

module.exports = {
	FunctionNode
};
},{"../utils":28,"acorn":1}],9:[function(require,module,exports){
const {
	Kernel
} = require('./kernel');

class GLKernel extends Kernel {
	static get mode() {
		return 'gpu';
	}

	static getIsFloatRead() {
		function kernelFunction() {
			return 1;
		}
		const kernel = new this(kernelFunction.toString(), {
			context: this.testContext,
			canvas: this.testCanvas,
			skipValidate: true,
			output: [2],
			floatTextures: true,
			floatOutput: true,
			floatOutputForce: true
		});
		const result = kernel.run();
		kernel.destroy(true);
		return result[0] === 1;
	}

	static getIsIntegerDivisionAccurate() {
		function kernelFunction(v1, v2) {
			return v1[this.thread.x] / v2[this.thread.x];
		}
		const kernel = new this(kernelFunction.toString(), {
			context: this.testContext,
			canvas: this.testCanvas,
			skipValidate: true,
			output: [2]
		});
		const result = kernel.run([6, 6030401], [3, 3991]);
		kernel.destroy(true);
		return result[0] === 2 && result[1] === 1511;
	}

	static get testCanvas() {
		throw new Error(`"testCanvas" not defined on ${ this.name }`);
	}

	static get testContext() {
		throw new Error(`"testContext" not defined on ${ this.name }`);
	}

	static get features() {
		throw new Error(`"features" not defined on ${ this.name }`);
	}

	static setupFeatureChecks() {
		throw new Error(`"setupFeatureChecks" not defined on ${ this.name }`);
	}

	setFixIntegerDivisionAccuracy(fix) {
		this.fixIntegerDivisionAccuracy = fix;
		return this;
	}

	setFloatOutput(flag) {
		this.floatOutput = flag;
		return this;
	}

	setFloatOutputForce(flag) {
		this.floatOutputForce = flag;
		return this;
	}

	setFloatTextures(flag) {
		this.floatTextures = flag;
		return this;
	}

	constructor(source, settings) {
		super(source, settings);
		this.texSize = null;
		this.floatTextures = null;
		this.floatOutput = null;
		this.floatOutputForce = null;
		this.fixIntegerDivisionAccuracy = null;
	}
}

module.exports = {
	GLKernel
};
},{"./kernel":11}],10:[function(require,module,exports){
const getContext = require('gl');
const {
	WebGLKernel
} = require('../web-gl/kernel');

let isSupported = null;
let testCanvas = null;
let testContext = null;
let testExtensions = null;
let features = null;

class HeadlessGLKernel extends WebGLKernel {
	static get isSupported() {
		if (isSupported !== null) return isSupported;
		this.setupFeatureChecks();
		isSupported = testContext !== null;
		return isSupported;
	}

	static setupFeatureChecks() {
		testCanvas = null;
		testExtensions = null;
		if (typeof getContext !== 'function') return;
		testContext = getContext(2, 2, {
			preserveDrawingBuffer: true
		});
		testExtensions = {
			STACKGL_resize_drawingbuffer: testContext.getExtension('STACKGL_resize_drawingbuffer'),
			STACKGL_destroy_context: testContext.getExtension('STACKGL_destroy_context'),
			OES_texture_float: testContext.getExtension('OES_texture_float'),
			OES_texture_float_linear: testContext.getExtension('OES_texture_float_linear'),
			OES_element_index_uint: testContext.getExtension('OES_element_index_uint'),
		};
		features = this.getFeatures();
	}

	static isContextMatch(context) {
		try {
			return context.getParameter(context.RENDERER) === 'ANGLE';
		} catch (e) {
			return false;
		}
	}

	static getFeatures() {
		const isDrawBuffers = this.getIsDrawBuffers();
		return Object.freeze({
			isFloatRead: this.getIsFloatRead(),
			isIntegerDivisionAccurate: this.getIsIntegerDivisionAccurate(),
			getIsTextureFloat: true,
			isDrawBuffers,
			kernelMap: isDrawBuffers
		});
	}

	static getIsDrawBuffers() {
		return Boolean(testExtensions.WEBGL_draw_buffers);
	}

	static get testCanvas() {
		return testCanvas;
	}

	static get testContext() {
		return testContext;
	}

	static get features() {
		return features;
	}

	initCanvas() {
		return {};
	}

	initContext() {
		const context = getContext(2, 2, {
			preserveDrawingBuffer: true
		});
		return context;
	}

	initExtensions() {
		this.extensions = {
			STACKGL_resize_drawingbuffer: this.context.getExtension('STACKGL_resize_drawingbuffer'),
			STACKGL_destroy_context: this.context.getExtension('STACKGL_destroy_context'),
			OES_texture_float: this.context.getExtension('OES_texture_float'),
			OES_texture_float_linear: this.context.getExtension('OES_texture_float_linear'),
			OES_element_index_uint: this.context.getExtension('OES_element_index_uint'),
		};
	}

	destroyExtensions() {
		this.extensions.STACKGL_resize_drawingbuffer = null;
		this.extensions.STACKGL_destroy_context = null;
		this.extensions.OES_texture_float = null;
		this.extensions.OES_texture_float_linear = null;
		this.extensions.OES_element_index_uint = null;
	}

	static destroyContext(context) {
		const extension = context.getExtension('STACKGL_destroy_context');
		if (extension && extension.destroy) {
			extension.destroy();
		}
	}
}

module.exports = {
	HeadlessGLKernel
};
},{"../web-gl/kernel":15,"gl":1}],11:[function(require,module,exports){
const {
	utils
} = require('../utils');
const {
	Input
} = require('../input');

class Kernel {
	static get isSupported() {
		throw new Error(`"isSupported" not implemented on ${ this.name }`);
	}

	static isContextMatch(context) {
		throw new Error(`"isContextMatch" not implemented on ${ this.name }`);
	}

	static getFeatures() {
		throw new Error(`"getFeatures" not implemented on ${ this.name }`);
	}

	static destroyContext(context) {
		throw new Error(`"destroyContext" called on ${ this.name }`);
	}

	constructor(source, settings) {
		if (typeof source !== 'object') {
			if (typeof source !== 'string') {
				throw new Error('source not a string');
			}
			if (!utils.isFunctionString(source)) {
				throw new Error('source not a function string');
			}
		}

		this.argumentNames = typeof source === 'string' ? utils.getArgumentNamesFromString(source) : null;
		this.argumentTypes = null;
		this.argumentSizes = null;

		this.source = source;

		this.output = null;

		this.debug = false;

		this.graphical = false;

		this.loopMaxIterations = 0;

		this.constants = null;
		this.constantTypes = null;
		this.hardcodeConstants = null;

		this.canvas = null;

		this.context = null;

		this.functions = null;

		this.nativeFunctions = null;

		this.subKernels = null;

		this.skipValidate = false;
		this.wraparound = null;

		this.immutable = false;

		this.pipeline = false;

		this.plugins = null;
	}

	mergeSettings(settings) {
		for (let p in settings) {
			if (!settings.hasOwnProperty(p) || !this.hasOwnProperty(p)) continue;
			this[p] = settings[p];
		}
		if (settings.hasOwnProperty('output') && !Array.isArray(settings.output)) {
			this.setOutput(settings.output); 
		}
		if (!this.canvas) this.canvas = this.initCanvas();
		if (!this.context) this.context = this.initContext();
		if (!this.plugins) this.plugins = this.initPlugins(settings);
	}
	build() {
		throw new Error(`"build" not defined on ${ this.constructor.name }`);
	}

	run() {
		throw new Error(`"run" not defined on ${ this.constructor.name }`)
	}

	initCanvas() {
		throw new Error(`"initCanvas" not defined on ${ this.constructor.name }`);
	}

	initContext() {
		throw new Error(`"initContext" not defined on ${ this.constructor.name }`);
	}

	initPlugins(settings) {
		throw new Error(`"initPlugins" not defined on ${ this.constructor.name }`);
	}

	setupArguments(args) {
		this.argumentTypes = [];
		this.argumentSizes = [];
		for (let i = 0; i < args.length; i++) {
			const arg = args[i];
			const argType = utils.getVariableType(arg);
			this.argumentTypes.push(argType === 'Integer' ? 'Number' : argType);
			this.argumentSizes.push(arg.constructor === Input ? arg.size : null);
		}

		if (this.argumentNames.length !== args.length) {
			throw new Error(`arguments are miss-aligned`);
		}
	}

	setupConstants() {
		this.constantTypes = {};
		if (this.constants) {
			for (let p in this.constants) {
				this.constantTypes[p] = utils.getVariableType(this.constants[p]);
			}
		}
	}

	setOutput(output) {
		if (output.hasOwnProperty('x')) {
			if (output.hasOwnProperty('y')) {
				if (output.hasOwnProperty('z')) {
					this.output = [output.x, output.y, output.z];
				} else {
					this.output = [output.x, output.y];
				}
			} else {
				this.output = [output.x];
			}
		} else {
			this.output = output;
		}
		return this;
	}

	setDebug(flag) {
		this.debug = flag;
		return this;
	}

	setGraphical(flag) {
		this.graphical = flag;
		return this;
	}

	setLoopMaxIterations(max) {
		this.loopMaxIterations = max;
		return this;
	}

	setConstants(constants) {
		this.constants = constants;
		return this;
	}

	setPipeline(flag) {
		this.pipeline = flag;
		return this;
	}

	setImmutable(flag) {
		this.immutable = flag;
		return this;
	}

	setCanvas(canvas) {
		this.canvas = canvas;
		return this;
	}

	setContext(context) {
		this.context = context;
		return this;
	}

	setArgumentTypes(argumentTypes) {
		this.argumentTypes = argumentTypes;
		return this;
	}

	validateSettings() {
		throw new Error(`"validateSettings" not defined on ${ this.constructor.name }`);
	}

	exec() {
		const args = (arguments.length === 1 ? [arguments[0]] : Array.apply(null, arguments));
		return new Promise((accept, reject) => {
			try {
				accept(this.run.apply(this, args));
			} catch (e) {
				reject(e);
			}
		});
	}

	addSubKernel(subKernel) {
		if (this.subKernels === null) {
			this.subKernels = [];
		}
		if (!subKernel.source) throw new Error('subKernel missing "source" property');
		if (!subKernel.property && isNaN(subKernel.property)) throw new Error('subKernel missing "property" property');
		if (!subKernel.name) throw new Error('subKernel missing "name" property');
		this.subKernels.push(subKernel);
		return this;
	}

	destroy(removeCanvasReferences) {
		throw new Error(`"destroy" called on ${ this.constructor.name }`);
	}

	checkOutput() {
		if (!this.output || !Array.isArray(this.output)) throw new Error('kernel.output not an array');
		if (this.output.length < 1) throw new Error('kernel.output is empty, needs at least 1 value');
		for (let i = 0; i < this.output.length; i++) {
			if (isNaN(this.output[i]) || this.output[i] < 1) {
				throw new Error(`${ this.constructor.name }.output[${ i }] incorrectly defined as \`${ this.output[i] }\`, needs to be numeric, and greater than 0`);
			}
		}
	}

	toJSON() {
		const settings = {
			output: this.output,
			threadDim: this.threadDim,
			pipeline: this.pipeline,
			argumentNames: this.argumentNames,
			argumentsTypes: this.argumentTypes,
			argumentsLength: this.argumentsLength,
			constants: this.constants,
			constantsLength: this.constantsLength,
			pluginNames: this.plugins ? this.plugins.map(plugin => plugin.name) : null,
		};
		return {
			settings
		};
	}
}

module.exports = {
	Kernel
};
},{"../input":24,"../utils":28}],12:[function(require,module,exports){
const fragmentShader = `__HEADER__;
precision highp float;
precision highp int;
precision highp sampler2D;

const int LOOP_MAX = __LOOP_MAX__;

__PLUGINS__;
__CONSTANTS__;

varying vec2 vTexCoord;

vec4 round(vec4 x) {
  return floor(x + 0.5);
}

float round(float x) {
  return floor(x + 0.5);
}

vec2 integerMod(vec2 x, float y) {
  vec2 res = floor(mod(x, y));
  return res * step(1.0 - floor(y), -res);
}

vec3 integerMod(vec3 x, float y) {
  vec3 res = floor(mod(x, y));
  return res * step(1.0 - floor(y), -res);
}

vec4 integerMod(vec4 x, vec4 y) {
  vec4 res = floor(mod(x, y));
  return res * step(1.0 - floor(y), -res);
}

float integerMod(float x, float y) {
  float res = floor(mod(x, y));
  return res * (res > floor(y) - 1.0 ? 0.0 : 1.0);
}

int integerMod(int x, int y) {
  return x - (y * int(x / y));
}

__DIVIDE_WITH_INTEGER_CHECK__;

// Here be dragons!
// DO NOT OPTIMIZE THIS CODE
// YOU WILL BREAK SOMETHING ON SOMEBODY\'S MACHINE
// LEAVE IT AS IT IS, LEST YOU WASTE YOUR OWN TIME
const vec2 MAGIC_VEC = vec2(1.0, -256.0);
const vec4 SCALE_FACTOR = vec4(1.0, 256.0, 65536.0, 0.0);
const vec4 SCALE_FACTOR_INV = vec4(1.0, 0.00390625, 0.0000152587890625, 0.0); // 1, 1/256, 1/65536
float decode32(vec4 rgba) {
  __DECODE32_ENDIANNESS__;
  rgba *= 255.0;
  vec2 gte128;
  gte128.x = rgba.b >= 128.0 ? 1.0 : 0.0;
  gte128.y = rgba.a >= 128.0 ? 1.0 : 0.0;
  float exponent = 2.0 * rgba.a - 127.0 + dot(gte128, MAGIC_VEC);
  float res = exp2(round(exponent));
  rgba.b = rgba.b - 128.0 * gte128.x;
  res = dot(rgba, SCALE_FACTOR) * exp2(round(exponent-23.0)) + res;
  res *= gte128.y * -2.0 + 1.0;
  return res;
}

vec4 encode32(float f) {
  float F = abs(f);
  float sign = f < 0.0 ? 1.0 : 0.0;
  float exponent = floor(log2(F));
  float mantissa = (exp2(-exponent) * F);
  // exponent += floor(log2(mantissa));
  vec4 rgba = vec4(F * exp2(23.0-exponent)) * SCALE_FACTOR_INV;
  rgba.rg = integerMod(rgba.rg, 256.0);
  rgba.b = integerMod(rgba.b, 128.0);
  rgba.a = exponent*0.5 + 63.5;
  rgba.ba += vec2(integerMod(exponent+127.0, 2.0), sign) * 128.0;
  rgba = floor(rgba);
  rgba *= 0.003921569; // 1/255
  __ENCODE32_ENDIANNESS__;
  return rgba;
}
// Dragons end here

float decode(vec4 rgba, int x, int bitRatio) {
  if (bitRatio == 1) {
    return decode32(rgba);
  }
  __DECODE32_ENDIANNESS__;
  int channel = integerMod(x, bitRatio);
  if (bitRatio == 4) {
    if (channel == 0) return rgba.r * 255.0;
    if (channel == 1) return rgba.g * 255.0;
    if (channel == 2) return rgba.b * 255.0;
    if (channel == 3) return rgba.a * 255.0;
  }
  else {
    if (channel == 0) return rgba.r * 255.0 + rgba.g * 65280.0;
    if (channel == 1) return rgba.b * 255.0 + rgba.a * 65280.0;
  }
}

int index;
ivec3 threadId;

ivec3 indexTo3D(int idx, ivec3 texDim) {
  int z = int(idx / (texDim.x * texDim.y));
  idx -= z * int(texDim.x * texDim.y);
  int y = int(idx / texDim.x);
  int x = int(integerMod(idx, texDim.x));
  return ivec3(x, y, z);
}

float get(sampler2D tex, ivec2 texSize, ivec3 texDim, int bitRatio, int z, int y, int x) {
  ivec3 xyz = ivec3(x, y, z);
  __GET_WRAPAROUND__;
  int index = xyz.x + texDim.x * (xyz.y + texDim.y * xyz.z);
  __GET_TEXTURE_CHANNEL__;
  int w = texSize.x;
  vec2 st = vec2(float(integerMod(index, w)), float(index / w)) + 0.5;
  __GET_TEXTURE_INDEX__;
  vec4 texel = texture2D(tex, st / vec2(texSize));
  __GET_RESULT__;
}

vec4 getImage2D(sampler2D tex, ivec2 texSize, ivec3 texDim, int z, int y, int x) {
  ivec3 xyz = ivec3(x, y, z);
  __GET_WRAPAROUND__;
  int index = xyz.x + texDim.x * (xyz.y + texDim.y * xyz.z);
  __GET_TEXTURE_CHANNEL__;
  int w = texSize.x;
  vec2 st = vec2(float(integerMod(index, w)), float(index / w)) + 0.5;
  __GET_TEXTURE_INDEX__;
  return texture2D(tex, st / vec2(texSize));
}

vec4 actualColor;
void color(float r, float g, float b, float a) {
  actualColor = vec4(r,g,b,a);
}

void color(float r, float g, float b) {
  color(r,g,b,1.0);
}

void color(sampler2D image) {
  actualColor = texture2D(image, vTexCoord);
}

__MAIN_CONSTANTS__;
__MAIN_ARGUMENTS__;
__KERNEL__;

void main(void) {
  index = int(vTexCoord.s * float(uTexSize.x)) + int(vTexCoord.t * float(uTexSize.y)) * uTexSize.x;
  __MAIN_RESULT__;
}`;

module.exports = {
	fragmentShader
};
},{}],13:[function(require,module,exports){
const {
	FunctionNode
} = require('../function-node');
const jsMathPrefix = 'Math.';
const localPrefix = 'this.';

class WebGLFunctionNode extends FunctionNode {
	constructor(source, settings) {
		super(source, settings);
		this.fixIntegerDivisionAccuracy = null;
		if (settings && settings.hasOwnProperty('fixIntegerDivisionAccuracy')) {
			this.fixIntegerDivisionAccuracy = settings.fixIntegerDivisionAccuracy;
		}
	}

	astFunctionExpression(ast, retArr) {

		if (this.isRootKernel) {
			retArr.push('void');
		} else {
			const {
				returnType
			} = this;
			const type = typeMap[returnType];
			if (!type) {
				throw new Error(`unknown type ${ returnType }`);
			}
			retArr.push(type);
		}
		retArr.push(' ');
		retArr.push(this.name);
		retArr.push('(');

		if (!this.isRootKernel) {
			for (let i = 0; i < this.argumentNames.length; ++i) {
				const argumentName = this.argumentNames[i];

				if (i > 0) {
					retArr.push(', ');
				}
				let argumentType = this.getVariableType(argumentName);
				if (!argumentType || argumentType === 'LiteralInteger') {
					argumentType = 'Number';
				}
				const type = typeMap[argumentType];
				if (!type) {
					throw this.astErrorOutput('Unexpected expression', ast);
				}
				retArr.push(type);
				retArr.push(' ');
				retArr.push('user_');
				retArr.push(argumentName);
			}
		}

		retArr.push(') {\n');

		for (let i = 0; i < ast.body.body.length; ++i) {
			this.astGeneric(ast.body.body[i], retArr);
			retArr.push('\n');
		}

		retArr.push('}\n');
		return retArr;
	}

	astReturnStatement(ast, retArr) {
		if (!ast.argument) throw this.astErrorOutput('Unexpected return statement', ast);
		const type = this.getType(ast.argument);

		const result = [];

		switch (this.returnType) {
			case 'Number':
			case 'Float':
				switch (type) {
					case 'Integer':
						result.push('float(');
						this.astGeneric(ast.argument, result);
						result.push(')');
						break;
					case 'LiteralInteger':
						this.pushState('casting-to-float');
						this.astGeneric(ast.argument, result);
						this.popState('casting-to-float');
						break;
					default:
						this.astGeneric(ast.argument, result);
				}
				break;
			case 'Integer':
				switch (type) {
					case 'Number':
						this.pushState('casting-to-integer');
						result.push('int(');
						this.astGeneric(ast.argument, result);
						result.push(')');
						this.popState('casting-to-integer');
						break;
					case 'LiteralInteger':
						this.pushState('casting-to-integer');
						this.astGeneric(ast.argument, result);
						this.popState('casting-to-integer');
						break;
					default:
						this.astGeneric(ast.argument, result);
				}
				break;
			case 'Array(4)':
			case 'Array(3)':
			case 'Array(2)':
				this.astGeneric(ast.argument, result);
				break;
			default:
				throw this.astErrorOutput('Unknown return handler', ast);
		}

		if (this.isRootKernel) {
			retArr.push(`kernelResult = ${ result.join('') };`);
			retArr.push('return;');
		} else if (this.isSubKernel) {
			retArr.push(`subKernelResult_${ this.name } = ${ result.join('') };`);
			retArr.push(`return subKernelResult_${ this.name };`);
		} else {
			retArr.push(`return ${ result.join('') };`);
		}
		return retArr;
	}

	astLiteral(ast, retArr) {

		if (isNaN(ast.value)) {
			throw this.astErrorOutput(
				'Non-numeric literal not supported : ' + ast.value,
				ast
			);
		}

		if (Number.isInteger(ast.value)) {
			if (this.isState('in-for-loop-init') || this.isState('casting-to-integer')) {
				retArr.push(`${ast.value}`);
			} else if (this.isState('casting-to-float')) {
				retArr.push(`${ast.value}.0`);
			} else {
				retArr.push(`${ast.value}.0`);
			}
		} else if (this.isState('casting-to-integer')) {
			retArr.push(parseInt(ast.raw));
		} else {
			retArr.push(`${ast.value}`);
		}
		return retArr;
	}

	astBinaryExpression(ast, retArr) {
		if (ast.operator === '%') {
			retArr.push('mod(');

			const leftType = this.getType(ast.left);
			if (leftType === 'Integer') {
				retArr.push('float(');
				this.astGeneric(ast.left, retArr);
				retArr.push(')');
			} else if (leftType === 'LiteralInteger') {
				this.pushState('casting-to-float');
				this.astGeneric(ast.left, retArr);
				this.popState('casting-to-float');
			} else {
				this.astGeneric(ast.left, retArr);
			}

			retArr.push(',');
			const rightType = this.getType(ast.right);

			if (rightType === 'Integer') {
				retArr.push('float(');
				this.astGeneric(ast.right, retArr);
				retArr.push(')');
			} else if (rightType === 'LiteralInteger') {
				this.pushState('casting-to-float');
				this.astGeneric(ast.right, retArr);
				this.popState('casting-to-float');
			} else {
				this.astGeneric(ast.right, retArr);
			}
			retArr.push(')');
			return retArr;
		}

		retArr.push('(');
		if (this.fixIntegerDivisionAccuracy && ast.operator === '/') {
			retArr.push('div_with_int_check(');

			if (this.getType(ast.left) !== 'Number') {
				retArr.push('int(');
				this.pushState('casting-to-float');
				this.astGeneric(ast.left, retArr);
				this.popState('casting-to-float');
				retArr.push(')');
			} else {
				this.astGeneric(ast.left, retArr);
			}

			retArr.push(', ');

			if (this.getType(ast.right) !== 'Number') {
				retArr.push('float(');
				this.pushState('casting-to-float');
				this.astGeneric(ast.right, retArr);
				this.popState('casting-to-float');
				retArr.push(')');
			} else {
				this.astGeneric(ast.right, retArr);
			}
			retArr.push(')');
		} else {
			const leftType = this.getType(ast.left) || 'Number';
			const rightType = this.getType(ast.right) || 'Number';
			if (!leftType || !rightType) {
				throw this.astErrorOutput(`Unhandled binary expression`, ast);
			}
			const key = leftType + ' & ' + rightType;
			switch (key) {
				case 'Integer & Integer':
					this.astGeneric(ast.left, retArr);
					retArr.push(operatorMap[ast.operator] || ast.operator);
					this.astGeneric(ast.right, retArr);
					break;
				case 'Number & Float':
				case 'Float & Number':
				case 'Float & Float':
				case 'Number & Number':
					this.astGeneric(ast.left, retArr);
					retArr.push(operatorMap[ast.operator] || ast.operator);
					this.astGeneric(ast.right, retArr);
					break;
				case 'LiteralInteger & LiteralInteger':
					this.pushState('casting-to-float');
					this.astGeneric(ast.left, retArr);
					retArr.push(operatorMap[ast.operator] || ast.operator);
					this.astGeneric(ast.right, retArr);
					this.popState('casting-to-float');
					break;

				case 'Integer & Number':
					this.astGeneric(ast.left, retArr);
					retArr.push(operatorMap[ast.operator] || ast.operator);
					this.pushState('casting-to-integer');
					retArr.push('int(');
					this.astGeneric(ast.right, retArr);
					retArr.push(')');
					this.popState('casting-to-integer');
					break;
				case 'Integer & LiteralInteger':
					this.astGeneric(ast.left, retArr);
					retArr.push(operatorMap[ast.operator] || ast.operator);
					this.pushState('casting-to-integer');
					this.astGeneric(ast.right, retArr);
					this.popState('casting-to-integer');
					break;

				case 'Number & Integer':
					this.astGeneric(ast.left, retArr);
					retArr.push(operatorMap[ast.operator] || ast.operator);
					this.pushState('casting-to-float');
					retArr.push('float(');
					this.astGeneric(ast.right, retArr);
					retArr.push(')');
					this.popState('casting-to-float');
					break;
				case 'Float & LiteralInteger':
				case 'Number & LiteralInteger':
					if (this.isState('force-integer')) {
						retArr.push('int(');
						this.astGeneric(ast.left, retArr);
						retArr.push(')');
						retArr.push(operatorMap[ast.operator] || ast.operator);
						this.pushState('casting-to-integer');
						this.astGeneric(ast.right, retArr);
						this.popState('casting-to-integer');
					} else {
						this.astGeneric(ast.left, retArr);
						retArr.push(operatorMap[ast.operator] || ast.operator);
						this.pushState('casting-to-float');
						this.astGeneric(ast.right, retArr);
						this.popState('casting-to-float');
					}
					break;
				case 'LiteralInteger & Float':
				case 'LiteralInteger & Number':
					if (this.isState('force-integer') || this.isState('in-for-loop-init')) {
						this.pushState('casting-to-integer');
						this.astGeneric(ast.left, retArr);
						retArr.push(operatorMap[ast.operator] || ast.operator);
						retArr.push('int(');
						this.astGeneric(ast.right, retArr);
						retArr.push(')');
						this.popState('casting-to-integer');
					} else {
						this.astGeneric(ast.left, retArr);
						retArr.push(operatorMap[ast.operator] || ast.operator);
						this.pushState('casting-to-float');
						this.astGeneric(ast.right, retArr);
						this.popState('casting-to-float');
					}
					break;
				case 'LiteralInteger & Integer':
					this.pushState('casting-to-integer');
					this.astGeneric(ast.left, retArr);
					this.popState('casting-to-integer');
					retArr.push(operatorMap[ast.operator] || ast.operator);
					this.astGeneric(ast.right, retArr);
					break;
				default:
					throw this.astErrorOutput(`Unhandled binary expression between ${key}`, ast);
			}
		}

		retArr.push(')');
		return retArr;
	}

	astIdentifierExpression(idtNode, retArr) {
		if (idtNode.type !== 'Identifier') {
			throw this.astErrorOutput(
				'IdentifierExpression - not an Identifier',
				idtNode
			);
		}

		if (idtNode.name === 'Infinity') {
			retArr.push('3.402823466e+38');
		} else {
			const userArgumentName = this.getUserArgumentName(idtNode.name);
			if (userArgumentName) {
				retArr.push(`user_${userArgumentName}`);
			} else {
				retArr.push(`user_${idtNode.name}`);
			}
		}

		return retArr;
	}

	astForStatement(forNode, retArr) {
		if (forNode.type !== 'ForStatement') {
			throw this.astErrorOutput('Invalid for statement', forNode);
		}

		const initArr = [];
		const testArr = [];
		const updateArr = [];
		const bodyArr = [];
		let isSafe = null;

		if (forNode.init) {
			this.pushState('in-for-loop-init');
			this.astGeneric(forNode.init, initArr);
			for (let i = 0; i < initArr.length; i++) {
				if (initArr[i].includes && initArr[i].includes(',')) {
					isSafe = false;
				}
			}
			this.popState('in-for-loop-init');
		} else {
			isSafe = false;
		}

		if (forNode.test) {
			this.pushState('force-integer');
			this.astGeneric(forNode.test, testArr);
			this.popState('force-integer');
		} else {
			isSafe = false;
		}

		if (forNode.update) {
			this.astGeneric(forNode.update, updateArr);
		} else {
			isSafe = false;
		}

		if (forNode.body) {
			this.pushState('loop-body');
			this.astGeneric(forNode.body, bodyArr);
			this.popState('loop-body');
		}

		if (isSafe === null) {
			isSafe = this.isSafe(forNode.init) && this.isSafe(forNode.test);
		}

		if (isSafe) {
			retArr.push(`for (${initArr.join('')};${testArr.join('')};${updateArr.join('')}){\n`);
			retArr.push(bodyArr.join(''));
			retArr.push('}\n');
		} else {
			const iVariableName = this.getInternalVariableName('safeI');
			if (initArr.length > 0) {
				retArr.push(initArr.join(''), ';\n');
			}
			retArr.push(`for (int ${iVariableName}=0;${iVariableName}<LOOP_MAX;${iVariableName}++){\n`);
			if (testArr.length > 0) {
				retArr.push(`if (!${testArr.join('')}) break;\n`);
			}
			retArr.push(bodyArr.join(''));
			retArr.push(`\n${updateArr.join('')};`);
			retArr.push('}\n');
		}
		return retArr;
	}

	astWhileStatement(whileNode, retArr) {
		if (whileNode.type !== 'WhileStatement') {
			throw this.astErrorOutput('Invalid while statement', whileNode);
		}

		const iVariableName = this.getInternalVariableName('safeI');
		retArr.push(`for (int ${iVariableName}=0;${iVariableName}<LOOP_MAX;${iVariableName}++){\n`);
		retArr.push('if (!');
		this.astGeneric(whileNode.test, retArr);
		retArr.push(') break;\n');
		this.astGeneric(whileNode.body, retArr);
		retArr.push('}\n');

		return retArr;
	}

	astDoWhileStatement(doWhileNode, retArr) {
		if (doWhileNode.type !== 'DoWhileStatement') {
			throw this.astErrorOutput('Invalid while statement', doWhileNode);
		}

		const iVariableName = this.getInternalVariableName('safeI');
		retArr.push(`for (int ${iVariableName}=0;${iVariableName}<LOOP_MAX;${iVariableName}++){\n`);
		this.astGeneric(doWhileNode.body, retArr);
		retArr.push('if (!');
		this.astGeneric(doWhileNode.test, retArr);
		retArr.push(') break;\n');
		retArr.push('}\n');

		return retArr;
	}


	astAssignmentExpression(assNode, retArr) {
		if (assNode.operator === '%=') {
			this.astGeneric(assNode.left, retArr);
			retArr.push('=');
			retArr.push('mod(');
			this.astGeneric(assNode.left, retArr);
			retArr.push(',');
			this.astGeneric(assNode.right, retArr);
			retArr.push(')');
		} else {
			const leftType = this.getType(assNode.left);
			const rightType = this.getType(assNode.right);
			this.astGeneric(assNode.left, retArr);
			retArr.push(assNode.operator);
			if (leftType !== 'Integer' && rightType === 'Integer') {
				retArr.push('float(');
				this.astGeneric(assNode.right, retArr);
				retArr.push(')');
			} else {
				this.astGeneric(assNode.right, retArr);
			}
			return retArr;
		}
	}

	astBlockStatement(bNode, retArr) {
		if (!this.isState('loop-body')) {
			retArr.push('{\n');
		}
		for (let i = 0; i < bNode.body.length; i++) {
			this.astGeneric(bNode.body[i], retArr);
		}
		if (!this.isState('loop-body')) {
			retArr.push('}\n');
		}
		return retArr;
	}

	astVariableDeclaration(varDecNode, retArr) {
		const declarations = varDecNode.declarations;
		if (!declarations || !declarations[0] || !declarations[0].init) {
			throw this.astErrorOutput('Unexpected expression', varDecNode);
		}
		const result = [];
		const firstDeclaration = declarations[0];
		const init = firstDeclaration.init;
		const actualType = this.getType(init);
		let type = this.isState('in-for-loop-init') ? 'Integer' : actualType;
		if (type === 'LiteralInteger') {
			type = 'Number';
		}
		const markupType = typeMap[type];
		if (!markupType) {
			throw this.astErrorOutput(`Markup type ${ markupType } not handled`, varDecNode);
		}
		let dependencies = this.getDependencies(firstDeclaration.init);
		this.declarations[firstDeclaration.id.name] = Object.freeze({
			type,
			dependencies,
			isSafe: this.isSafeDependencies(dependencies),
		});
		const initResult = [];
		initResult.push([`${markupType} `]);
		initResult.push(`user_${firstDeclaration.id.name}=`);
		if (actualType === 'Number' && type === 'Integer') {
			initResult.push('int(');
			this.astGeneric(init, initResult);
			initResult.push(')');
		} else {
			this.astGeneric(init, initResult);
		}
		result.push(initResult.join(''));

		for (let i = 1; i < declarations.length; i++) {
			const declaration = declarations[i];
			dependencies = this.getDependencies(declaration);
			this.declarations[declaration.id.name] = Object.freeze({
				type,
				dependencies: dependencies,
				isSafe: this.isSafeDependencies(dependencies),
			});
			this.astGeneric(declaration, result);
		}

		retArr.push(result.join(','));
		if (!this.isState('in-for-loop-init')) {
			retArr.push(';');
		}
		return retArr;
	}

	astIfStatement(ifNode, retArr) {
		retArr.push('if (');
		this.astGeneric(ifNode.test, retArr);
		retArr.push(')');
		if (ifNode.consequent.type === 'BlockStatement') {
			this.astGeneric(ifNode.consequent, retArr);
		} else {
			retArr.push(' {\n');
			this.astGeneric(ifNode.consequent, retArr);
			retArr.push('\n}\n');
		}

		if (ifNode.alternate) {
			retArr.push('else ');
			if (ifNode.alternate.type === 'BlockStatement') {
				this.astGeneric(ifNode.alternate, retArr);
			} else {
				retArr.push(' {\n');
				this.astGeneric(ifNode.alternate, retArr);
				retArr.push('\n}\n');
			}
		}
		return retArr;
	}

	astThisExpression(tNode, retArr) {
		retArr.push('this');
		return retArr;
	}

	astMemberExpression(mNode, retArr) {
		const {
			property,
			name,
			signature,
			origin,
			type,
			xProperty,
			yProperty,
			zProperty
		} = this.getMemberExpressionDetails(mNode);
		switch (signature) {
			case 'this.thread.value':
				retArr.push(`threadId.${ name }`);
				return retArr;
			case 'this.output.value':
				switch (name) {
					case 'x':
						retArr.push(this.output[0]);
						break;
					case 'y':
						retArr.push(this.output[1]);
						break;
					case 'z':
						retArr.push(this.output[2]);
						break;
					default:
						throw this.astErrorOutput('Unexpected expression', mNode);
				}
				return retArr;
			case 'value':
				throw this.astErrorOutput('Unexpected expression', mNode);
			case 'value[]':
			case 'value[][]':
			case 'value[][][]':
			case 'value.value':
				if (origin === 'Math') {
					retArr.push(Math[name]);
					return retArr;
				}
				switch (property) {
					case 'r':
						retArr.push(`user_${ name }.r`);
						return retArr;
					case 'g':
						retArr.push(`user_${ name }.g`);
						return retArr;
					case 'b':
						retArr.push(`user_${ name }.b`);
						return retArr;
					case 'a':
						retArr.push(`user_${ name }.a`);
						return retArr;
				}
				break;
			case 'this.constants.value':
			case 'this.constants.value[]':
			case 'this.constants.value[][]':
			case 'this.constants.value[][][]':
				break;
			case 'fn()[]':
				this.astCallExpression(mNode.object, retArr);
				retArr.push('[');
				retArr.push(this.memberExpressionPropertyMarkup(property));
				retArr.push(']');
				return retArr;
			default:
				throw this.astErrorOutput('Unexpected expression', mNode);
		}

		if (type === 'Number' || type === 'Integer') {
			retArr.push(`${ origin }_${ name}`);
			return retArr;
		}

		let synonymName;
		if (this.parent) {
			synonymName = this.getUserArgumentName(name);
		}

		const markupName = `${origin}_${synonymName || name}`;

		switch (type) {
			case 'Array(2)':
			case 'Array(3)':
			case 'Array(4)':
				this.astGeneric(mNode.object, retArr);
				retArr.push('[');
				retArr.push(this.memberExpressionPropertyMarkup(xProperty));
				retArr.push(']');
				break;
			case 'HTMLImageArray':
				retArr.push(`getImage3D(${ markupName }, ${ markupName }Size, ${ markupName }Dim, `);
				this.memberExpressionXYZ(xProperty, yProperty, zProperty, retArr);
				retArr.push(')');
				break;
			case 'ArrayTexture(4)':
			case 'HTMLImage':
				retArr.push(`getImage2D(${ markupName }, ${ markupName }Size, ${ markupName }Dim, `);
				this.memberExpressionXYZ(xProperty, yProperty, zProperty, retArr);
				retArr.push(')');
				break;
			default:
				retArr.push(`get(${ markupName }, ${ markupName }Size, ${ markupName }Dim, ${ markupName }BitRatio, `);
				this.memberExpressionXYZ(xProperty, yProperty, zProperty, retArr);
				retArr.push(')');
				break;
		}
		return retArr;
	}

	astCallExpression(ast, retArr) {
		if (ast.callee) {
			let funcName = this.astMemberExpressionUnroll(ast.callee);

			if (funcName.indexOf(jsMathPrefix) === 0) {
				funcName = funcName.slice(jsMathPrefix.length);
			}

			if (funcName.indexOf(localPrefix) === 0) {
				funcName = funcName.slice(localPrefix.length);
			}

			if (funcName === 'atan2') {
				funcName = 'atan';
			}

			if (this.calledFunctions.indexOf(funcName) < 0) {
				this.calledFunctions.push(funcName);
			}
			if (!this.calledFunctionsArguments[funcName]) {
				this.calledFunctionsArguments[funcName] = [];
			}

			const functionArguments = [];
			this.calledFunctionsArguments[funcName].push(functionArguments);

			if (funcName === 'random' && this.plugins) {
				for (let i = 0; i < this.plugins.length; i++) {
					const plugin = this.plugins[i];
					if (plugin.functionMatch === 'Math.random()' && plugin.functionReplace) {
						functionArguments.push(plugin.functionReturnType);
						retArr.push(plugin.functionReplace);
					}
				}
				return retArr;
			}

			retArr.push(funcName);

			retArr.push('(');

			for (let i = 0; i < ast.arguments.length; ++i) {
				const argument = ast.arguments[i];
				if (i > 0) {
					retArr.push(', ');
				}
				this.astGeneric(argument, retArr);
				const argumentType = this.getType(argument);
				if (argumentType) {
					functionArguments.push({
						name: argument.name || null,
						type: argumentType
					});
				} else {
					functionArguments.push(null);
				}
			}

			retArr.push(')');

			return retArr;
		}

		throw this.astErrorOutput(
			'Unknown CallExpression',
			ast
		);
	}

	astArrayExpression(arrNode, retArr) {
		const arrLen = arrNode.elements.length;

		retArr.push('vec' + arrLen + '(');
		for (let i = 0; i < arrLen; ++i) {
			if (i > 0) {
				retArr.push(', ');
			}
			const subNode = arrNode.elements[i];
			this.astGeneric(subNode, retArr)
		}
		retArr.push(')');

		return retArr;
	}

	memberExpressionXYZ(x, y, z, retArr) {
		if (z) {
			retArr.push(this.memberExpressionPropertyMarkup(z), ', ');
		} else {
			retArr.push('0, ');
		}
		if (y) {
			retArr.push(this.memberExpressionPropertyMarkup(y), ', ');
		} else {
			retArr.push('0, ');
		}
		retArr.push(this.memberExpressionPropertyMarkup(x));
		return retArr;
	}

	memberExpressionPropertyMarkup(property) {
		if (!property) {
			throw new Error('Property not set');
		}
		const type = this.getType(property);
		const result = [];
		if (type === 'Number') {
			this.pushState('casting-to-integer');
			result.push('int(');
			this.astGeneric(property, result);
			result.push(')');
			this.popState('casting-to-integer');
		} else if (type === 'LiteralInteger') {
			this.pushState('casting-to-integer');
			this.astGeneric(property, result);
			this.popState('casting-to-integer');
		} else {
			this.astGeneric(property, result);
		}
		return result.join('');
	}
}

const typeMap = {
	'Array': 'sampler2D',
	'Array(2)': 'vec2',
	'Array(3)': 'vec3',
	'Array(4)': 'vec4',
	'Array2D': 'sampler2D',
	'Array3D': 'sampler2D',
	'Float': 'float',
	'Input': 'sampler2D',
	'Integer': 'int',
	'Number': 'float',
	'NumberTexture': 'sampler2D',
	'ArrayTexture(4)': 'sampler2D'
};

const operatorMap = {
	'===': '==',
	'!==': '!='
};

module.exports = {
	WebGLFunctionNode
};
},{"../function-node":8}],14:[function(require,module,exports){
const {
	utils
} = require('../../utils');
const {
	kernelRunShortcut
} = require('../../kernel-run-shortcut');

function removeFnNoise(fn) {
	if (/^function /.test(fn)) {
		fn = fn.substring(9);
	}
	return fn.replace(/[_]typeof/g, 'typeof');
}

function removeNoise(str) {
	return str
		.replace(/^[A-Za-z23]+/, 'function')
		.replace(/[_]typeof/g, 'typeof');
}

function boolToString(value) {
	if (value) {
		return 'true';
	} else if (value === false) {
		return 'false';
	}
	return 'null';
}

function webGLKernelString(gpuKernel, name) {
	return `() => {
    ${ kernelRunShortcut.toString() };
    const utils = {
      allPropertiesOf: ${ removeNoise(utils.allPropertiesOf.toString()) },
      clone: ${ removeNoise(utils.clone.toString()) },
      splitArray: ${ removeNoise(utils.splitArray.toString()) },
      getVariableType: ${ removeNoise(utils.getVariableType.toString()) },
      getDimensions: ${ removeNoise(utils.getDimensions.toString()) },
      dimToTexSize: ${ removeNoise(utils.dimToTexSize.toString()) },
      flattenTo: ${ removeNoise(utils.flattenTo.toString()) },
      flatten2dArrayTo: ${ removeNoise(utils.flatten2dArrayTo.toString()) },
      flatten3dArrayTo: ${ removeNoise(utils.flatten3dArrayTo.toString()) },
      systemEndianness: ${ removeNoise(utils.getSystemEndianness.toString()) },
      isArray: ${ removeNoise(utils.isArray.toString()) }
    };
    const canvases = [];
    const maxTexSizes = {};
    let Texture = function() {};
    let Input = function() {}; 
    class ${ name || 'Kernel' } {
      constructor() {
        this.maxTexSize = null;
        this.argumentsLength = 0;
        this.constantsLength = 0;
        this.canvas = null;
        this.context = null;
        this.program = null;
        this.subKernels = null;
        this.subKernelNames = null;
        this.wraparound = null;
        this.drawBuffersMap = ${ gpuKernel.drawBuffersMap ? JSON.stringify(gpuKernel.drawBuffersMap) : 'null' };
        this.endianness = '${ gpuKernel.endianness }';
        this.graphical = ${ boolToString(gpuKernel.graphical) };
        this.floatTextures = ${ boolToString(gpuKernel.floatTextures) };
        this.floatOutput = ${ boolToString(gpuKernel.floatOutput) };
        this.floatOutputForce = ${ boolToString(gpuKernel.floatOutputForce) };
        this.hardcodeConstants = ${ boolToString(gpuKernel.hardcodeConstants) };
        this.pipeline = ${ boolToString(gpuKernel.pipeline) };
        this.argumentNames = ${ JSON.stringify(gpuKernel.argumentNames) };
        this.argumentTypes = ${ JSON.stringify(gpuKernel.argumentTypes) };
        this.texSize = ${ JSON.stringify(gpuKernel.texSize) };
        this.output = ${ JSON.stringify(gpuKernel.output) };
        this.compiledFragmentShader = \`${ gpuKernel.compiledFragmentShader }\`;
		    this.compiledVertexShader = \`${ gpuKernel.compiledVertexShader }\`;
		    this.programUniformLocationCache = {};
		    this.textureCache = {};
		    this.subKernelOutputTextures = null;
		    this.extensions = {};
		    this.uniform1fCache = {};
		    this.uniform1iCache = {};
		    this.uniform2fCache = {};
		    this.uniform2fvCache = {};
		    this.uniform2ivCache = {};
		    this.uniform3fvCache = {};
		    this.uniform3ivCache = {};
      }
      getFragmentShader() { return this.compiledFragmentShader; }
      getVertexShader() { return this.compiledVertexShader; }
      validateSettings() {}
      initExtensions() {}
      setupArguments() {}
      setupConstants() {}
      setCanvas(canvas) { this.canvas = canvas; return this; }
      setContext(context) { this.context = context; return this; }
      setTexture(Type) { Texture = Type; }
      setInput(Type) { Input = Type; }
      ${ removeFnNoise(gpuKernel.getUniformLocation.toString()) }
      ${ removeFnNoise(gpuKernel.build.toString()) }
		  ${ removeFnNoise(gpuKernel.run.toString()) }
		  ${ removeFnNoise(gpuKernel._addArgument.toString()) }
		  ${ removeFnNoise(gpuKernel._formatArrayTransfer.toString()) }
		  ${ removeFnNoise(gpuKernel.checkOutput.toString()) }
		  ${ removeFnNoise(gpuKernel.getArgumentTexture.toString()) }
		  ${ removeFnNoise(gpuKernel.getTextureCache.toString()) }
		  ${ removeFnNoise(gpuKernel.getOutputTexture.toString()) }
		  ${ removeFnNoise(gpuKernel.renderOutput.toString()) }
		  ${ removeFnNoise(gpuKernel.updateMaxTexSize.toString()) }
		  ${ removeFnNoise(gpuKernel._setupOutputTexture.toString()) }
		  ${ removeFnNoise(gpuKernel.detachTextureCache.toString()) }
		  ${ removeFnNoise(gpuKernel.setUniform1f.toString()) }
		  ${ removeFnNoise(gpuKernel.setUniform1i.toString()) }
		  ${ removeFnNoise(gpuKernel.setUniform2f.toString()) }
		  ${ removeFnNoise(gpuKernel.setUniform2fv.toString()) }
		  ${ removeFnNoise(gpuKernel.setUniform2iv.toString()) }
		  ${ removeFnNoise(gpuKernel.setUniform3fv.toString()) }
		  ${ removeFnNoise(gpuKernel.setUniform3iv.toString()) }
    };
    return kernelRunShortcut(new ${ name || 'Kernel' }());
  };`;
}

module.exports = {
	webGLKernelString
};
},{"../../kernel-run-shortcut":25,"../../utils":28}],15:[function(require,module,exports){
const {
	GLKernel
} = require('../gl-kernel');
const {
	FunctionBuilder
} = require('../function-builder');
const {
	WebGLFunctionNode
} = require('./function-node');
const {
	utils
} = require('../../utils');
const {
	Texture
} = require('../../texture');
const triangleNoise = require('../../plugins/triangle-noise');
const {
	fragmentShader
} = require('./fragment-shader');
const {
	vertexShader
} = require('./vertex-shader');
const {
	webGLKernelString
} = require('./kernel-string');

let isSupported = null;
let testCanvas = null;
let testContext = null;
let testExtensions = null;
let features = null;

const plugins = [triangleNoise];
const canvases = [];
const maxTexSizes = {};

class WebGLKernel extends GLKernel {
	static get isSupported() {
		if (isSupported !== null) {
			return isSupported;
		}
		this.setupFeatureChecks();
		isSupported = this.isContextMatch(testContext);
		return isSupported;
	}

	static setupFeatureChecks() {
		if (typeof document !== 'undefined') {
			testCanvas = document.createElement('canvas');
		} else if (typeof OffscreenCanvas !== 'undefined') {
			testCanvas = new OffscreenCanvas(0, 0);
		}

		if (testCanvas) {
			testContext = testCanvas.getContext('webgl') || testCanvas.getContext('experimental-webgl');
			testExtensions = {
				OES_texture_float: testContext.getExtension('OES_texture_float'),
				OES_texture_float_linear: testContext.getExtension('OES_texture_float_linear'),
				OES_element_index_uint: testContext.getExtension('OES_element_index_uint'),
				WEBGL_draw_buffers: testContext.getExtension('WEBGL_draw_buffers'),
			};
			features = this.getFeatures();
		}
	}

	static isContextMatch(context) {
		if (typeof WebGLRenderingContext !== 'undefined') {
			return context instanceof WebGLRenderingContext;
		}
		return false;
	}

	static getFeatures() {
		const isDrawBuffers = this.getIsDrawBuffers();
		return Object.freeze({
			isFloatRead: this.getIsFloatRead(),
			isIntegerDivisionAccurate: this.getIsIntegerDivisionAccurate(),
			isTextureFloat: this.getIsTextureFloat(),
			isDrawBuffers,
			kernelMap: isDrawBuffers
		});
	}

	static getIsTextureFloat() {
		return Boolean(testExtensions.OES_texture_float);
	}

	static getIsDrawBuffers() {
		return Boolean(testExtensions.WEBGL_draw_buffers);
	}

	static get testCanvas() {
		return testCanvas;
	}

	static get testContext() {
		return testContext;
	}

	static get features() {
		return features;
	}

	static get fragmentShader() {
		return fragmentShader;
	}

	static get vertexShader() {
		return vertexShader;
	}

	constructor(source, settings) {
		super(source, settings);
		this.textureCache = {};
		this.threadDim = {};
		this.programUniformLocationCache = {};
		this.framebuffer = null;

		this.buffer = null;
		this.program = null;
		this.pipeline = settings.pipeline;
		this.endianness = utils.systemEndianness();
		this.extensions = {};
		this.subKernelOutputTextures = null;
		this.argumentsLength = 0;
		this.constantsLength = 0;
		this.compiledFragmentShader = null;
		this.compiledVertexShader = null;
		this.fragShader = null;
		this.vertShader = null;
		this.drawBuffersMap = null;
		this.outputTexture = null;
		this.maxTexSize = null;
		this.uniform1fCache = {};
		this.uniform1iCache = {};
		this.uniform2fCache = {};
		this.uniform2fvCache = {};
		this.uniform2ivCache = {};
		this.uniform3fvCache = {};
		this.uniform3ivCache = {};

		this.mergeSettings(source.settings || settings);
	}

	initCanvas() {
		if (typeof document !== 'undefined') {
			const canvas = document.createElement('canvas');
			canvas.width = 2;
			canvas.height = 2;
			return canvas;
		} else if (typeof OffscreenCanvas !== 'undefined') {
			return new OffscreenCanvas(0, 0);
		}
	}

	initContext() {
		const settings = {
			alpha: false,
			depth: false,
			antialias: false
		};
		const context = this.canvas.getContext('webgl', settings) || this.canvas.getContext('experimental-webgl', settings);
		return context;
	}

	initPlugins(settings) {
		const pluginsToUse = [];

		if (typeof this.source === 'string') {
			for (let i = 0; i < plugins.length; i++) {
				const plugin = plugins[i];
				if (this.source.match(plugin.functionMatch)) {
					pluginsToUse.push(plugin);
				}
			}
		} else if (typeof this.source === 'object') {
			if (settings.pluginNames) {
				for (let i = 0; i < plugins.length; i++) {
					const plugin = plugins[i];
					const usePlugin = settings.pluginNames.some(pluginName => pluginName === plugin.name);
					if (usePlugin) {
						pluginsToUse.push(plugin);
					}
				}
			}
		}
		return pluginsToUse;
	}

	initExtensions() {
		this.extensions = {
			OES_texture_float: this.context.getExtension('OES_texture_float'),
			OES_texture_float_linear: this.context.getExtension('OES_texture_float_linear'),
			OES_element_index_uint: this.context.getExtension('OES_element_index_uint'),
			WEBGL_draw_buffers: this.context.getExtension('WEBGL_draw_buffers'),
		};
	}

	validateSettings() {
		if (this.skipValidate) {
			this.texSize = utils.dimToTexSize({
				floatTextures: this.floatTextures,
				floatOutput: this.floatOutput
			}, this.output, true);
			return;
		}

		const features = this.constructor.features;
		if (this.floatTextures === true && !features.isTextureFloat) {
			throw new Error('Float textures are not supported');
		} else if (this.floatOutput === true && this.floatOutputForce !== true && !features.isFloatRead) {
			throw new Error('Float texture outputs are not supported');
		} else if (this.floatTextures === undefined && features.isTextureFloat) {
			this.floatTextures = true;
			this.floatOutput = features.isFloatRead;
		}

		if (this.subKernels && this.subKernels.length > 0 && !this.extensions.WEBGL_draw_buffers) {
			throw new Error('could not instantiate draw buffers extension');
		}

		if (this.fixIntegerDivisionAccuracy === null) {
			this.fixIntegerDivisionAccuracy = !features.isIntegerDivisionAccurate;
		} else if (this.fixIntegerDivisionAccuracy && features.isIntegerDivisionAccurate) {
			this.fixIntegerDivisionAccuracy = false;
		}

		this.checkOutput();

		if (!this.output || this.output.length === 0) {
			if (arguments.length !== 1) {
				throw new Error('Auto output only supported for kernels with only one input');
			}

			const argType = utils.getVariableType(arguments[0]);
			if (argType === 'Array') {
				this.output = utils.getDimensions(argType);
			} else if (argType === 'NumberTexture' || argType === 'ArrayTexture(4)') {
				this.output = arguments[0].output;
			} else {
				throw new Error('Auto output not supported for input type: ' + argType);
			}
		}

		this.texSize = utils.dimToTexSize({
			floatTextures: this.floatTextures,
			floatOutput: this.floatOutput
		}, this.output, true);

		if (this.graphical) {
			if (this.output.length !== 2) {
				throw new Error('Output must have 2 dimensions on graphical mode');
			}

			if (this.floatOutput) {
				this.floatOutput = false;
				console.warn('Cannot use graphical mode and float output at the same time');
			}

			this.texSize = utils.clone(this.output);
		} else if (this.floatOutput === undefined && features.isTextureFloat) {
			this.floatOutput = true;
		}
	}

	updateMaxTexSize() {
		const texSize = this.texSize;
		const canvas = this.canvas;
		if (this.maxTexSize === null) {
			let canvasIndex = canvases.indexOf(canvas);
			if (canvasIndex === -1) {
				canvasIndex = canvases.length;
				canvases.push(canvas);
				maxTexSizes[canvasIndex] = [texSize[0], texSize[1]];
			}
			this.maxTexSize = maxTexSizes[canvasIndex];
		}
		if (this.maxTexSize[0] < texSize[0]) {
			this.maxTexSize[0] = texSize[0];
		}
		if (this.maxTexSize[1] < texSize[1]) {
			this.maxTexSize[1] = texSize[1];
		}
	}

	build() {
		this.initExtensions();
		this.validateSettings();
		this.setupConstants();
		this.setupArguments(arguments);
		this.updateMaxTexSize();
		const texSize = this.texSize;
		const gl = this.context;
		const canvas = this.canvas;
		gl.enable(gl.SCISSOR_TEST);
		gl.viewport(0, 0, this.maxTexSize[0], this.maxTexSize[1]);
		canvas.width = this.maxTexSize[0];
		canvas.height = this.maxTexSize[1];
		const threadDim = this.threadDim = utils.clone(this.output);
		while (threadDim.length < 3) {
			threadDim.push(1);
		}

		const compiledVertexShader = this.getVertexShader(arguments);
		const vertShader = gl.createShader(gl.VERTEX_SHADER);
		gl.shaderSource(vertShader, compiledVertexShader);
		gl.compileShader(vertShader);
		this.vertShader = vertShader;

		const compiledFragmentShader = this.getFragmentShader(arguments);
		const fragShader = gl.createShader(gl.FRAGMENT_SHADER);
		gl.shaderSource(fragShader, compiledFragmentShader);
		gl.compileShader(fragShader);
		this.fragShader = fragShader;

		if (this.debug) {
			console.log('GLSL Shader Output:');
			console.log(compiledFragmentShader);
		}

		if (!gl.getShaderParameter(vertShader, gl.COMPILE_STATUS)) {
			throw new Error('Error compiling vertex shader: ' + gl.getShaderInfoLog(vertShader));
		}
		if (!gl.getShaderParameter(fragShader, gl.COMPILE_STATUS)) {
			throw new Error('Error compiling fragment shader: ' + gl.getShaderInfoLog(fragShader));
		}

		const program = this.program = gl.createProgram();
		gl.attachShader(program, vertShader);
		gl.attachShader(program, fragShader);
		gl.linkProgram(program);
		this.framebuffer = gl.createFramebuffer();
		this.framebuffer.width = texSize[0];
		this.framebuffer.height = texSize[1];

		const vertices = new Float32Array([-1, -1,
			1, -1, -1, 1,
			1, 1
		]);
		const texCoords = new Float32Array([
			0, 0,
			1, 0,
			0, 1,
			1, 1
		]);

		const texCoordOffset = vertices.byteLength;

		let buffer = this.buffer;
		if (!buffer) {
			buffer = this.buffer = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
			gl.bufferData(gl.ARRAY_BUFFER, vertices.byteLength + texCoords.byteLength, gl.STATIC_DRAW);
		} else {
			gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		}

		gl.bufferSubData(gl.ARRAY_BUFFER, 0, vertices);
		gl.bufferSubData(gl.ARRAY_BUFFER, texCoordOffset, texCoords);

		const aPosLoc = gl.getAttribLocation(this.program, 'aPos');
		gl.enableVertexAttribArray(aPosLoc);
		gl.vertexAttribPointer(aPosLoc, 2, gl.FLOAT, false, 0, 0);
		const aTexCoordLoc = gl.getAttribLocation(this.program, 'aTexCoord');
		gl.enableVertexAttribArray(aTexCoordLoc);
		gl.vertexAttribPointer(aTexCoordLoc, 2, gl.FLOAT, false, 0, texCoordOffset);
		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);

		for (let p in this.constants) {
			const value = this.constants[p];
			const type = utils.getVariableType(value);
			if (type === 'Float' || type === 'Integer') {
				continue;
			}
			gl.useProgram(this.program);
			this._addConstant(this.constants[p], type, p);
		}

		if (!this.immutable) {
			this._setupOutputTexture();
			if (
				this.subKernels !== null &&
				this.subKernels.length > 0
			) {
				this._setupSubOutputTextures(this.subKernels.length);
			}
		}
	}

	run() {
		if (this.program === null) {
			this.build.apply(this, arguments);
		}
		const argumentNames = this.argumentNames;
		const argumentTypes = this.argumentTypes;
		const texSize = this.texSize;
		const gl = this.context;

		gl.useProgram(this.program);
		gl.scissor(0, 0, texSize[0], texSize[1]);

		if (!this.hardcodeConstants) {
			this.setUniform3iv('uOutputDim', this.threadDim);
			this.setUniform2iv('uTexSize', texSize);
		}

		this.setUniform2f('ratio', texSize[0] / this.maxTexSize[0], texSize[1] / this.maxTexSize[1]);

		this.argumentsLength = 0;
		for (let texIndex = 0; texIndex < argumentNames.length; texIndex++) {
			this._addArgument(arguments[texIndex], argumentTypes[texIndex], argumentNames[texIndex]);
		}

		if (this.plugins) {
			for (let i = 0; i < this.plugins.length; i++) {
				const plugin = this.plugins[i];
				if (plugin.onBeforeRun) {
					plugin.onBeforeRun(this);
				}
			}
		}

		if (this.graphical) {
			if (this.pipeline) {
				gl.bindRenderbuffer(gl.RENDERBUFFER, null);
				gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
				if (!this.outputTexture || this.immutable) {
					this._setupOutputTexture();
				}
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
				return new Texture(this.outputTexture, texSize, this.threadDim, this.output, this.context, 'ArrayTexture(4)');
			}
			gl.bindRenderbuffer(gl.RENDERBUFFER, null);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			return;
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
		if (this.immutable) {
			this._setupOutputTexture();
		}
		const outputTexture = this.outputTexture;

		if (this.subKernels !== null) {
			if (this.immutable) {
				this.subKernelOutputTextures = [];
				this._setupSubOutputTextures(this.subKernels.length);
			}
			this.extensions.WEBGL_draw_buffers.drawBuffersWEBGL(this.drawBuffersMap);
		}

		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

		if (this.subKernelOutputTextures !== null) {
			if (this.subKernels !== null) {
				const output = {
					result: this.renderOutput(outputTexture),
				};
				for (let i = 0; i < this.subKernels.length; i++) {
					output[this.subKernels[i].property] = new Texture(this.subKernelOutputTextures[i], texSize, this.threadDim, this.output, this.context);
				}
				return output;
			}
		}

		return this.renderOutput(outputTexture);
	}

	renderOutput(outputTexture) {
		const texSize = this.texSize;
		const gl = this.context;
		const threadDim = this.threadDim;
		const output = this.output;
		if (this.pipeline) {
			return new Texture(outputTexture, texSize, this.threadDim, output, this.context);
		} else {
			let result;
			if (this.floatOutput) {
				const w = texSize[0];
				const h = Math.ceil(texSize[1] / 4);
				result = new Float32Array(w * h * 4);
				gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, result);
			} else {
				const bytes = new Uint8Array(texSize[0] * texSize[1] * 4);
				gl.readPixels(0, 0, texSize[0], texSize[1], gl.RGBA, gl.UNSIGNED_BYTE, bytes);
				result = new Float32Array(bytes.buffer);
			}
			result = result.subarray(0, threadDim[0] * threadDim[1] * threadDim[2]);

			if (output.length === 1) {
				return result;
			} else if (output.length === 2) {
				return utils.splitArray(result, output[0]);
			} else if (output.length === 3) {
				const cube = utils.splitArray(result, output[0] * output[1]);
				return cube.map(function(x) {
					return utils.splitArray(x, output[0]);
				});
			}
		}
	}

	getOutputTexture() {
		return this.outputTexture;
	}

	_setupOutputTexture() {
		const gl = this.context;
		const texSize = this.texSize;
		const texture = this.outputTexture = this.context.createTexture();
		gl.activeTexture(gl.TEXTURE0 + this.constantsLength + this.argumentNames.length);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		if (this.floatOutput) {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texSize[0], texSize[1], 0, gl.RGBA, gl.FLOAT, null);
		} else {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texSize[0], texSize[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		}
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
	}

	_setupSubOutputTextures(length) {
		const gl = this.context;
		const texSize = this.texSize;
		const drawBuffersMap = this.drawBuffersMap = [gl.COLOR_ATTACHMENT0];
		const textures = this.subKernelOutputTextures = [];
		for (let i = 0; i < length; i++) {
			const texture = this.context.createTexture();
			textures.push(texture);
			drawBuffersMap.push(gl.COLOR_ATTACHMENT0 + i + 1);
			gl.activeTexture(gl.TEXTURE0 + this.constantsLength + this.argumentNames.length + i);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			if (this.floatOutput) {
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texSize[0], texSize[1], 0, gl.RGBA, gl.FLOAT, null);
			} else {
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texSize[0], texSize[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			}
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i + 1, gl.TEXTURE_2D, texture, 0);
		}
	}

	getArgumentTexture(name) {
		return this.getTextureCache(`ARGUMENT_${name}`);
	}

	getTextureCache(name) {
		if (this.textureCache.hasOwnProperty(name)) {
			return this.textureCache[name];
		}
		return this.textureCache[name] = this.context.createTexture();
	}

	detachTextureCache(name) {
		delete this.textureCache[name];
	}

	setUniform1f(name, value) {
		if (this.uniform1fCache.hasOwnProperty(name)) {
			const cache = this.uniform1fCache[name];
			if (value === cache) {
				return;
			}
		}
		this.uniform1fCache[name] = value;
		const loc = this.getUniformLocation(name);
		this.context.uniform1f(loc, value);
	}

	setUniform1i(name, value) {
		if (this.uniform1iCache.hasOwnProperty(name)) {
			const cache = this.uniform1iCache[name];
			if (value === cache) {
				return;
			}
		}
		this.uniform1iCache[name] = value;
		const loc = this.getUniformLocation(name);
		this.context.uniform1i(loc, value);
	}

	setUniform2f(name, value1, value2) {
		if (this.uniform2fCache.hasOwnProperty(name)) {
			const cache = this.uniform2fCache[name];
			if (
				value1 === cache[0] &&
				value2 === cache[1]
			) {
				return;
			}
		}
		this.uniform2fCache[name] = [value1, value2];
		const loc = this.getUniformLocation(name);
		this.context.uniform2f(loc, value1, value2);
	}

	setUniform2fv(name, value) {
		if (this.uniform2fvCache.hasOwnProperty(name)) {
			const cache = this.uniform2fvCache[name];
			if (
				value[0] === cache[0] &&
				value[1] === cache[1]
			) {
				return;
			}
		}
		this.uniform2fvCache[name] = value;
		const loc = this.getUniformLocation(name);
		this.context.uniform2fv(loc, value);
	}

	setUniform2iv(name, value) {
		if (this.uniform2ivCache.hasOwnProperty(name)) {
			const cache = this.uniform2ivCache[name];
			if (
				value[0] === cache[0] &&
				value[1] === cache[1]
			) {
				return;
			}
		}
		this.uniform2ivCache[name] = value;
		const loc = this.getUniformLocation(name);
		this.context.uniform2iv(loc, value);
	}

	setUniform3fv(name, value) {
		if (this.uniform3fvCache.hasOwnProperty(name)) {
			const cache = this.uniform3fvCache[name];
			if (
				value[0] === cache[0] &&
				value[1] === cache[1] &&
				value[2] === cache[2]
			) {
				return;
			}
		}
		this.uniform3fvCache[name] = value;
		const loc = this.getUniformLocation(name);
		this.context.uniform3fv(loc, value);
	}

	setUniform3iv(name, value) {
		if (this.uniform3ivCache.hasOwnProperty(name)) {
			const cache = this.uniform3ivCache[name];
			if (
				value[0] === cache[0] &&
				value[1] === cache[1] &&
				value[2] === cache[2]
			) {
				return;
			}
		}
		this.uniform3ivCache[name] = value;
		const loc = this.getUniformLocation(name);
		this.context.uniform3iv(loc, value);
	}

	getUniformLocation(name) {
		if (this.programUniformLocationCache.hasOwnProperty(name)) {
			return this.programUniformLocationCache[name];
		}
		return this.programUniformLocationCache[name] = this.context.getUniformLocation(this.program, name);
	}

	_getFragShaderArtifactMap(args) {
		return {
			HEADER: this._getHeaderString(),
			LOOP_MAX: this._getLoopMaxString(),
			PLUGINS: this._getPluginsString(),
			CONSTANTS: this._getConstantsString(),
			DECODE32_ENDIANNESS: this._getDecode32EndiannessString(),
			ENCODE32_ENDIANNESS: this._getEncode32EndiannessString(),
			DIVIDE_WITH_INTEGER_CHECK: this._getDivideWithIntegerCheckString(),
			GET_WRAPAROUND: this._getGetWraparoundString(),
			GET_TEXTURE_CHANNEL: this._getGetTextureChannelString(),
			GET_TEXTURE_INDEX: this._getGetTextureIndexString(),
			GET_RESULT: this._getGetResultString(),
			MAIN_CONSTANTS: this._getMainConstantsString(),
			MAIN_ARGUMENTS: this._getMainArgumentsString(args),
			KERNEL: this._getKernelString(),
			MAIN_RESULT: this._getMainResultString()
		};
	}

	_addArgument(value, type, name) {
		const gl = this.context;
		const argumentTexture = this.getArgumentTexture(name);
		if (value instanceof Texture) {
			type = value.type;
		}
		switch (type) {
			case 'Array':
			case 'Array(2)':
			case 'Array(3)':
			case 'Array(4)':
			case 'Array2D':
			case 'Array3D':
				{
					const dim = utils.getDimensions(value, true);
					const size = utils.dimToTexSize({
						floatTextures: this.floatTextures,
						floatOutput: this.floatOutput
					}, dim);
					gl.activeTexture(gl.TEXTURE0 + this.constantsLength + this.argumentsLength);
					gl.bindTexture(gl.TEXTURE_2D, argumentTexture);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

					let length = size[0] * size[1];

					const {
						valuesFlat,
						bitRatio
					} = this._formatArrayTransfer(value, length);

					let buffer;
					if (this.floatTextures) {
						gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size[0], size[1], 0, gl.RGBA, gl.FLOAT, valuesFlat);
					} else {
						buffer = new Uint8Array(valuesFlat.buffer);
						gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size[0] / bitRatio, size[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
					}

					if (!this.hardcodeConstants) {
						this.setUniform3iv(`user_${name}Dim`, dim);
						this.setUniform2iv(`user_${name}Size`, size);
					}
					this.setUniform1i(`user_${name}BitRatio`, bitRatio);
					this.setUniform1i(`user_${name}`, this.argumentsLength);
					break;
				}
			case 'Integer':
			case 'Float':
			case 'Number':
				{
					this.setUniform1f(`user_${name}`, value);
					break;
				}
			case 'Input':
				{
					const input = value;
					const dim = input.size;
					const size = utils.dimToTexSize({
						floatTextures: this.floatTextures,
						floatOutput: this.floatOutput
					}, dim);
					gl.activeTexture(gl.TEXTURE0 + this.constantsLength + this.argumentsLength);
					gl.bindTexture(gl.TEXTURE_2D, argumentTexture);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

					let length = size[0] * size[1];

					const {
						valuesFlat,
						bitRatio
					} = this._formatArrayTransfer(value.value, length);

					if (this.floatTextures) {
						gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size[0], size[1], 0, gl.RGBA, gl.FLOAT, input);
					} else {
						const buffer = new Uint8Array(valuesFlat.buffer);
						gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size[0] / bitRatio, size[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
					}

					if (!this.hardcodeConstants) {
						this.setUniform3iv(`user_${name}Dim`, dim);
						this.setUniform2iv(`user_${name}Size`, size);
					}
					this.setUniform1i(`user_${name}BitRatio`, bitRatio);
					this.setUniform1i(`user_${name}`, this.argumentsLength);
					break;
				}
			case 'HTMLImage':
				{
					const inputImage = value;
					const dim = [inputImage.width, inputImage.height, 1];
					const size = [inputImage.width, inputImage.height];

					gl.activeTexture(gl.TEXTURE0 + this.constantsLength + this.argumentsLength);
					gl.bindTexture(gl.TEXTURE_2D, argumentTexture);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
					gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
					const mipLevel = 0; 
					const internalFormat = gl.RGBA; 
					const srcFormat = gl.RGBA; 
					const srcType = gl.UNSIGNED_BYTE; 
					gl.texImage2D(gl.TEXTURE_2D,
						mipLevel,
						internalFormat,
						srcFormat,
						srcType,
						inputImage);
					this.setUniform3iv(`user_${name}Dim`, dim);
					this.setUniform2iv(`user_${name}Size`, size);
					this.setUniform1i(`user_${name}`, this.argumentsLength);
					break;
				}
			case 'ArrayTexture(4)':
			case 'NumberTexture':
				{
					const inputTexture = value;
					if (inputTexture.context !== this.context) {
						throw new Error(`argument ${ name} (${ type }) must be from same context`);
					}
					const dim = inputTexture.dimensions;
					const size = inputTexture.size;

					gl.activeTexture(gl.TEXTURE0 + this.constantsLength + this.argumentsLength);
					gl.bindTexture(gl.TEXTURE_2D, inputTexture.texture);

					this.setUniform3iv(`user_${name}Dim`, dim);
					this.setUniform2iv(`user_${name}Size`, size);
					this.setUniform1i(`user_${name}BitRatio`, 1); 
					this.setUniform1i(`user_${name}`, this.argumentsLength);
					break;
				}
			default:
				throw new Error('Input type not supported: ' + value);
		}
		this.argumentsLength++;
	}

	_addConstant(value, type, name) {
		const gl = this.context;
		const argumentTexture = this.getArgumentTexture(name);
		if (value instanceof Texture) {
			type = value.type;
		}
		switch (type) {
			case 'Array':
				{
					const dim = utils.getDimensions(value, true);
					const size = utils.dimToTexSize({
						floatTextures: this.floatTextures,
						floatOutput: this.floatOutput
					}, dim);
					gl.activeTexture(gl.TEXTURE0 + this.constantsLength);
					gl.bindTexture(gl.TEXTURE_2D, argumentTexture);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

					let length = size[0] * size[1];

					const {
						valuesFlat,
						bitRatio
					} = this._formatArrayTransfer(value, length);

					let buffer;
					if (this.floatTextures) {
						gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size[0], size[1], 0, gl.RGBA, gl.FLOAT, valuesFlat);
					} else {
						buffer = new Uint8Array(valuesFlat.buffer);
						gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size[0] / bitRatio, size[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
					}

					if (!this.hardcodeConstants) {
						this.setUniform3iv(`constants_${name}Dim`, dim);
						this.setUniform2iv(`constants_${name}Size`, size);
					}
					this.setUniform1i(`constants_${name}BitRatio`, bitRatio);
					this.setUniform1i(`constants_${name}`, this.constantsLength);
					break;
				}
			case 'Input':
				{
					const input = value;
					const dim = input.size;
					const size = utils.dimToTexSize({
						floatTextures: this.floatTextures,
						floatOutput: this.floatOutput
					}, dim);
					gl.activeTexture(gl.TEXTURE0 + this.constantsLength);
					gl.bindTexture(gl.TEXTURE_2D, argumentTexture);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

					let length = size[0] * size[1];
					const {
						valuesFlat,
						bitRatio
					} = this._formatArrayTransfer(value.value, length);

					if (this.floatTextures) {
						gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size[0], size[1], 0, gl.RGBA, gl.FLOAT, inputArray);
					} else {
						const buffer = new Uint8Array(valuesFlat.buffer);
						gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size[0] / bitRatio, size[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
					}

					if (!this.hardcodeConstants) {
						this.setUniform3iv(`constants_${name}Dim`, dim);
						this.setUniform2iv(`constants_${name}Size`, size);
					}
					this.setUniform1i(`constants_${name}BitRatio`, bitRatio);
					this.setUniform1i(`constants_${name}`, this.constantsLength);
					break;
				}
			case 'HTMLImage':
				{
					const inputImage = value;
					const dim = [inputImage.width, inputImage.height, 1];
					const size = [inputImage.width, inputImage.height];

					gl.activeTexture(gl.TEXTURE0 + this.constantsLength);
					gl.bindTexture(gl.TEXTURE_2D, argumentTexture);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
					gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
					const mipLevel = 0; 
					const internalFormat = gl.RGBA; 
					const srcFormat = gl.RGBA; 
					const srcType = gl.UNSIGNED_BYTE; 
					gl.texImage2D(gl.TEXTURE_2D,
						mipLevel,
						internalFormat,
						srcFormat,
						srcType,
						inputImage);
					this.setUniform3iv(`constants_${name}Dim`, dim);
					this.setUniform2iv(`constants_${name}Size`, size);
					this.setUniform1i(`constants_${name}`, this.constantsLength);
					break;
				}
			case 'ArrayTexture(4)':
			case 'NumberTexture':
				{
					const inputTexture = value;
					if (inputTexture.context !== this.context) {
						throw new Error(`argument ${ name} (${ type }) must be from same context`);
					}
					const dim = inputTexture.dimensions;
					const size = inputTexture.size;

					gl.activeTexture(gl.TEXTURE0 + this.constantsLength);
					gl.bindTexture(gl.TEXTURE_2D, inputTexture.texture);
					this.setUniform3iv(`constants_${name}Dim`, dim);
					this.setUniform2iv(`constants_${name}Size`, size);
					this.setUniform1i(`constants_${name}BitRatio`, 1); 
					this.setUniform1i(`constants_${name}`, this.constantsLength);
					break;
				}
			case 'Integer':
			case 'Float':
			default:
				throw new Error('Input type not supported: ' + value);
		}
		this.constantsLength++;
	}

	_formatArrayTransfer(value, length) {
		let bitRatio = 1; 
		let valuesFlat = value;
		if (utils.isArray(value[0]) || this.floatTextures) {
			valuesFlat = new Float32Array(length);
			utils.flattenTo(value, valuesFlat);
		} else {

			switch (value.constructor) {
				case Uint8Array:
				case Int8Array:
					bitRatio = 4;
					break;
				case Uint16Array:
				case Int16Array:
					bitRatio = 2;
				case Float32Array:
				case Int32Array:
					break;

				default:
					valuesFlat = new Float32Array(length);
					utils.flattenTo(value, valuesFlat);
			}
		}
		return {
			bitRatio,
			valuesFlat
		};
	}

	_getHeaderString() {
		return (
			this.subKernels !== null ?
			'#extension GL_EXT_draw_buffers : require\n' :
			''
		);
	}

	_getLoopMaxString() {
		return (
			this.loopMaxIterations ?
			` ${parseInt(this.loopMaxIterations)};\n` :
			' 1000;\n'
		);
	}

	_getPluginsString() {
		if (!this.plugins) return '\n';
		return this.plugins.map(plugin => plugin.source && this.source.match(plugin.functionMatch) ? plugin.source : '').join('\n');
	}

	_getConstantsString() {
		const result = [];
		const threadDim = this.threadDim;
		const texSize = this.texSize;
		if (this.hardcodeConstants) {
			result.push(
				`ivec3 uOutputDim = ivec3(${threadDim[0]}, ${threadDim[1]}, ${threadDim[2]})`,
				`ivec2 uTexSize = ivec2(${texSize[0]}, ${texSize[1]})`
			);
		} else {
			result.push(
				'uniform ivec3 uOutputDim',
				'uniform ivec2 uTexSize'
			);
		}

		return this._linesToString(result);
	}

	_getTextureCoordinate() {
		const subKernels = this.subKernels;
		if (subKernels === null || subKernels.length < 1) {
			return 'varying vec2 vTexCoord;\n';
		} else {
			return 'out vec2 vTexCoord;\n';
		}
	}

	_getDecode32EndiannessString() {
		return (
			this.endianness === 'LE' ?
			'' :
			'  rgba.rgba = rgba.abgr;\n'
		);
	}

	_getEncode32EndiannessString() {
		return (
			this.endianness === 'LE' ?
			'' :
			'  rgba.rgba = rgba.abgr;\n'
		);
	}

	_getDivideWithIntegerCheckString() {
		return this.fixIntegerDivisionAccuracy ?
			`float div_with_int_check(float x, float y) {
  if (floor(x) == x && floor(y) == y && integerMod(x, y) == 0.0) {
    return float(int(x)/int(y));
  }
  return x / y;
}` :
			'';
	}

	_getGetWraparoundString() {
		return (
			this.wraparound ?
			'  xyz = mod(xyz, texDim);\n' :
			''
		);
	}

	_getGetTextureChannelString() {
		if (!this.floatTextures) return '';

		return this._linesToString([
			'  int channel = integerMod(index, 4)',
			'  index = index / 4'
		]);
	}

	_getGetTextureIndexString() {
		return (
			this.floatTextures ?
			'  index = index / 4;\n' :
			''
		);
	}

	_getGetResultString() {
		if (!this.floatTextures) {
			return '  return decode(texel, x, bitRatio);';
		}
		return this._linesToString([
			'  if (channel == 0) return texel.r',
			'  if (channel == 1) return texel.g',
			'  if (channel == 2) return texel.b',
			'  if (channel == 3) return texel.a'
		]);
	}

	_getMainArgumentsString(args) {
		const result = [];
		const argumentTypes = this.argumentTypes;
		const argumentNames = this.argumentNames;
		for (let i = 0; i < argumentNames.length; i++) {
			const value = args[i];
			const name = argumentNames[i];
			const type = argumentTypes[i];
			if (this.hardcodeConstants) {
				if (type === 'Array' || type === 'NumberTexture' || type === 'ArrayTexture(4)') {
					const dim = utils.getDimensions(value, true);
					const size = utils.dimToTexSize({
						floatTextures: this.floatTextures,
						floatOutput: this.floatOutput
					}, dim);

					result.push(
						`uniform sampler2D user_${name}`,
						`ivec2 user_${name}Size = ivec2(${size[0]}, ${size[1]})`,
						`ivec3 user_${name}Dim = ivec3(${dim[0]}, ${dim[1]}, ${dim[2]})`,
						`uniform int user_${name}BitRatio`
					);
				} else if (type === 'Integer') {
					result.push(`float user_${name} = ${value}.0`);
				} else if (type === 'Float') {
					result.push(`float user_${name} = ${value}`);
				}
			} else {
				if (type === 'Array' || type === 'NumberTexture' || type === 'ArrayTexture(4)' || type === 'Input' || type === 'HTMLImage') {
					result.push(
						`uniform sampler2D user_${name}`,
						`uniform ivec2 user_${name}Size`,
						`uniform ivec3 user_${name}Dim`
					);
					if (type !== 'HTMLImage') {
						result.push(`uniform int user_${name}BitRatio`)
					}
				} else if (type === 'Integer' || type === 'Float' || type === 'Number') {
					result.push(`uniform float user_${name}`);
				} else {
					throw new Error(`Param type ${type} not supported in WebGL`);
				}
			}
		}
		return this._linesToString(result);
	}

	_getMainConstantsString() {
		const result = [];
		if (this.constants) {
			for (let name in this.constants) {
				if (!this.constants.hasOwnProperty(name)) continue;
				let value = this.constants[name];
				let type = utils.getVariableType(value);
				switch (type) {
					case 'Integer':
						result.push('const int constants_' + name + ' = ' + parseInt(value));
						break;
					case 'Float':
						result.push('const float constants_' + name + ' = ' + parseFloat(value));
						break;
					case 'Array':
					case 'Input':
					case 'HTMLImage':
					case 'NumberTexture':
					case 'ArrayTexture(4)':
						result.push(
							`uniform sampler2D constants_${name}`,
							`uniform ivec2 constants_${name}Size`,
							`uniform ivec3 constants_${name}Dim`,
							`uniform int constants_${name}BitRatio`
						);
						break;
					default:
						throw new Error(`Unsupported constant ${name} type ${type}`);
				}
			}
		}
		return this._linesToString(result);
	}

	_getKernelString() {
		const result = [];
		const subKernels = this.subKernels;
		if (subKernels !== null) {
			result.push('float kernelResult = 0.0');
			for (let i = 0; i < subKernels.length; i++) {
				result.push(
					`float subKernelResult_${subKernels[i].name} = 0.0`
				);
			}
		} else {
			result.push('float kernelResult = 0.0');
		}

		const functionBuilder = FunctionBuilder.fromKernel(this, WebGLFunctionNode, {
			fixIntegerDivisionAccuracy: this.fixIntegerDivisionAccuracy
		});

		return this._linesToString(result) + functionBuilder.getPrototypeString('kernel');
	}

	_getMainResultString() {
		const subKernels = this.subKernels;
		const result = [];

		if (this.floatOutput) {
			result.push('  index *= 4');
		}

		if (this.graphical) {
			result.push(
				'  threadId = indexTo3D(index, uOutputDim)',
				'  kernel()',
				'  gl_FragColor = actualColor'
			);
		} else if (this.floatOutput) {
			const channels = ['r', 'g', 'b', 'a'];

			for (let i = 0; i < channels.length; ++i) {
				result.push('  threadId = indexTo3D(index, uOutputDim)');
				result.push('  kernel()');

				if (subKernels) {
					result.push(`  gl_FragData[0].${channels[i]} = kernelResult`);

					for (let j = 0; j < subKernels.length; ++j) {
						result.push(`  gl_FragData[${j + 1}].${channels[i]} = subKernelResult_${subKernels[j].name}`);
					}
				} else {
					result.push(`  gl_FragColor.${channels[i]} = kernelResult`);
				}

				if (i < channels.length - 1) {
					result.push('  index += 1');
				}
			}
		} else if (subKernels !== null) {
			result.push('  threadId = indexTo3D(index, uOutputDim)');
			result.push('  kernel()');
			result.push('  gl_FragData[0] = encode32(kernelResult)');
			for (let i = 0; i < subKernels.length; i++) {
				result.push(`  gl_FragData[${i + 1}] = encode32(subKernelResult_${subKernels[i].name})`);
			}
		} else {
			result.push(
				'  threadId = indexTo3D(index, uOutputDim)',
				'  kernel()',
				'  gl_FragColor = encode32(kernelResult)'
			);
		}

		return this._linesToString(result);
	}

	_linesToString(lines) {
		if (lines.length > 0) {
			return lines.join(';\n') + ';\n';
		} else {
			return '\n';
		}
	}

	replaceArtifacts(src, map) {
		return src.replace(/[ ]*__([A-Z]+[0-9]*([_]?[A-Z])*)__;\n/g, (match, artifact) => {
			if (map.hasOwnProperty(artifact)) {
				return map[artifact];
			}
			throw `unhandled artifact ${artifact}`;
		});
	}

	getFragmentShader(args) {
		if (this.compiledFragmentShader !== null) {
			return this.compiledFragmentShader;
		}
		return this.compiledFragmentShader = this.replaceArtifacts(this.constructor.fragmentShader, this._getFragShaderArtifactMap(args));
	}

	getVertexShader(args) {
		if (this.compiledVertexShader !== null) {
			return this.compiledVertexShader;
		}
		return this.compiledVertexShader = this.constructor.vertexShader;
	}

	toString() {
		return webGLKernelString(this);
	}

	destroy(removeCanvasReferences) {
		if (this.outputTexture) {
			this.context.deleteTexture(this.outputTexture);
		}
		if (this.buffer) {
			this.context.deleteBuffer(this.buffer);
		}
		if (this.framebuffer) {
			this.context.deleteFramebuffer(this.framebuffer);
		}
		if (this.vertShader) {
			this.context.deleteShader(this.vertShader);
		}
		if (this.fragShader) {
			this.context.deleteShader(this.fragShader);
		}
		if (this.program) {
			this.context.deleteProgram(this.program);
		}

		const keys = Object.keys(this.textureCache);

		for (let i = 0; i < keys.length; i++) {
			const name = keys[i];
			this.context.deleteTexture(this.textureCache[name]);
		}

		if (this.subKernelOutputTextures) {
			for (let i = 0; i < this.subKernelOutputTextures.length; i++) {
				this.context.deleteTexture(this.subKernelOutputTextures[i]);
			}
		}
		if (removeCanvasReferences) {
			const idx = canvases.indexOf(this.canvas);
			if (idx >= 0) {
				canvases[idx] = null;
				maxTexSizes[idx] = null;
			}
		}
		this.destroyExtensions();
		delete this.context;
		delete this.canvas;
	}

	destroyExtensions() {
		this.extensions.OES_texture_float = null;
		this.extensions.OES_texture_float_linear = null;
		this.extensions.OES_element_index_uint = null;
	}

	static destroyContext(context) {
		const extension = context.getExtension('WEBGL_lose_context');
		if (extension) {
			extension.loseContext();
		}
	}

	toJSON() {
		const json = super.toJSON();
		json.functionNodes = FunctionBuilder.fromKernel(this, WebGLFunctionNode).toJSON();
		return json;
	}
}

module.exports = {
	WebGLKernel
};
},{"../../plugins/triangle-noise":26,"../../texture":27,"../../utils":28,"../function-builder":7,"../gl-kernel":9,"./fragment-shader":12,"./function-node":13,"./kernel-string":14,"./vertex-shader":16}],16:[function(require,module,exports){
const vertexShader = `precision highp float;
precision highp int;
precision highp sampler2D;

attribute vec2 aPos;
attribute vec2 aTexCoord;

varying vec2 vTexCoord;
uniform vec2 ratio;

void main(void) {
  gl_Position = vec4((aPos + vec2(1)) * ratio + vec2(-1), 0, 1);
  vTexCoord = aTexCoord;
}`;

module.exports = {
	vertexShader
};
},{}],17:[function(require,module,exports){
const fragmentShader = `#version 300 es
__HEADER__;
precision highp float;
precision highp int;
precision highp sampler2D;

const int LOOP_MAX = __LOOP_MAX__;

__PLUGINS__;
__CONSTANTS__;

in vec2 vTexCoord;

vec2 integerMod(vec2 x, float y) {
  vec2 res = floor(mod(x, y));
  return res * step(1.0 - floor(y), -res);
}

vec3 integerMod(vec3 x, float y) {
  vec3 res = floor(mod(x, y));
  return res * step(1.0 - floor(y), -res);
}

vec4 integerMod(vec4 x, vec4 y) {
  vec4 res = floor(mod(x, y));
  return res * step(1.0 - floor(y), -res);
}

float integerMod(float x, float y) {
  float res = floor(mod(x, y));
  return res * (res > floor(y) - 1.0 ? 0.0 : 1.0);
}

int integerMod(int x, int y) {
  return x - (y * int(x/y));
}

__DIVIDE_WITH_INTEGER_CHECK__;

// Here be dragons!
// DO NOT OPTIMIZE THIS CODE
// YOU WILL BREAK SOMETHING ON SOMEBODY\'S MACHINE
// LEAVE IT AS IT IS, LEST YOU WASTE YOUR OWN TIME
const vec2 MAGIC_VEC = vec2(1.0, -256.0);
const vec4 SCALE_FACTOR = vec4(1.0, 256.0, 65536.0, 0.0);
const vec4 SCALE_FACTOR_INV = vec4(1.0, 0.00390625, 0.0000152587890625, 0.0); // 1, 1/256, 1/65536
float decode32(vec4 rgba) {
  __DECODE32_ENDIANNESS__;
  rgba *= 255.0;
  vec2 gte128;
  gte128.x = rgba.b >= 128.0 ? 1.0 : 0.0;
  gte128.y = rgba.a >= 128.0 ? 1.0 : 0.0;
  float exponent = 2.0 * rgba.a - 127.0 + dot(gte128, MAGIC_VEC);
  float res = exp2(round(exponent));
  rgba.b = rgba.b - 128.0 * gte128.x;
  res = dot(rgba, SCALE_FACTOR) * exp2(round(exponent-23.0)) + res;
  res *= gte128.y * -2.0 + 1.0;
  return res;
}

vec4 encode32(float f) {
  float F = abs(f);
  float sign = f < 0.0 ? 1.0 : 0.0;
  float exponent = floor(log2(F));
  float mantissa = (exp2(-exponent) * F);
  // exponent += floor(log2(mantissa));
  vec4 rgba = vec4(F * exp2(23.0-exponent)) * SCALE_FACTOR_INV;
  rgba.rg = integerMod(rgba.rg, 256.0);
  rgba.b = integerMod(rgba.b, 128.0);
  rgba.a = exponent*0.5 + 63.5;
  rgba.ba += vec2(integerMod(exponent+127.0, 2.0), sign) * 128.0;
  rgba = floor(rgba);
  rgba *= 0.003921569; // 1/255
  __ENCODE32_ENDIANNESS__;
  return rgba;
}
// Dragons end here

float decode(vec4 rgba, int x, int bitRatio) {
  if (bitRatio == 1) {
    return decode32(rgba);
  }
  __DECODE32_ENDIANNESS__;
  int channel = integerMod(x, bitRatio);
  if (bitRatio == 4) {
    return rgba[channel] * 255.0;
  }
  else {
    return rgba[channel*2] * 255.0 + rgba[channel*2 + 1] * 65280.0;
  }
}

int index;
ivec3 threadId;

ivec3 indexTo3D(int idx, ivec3 texDim) {
  int z = int(idx / (texDim.x * texDim.y));
  idx -= z * int(texDim.x * texDim.y);
  int y = int(idx / texDim.x);
  int x = int(integerMod(idx, texDim.x));
  return ivec3(x, y, z);
}

float get(sampler2D tex, ivec2 texSize, ivec3 texDim, int bitRatio, int z, int y, int x) {
  ivec3 xyz = ivec3(x, y, z);
  __GET_WRAPAROUND__;
  int index = xyz.x + texDim.x * (xyz.y + texDim.y * xyz.z);
  __GET_TEXTURE_CHANNEL__;
  int w = texSize.x;
  vec2 st = vec2(float(integerMod(index, w)), float(index / w)) + 0.5;
  __GET_TEXTURE_INDEX__;
  vec4 texel = texture(tex, st / vec2(texSize));
  __GET_RESULT__;
}

vec4 getImage2D(sampler2D tex, ivec2 texSize, ivec3 texDim, int z, int y, int x) {
  ivec3 xyz = ivec3(x, y, z);
  __GET_WRAPAROUND__;
  int index = xyz.x + texDim.x * (xyz.y + texDim.y * xyz.z);
  __GET_TEXTURE_CHANNEL__;
  int w = texSize.x;
  vec2 st = vec2(float(integerMod(index, w)), float(index / w)) + 0.5;
  __GET_TEXTURE_INDEX__;
  return texture(tex, st / vec2(texSize));
}

vec4 getImage3D(sampler2DArray tex, ivec2 texSize, ivec3 texDim, int z, int y, int x) {
  ivec3 xyz = ivec3(x, y, z);
  __GET_WRAPAROUND__;
  int index = xyz.x + texDim.x * (xyz.y + texDim.y * xyz.z);
  __GET_TEXTURE_CHANNEL__;
  int w = texSize.x;
  vec2 st = vec2(float(integerMod(index, w)), float(index / w)) + 0.5;
  __GET_TEXTURE_INDEX__;
  return texture(tex, vec3(st / vec2(texSize), z));
}

vec4 actualColor;
void color(float r, float g, float b, float a) {
  actualColor = vec4(r,g,b,a);
}

void color(float r, float g, float b) {
  color(r,g,b,1.0);
}

__MAIN_CONSTANTS__;
__MAIN_ARGUMENTS__;
__KERNEL__;

void main(void) {
  index = int(vTexCoord.s * float(uTexSize.x)) + int(vTexCoord.t * float(uTexSize.y)) * uTexSize.x;
  __MAIN_RESULT__;
}`;

module.exports = {
	fragmentShader
};
},{}],18:[function(require,module,exports){
const {
	WebGLFunctionNode
} = require('../web-gl/function-node');

class WebGL2FunctionNode extends WebGLFunctionNode {

	astIdentifierExpression(idtNode, retArr) {
		if (idtNode.type !== 'Identifier') {
			throw this.astErrorOutput(
				'IdentifierExpression - not an Identifier',
				idtNode
			);
		}

		switch (idtNode.name) {
			case 'Infinity':
				retArr.push('intBitsToFloat(2139095039)');
				break;
			default:
				const userArgumentName = this.getUserArgumentName(idtNode.name);
				if (userArgumentName) {
					retArr.push(`user_${userArgumentName}`);
				} else {
					retArr.push(`user_${idtNode.name}`);
				}
		}

		return retArr;
	}
}

module.exports = {
	WebGL2FunctionNode
};
},{"../web-gl/function-node":13}],19:[function(require,module,exports){
const {
	WebGLKernel
} = require('../web-gl/kernel');
const {
	WebGL2FunctionNode
} = require('./function-node');
const {
	FunctionBuilder
} = require('../function-builder');
const {
	utils
} = require('../../utils');
const {
	Texture
} = require('../../texture');
const {
	fragmentShader
} = require('./fragment-shader');
const {
	vertexShader
} = require('./vertex-shader');

let isSupported = null;
let testCanvas = null;
let testContext = null;
let testExtensions = null;
let features = null;

class WebGL2Kernel extends WebGLKernel {
	static get isSupported() {
		if (isSupported !== null) {
			return isSupported;
		}
		this.setupFeatureChecks();
		isSupported = this.isContextMatch(testContext);
		return isSupported;
	}

	static setupFeatureChecks() {
		if (typeof document !== 'undefined') {
			testCanvas = document.createElement('canvas');
		} else if (typeof OffscreenCanvas !== 'undefined') {
			testCanvas = new OffscreenCanvas(0, 0);
		}

		if (testCanvas) {
			testContext = testCanvas.getContext('webgl2');
			if (!testContext) return;
			testExtensions = {
				EXT_color_buffer_float: testContext.getExtension('EXT_color_buffer_float'),
				OES_texture_float_linear: testContext.getExtension('OES_texture_float_linear'),
			};
			features = this.getFeatures();
		}
	}

	static isContextMatch(context) {
		if (typeof WebGL2RenderingContext !== 'undefined') {
			return context instanceof WebGL2RenderingContext;
		}
		return false;
	}

	static getFeatures() {
		return Object.freeze({
			isFloatRead: this.getIsFloatRead(),
			isIntegerDivisionAccurate: this.getIsIntegerDivisionAccurate(),
			kernelMap: true
		});
	}

	static getIsIntegerDivisionAccurate() {
		return super.getIsIntegerDivisionAccurate();
	}

	static get testCanvas() {
		return testCanvas;
	}

	static get testContext() {
		return testContext;
	}

	static get features() {
		return features;
	}

	static get fragmentShader() {
		return fragmentShader;
	}
	static get vertexShader() {
		return vertexShader;
	}

	initContext() {
		const settings = {
			alpha: false,
			depth: false,
			antialias: false
		};
		const context = this.canvas.getContext('webgl2', settings);
		return context;
	}

	initExtensions() {
		this.extensions = {
			EXT_color_buffer_float: this.context.getExtension('EXT_color_buffer_float'),
			OES_texture_float_linear: this.context.getExtension('OES_texture_float_linear'),
		};
	}

	validateSettings() {
		if (this.skipValidate) {
			this.texSize = utils.dimToTexSize({
				floatTextures: this.floatTextures,
				floatOutput: this.floatOutput
			}, this.output, true);
			return;
		}

		const features = this.constructor.features;
		if (this.floatOutput === true && this.floatOutputForce !== true && !features.isFloatRead) {
			throw new Error('Float texture outputs are not supported');
		} else if (this.floatTextures === undefined) {
			this.floatTextures = true;
			this.floatOutput = features.isFloatRead;
		}

		if (this.fixIntegerDivisionAccuracy === null) {
			this.fixIntegerDivisionAccuracy = !features.isIntegerDivisionAccurate;
		} else if (this.fixIntegerDivisionAccuracy && features.isIntegerDivisionAccurate) {
			this.fixIntegerDivisionAccuracy = false;
		}

		this.checkOutput();

		if (!this.output || this.output.length === 0) {
			if (arguments.length !== 1) {
				throw new Error('Auto output only supported for kernels with only one input');
			}

			const argType = utils.getVariableType(arguments[0]);
			if (argType === 'Array') {
				this.output = utils.getDimensions(argType);
			} else if (argType === 'NumberTexture' || argType === 'ArrayTexture(4)') {
				this.output = arguments[0].output;
			} else {
				throw new Error('Auto output not supported for input type: ' + argType);
			}
		}

		this.texSize = utils.dimToTexSize({
			floatTextures: this.floatTextures,
			floatOutput: this.floatOutput
		}, this.output, true);

		if (this.graphical) {
			if (this.output.length !== 2) {
				throw new Error('Output must have 2 dimensions on graphical mode');
			}

			if (this.floatOutput) {
				this.floatOutput = false;
				console.warn('Cannot use graphical mode and float output at the same time');
			}

			this.texSize = utils.clone(this.output);
		} else if (this.floatOutput === undefined) {
			this.floatOutput = true;
		}

		if (this.floatOutput || this.floatOutputForce) {
			this.context.getExtension('EXT_color_buffer_float');
		}
	}

	run() {
		if (this.program === null) {
			this.build.apply(this, arguments);
		}
		const argumentNames = this.argumentNames;
		const argumentTypes = this.argumentTypes;
		const texSize = this.texSize;
		const gl = this.context;

		gl.useProgram(this.program);
		gl.scissor(0, 0, texSize[0], texSize[1]);

		if (!this.hardcodeConstants) {
			this.setUniform3iv('uOutputDim', new Int32Array(this.threadDim));
			this.setUniform2iv('uTexSize', texSize);
		}

		this.setUniform2f('ratio', texSize[0] / this.maxTexSize[0], texSize[1] / this.maxTexSize[1]);

		this.argumentsLength = 0;
		for (let texIndex = 0; texIndex < argumentNames.length; texIndex++) {
			this._addArgument(arguments[texIndex], argumentTypes[texIndex], argumentNames[texIndex]);
		}

		if (this.plugins) {
			for (let i = 0; i < this.plugins.length; i++) {
				const plugin = this.plugins[i];
				if (plugin.onBeforeRun) {
					plugin.onBeforeRun(this);
				}
			}
		}

		if (this.graphical) {
			if (this.pipeline) {
				gl.bindRenderbuffer(gl.RENDERBUFFER, null);
				gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
				if (!this.outputTexture || this.immutable) {
					this._setupOutputTexture();
				}
				gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
				return new Texture(this.outputTexture, texSize, this.threadDim, this.output, this.context, 'ArrayTexture(4)');
			}
			gl.bindRenderbuffer(gl.RENDERBUFFER, null);
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
			return;
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
		if (this.immutable) {
			this._setupOutputTexture();
		}
		const outputTexture = this.outputTexture;

		if (this.subKernels !== null) {
			if (this.immutable) {
				this.subKernelOutputTextures = [];
				this._setupSubOutputTextures(this.subKernels.length);
			}
			gl.drawBuffers(this.drawBuffersMap);
		}

		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

		if (this.subKernelOutputTextures !== null) {
			if (this.subKernels !== null) {
				const output = {
					result: this.renderOutput(outputTexture)
				};
				for (let i = 0; i < this.subKernels.length; i++) {
					output[this.subKernels[i].property] = new Texture(this.subKernelOutputTextures[i], texSize, this.threadDim, this.output, this.context);
				}
				return output;
			}
		}

		return this.renderOutput(outputTexture);
	}

	drawBuffers() {
		this.context.drawBuffers(this.drawBuffersMap);
	}

	getOutputTexture() {
		return this.outputTexture;
	}

	_setupOutputTexture() {
		const gl = this.context;
		const texSize = this.texSize;
		const texture = this.outputTexture = this.context.createTexture();
		gl.activeTexture(gl.TEXTURE0 + this.constantsLength + this.argumentNames.length);
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		if (this.floatOutput) {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, texSize[0], texSize[1], 0, gl.RGBA, gl.FLOAT, null);
		} else {
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texSize[0], texSize[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		}
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
	}

	_setupSubOutputTextures(length) {
		const gl = this.context;
		const texSize = this.texSize;
		const drawBuffersMap = this.drawBuffersMap = [gl.COLOR_ATTACHMENT0];
		const textures = this.subKernelOutputTextures = [];
		for (let i = 0; i < length; i++) {
			const texture = this.context.createTexture();
			textures.push(texture);
			drawBuffersMap.push(gl.COLOR_ATTACHMENT0 + i + 1);
			gl.activeTexture(gl.TEXTURE0 + this.constantsLength + this.argumentNames.length + i);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
			if (this.floatOutput) {
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, texSize[0], texSize[1], 0, gl.RGBA, gl.FLOAT, null);
			} else {
				gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, texSize[0], texSize[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
			}
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i + 1, gl.TEXTURE_2D, texture, 0);
		}
	}


	_addArgument(value, type, name) {
		const gl = this.context;
		const argumentTexture = this.getArgumentTexture(name);
		if (value instanceof Texture) {
			type = value.type;
		}
		switch (type) {
			case 'Array':
				{
					const dim = utils.getDimensions(value, true);
					const size = utils.dimToTexSize({
						floatTextures: this.floatTextures,
						floatOutput: this.floatOutput
					}, dim);
					gl.activeTexture(gl.TEXTURE0 + this.constantsLength + this.argumentsLength);
					gl.bindTexture(gl.TEXTURE_2D, argumentTexture);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

					let length = size[0] * size[1];

					const {
						valuesFlat,
						bitRatio
					} = this._formatArrayTransfer(value, length);

					let buffer;
					if (this.floatTextures) {
						gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, size[0], size[1], 0, gl.RGBA, gl.FLOAT, valuesFlat);
					} else {
						buffer = new Uint8Array(valuesFlat.buffer);
						gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size[0] / bitRatio, size[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
					}

					if (!this.hardcodeConstants) {
						this.setUniform3iv(`user_${name}Dim`, dim);
						this.setUniform2iv(`user_${name}Size`, size);
					}
					this.setUniform1i(`user_${name}BitRatio`, bitRatio);
					this.setUniform1i(`user_${name}`, this.argumentsLength);
					break;
				}
			case 'Integer':
			case 'Float':
			case 'Number':
				{
					this.setUniform1f(`user_${name}`, value);
					break;
				}
			case 'Input':
				{
					const input = value;
					const dim = input.size;
					const size = utils.dimToTexSize({
						floatTextures: this.floatTextures,
						floatOutput: this.floatOutput
					}, dim);
					gl.activeTexture(gl.TEXTURE0 + this.constantsLength + this.argumentsLength);
					gl.bindTexture(gl.TEXTURE_2D, argumentTexture);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

					let length = size[0] * size[1];
					const {
						valuesFlat,
						bitRatio
					} = this._formatArrayTransfer(value.value, length);

					if (this.floatTextures) {
						gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, size[0], size[1], 0, gl.RGBA, gl.FLOAT, inputArray);
					} else {
						const buffer = new Uint8Array(valuesFlat.buffer);
						gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size[0] / bitRatio, size[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
					}

					if (!this.hardcodeConstants) {
						this.setUniform3iv(`user_${name}Dim`, dim);
						this.setUniform2iv(`user_${name}Size`, size);
					}
					this.setUniform1i(`user_${name}BitRatio`, bitRatio);
					this.setUniform1i(`user_${name}`, this.argumentsLength);
					break;
				}
			case 'HTMLImage':
				{
					const inputImage = value;
					const dim = [inputImage.width, inputImage.height, 1];
					const size = [inputImage.width, inputImage.height];

					gl.activeTexture(gl.TEXTURE0 + this.constantsLength + this.argumentsLength);
					gl.bindTexture(gl.TEXTURE_2D, argumentTexture);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
					gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
					const mipLevel = 0; 
					const internalFormat = gl.RGBA; 
					const srcFormat = gl.RGBA; 
					const srcType = gl.UNSIGNED_BYTE; 
					gl.texImage2D(gl.TEXTURE_2D,
						mipLevel,
						internalFormat,
						srcFormat,
						srcType,
						inputImage);
					this.setUniform3iv(`user_${name}Dim`, dim);
					this.setUniform2iv(`user_${name}Size`, size);
					this.setUniform1i(`user_${name}`, this.argumentsLength);
					break;
				}
			case 'HTMLImageArray':
				{
					const inputImages = value;
					const dim = [inputImages[0].width, inputImages[0].height, inputImages.length];
					const size = [inputImages[0].width, inputImages[0].height];

					gl.activeTexture(gl.TEXTURE0 + this.constantsLength + this.argumentsLength);
					gl.bindTexture(gl.TEXTURE_2D_ARRAY, argumentTexture);
					gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
					gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
					gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
					const mipLevel = 0; 
					const internalFormat = gl.RGBA; 
					const width = inputImages[0].width;
					const height = inputImages[0].height;
					const textureDepth = inputImages.length;
					const border = 0;
					const srcFormat = gl.RGBA; 
					const srcType = gl.UNSIGNED_BYTE; 
					gl.texImage3D(
						gl.TEXTURE_2D_ARRAY,
						mipLevel,
						internalFormat,
						width,
						height,
						textureDepth,
						border,
						srcFormat,
						srcType,
						null
					);
					for (let i = 0; i < inputImages.length; i++) {
						const xOffset = 0;
						const yOffset = 0;
						const imageDepth = 1;
						gl.texSubImage3D(
							gl.TEXTURE_2D_ARRAY,
							mipLevel,
							xOffset,
							yOffset,
							i,
							inputImages[i].width,
							inputImages[i].height,
							imageDepth,
							srcFormat,
							srcType,
							inputImages[i]
						);
					}
					this.setUniform3iv(`user_${name}Dim`, dim);
					this.setUniform2iv(`user_${name}Size`, size);
					this.setUniform1i(`user_${name}`, this.argumentsLength);
					break;
				}
			case 'ArrayTexture(4)':
			case 'NumberTexture':
				{
					const inputTexture = value;
					if (inputTexture.context !== this.context) {
						throw new Error(`argument ${ name} (${ type }) must be from same context`);
					}
					const dim = inputTexture.dimensions;
					const size = inputTexture.size;

					gl.activeTexture(gl.TEXTURE0 + this.constantsLength + this.argumentsLength);
					gl.bindTexture(gl.TEXTURE_2D, inputTexture.texture);

					this.setUniform3iv(`user_${name}Dim`, dim);
					this.setUniform2iv(`user_${name}Size`, size);
					this.setUniform1i(`user_${name}BitRatio`, 1); 
					this.setUniform1i(`user_${name}`, this.argumentsLength);
					break;
				}
			default:
				throw new Error('Input type not supported: ' + value);
		}
		this.argumentsLength++;
	}

	_getMainConstantsString() {
		const result = [];
		if (this.constants) {
			for (let name in this.constants) {
				if (!this.constants.hasOwnProperty(name)) continue;
				let value = this.constants[name];
				let type = utils.getVariableType(value);
				switch (type) {
					case 'Integer':
						result.push('const int constants_' + name + ' = ' + parseInt(value));
						break;
					case 'Float':
						result.push('const float constants_' + name + ' = ' + parseFloat(value));
						break;
					case 'Array':
					case 'Input':
					case 'HTMLImage':
					case 'ArrayTexture(4)':
					case 'NumberTexture':
						result.push(
							`uniform highp sampler2D constants_${ name }`,
							`uniform highp ivec2 constants_${ name }Size`,
							`uniform highp ivec3 constants_${ name }Dim`,
							`uniform highp int constants_${ name }BitRatio`
						);
						break;
					case 'HTMLImageArray':
						result.push(
							`uniform highp sampler2DArray constants_${ name }`,
							`uniform highp ivec2 constants_${ name }Size`,
							`uniform highp ivec3 constants_${ name }Dim`,
							`uniform highp int constants_${ name }BitRatio`
						);
						break;

					default:
						throw new Error(`Unsupported constant ${ name } type ${ type }`);
				}
			}
		}
		return this._linesToString(result);
	}

	_addConstant(value, type, name) {
		const gl = this.context;
		const argumentTexture = this.getArgumentTexture(name);
		if (value instanceof Texture) {
			type = value.type;
		}
		switch (type) {
			case 'Array':
				{
					const dim = utils.getDimensions(value, true);
					const size = utils.dimToTexSize({
						floatTextures: this.floatTextures,
						floatOutput: this.floatOutput
					}, dim);
					gl.activeTexture(gl.TEXTURE0 + this.constantsLength);
					gl.bindTexture(gl.TEXTURE_2D, argumentTexture);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

					let length = size[0] * size[1];

					const {
						valuesFlat,
						bitRatio
					} = this._formatArrayTransfer(value, length);

					let buffer;
					if (this.floatTextures) {
						gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size[0], size[1], 0, gl.RGBA, gl.FLOAT, valuesFlat);
					} else {
						buffer = new Uint8Array(valuesFlat.buffer);
						gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size[0] / bitRatio, size[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
					}

					if (!this.hardcodeConstants) {
						this.setUniform3iv(`constants_${name}Dim`, dim);
						this.setUniform2iv(`constants_${name}Size`, size);
					}
					this.setUniform1i(`constants_${name}BitRatio`, bitRatio);
					this.setUniform1i(`constants_${name}`, this.constantsLength);
					break;
				}
			case 'Input':
				{
					const input = value;
					const dim = input.size;
					const size = utils.dimToTexSize({
						floatTextures: this.floatTextures,
						floatOutput: this.floatOutput
					}, dim);
					gl.activeTexture(gl.TEXTURE0 + this.constantsLength);
					gl.bindTexture(gl.TEXTURE_2D, argumentTexture);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

					let length = size[0] * size[1];
					const {
						valuesFlat,
						bitRatio
					} = this._formatArrayTransfer(value.value, length);

					if (this.floatTextures) {
						gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, size[0], size[1], 0, gl.RGBA, gl.FLOAT, inputArray);
					} else {
						const buffer = new Uint8Array(valuesFlat.buffer);
						gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size[0] / bitRatio, size[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, buffer);
					}

					if (!this.hardcodeConstants) {
						this.setUniform3iv(`constants_${name}Dim`, dim);
						this.setUniform2iv(`constants_${name}Size`, size);
					}
					this.setUniform1i(`constants_${name}BitRatio`, bitRatio);
					this.setUniform1i(`constants_${name}`, this.constantsLength);
					break;
				}
			case 'HTMLImage':
				{
					const inputImage = value;
					const dim = [inputImage.width, inputImage.height, 1];
					const size = [inputImage.width, inputImage.height];

					gl.activeTexture(gl.TEXTURE0 + this.constantsLength);
					gl.bindTexture(gl.TEXTURE_2D, argumentTexture);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
					gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
					gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
					const mipLevel = 0; 
					const internalFormat = gl.RGBA; 
					const srcFormat = gl.RGBA; 
					const srcType = gl.UNSIGNED_BYTE; 
					gl.texImage2D(gl.TEXTURE_2D,
						mipLevel,
						internalFormat,
						srcFormat,
						srcType,
						inputImage);
					this.setUniform3iv(`constants_${name}Dim`, dim);
					this.setUniform2iv(`constants_${name}Size`, size);
					this.setUniform1i(`constants_${name}`, this.constantsLength);
					break;
				}
			case 'HTMLImageArray':
				{
					const inputImages = value;
					const dim = [inputImages[0].width, inputImages[0].height, inputImages.length];
					const size = [inputImages[0].width, inputImages[0].height];

					gl.activeTexture(gl.TEXTURE0 + this.constantsLength);
					gl.bindTexture(gl.TEXTURE_2D_ARRAY, argumentTexture);
					gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
					gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
					gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
					const mipLevel = 0; 
					const internalFormat = gl.RGBA; 
					const width = inputImages[0].width;
					const height = inputImages[0].height;
					const textureDepth = inputImages.length;
					const border = 0;
					const srcFormat = gl.RGBA; 
					const srcType = gl.UNSIGNED_BYTE; 
					gl.texImage3D(
						gl.TEXTURE_2D_ARRAY,
						mipLevel,
						internalFormat,
						width,
						height,
						textureDepth,
						border,
						srcFormat,
						srcType,
						null
					);
					for (let i = 0; i < inputImages.length; i++) {
						const xOffset = 0;
						const yOffset = 0;
						const imageDepth = 1;
						gl.texSubImage3D(
							gl.TEXTURE_2D_ARRAY,
							mipLevel,
							xOffset,
							yOffset,
							i,
							inputImages[i].width,
							inputImages[i].height,
							imageDepth,
							srcFormat,
							srcType,
							inputImages[i]
						);
					}
					this.setUniform3iv(`constants_${name}Dim`, dim);
					this.setUniform2iv(`constants_${name}Size`, size);
					this.setUniform1i(`constants_${name}`, this.constantsLength);
					break;
				}
			case 'ArrayTexture(4)':
			case 'NumberTexture':
				{
					const inputTexture = value;
					if (inputTexture.context !== this.context) {
						throw new Error(`argument ${ name} (${ type }) must be from same context`);
					}
					const dim = inputTexture.dimensions;
					const size = inputTexture.size;

					gl.activeTexture(gl.TEXTURE0 + this.constantsLength);
					gl.bindTexture(gl.TEXTURE_2D, inputTexture.texture);

					this.setUniform3iv(`constants_${name}Dim`, dim);
					this.setUniform2iv(`constants_${name}Size`, size);
					this.setUniform1i(`constants_${name}BitRatio`, 1); 
					this.setUniform1i(`constants_${name}`, this.constantsLength);
					break;
				}
			case 'Integer':
			case 'Float':
			default:
				throw new Error('Input type not supported: ' + value);
		}
		this.constantsLength++;
	}
	_getGetResultString() {
		if (!this.floatTextures) {
			return '  return decode(texel, x, bitRatio);';
		}
		return '  return texel[channel];';
	}

	_getHeaderString() {
		return '';
	}

	_getTextureCoordinate() {
		const subKernels = this.subKernels;
		if (subKernels === null || subKernels.length < 1) {
			return 'in highp vec2 vTexCoord;\n';
		} else {
			return 'out highp vec2 vTexCoord;\n';
		}
	}

	_getMainArgumentsString(args) {
		const result = [];
		const argumentTypes = this.argumentTypes;
		const argumentNames = this.argumentNames;
		for (let i = 0; i < argumentNames.length; i++) {
			const value = args[i];
			const name = argumentNames[i];
			const type = argumentTypes[i];
			if (this.hardcodeConstants) {
				if (type === 'Array' || type === 'NumberTexture' || type === 'ArrayTexture(4)') {
					const dim = utils.getDimensions(value, true);
					const size = utils.dimToTexSize({
						floatTextures: this.floatTextures,
						floatOutput: this.floatOutput
					}, dim);

					result.push(
						`uniform highp sampler2D user_${ name }`,
						`highp ivec2 user_${ name }Size = ivec2(${ size[0] }, ${ size[1] })`,
						`highp ivec3 user_${ name }Dim = ivec3(${ dim[0] }, ${ dim[1]}, ${ dim[2] })`,
						`uniform highp int user_${ name }BitRatio`
					);
				} else if (type === 'Integer') {
					result.push(`highp float user_${ name } = ${ value }.0`);
				} else if (type === 'Float') {
					result.push(`highp float user_${ name } = ${ value }`);
				}
			} else {
				if (type === 'Array' || type === 'NumberTexture' || type === 'ArrayTexture(4)' || type === 'Input' || type === 'HTMLImage') {
					result.push(
						`uniform highp sampler2D user_${ name }`,
						`uniform highp ivec2 user_${ name }Size`,
						`uniform highp ivec3 user_${ name }Dim`
					);
					if (type !== 'HTMLImage') {
						result.push(`uniform highp int user_${ name }BitRatio`)
					}
				} else if (type === 'HTMLImageArray') {
					result.push(
						`uniform highp sampler2DArray user_${ name }`,
						`uniform highp ivec2 user_${ name }Size`,
						`uniform highp ivec3 user_${ name }Dim`
					);
				} else if (type === 'Integer' || type === 'Float' || type === 'Number') {
					result.push(`uniform float user_${ name }`);
				} else {
					throw new Error(`Param type ${type} not supported in WebGL2`);
				}
			}
		}
		return this._linesToString(result);
	}

	_getKernelString() {
		const result = [];
		const subKernels = this.subKernels;
		if (subKernels !== null) {
			result.push('float kernelResult = 0.0');
			result.push('layout(location = 0) out vec4 data0');
			for (let i = 0; i < subKernels.length; i++) {
				result.push(
					`float subKernelResult_${ subKernels[i].name } = 0.0`,
					`layout(location = ${ i + 1 }) out vec4 data${ i + 1 }`
				);
			}
		} else {
			result.push('out vec4 data0');
			result.push('float kernelResult = 0.0');
		}

		const functionBuilder = FunctionBuilder.fromKernel(this, WebGL2FunctionNode, {
			fixIntegerDivisionAccuracy: this.fixIntegerDivisionAccuracy
		});

		return this._linesToString(result) + functionBuilder.getPrototypeString('kernel');
	}

	_getMainResultString() {
		const subKernels = this.subKernels;
		const result = [];

		if (this.floatOutput) {
			result.push('  index *= 4');
		}

		if (this.graphical) {
			result.push(
				'  threadId = indexTo3D(index, uOutputDim)',
				'  kernel()',
				'  data0 = actualColor'
			);
		} else if (this.floatOutput) {
			const channels = ['r', 'g', 'b', 'a'];

			for (let i = 0; i < channels.length; ++i) {
				result.push('  threadId = indexTo3D(index, uOutputDim)');
				result.push('  kernel()');

				if (subKernels) {
					result.push(`  data0.${channels[i]} = kernelResult`);

					for (let j = 0; j < subKernels.length; ++j) {
						result.push(`  data${ j + 1 }.${channels[i]} = subKernelResult_${ subKernels[j].name }`);
					}
				} else {
					result.push(`  data0.${channels[i]} = kernelResult`);
				}

				if (i < channels.length - 1) {
					result.push('  index += 1');
				}
			}
		} else if (subKernels !== null) {
			result.push('  threadId = indexTo3D(index, uOutputDim)');
			result.push('  kernel()');
			result.push('  data0 = encode32(kernelResult)');
			for (let i = 0; i < subKernels.length; i++) {
				result.push(`  data${ i + 1 } = encode32(subKernelResult_${ subKernels[i].name })`);
			}
		} else {
			result.push(
				'  threadId = indexTo3D(index, uOutputDim)',
				'  kernel()',
				'  data0 = encode32(kernelResult)'
			);
		}

		return this._linesToString(result);
	}

	getFragmentShader(args) {
		if (this.compiledFragmentShader !== null) {
			return this.compiledFragmentShader;
		}
		return this.compiledFragmentShader = this.replaceArtifacts(this.constructor.fragmentShader, this._getFragShaderArtifactMap(args));
	}

	getVertexShader(args) {
		if (this.compiledVertexShader !== null) {
			return this.compiledVertexShader;
		}
		return this.compiledVertexShader = this.constructor.vertexShader;
	}

	destroyExtensions() {
		this.extensions.EXT_color_buffer_float = null;
		this.extensions.OES_texture_float_linear = null;
	}

	toJSON() {
		const json = super.toJSON();
		json.functionNodes = FunctionBuilder.fromKernel(this, WebGL2FunctionNode).toJSON();
		return json;
	}
}

module.exports = {
	WebGL2Kernel
};
},{"../../texture":27,"../../utils":28,"../function-builder":7,"../web-gl/kernel":15,"./fragment-shader":17,"./function-node":18,"./vertex-shader":20}],20:[function(require,module,exports){
const vertexShader = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;

in vec2 aPos;
in vec2 aTexCoord;

out vec2 vTexCoord;
uniform vec2 ratio;

void main(void) {
  gl_Position = vec4((aPos + vec2(1)) * ratio + vec2(-1), 0, 1);
  vTexCoord = aTexCoord;
}`;

module.exports = {
	vertexShader
};
},{}],21:[function(require,module,exports){
const lib = require('./index');
const GPU = lib.GPU;
for (const p in lib) {
	if (!lib.hasOwnProperty(p)) continue;
	if (p === 'GPU') continue; 
	GPU[p] = lib[p];
}
if (typeof module !== 'undefined') {
	module.exports = GPU;
}
if (typeof window !== 'undefined') {
	window.GPU = GPU;
}
if (typeof self !== 'undefined') {
	self.GPU = GPU;
}
},{"./index":23}],22:[function(require,module,exports){
const gpuMock = require('gpu-mock.js');
const {
	utils
} = require('./utils');
const {
	CPUKernel
} = require('./backend/cpu/kernel');
const {
	HeadlessGLKernel
} = require('./backend/headless-gl/kernel');
const {
	WebGL2Kernel
} = require('./backend/web-gl2/kernel');
const {
	WebGLKernel
} = require('./backend/web-gl/kernel');
const {
	kernelRunShortcut
} = require('./kernel-run-shortcut');


const kernelOrder = [HeadlessGLKernel, WebGL2Kernel, WebGLKernel];

const kernelTypes = ['gpu', 'cpu'];

const internalKernels = {
	'headlessgl': HeadlessGLKernel,
	'webgl2': WebGL2Kernel,
	'webgl': WebGLKernel,
};

class GPU {
	static get isGPUSupported() {
		return kernelOrder.some(Kernel => Kernel.isSupported);
	}

	static get isKernelMapSupported() {
		return kernelOrder.some(Kernel => Kernel.isSupported && Kernel.features.kernelMap);
	}

	static get isOffscreenCanvasSupported() {
		return (typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined') || typeof importScripts !== 'undefined';
	}

	static get isWebGLSupported() {
		return WebGLKernel.isSupported;
	}

	static get isWebGL2Supported() {
		return WebGL2Kernel.isSupported;
	}

	static get isHeadlessGLSupported() {
		return HeadlessGLKernel.isSupported;
	}

	static get isCanvasSupported() {
		return typeof HTMLCanvasElement !== 'undefined';
	}

	static get isGPUHTMLImageArraySupported() {
		return WebGL2Kernel.isSupported;
	}

	static get isFloatOutputSupported() {
		return kernelOrder.some(Kernel => Kernel.isSupported && Kernel.features.isFloatRead && Kernel.features.isTextureFloat);
	}

	constructor(settings) {
		settings = settings || {};
		this.canvas = settings.canvas || null;
		this.context = settings.context || null;
		this.mode = settings.mode;
		if (this.mode === 'dev') return;
		this.Kernel = null;
		this.kernels = [];
		this.functions = [];
		this.nativeFunctions = [];

		if (settings.functions) {
			for (let i = 0; i < settings.functions.length; i++) {
				this.addFunction(settings.functions[i]);
			}
		}

		if (settings.nativeFunctions) {
			for (const p in settings.nativeFunctions) {
				this.addNativeFunction(p, settings.nativeFunctions[p]);
			}
		}

		this.chooseKernel();
	}

	chooseKernel() {
		if (this.Kernel) return;

		let Kernel = null;

		if (this.context) {
			for (let i = 0; i < kernelOrder.length; i++) {
				const ExternalKernel = kernelOrder[i];
				if (ExternalKernel.isContextMatch(this.context)) {
					Kernel = ExternalKernel;
					break;
				}
			}
			if (Kernel === null) {
				throw new Error('unknown Context');
			}
		} else if (this.mode) {
			if (this.mode in internalKernels) {
				if (internalKernels[this.mode].isSupported) {
					Kernel = internalKernels[this.mode];
				}
			} else if (this.mode === 'gpu') {
				for (let i = 0; i < kernelOrder.length; i++) {
					if (kernelOrder[i].isSupported) {
						Kernel = kernelOrder[i];
						break;
					}
				}
			} else if (this.mode === 'cpu') {
				Kernel = CPUKernel;
			}
			if (!Kernel) {
				throw new Error(`A requested mode of "${this.mode}" and is not supported`);
			}
		} else {
			for (let i = 0; i < kernelOrder.length; i++) {
				if (kernelOrder[i].isSupported) {
					Kernel = kernelOrder[i];
					break;
				}
			}
			if (!Kernel) {
				Kernel = CPUKernel;
			}
		}

		if (!this.mode) {
			this.mode = Kernel.mode;
		}
		this.Kernel = Kernel;
	}

	createKernel(source, settings) {
		if (typeof source === 'undefined') {
			throw new Error('Missing source parameter');
		}
		if (typeof source !== 'object' && !utils.isFunction(source) && typeof source !== 'string') {
			throw new Error('source parameter not a function');
		}

		if (this.mode === 'dev') {
			return gpuMock(source, settings);
		}

		source = typeof source === 'function' ? source.toString() : source;
		const mergedSettings = Object.assign({
			context: this.context,
			canvas: this.canvas,
			functions: this.functions,
			nativeFunctions: this.nativeFunctions
		}, settings || {});

		const kernel = kernelRunShortcut(new this.Kernel(source, mergedSettings));

		if (!this.canvas) {
			this.canvas = kernel.canvas;
		}

		if (!this.context) {
			this.context = kernel.context;
		}

		this.kernels.push(kernel);

		return kernel;
	}

	createKernelMap() {
		let fn;
		let settings;
		if (typeof arguments[arguments.length - 2] === 'function') {
			fn = arguments[arguments.length - 2];
			settings = arguments[arguments.length - 1];
		} else {
			fn = arguments[arguments.length - 1];
		}

		if (!this.Kernel.isSupported || !this.Kernel.features.kernelMap) {
			if (this.mode && kernelTypes.indexOf(this.mode) < 0) {
				throw new Error(`kernelMap not supported on ${this.Kernel.name}`);
			}
		}

		const kernel = this.createKernel(fn, settings);
		if (Array.isArray(arguments[0])) {
			const functions = arguments[0];
			for (let i = 0; i < functions.length; i++) {
				const source = functions[i].toString();
				const name = utils.getFunctionNameFromString(source);
				kernel.addSubKernel({
					name,
					source,
					property: i,
				});
			}
		} else {
			const functions = arguments[0];
			for (let p in functions) {
				if (!functions.hasOwnProperty(p)) continue;
				const source = functions[p].toString();
				const name = utils.getFunctionNameFromString(source);
				kernel.addSubKernel({
					name: name || p,
					source,
					property: p,
				});
			}
		}

		return kernel;
	}

	combineKernels() {
		const lastKernel = arguments[arguments.length - 2];
		const combinedKernel = arguments[arguments.length - 1];
		if (this.mode === 'cpu') return combinedKernel;

		const canvas = arguments[0].canvas;
		let context = arguments[0].context;

		for (let i = 0; i < arguments.length - 1; i++) {
			arguments[i]
				.setCanvas(canvas)
				.setContext(context)
				.setPipeline(true);
		}

		return function() {
			combinedKernel.apply(null, arguments);
			const texSize = lastKernel.texSize;
			const gl = lastKernel.context;
			const threadDim = lastKernel.threadDim;
			let result;
			if (lastKernel.floatOutput) {
				const w = texSize[0];
				const h = Math.ceil(texSize[1] / 4);
				result = new Float32Array(w * h * 4);
				gl.readPixels(0, 0, w, h, gl.RGBA, gl.FLOAT, result);
			} else {
				const bytes = new Uint8Array(texSize[0] * texSize[1] * 4);
				gl.readPixels(0, 0, texSize[0], texSize[1], gl.RGBA, gl.UNSIGNED_BYTE, bytes);
				result = new Float32Array(bytes.buffer);
			}

			result = result.subarray(0, threadDim[0] * threadDim[1] * threadDim[2]);

			if (lastKernel.output.length === 1) {
				return result;
			} else if (lastKernel.output.length === 2) {
				return utils.splitArray(result, lastKernel.output[0]);
			} else if (lastKernel.output.length === 3) {
				const cube = utils.splitArray(result, lastKernel.output[0] * lastKernel.output[1]);
				return cube.map(function(x) {
					return utils.splitArray(x, lastKernel.output[0]);
				});
			}
		};
	}

	addFunction(source, settings) {
		settings = settings || {};
		if (typeof source !== 'string' && typeof source !== 'function') throw new Error('source not a string or function');
		const sourceString = typeof source === 'string' ? source : source.toString();

		let argumentTypes = [];

		if (typeof settings.argumentTypes === 'object') {
			argumentTypes = utils.getArgumentNamesFromString(sourceString)
				.map(name => settings.argumentTypes[name]) || [];
		} else {
			argumentTypes = settings.argumentTypes || [];
		}

		this.functions.push({
			source: sourceString,
			argumentTypes,
			returnType: settings.returnType
		});
		return this;
	}

	addNativeFunction(name, source, settings) {
		if (this.kernels.length > 0) {
			throw new Error('Cannot call "addNativeFunction" after "createKernels" has been called.');
		}
		this.nativeFunctions.push({
			name,
			source,
			settings
		});
		return this;
	}

	destroy() {
		setTimeout(() => {
			for (let i = 0; i < this.kernels.length; i++) {
				this.kernels[i].destroy(true); 
			}
			this.kernels[0].kernel.constructor.destroyContext(this.context);
		}, 0);
	}
}

module.exports = {
	GPU,
	kernelOrder,
	kernelTypes
};
},{"./backend/cpu/kernel":6,"./backend/headless-gl/kernel":10,"./backend/web-gl/kernel":15,"./backend/web-gl2/kernel":19,"./kernel-run-shortcut":25,"./utils":28,"gpu-mock.js":2}],23:[function(require,module,exports){
const {
	GPU
} = require('./gpu');
const {
	alias
} = require('./alias');
const {
	utils
} = require('./utils');
const {
	Input,
	input
} = require('./input');
const {
	Texture
} = require('./texture');
const {
	FunctionBuilder
} = require('./backend/function-builder');
const {
	FunctionNode
} = require('./backend/function-node');
const {
	CPUFunctionNode
} = require('./backend/cpu/function-node');
const {
	CPUKernel
} = require('./backend/cpu/kernel');

const {
	HeadlessGLKernel
} = require('./backend/headless-gl/kernel');

const {
	WebGLFunctionNode
} = require('./backend/web-gl/function-node');
const {
	WebGLKernel
} = require('./backend/web-gl/kernel');

const {
	WebGL2FunctionNode
} = require('./backend/web-gl2/function-node');
const {
	WebGL2Kernel
} = require('./backend/web-gl2/kernel');

module.exports = {
	alias,
	CPUFunctionNode,
	CPUKernel,
	GPU,
	FunctionBuilder,
	FunctionNode,
	HeadlessGLKernel,
	Input,
	input,
	Texture,
	utils,
	WebGL2FunctionNode,
	WebGL2Kernel,
	WebGLFunctionNode,
	WebGLKernel,
};
},{"./alias":3,"./backend/cpu/function-node":4,"./backend/cpu/kernel":6,"./backend/function-builder":7,"./backend/function-node":8,"./backend/headless-gl/kernel":10,"./backend/web-gl/function-node":13,"./backend/web-gl/kernel":15,"./backend/web-gl2/function-node":18,"./backend/web-gl2/kernel":19,"./gpu":22,"./input":24,"./texture":27,"./utils":28}],24:[function(require,module,exports){
class Input {
	constructor(value, size) {
		this.value = value;
		if (Array.isArray(size)) {
			this.size = [];
			for (let i = 0; i < size.length; i++) {
				this.size[i] = size[i];
			}
			while (this.size.length < 3) {
				this.size.push(1);
			}
		} else {
			if (size.z) {
				this.size = [size.x, size.y, size.z];
			} else if (size.y) {
				this.size = [size.x, size.y, 1];
			} else {
				this.size = [size.x, 1, 1];
			}
		}
	}
}

function input(value, size) {
	return new Input(value, size);
}

module.exports = {
	Input,
	input
};
},{}],25:[function(require,module,exports){
const {
	utils
} = require('./utils');

function kernelRunShortcut(kernel) {
	const shortcut = function() {
		return kernel.run.apply(kernel, arguments);
	};

	utils
		.allPropertiesOf(kernel)
		.forEach((key) => {
			if (key[0] === '_' && key[1] === '_') return;
			if (typeof kernel[key] === 'function') {
				if (key.substring(0, 3) === 'add' || key.substring(0, 3) === 'set') {
					shortcut[key] = function() {
						kernel[key].apply(kernel, arguments);
						return shortcut;
					};
				} else {
					shortcut[key] = kernel[key].bind(kernel);
				}
			} else {
				shortcut.__defineGetter__(key, () => {
					return kernel[key];
				});
				shortcut.__defineSetter__(key, (value) => {
					kernel[key] = value;
				});
			}
		});

	shortcut.kernel = kernel;

	return shortcut;
}

module.exports = {
	kernelRunShortcut
};
},{"./utils":28}],26:[function(require,module,exports){
const source = `

uniform highp float triangle_noise_seed;
highp float triangle_noise_shift = 0.000001;

//https://www.shadertoy.com/view/4t2SDh
//note: uniformly distributed, normalized rand, [0;1[
float nrand( vec2 n )
{
	return fract(sin(dot(n.xy, vec2(12.9898, 78.233)))* 43758.5453);
}
//note: remaps v to [0;1] in interval [a;b]
float remap( float a, float b, float v )
{
	return clamp( (v-a) / (b-a), 0.0, 1.0 );
}

float n4rand( vec2 n )
{
	float t = fract( triangle_noise_seed + triangle_noise_shift );
	float nrnd0 = nrand( n + 0.07*t );
	float nrnd1 = nrand( n + 0.11*t );	
	float nrnd2 = nrand( n + 0.13*t );
	float nrnd3 = nrand( n + 0.17*t );
	float result = (nrnd0+nrnd1+nrnd2+nrnd3) / 4.0;
	triangle_noise_shift = result + 0.000001;
	return result;
}`;

const name = 'triangle-noise-noise';

const functionMatch = 'Math.random()';

const functionReplace = 'n4rand(vTexCoord)';

const functionReturnType = 'Number';

const onBeforeRun = (kernel) => {
	kernel.setUniform1f('triangle_noise_seed', Math.random());
};

module.exports = {
	name,
	onBeforeRun,
	functionMatch,
	functionReplace,
	functionReturnType,
	source
};
},{}],27:[function(require,module,exports){
class Texture {
	constructor(texture, size, dimensions, output, context, type = 'NumberTexture') {
		this.texture = texture;
		this.size = size;
		this.dimensions = dimensions;
		this.output = output;
		this.context = context;
		this.kernel = null;
		this.type = type;
	}

	toArray(gpu) {
		if (!gpu) throw new Error('You need to pass the GPU object for toArray to work.');
		if (this.kernel) return this.kernel(this);

		this.kernel = gpu.createKernel(function(x) {
			return x[this.thread.z][this.thread.y][this.thread.x];
		}).setOutput(this.output);

		return this.kernel(this);
	}

	delete() {
		return this.context.deleteTexture(this.texture);
	}
}

module.exports = {
	Texture
};
},{}],28:[function(require,module,exports){
const {
	Input
} = require('./input');
const {
	Texture
} = require('./texture');

const FUNCTION_NAME = /function ([^(]*)/;
const STRIP_COMMENTS = /((\/\/.*$)|(\/\*[\s\S]*?\*\/))/mg;
const ARGUMENT_NAMES = /([^\s,]+)/g;

const utils = {
	systemEndianness() {
		return _systemEndianness;
	},
	getSystemEndianness() {
		const b = new ArrayBuffer(4);
		const a = new Uint32Array(b);
		const c = new Uint8Array(b);
		a[0] = 0xdeadbeef;
		if (c[0] === 0xef) return 'LE';
		if (c[0] === 0xde) return 'BE';
		throw new Error('unknown endianness');
	},

	isFunction(funcObj) {
		return typeof(funcObj) === 'function';
	},

	isFunctionString(fn) {
		if (typeof fn === 'string') {
			return (fn
				.slice(0, 'function'.length)
				.toLowerCase() === 'function');
		}
		return false;
	},

	getFunctionNameFromString(funcStr) {
		return FUNCTION_NAME.exec(funcStr)[1].trim();
	},

	getFunctionBodyFromString(funcStr) {
		return funcStr.substring(funcStr.indexOf('{') + 1, funcStr.lastIndexOf('}'));
	},

	getArgumentNamesFromString(fn) {
		const fnStr = fn.replace(STRIP_COMMENTS, '');
		let result = fnStr.slice(fnStr.indexOf('(') + 1, fnStr.indexOf(')')).match(ARGUMENT_NAMES);
		if (result === null) {
			result = [];
		}
		return result;
	},

	clone(obj) {
		if (obj === null || typeof obj !== 'object' || obj.hasOwnProperty('isActiveClone')) return obj;

		const temp = obj.constructor(); 

		for (let key in obj) {
			if (Object.prototype.hasOwnProperty.call(obj, key)) {
				obj.isActiveClone = null;
				temp[key] = utils.clone(obj[key]);
				delete obj.isActiveClone;
			}
		}

		return temp;
	},

	isArray(array) {
		return !isNaN(array.length);
	},

	getVariableType(value) {
		if (utils.isArray(value)) {
			if (value[0].nodeName === 'IMG') {
				return 'HTMLImageArray';
			}
			return 'Array';
		} else if (typeof value === 'number') {
			if (Number.isInteger(value)) {
				return 'Integer';
			}
			return 'Float';
		} else if (value instanceof Texture) {
			return value.type;
		} else if (value instanceof Input) {
			return 'Input';
		} else if (value.nodeName === 'IMG') {
			return 'HTMLImage';
		} else {
			return 'Unknown';
		}
	},


	dimToTexSize(opt, dimensions, output) {
		let numTexels = dimensions[0];
		let w = dimensions[0];
		let h = dimensions[1];
		for (let i = 1; i < dimensions.length; i++) {
			numTexels *= dimensions[i];
		}

		if (opt.floatTextures && (!output || opt.floatOutput)) {
			w = numTexels = Math.ceil(numTexels / 4);
		}
		if (h > 1 && w * h === numTexels) {
			return [w, h];
		}
		const sqrt = Math.sqrt(numTexels);
		let high = Math.ceil(sqrt);
		let low = Math.floor(sqrt);
		while (high * low > numTexels) {
			high--;
			low = Math.ceil(numTexels / high);
		}
		w = low;
		h = Math.ceil(numTexels / w);
		return [w, h];
	},

	getDimensions(x, pad) {
		let ret;
		if (utils.isArray(x)) {
			const dim = [];
			let temp = x;
			while (utils.isArray(temp)) {
				dim.push(temp.length);
				temp = temp[0];
			}
			ret = dim.reverse();
		} else if (x instanceof Texture) {
			ret = x.output;
		} else if (x instanceof Input) {
			ret = x.size;
		} else {
			throw new Error('Unknown dimensions of ' + x);
		}

		if (pad) {
			ret = utils.clone(ret);
			while (ret.length < 3) {
				ret.push(1);
			}
		}

		return new Int32Array(ret);
	},

	flatten2dArrayTo(array, target) {
		let offset = 0;
		for (let y = 0; y < array.length; y++) {
			target.set(array[y], offset);
			offset += array[y].length;
		}
	},

	flatten3dArrayTo(array, target) {
		let offset = 0;
		for (let z = 0; z < array.length; z++) {
			for (let y = 0; y < array[z].length; y++) {
				target.set(array[z][y], offset);
				offset += array[z][y].length;
			}
		}
	},

	flattenTo(array, target) {
		if (utils.isArray(array[0])) {
			if (utils.isArray(array[0][0])) {
				utils.flatten3dArrayTo(array, target);
			} else {
				utils.flatten2dArrayTo(array, target);
			}
		} else {
			target.set(array);
		}
	},

	splitArray(array, part) {
		const result = [];
		for (let i = 0; i < array.length; i += part) {
			result.push(new array.constructor(array.buffer, i * 4 + array.byteOffset, part));
		}
		return result;
	},

	getAstString(source, ast) {
		const lines = Array.isArray(source) ? source : source.split(/\r?\n/g);
		const start = ast.loc.start;
		const end = ast.loc.end;
		const result = [];
		result.push(lines[start.line - 1].slice(start.column));
		for (let i = start.line; i < end.line - 1; i++) {
			result.push(lines[i]);
		}
		result.push(lines[end.line - 1].slice(0, end.column));
		return result.join('\n');
	},

	allPropertiesOf(obj) {
		const props = [];

		do {
			props.push.apply(props, Object.getOwnPropertyNames(obj));
		} while (obj = Object.getPrototypeOf(obj));

		return props;
	}
};

const _systemEndianness = utils.getSystemEndianness();

module.exports = {
	utils
};
},{"./input":24,"./texture":27}]},{},[21]);
