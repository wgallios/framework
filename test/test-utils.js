require('../index');
global.builders = require('../builders');

var assert = require('assert');
var utils = require('../utils');

// test: date prototype
function prototypeDate() {

	var dt = new Date(1404723152167);
	assert.ok(dt.toString() === 'Mon Jul 07 2014 10:52:32 GMT+0200 (CEST)', 'date problem');
	assert.ok(dt.add('minute', 5).toString() === 'Mon Jul 07 2014 10:57:32 GMT+0200 (CEST)', 'date add');

	dt = new Date();
	dt = dt.add('minute', 1);
	dt = dt.add('seconds', 5);

	assert.ok('1 minute 5 seconds'.parseDateExpire().format('mm:ss') === dt.format('mm:ss'), 'date expiration');

	dt = '2010-01-01 12:05:10'.parseDate();
	assert.ok('Fri Jan 01 2010 12:05:10 GMT+0100 (CET)' === dt.toString(), 'date parsing 1');

	dt = '2010-01-02'.parseDate();
	assert.ok('Sat Jan 02 2010 00:00:00 GMT+0100 (CET)' === dt.toString(), 'date parsing 2');

	dt = '2100-01-01'.parseDate();
	assert.ok(dt.compare(new Date()) === 1, 'date compare (earlier)');
	assert.ok(dt.compare('2101-01-01'.parseDate()) === -1, 'date compare (later)');
	assert.ok(dt.compare(dt) === 0, 'date compare (same)');
	assert.ok(Date.compare(dt, dt) === 0, 'date compare (same, static)');

	dt = '12:00:00'.parseDate();
	assert.ok(dt.compare(dt) === 0, 'time compare (same)');
}

// test: number prototype
function prototypeNumber() {
	var format = '';
	assert.ok((10000).format(2) === '10 000.00', 'format number with decimal parameter');
	assert.ok((10000).format(3) === '10 000.000', 'format/decimal: A');
	assert.ok((10000).format(3, ',', '.') === '10,000.000', 'format/decimal: B');
	assert.ok((10000).format() === '10 000', 'format/decimal: C');
	var number = 10.103435;
	assert.ok(number.floor(2) === 10.10, 'floor number: 2 decimals');
	assert.ok(number.floor(4) === 10.1034, 'floor number: 4 decimals');
	assert.ok(number.floor(0) === 10, 'floor number: 0 decimals');
	assert.ok(number.hex() === 'A.1A7AB75643028', 'number to hex');
}

// test: string prototype
function prototypeString() {
	var str = ' total.js    ';
	assert.ok(str.trim() === 'total.js', 'string.trim()');
	assert.ok(str.contains(['t', 'X']), 'string.contains(all=false)');
	assert.ok(str.contains(['t', 'X'], true) === false, 'string.contains(all=true)');
	assert.ok('{0}={1}'.format('name', 'value') === 'name=value', 'string.format()');
	assert.ok('<b>total.js</b>"&nbsp;'.encode() === '&lt;b&gt;total.js&lt;/b&gt;&quot;&amp;nbsp;', 'string.encode()');
	assert.ok('&lt;b&gt;total.js&lt;/b&gt;&amp;nbsp;'.decode() === '<b>total.js</b>&nbsp;', 'string.decode()');
	assert.ok(str.trim().replaceAt(5, ';') === 'total;js', 'string.replaceAt()');

	str = ' A PeTer Širka   Je krááály. ';
	assert.ok(str.toSearch() === 'a peter sirka je kraaali.', 'string.toSearch()');

	str = 'Great function.';

	assert.ok(str.startsWith('Great'), 'string.startsWith()');
	assert.ok(str.startsWith('GrEAT', true), 'string.startsWith(ignoreCase)');
	assert.ok(str.startsWith('asdljkaslkdj aslkdjalsdjlasdjlkasdjlasjdlaj') === false, 'string.startsWith() - large string');

	assert.ok(str.endsWith('ion.'), 'string.endsWith()');
	assert.ok(str.endsWith('ION.', true), 'string.endsWith(ignoreCase)');
	assert.ok(str.endsWith('asdljkaslkdj aslkdjalsdjlasdjlkasdjlasjdlaj') === false, 'string.endsWith() - large string');

	str = 'abcdefgh ijklmnop';
	assert.ok(str.max(5, '---') === 'ab---', 'string.maxLength(5, "---")');
	assert.ok(str.max(5) === 'ab...', 'string.maxLength(5)');

	assert.ok(str.isJSON() === false, 'string.isJSON()');
	assert.ok('[]'.isJSON() === true, 'string.isJSON([])');
	assert.ok('{}'.isJSON() === true, 'string.isJSON({})');
	assert.ok('"'.isJSON() === false, 'string.isJSON(")');
	assert.ok('""'.isJSON() === true, 'string.isJSON("")');
	assert.ok('12'.isJSON() === false, 'string.isJSON(12)');
	assert.ok('[}'.isJSON() === false, 'string.isJSON([})');
	assert.ok('["'.isJSON() === false, 'string.isJSON([")');

	str = 'www.google.sk';
	assert.ok(str.isURL() === true, 'string.isURL(): ' + str);

	str = 'google.sk';
	assert.ok(str.isURL() === false, 'string.isURL(): ' + str);

	str = 'google';
	assert.ok(str.isURL() === false, 'string.isURL(): ' + str);

	str = 'http://google.com';
	assert.ok(str.isURL() === true, 'string.isURL(): ' + str);

	str = 'https://mail.google.com';
	assert.ok(str.isURL() === true, 'string.isURL(): ' + str);

	str = 'petersirka@gmail.com';
	assert.ok(str.isEmail() === true, 'string.isEmail(): ' + str);

	str = 'petersirka@gmail';
	assert.ok(str.isEmail() === false, 'string.isEmail(): ' + str);

	str = 'a@a.a';
	assert.ok(str.isEmail() === false, 'string.isEmail(): ' + str);

	str = '255';
	assert.ok(str.parseInt() === 255, 'string.parseInt(): ' + str);

	str = '-255';
	assert.ok(str.parseInt() === -255, 'string.parseInt(): ' + str);

	str = '   255  ';
	assert.ok(str.parseInt() === 255, 'string.parseInt(): ' + str);

	str = '   a  ';
	assert.ok(str.parseInt() === 0, 'string.parseInt(): ' + str);

	str = '';
	assert.ok(str.parseInt() === 0, 'string.parseInt(): ' + str);

	str = '255.50';
	assert.ok(str.parseFloat() === 255.50, 'string.parseFloat(): ' + str);

	str = '  255,50  ';
	assert.ok(str.parseFloat() === 255.50, 'string.parseFloat(): ' + str);

	str = '  ,50  ';
	assert.ok(str.parseFloat() === 0.50, 'string.parseFloat(): ' + str);

	str = '.50';
	assert.ok(str.parseFloat() === 0.50, 'string.parseFloat(): ' + str);

	str = '.';
	assert.ok(str.parseFloat() === 0, 'string.parseFloat(): ' + str);

	str = '123456';
	assert.ok(str.sha1() === '7c4a8d09ca3762af61e59520943dc26494f8941b', 'string.sha1(): ' + str);
	assert.ok(str.sha256() === '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', 'string.sha256(): ' + str);
	assert.ok(str.md5() === 'e10adc3949ba59abbe56e057f20f883e', 'string.md5(): ' + str);
	assert.ok(str.sha512() === 'ba3253876aed6bc22d4a6ff53d8406c6ad864195ed144ab5c87621b6c233b548baeae6956df346ec8c17f5ea10f35ee3cbc514797ed7ddd3145464e2a0bab413', 'string.sha512(): ' + str);

	var value = str.encrypt('key', false);
	assert.ok(value.decrypt('key') === str, 'string.encode() & string.decode() = unique=false: ' + str);

	value = str.encrypt('key', true);
	assert.ok(value.decrypt('key') === str, 'string.encode() & string.decode() = unique=true: ' + str);

	str = 'data:image/gif;base64,R0lGODdhAQABAIAAAF5eXgAAACwAAAAAAQABAAACAkQBADs=';
	assert.ok(str.base64ContentType() === 'image/gif', 'string.base64ContentType(): ' + str);

	str = 'ľščťŽýÁíéäôúá';
	assert.ok(str.removeDiacritics() === 'lsctZyAieaoua', 'string.removeDiacritics(): ' + str);

	str ='<xml>';
	assert.ok(str.indent(4) === '    <xml>', 'string.indent(4): ' + str);
	assert.ok(str.indent(4, '-') === '----<xml>', 'string.indent(4, "-"): ' + str);

	str = '12';
	assert.ok(str.isNumber() === true, 'string.isNumber(): ' + str);
	str = '13a';
	assert.ok(str.isNumber() === false, 'string.isNumber(): ' + str);
	str = '13 ';
	assert.ok(str.isNumber() === false, 'string.isNumber(): ' + str);
	str = '13.34';
	assert.ok(str.isNumber(true) === true, 'string.isNumber(true): ' + str);
	str = '13,34';
	assert.ok(str.isNumber(true) === true, 'string.isNumber(true): ' + str);

	str = '12345';
	assert.ok(str.padLeft(10) === '     12345', 'string.padLeft(10): ' + str);
	assert.ok(str.padLeft(5) === '12345', 'string.padLeft(10): ' + str);
	assert.ok(str.padLeft(10, '-') === '-----12345', 'string.padLeft(10, "-"): ' + str);
	assert.ok(str.padRight(10) === '12345     ', 'string.padRight(10): ' + str);
	assert.ok(str.padRight(5) === '12345', 'string.padRight(10): ' + str);
	assert.ok(str.padRight(10, '-') === '12345-----', 'string.padRight(10, "-"): ' + str);

	var num = 12345;
	assert.ok(num.padLeft(10) === '0000012345', 'number.padLeft(10): ' + num);
	assert.ok(num.padRight(10) === '1234500000', 'number.padRight(10): ' + num);

	str = 'Date: {now | dd.MM.yyyy HH:mm:ss}. Currency: {number | 2} and encoded: {name} and raw: {!name}';
	assert.ok(str.params({now: new Date(), number: 23034.34, name: '<b>Peter</b>'}).length === 106, 'string.params(): ' + str);

	str = 'Peter Širka Linker & - you known';
	assert.ok(str.linker() === 'peter-sirka-linker-you-known', 'string.link(): ' + str);
	assert.ok(str.linker(11) === 'peter-sirka', 'string.link(): ' + str);
	assert.ok(str.slug() === 'peter-sirka-linker-you-known', 'string.slug(): ' + str);
	assert.ok(str.slug(11) === 'peter-sirka', 'string.slug(): ' + str);

	str = '// Configuration\nname   : total.js\nage    : 29\n// comment1    : comment1\n# comment2     : comment2\ndebug  : false';
	assert.ok(JSON.stringify(str.parseConfig({ comment3: 'comment3' })) === '{"comment3":"comment3","name":"total.js","age":"29","debug":"false"}', 'String.parseConfig()');
}

function prototypeArray() {

	var arr = [
		{ name: '1', value: 10 },
		{ name: '2', value: 20 },
		{ name: '3', value: 30 },
		{ name: '4', value: 40 },
		{ name: '5', value: 50 }
	];

	assert.ok(arr.find(function(o) { return o.name === '4'; }).value === 40, 'array.find()');
	assert.ok(arr.find(function(o) { return o.name === '6'; }) === null, 'array.find(): null');
	assert.ok(arr.find('name', '4').value === 40, 'array.find(inline)');
	assert.ok(arr.find('name', '6') === null, 'array.find(inline): null');

	arr = arr.remove(function(o) {
		return o.value > 30;
	});

	assert.ok(arr.length === 3, 'array.remove()');
	arr = arr.remove('value', 30);
	assert.ok(arr.length === 2, 'array.remove(inline)');

	arr = [1, 2, 3, 4, 5];
	assert.ok(arr.skip(3).join('') === '45', 'array.skip()');
	assert.ok(arr.take(3).join('') === '123', 'array.take()');

	assert.ok(arr.orderBy(false)[0] === 5, 'array.orderBy()');

	var counter = arr.length;

	arr.wait(function(item, next) {
		counter--;
		next();
	}, function() {
		assert.ok(counter === 0 && counter !== arr.length, 'array.wait(remove = false)');

		arr.wait(function(item, next) {
			next();
		}, function() {
			assert.ok(arr.length === 0, 'array.wait(remove = true)');
		}, true);

	});

}

function t_callback1(a, cb) {
	cb(null, a);
}

function t_callback2(a, b, cb) {
	cb(null, a + b);
}

function t_callback3(a, b, cb) {
	cb(new Error('TEST'), a + b);
}
/*
function harmony() {

	async(function *() {
		var a = yield sync(t_callback1)(1);
		assert.ok(a === 1, 'harmony t_callback1');

		var b = yield sync(t_callback2)(1, 1);
		assert.ok(b === 2, 'harmony t_callback2');

		return a + b;
	})(function(err, value) {
		assert.ok(value === 3, 'harmony callback');
	});

	async(function *() {
		var err = yield sync(t_callback3)(1, 1);
	})(function(err, value) {
		assert.ok(err.message === 'TEST', 'harmony t_callback3');
	});
}*/

function others() {
	var obj = {};

	assert.ok(utils.isEmpty({}), 'utils.isEmpty() - is empty');
	assert.ok(!utils.isEmpty({ a: 1 }), 'utils.isEmpty() - not empty');

	assert.ok(JSON.stringify(utils.extend({ id: 1 })) === '{"id":1}', 'utils.extend() - undefined');

	utils.copy(obj, { name: 'Peter', age: 25 });
	assert.ok(!obj.name, 'utils.copy(2)');

	assert.ok(utils.copy({ name: 'Janko' }).name === 'Janko', 'utils.copy(1)');

	utils.extend(obj, { name: 'Peter', age: 25 });
	assert.ok(obj.name === 'Peter' && obj.age === 25, 'utils.extend()');

	utils.copy({ name: 'A', age: -1 }, obj);
	assert.ok(obj.name === 'A' && obj.age === -1, 'utils.copy(rewrite=true)');

	utils.reduce(obj, ['name']);
	assert.ok(typeof(obj.age) === 'undefined', 'utils.reduce()');

	var str = 'http://www.google.sk';
	assert.ok(utils.isRelative(str) === false, 'utils.isRelative(): ' + str);

	str = '/img/logo.jpg';
	assert.ok(utils.isRelative(str) === true, 'utils.isRelative(): ' + str);

	assert.ok(utils.isStaticFile(str) === true, 'utils.isStaticFile(): ' + str);

	str = '/logo/';
	assert.ok(utils.isStaticFile(str) === false, 'utils.isStaticFile(): ' + str);

	str = null;
	assert.ok(utils.isNullOrEmpty(str) === true, 'utils.isNullOrEmpty(): null');

	str = '';
	assert.ok(utils.isNullOrEmpty(str) === true, 'utils.isNullOrEmpty(): ' + str);

	str = 'gif';
	assert.ok(utils.getContentType(str) === 'image/gif', 'utils.getContentType(): ' + str);

	str = '.jpg';
	assert.ok(utils.getContentType(str) === 'image/jpeg', 'utils.getContentType(): ' + str);

	str = '.xFx';
	assert.ok(utils.getContentType(str) === 'application/octet-stream', 'utils.getContentType(): ' + str);

	str = 'logo.jpg';
	assert.ok(utils.etag(str) === '800', 'utils.etag(): ' + str);

	str = 'logo.jpg?=1';
	assert.ok(utils.etag(str) === '973', 'utils.etag(): ' + str);

	str = 'logo.jpg?=2';
	assert.ok(utils.etag(str) === '974', 'utils.etag(): ' + str);

	str = '/logo';
	assert.ok(utils.path(str) === '/logo/', 'utils.path(): ' + str);

	str = '/logo/';
	assert.ok(utils.path(str) === '/logo/', 'utils.path(): ' + str);

	assert.ok(utils.GUID(40).length === 40, 'utils.GUID(40)');
	assert.ok(utils.combine('1', '2', 'logo.jpg') === '.1/2/logo.jpg', 'utils.combine()');

	assert.ok(utils.encode('<b>total.js</b>"&nbsp;') === '&lt;b&gt;total.js&lt;/b&gt;&quot;&amp;nbsp;', 'utils.encode()');
	assert.ok(utils.decode('&lt;b&gt;total.js&lt;/b&gt;&amp;nbsp;') === '<b>total.js</b>&nbsp;', 'utils.decode()');

	var result = utils.parseXML('<div><b>Peter</b><i style="color:red">Italic</i></div>');

	assert.ok(result['div.b'] === 'Peter', 'XML Parser 1');
	assert.ok(result['div.i'] === 'Italic', 'XML Parser 2');
	assert.ok(result['div.i[]'].style === 'color:red', 'XML Parser Attributes');

	result = utils.parseXML('<xml>OK</xml>');

	obj = { a: '  1  ', b: { a: '    2 '}};
	utils.trim(obj);
	assert.ok(JSON.stringify(obj) === '{"a":"1","b":{"a":"2"}}', 'utils.trim()');

	var async = new utils.Async();
	var value = [];

	async.on('error', function(err, name) {
		console.log('ERROR', err, name);
	});

	async.await('0', function(next) {
		value.push(9);
		next();
	});

	async.wait('1', '0', function(next) {
		value.push(1);
		next();
	});

	async.wait('2', '1', function(next) {
		setTimeout(function() {
			value.push(2);
			next();
		}, 2000);
	});

	async.wait('3', '2', function(next) {
		value.push(3);
		next();
	});

	async.wait('4', '5', function(next) {
		value.push(4);
		next();
	});

	async.wait('5', '3', function(next) {
		value.push(5);
		next();
	});

	async.wait('6', '5', function(next) {
		value.push(6);
		next();
	});

	async.wait('7', '6', function(next) {
		value.push(7);
		next();
	});

	async.wait('8', '7', function(next) {
		value.push(8);
		next();
	});

	async.await(function(next) {
		next();
	});

	async.await(function(next) {
		next();
	});

	async.complete(function() {

		value.sort(function(a, b) {
			if (a > b)
				return 1;
			else
				return -1;
		});

		assert.ok(value.join(',') === '1,2,3,4,5,6,7,8,9', 'async');
	});

	utils.request('http://www.yahoo.com', ['get'], function(err, data, code) {
		assert.ok(code === 200, 'utils.request (success)');
	}).on('data', function(chunk, p) {
		assert.ok(p === 100, 'utils.request (events)');
	});

	utils.download('http://www.yahoo.com', ['get'], function(err, res) {
		assert.ok(res.statusCode === 301, 'utils.download (success)');
	}).on('data', function(chunk, p) {
		assert.ok(p === 100, 'utils.download (events)');
	});

	utils.request('http://xxxxxxx.yyy', 'get', null, function(err, data, code) {
		assert.ok(err !== null, 'utils.requiest (error)');
	});

	var resource = function(name) {
		return 'resource-' + name;
	};

	var error = utils.validate({}, ['firstName', 'lastName', 'age'], onValidation, resource);
	assert.ok(error.hasError(), 'validation - hasError()');

	error.prepare();

	assert.ok(error.errors[0].name === 'firstName' || error.errors[0].error === 'resource-firstName', 'validation - return boolean');
	assert.ok(error.errors[1].name === 'lastName' || error.errors[1].error === 'lastName-error', 'validation - return string');
	assert.ok(error.errors[2].name === 'age' || error.errors[2].error === 'age-error', 'validation - return utils.isValid()');

	error.clear();
	assert.ok(!error.hasError(), 'validation - clear() & hasError()');

	assert.ok(expression('a.id === b', ['a', 'b'], { id: 1 }, 1)(), 'expression error (true)');
	assert.ok(!expression('a.id === b', ['a', 'b'], { id: 1 })(), 'expression error (false)');

	builders.schema('1', { name: 'string', join: '[2]' });
	builders.schema('2', { age: Number }, function(name) {
		if (name === 'age')
			return -1;
	});

	builders.validation('1', ['name', 'join']);
	builders.validation('2', ['age']);

	error = utils.validate({ name: 'Name', join: [{ age: 'A' }, { age: 4 }]}, '1', onValidation, resource);
	assert.ok(error.hasError(), 'validation - hasError() (array)');

	builders.schema('3', { name: 'string', arrNumber: '[Number]', arrString: '[string]' }, null, onValidation);
	error = builders.validate('3', { name: 'Peter', arrNumber: 'peter' });

	assert.ok(error.hasError(), 'validation - hasError() (array 2)');

	var indexer = 0;

	utils.wait(function() {
		return indexer++ === 3;
	}, function(err) {
		assert(err === null, 'utils.wait()');
	});

	utils.wait(noop, function(err) {
		assert(err !== null, 'utils.wait() - timeout');
	}, 1000);

	var queue = 0;

	utils.queue('file', 2, function(next) {
		setTimeout(function() {
			queue++;
			next();
		}, 300);
	});

	utils.queue('file', 2, function(next) {
		setTimeout(function() {
			queue--;
			next();
		}, 300);
	});

	utils.queue('file', 2, function(next) {
		setTimeout(function() {
			assert.ok(queue === 0, 'utils.queue()');
			next();
		}, 300);
	});

	var a = { a: 1, b: 2, name: 'Peter', isActive: true };
	var b = { a: 1, b: 2, name: 'Peter', isActive: true };

	assert.ok(utils.isEqual(a, b), 'utils.isEqual(1)');

	b.isActive = false;
	assert.ok(utils.isEqual(a, b) === false, 'utils.isEqual(2)');

	b.name = 'Lucia';
	assert.ok(utils.isEqual(a, b, ['a', 'b']), 'utils.isEqual(3)');

}

function onValidation(name, value, path) {
	switch (name) {
		case 'firstName':
			return value.length > 0;
		case 'lastName':
			return 'lastName-error';
		case 'age':
			return utils.isValid(utils.parseInt(value) > 0, 'age-error');
	}
}

prototypeDate();
prototypeNumber();
prototypeString();
prototypeArray();
others();
//harmony();

console.log('================================================');
console.log('success - OK');
console.log('================================================');
console.log('');