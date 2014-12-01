/**
 * @module FrameworkInternal
 * @version 1.6.0
 */

'use strict';

var crypto = require('crypto');
var fs = require('fs');

var ENCODING = 'utf8';
var UNDEFINED = 'undefined';
var FUNCTION = 'function';
var OBJECT = 'object';

var REG_1 = /[\n\r\t]+/g;
var REG_2 = /\s{3,}/g;

var HTTPVERBS = { 'GET': true, 'POST': true, 'OPTIONS': true, 'PUT': true, 'DELETE': true, 'PATCH': true, 'upload': true, 'HEAD': true, 'TRACE': true, 'PROPFIND': true };

global.$STRING = function(value) {
    if (value === null || value === undefined)
        return '';
    return value.toString();
};

/*
    Internal function / Parse data from Request
    @req {ServerRequest}
    @contentType {String}
    @maximumSize {Number}
    @tmpDirectory {String}
    @onXSS {Function}
    @callback {Function}
*/
exports.parseMULTIPART = function(req, contentType, maximumSize, tmpDirectory, onXSS, callback) {

    var parser = new MultipartParser();
    var boundary = contentType.split(';')[1];
    var isFile = false;
    var size = 0;
    var stream = null;

    var tmp = {
        name: '',
        value: '',
        contentType: '',
        fileName: '',
        fileNameTmp: '',
        fileSize: 0,
        isFile: false,
        step: 0,
        width: 0,
        height: 0
    };

    var ip = req.ip.replace(/\./g, '');
    var close = 0;
    var isXSS = false;
    var rm = null;

    boundary = boundary.substring(boundary.indexOf('=') + 1);

    req.buffer_exceeded = false;
    req.buffer_has = true;

    parser.initWithBoundary(boundary);

    parser.onPartBegin = function() {
        tmp.value = '';
        tmp.fileSize = 0;
        tmp.step = 0;
        tmp.isFile = false;
    };

    parser.onHeaderValue = function(buffer, start, end) {

        if (req.buffer_exceeded)
            return;

        if (isXSS)
            return;

        var arr = buffer.slice(start, end).toString(ENCODING).split(';');

        if (tmp.step === 1) {
            tmp.contentType = arr[0];
            tmp.step = 2;
            return;
        }

        if (tmp.step !== 0)
            return;

        tmp.name = arr[1].substring(arr[1].indexOf('=') + 2);
        tmp.name = tmp.name.substring(0, tmp.name.length - 1);
        tmp.step = 1;

        if (arr.length !== 3)
            return;

        tmp.fileName = arr[2].substring(arr[2].indexOf('=') + 2);
        tmp.fileName = tmp.fileName.substring(0, tmp.fileName.length - 1);

        tmp.isFile = true;
        tmp.fileNameTmp = framework_utils.combine(tmpDirectory, ip + '-' + new Date().getTime() + '-' + framework_utils.random(100000) + '.upload');

        stream = fs.createWriteStream(tmp.fileNameTmp, {
            flags: 'w'
        });

        stream.once('close', function() {
            close--;
        });

        stream.once('error', function() {
            close--;
        });

        close++;
    };

    parser.onPartData = function(buffer, start, end) {

        if (req.buffer_exceeded)
            return;

        if (isXSS)
            return;

        var data = buffer.slice(start, end);
        var length = data.length;

        size += length;

        if (size >= maximumSize) {
            req.buffer_exceeded = true;

            if (rm === null)
                rm = [tmp.fileNameTmp];
            else
                rm.push(tmp.fileNameTmp);

            return;
        }

        if (!tmp.isFile) {
            tmp.value += data.toString(ENCODING);
            return;
        }

        if (tmp.fileSize === 0) {
            var wh = null;
            switch (tmp.contentType) {
                case 'image/jpeg':
                    wh = framework_image.measureJPG(data);
                    break;
                case 'image/gif':
                    wh = framework_image.measureGIF(data);
                    break;
                case 'image/png':
                    wh = framework_image.measurePNG(data);
                    break;
            }

            if (wh) {
                tmp.width = wh.width;
                tmp.height = wh.height;
            }
        }

        stream.write(data);
        tmp.fileSize += length;
    };

    parser.onPartEnd = function() {

        if (stream !== null) {
            stream.end();
            stream = null;
        }

        if (req.buffer_exceeded)
            return;

        if (tmp.isFile) {
            req.files.push(new HttpFile(tmp.name, tmp.fileName, tmp.fileNameTmp, tmp.fileSize, tmp.contentType, tmp.width, tmp.height));
            return;
        }

        if (onXSS(tmp.value))
            isXSS = true;

        var temporary = req.body[tmp.name];

        if (temporary === undefined) {
            req.body[tmp.name] = tmp.value;
            return;
        }

        if (framework_utils.isArray(temporary)) {
            req.body[tmp.name].push(tmp.value);
            return;
        }

        temporary = [temporary];
        temporary.push(tmp.value);
        req.body[tmp.name] = temporary;
    };

    parser.onEnd = function() {

        var cb = function() {

            if (close > 0) {
                setImmediate(cb);
                return;
            }

            if (isXSS) {
                req.flags.push('xss');
                framework.stats.request.xss++;
            }

            if (rm !== null)
                framework.unlink(rm);

            callback();
        };

        cb();
    };

    req.on('data', parser.write.bind(parser));
    req.on('end', parser.end.bind(parser));
};

/*
    Internal function / Parse MIXED data
    @req {ServerRequest}
    @contentType {String}
    @tmpDirectory {String}
    @onFile {Function} :: this function is called when is a file downloaded
    @callback {Function}
*/
exports.parseMULTIPART_MIXED = function(req, contentType, tmpDirectory, onFile, callback) {

    var parser = new MultipartParser();
    var boundary = contentType.split(';')[1];
    var stream = null;
    var tmp = {
        name: '',
        contentType: '',
        fileName: '',
        fileNameTmp: '',
        fileSize: 0,
        isFile: false,
        step: 0,
        width: 0,
        height: 0
    };
    var ip = req.ip.replace(/\./g, '');
    var close = 0;

    boundary = boundary.substring(boundary.indexOf('=') + 1);

    req.buffer_exceeded = false;
    req.buffer_has = true;

    parser.initWithBoundary(boundary);

    parser.onPartBegin = function() {
        tmp.fileSize = 0;
        tmp.step = 0;
        tmp.isFile = false;
    };

    parser.onHeaderValue = function(buffer, start, end) {

        if (req.buffer_exceeded || tmp.step > 1)
            return;

        var arr = buffer.slice(start, end).toString(ENCODING).split(';');

        if (tmp.step === 1) {
            tmp.contentType = arr[0];
            tmp.step = 2;
            return;
        }

        if (tmp.step === 0) {

            tmp.name = arr[1].substring(arr[1].indexOf('=') + 2);
            tmp.name = tmp.name.substring(0, tmp.name.length - 1);
            tmp.step = 1;

            if (arr.length !== 3)
                return;

            tmp.fileName = arr[2].substring(arr[2].indexOf('=') + 2);
            tmp.fileName = tmp.fileName.substring(0, tmp.fileName.length - 1);
            tmp.isFile = true;
            tmp.fileNameTmp = framework_utils.combine(tmpDirectory, ip + '-' + new Date().getTime() + '-' + framework_utils.random(100000) + '.upload');
            stream = fs.createWriteStream(tmp.fileNameTmp, {
                flags: 'w'
            });

            stream.on('close', function() {
                close--;
            });

            stream.on('error', function() {
                close--;
            });

            close++;
            return;
        }

    };

    parser.onPartData = function(buffer, start, end) {
        var data = buffer.slice(start, end);
        var length = data.length;

        if (!tmp.isFile)
            return;

        if (tmp.fileSize === 0) {
            var wh = null;
            switch (tmp.contentType) {
                case 'image/jpeg':
                    wh = framework_image.measureJPG(data);
                    break;
                case 'image/gif':
                    wh = framework_image.measureGIF(data);
                    break;
                case 'image/png':
                    wh = framework_image.measurePNG(data);
                    break;
            }

            if (wh) {
                tmp.width = wh.width;
                tmp.height = wh.height;
            }
        }

        stream.write(data);
        tmp.fileSize += length;
    };

    parser.onPartEnd = function() {

        if (stream !== null) {
            stream.end();
            stream = null;
        }

        if (!tmp.isFile)
            return;

        onFile(new HttpFile(tmp.name, tmp.fileName, tmp.fileNameTmp, tmp.fileSize, tmp.contentType, tmp.width, tmp.height));
    };

    parser.onEnd = function() {
        var cb = function cb() {

            if (close > 0) {
                setImmediate(cb);
                return;
            }

            onFile(null);
            callback();
        };

        cb();
    };

    req.on('data', parser.write.bind(parser));
};

/*
    Internal function / Split string (url) to array
    @url {String}
    return {String array}
*/
exports.routeSplit = function(url, noLower) {

    if (!noLower)
        url = url.toLowerCase();

    if (url[0] === '/')
        url = url.substring(1);

    if (url[url.length - 1] === '/')
        url = url.substring(0, url.length - 1);

    var arr = url.split('/');
    if (arr.length === 1 && arr[0] === '')
        arr[0] = '/';

    return arr;
};

/*
    Internal function / Compare route with url
    @route {String array}
    @url {String}
    @isSystem {Boolean}
    return {Boolean}
*/
exports.routeCompare = function(url, route, isSystem, isAsterix) {

    var length = url.length;
    var lengthRoute = route.length;

    if (lengthRoute !== length && !isAsterix)
        return false;

    if (isAsterix && lengthRoute === 1 && route[0] === '/')
        return true;

    var skip = length === 1 && url[0] === '/';

    for (var i = 0; i < length; i++) {

        var value = route[i];

        if (!isSystem && isAsterix && value === undefined)
            return true;

        if (!isSystem && (!skip && value[0] === '{'))
            continue;

        if (url[i] !== value) {
            if (!isSystem)
                return isAsterix ? i >= lengthRoute : false;
            return false;
        }
    }

    return true;
};

/*
    Internal function / Compare subdomain
    @subdomain {String}
    @arr {String array}
    return {Boolean}
*/
exports.routeCompareSubdomain = function(subdomain, arr) {

    if (arr === null || subdomain === null || arr.length === 0)
        return true;

    return arr.indexOf(subdomain) > -1;
};

exports.routeCompareFlags = function(arr1, arr2, noLoggedUnlogged) {

    var hasVerb = false;
    var a1 = arr1;
    var a2 = arr2;
    var l1 = arr1.length;
    var l2 = arr2.length;
    var select = l1 > l2 ? a1 : a2;
    var compare = l1 > l2 ? a2 : a1;
    var length = Math.max(l1, l2);

    var AUTHORIZE = 'authorize';
    var UNAUTHORIZE = 'unauthorize';

    for (var i = 0; i < length; i++) {

        var value = select[i];
        var c = value[0];

        if (c === '!' || c === '#' || c === '$' || c === '@' || c === '+') // ignore roles
            continue;

        if (noLoggedUnlogged && (value === AUTHORIZE || value === UNAUTHORIZE))
            continue;

        var index = compare.indexOf(value);
        var method = value.toUpperCase();

        if (index === -1 && !HTTPVERBS[method])
            return value === AUTHORIZE || value === UNAUTHORIZE ? -1 : 0;

        hasVerb = hasVerb || (index !== -1 && HTTPVERBS[method]);
    }

    return hasVerb ? 1 : 0;
};

exports.routeCompareFlags2 = function(req, route, noLoggedUnlogged) {

    if (route.isXHR && !req.xhr)
        return 0;

    var method = req.method;
    if (route.method) {
        if (route.method !== method)
            return 0;
    } else if (route.flags.indexOf(method.toLowerCase()) === -1)
            return 0;

    if (route.isREFERER && req.flags.indexOf('referer') === -1)
        return 0;

    for (var i = 0, length = req.flags.length; i < length; i++) {

        var flag = req.flags[i];

        switch (flag) {

            case 'proxy':
                if (!route.isPROXY)
                    return 0;
                continue;

            case 'debug':
                if (!route.isDEBUG && route.isRELEASE)
                    return 0;
                continue;

            case 'release':
                if (!route.isRELEASE && route.isDEBUG)
                    return 0;
                continue;

            case 'referer':
                continue;

            case 'upload':
                if (!route.isUPLOAD)
                    return 0;
                continue;

            case 'https':
                if (!route.isHTTPS && route.isHTTP)
                    return 0;
                continue;

            case 'http':
                if (!route.isHTTP && route.isHTTPS)
                    return 0;
                continue;

            case 'xhr':
            case '+xhr':
                if (!route.isBOTH && !route.isXHR)
                    return 0;
                continue;
        }

        if (noLoggedUnlogged && route.isMEMBER)
            continue;

        var index = route.flags.indexOf(flag);
        if (index === -1)
            return !route.isMEMBER ? -1 : 0;
    }

    return 1;
};

/**
 * Create arguments for controller action
 * @param {String Array} routeUrl
 * @param {Object} route
 * @return {String Array}
 */
exports.routeParam = function(routeUrl, route) {
    var arr = [];

    if (!route || !routeUrl)
        return arr;

    var length = route.param.length;
    if (length === 0)
        return arr;

    for (var i = 0; i < length; i++) {
        var value = routeUrl[route.param[i]];
        arr.push(value === '/' ? '' : value);
    }

    return arr;
};

/*
    HttpFile class
    @name {String}
    @filename {String}
    @path {String}
    @length {Number}
    @contentType {String}
    return {HttpFile}
*/
function HttpFile(name, filename, path, length, contentType, width, height) {
    this.name = name;
    this.filename = filename;
    this.length = length;
    this.contentType = contentType;
    this.path = path;
    this.width = width;
    this.height = height;
}

/*
    Read file to byte array
    @filename {String} :: new filename
    return {HttpFile}
*/
HttpFile.prototype.copy = function(filename, callback) {

    var self = this;

    if (!callback) {
        fs.createReadStream(self.path).pipe(fs.createWriteStream(filename));
        return;
    }

    var reader = fs.createReadStream(self.path);
    var writer = fs.createWriteStream(filename);

    reader.on('close', callback);
    reader.pipe(writer);

    return self;
};

/*
    Read file to buffer (SYNC)
    return {Buffer}
*/
HttpFile.prototype.readSync = function() {
    return fs.readFileSync(this.path);
};

/*
    Read file to buffer (ASYNC)
    @callback {Function} :: function(error, data);
    return {HttpFile}
*/
HttpFile.prototype.read = function(callback) {
    var self = this;
    fs.readFile(self.path, callback);
    return self;
};

/*
    Create MD5 hash from a file
    @callback {Function} :: function(error, hash);
    return {HttpFile}
*/
HttpFile.prototype.md5 = function(callback) {

    var self = this;
    var md5 = crypto.createHash('md5');
    var stream = fs.createReadStream(self.path);

    stream.on('data', function(buffer) {
        md5.update(buffer);
    });

    stream.on('error', function(error) {
        callback(error, null);
    });

    stream.on('end', function() {
        callback(null, md5.digest('hex'));
    });

    return self;
};

/*
    Get a stream
    @options {Object} :: optional
    return {Stream}
*/
HttpFile.prototype.stream = function(options) {
    var self = this;
    return fs.createReadStream(self.path, options);
};

/*
    Pipe a stream
    @stream {Stream}
    @options {Object} :: optional
    return {Stream}
*/
HttpFile.prototype.pipe = function(stream, options) {
    var self = this;
    return fs.createReadStream(self.path, options).pipe(stream, options);
};

/*
    return {Boolean}
*/
HttpFile.prototype.isImage = function() {
    var self = this;
    return self.contentType.indexOf('image/') !== -1;
};

/*
    return {Boolean}
*/
HttpFile.prototype.isVideo = function() {
    var self = this;
    return self.contentType.indexOf('video/') !== -1;
};

/*
    return {Boolean}
*/
HttpFile.prototype.isAudio = function() {
    var self = this;
    return self.contentType.indexOf('audio/') !== -1;
};

/*
    @imageMagick {Boolean} :: optional - default false
    return {Image} :: look at ./lib/image.js
*/
HttpFile.prototype.image = function(imageMagick) {

    var im = imageMagick;

    // Not a clean solution because the framework hasn't a direct dependence.
    // This is hack :-)
    if (im === undefined)
        im = framework.config['default-image-converter'] === 'im';

    return framework_image.init(this.path, im, this.width, this.height);
};

// *********************************************************************************
// =================================================================================
// JS CSS + AUTO-VENDOR-PREFIXES
// =================================================================================
// *********************************************************************************

function compile_autovendor(css) {

    var reg1 = /\n|\s{2,}/g;
    var reg2 = /\s?\{\s{1,}/g;
    var reg3 = /\s?\}\s{1,}/g;
    var reg4 = /\s?\:\s{1,}/g;
    var reg5 = /\s?\;\s{1,}/g;

    var avp = '@#auto-vendor-prefix#@';
    var isAuto = css.startsWith(avp);

    if (isAuto)
        css = css.replace(avp, '');
    else {
        avp = '/*auto*/';
        isAuto = css.indexOf(avp) !== -1;
        if (isAuto)
            css = css.replace(avp, '');
    }


    if (isAuto)
        css = autoprefixer(css)

    return css.replace(reg1, '').replace(reg2, '{').replace(reg3, '}').replace(reg4, ':').replace(reg5, ';').replace(/\s\}/g, '}').replace(/\s\{/g, '{').trim();
}

/*
    Auto vendor prefixer
    @value {String} :: Raw CSS
    return {String}
*/
function autoprefixer(value) {

    var prefix = ['appearance', 'column-count', 'column-gap', 'column-rule', 'display', 'transform', 'transform-style', 'transform-origin', 'transition', 'user-select', 'animation', 'perspective', 'animation-name', 'animation-duration', 'animation-timing-function', 'animation-delay', 'animation-iteration-count', 'animation-direction', 'animation-play-state', 'opacity', 'background', 'background-image', 'font-smoothing', 'text-size-adjust', 'backface-visibility', 'box-sizing'];

    value = autoprefixer_keyframes(value);

    var builder = [];
    var index = 0;
    var property;

    // properties
    for (var i = 0; i < prefix.length; i++) {

        property = prefix[i];
        index = 0;

        while (index !== -1) {

            index = value.indexOf(property, index + 1);

            if (index === -1)
                continue;

            var a = value.indexOf(';', index);
            var b = value.indexOf('}', index);

            var end = Math.min(a, b);
            if (end === -1)
                end = Math.max(a, b);

            if (end === -1)
                continue;

            // text-transform
            var isPrefix = value.substring(index - 1, index) === '-';
            // if (property === 'transform' && isPrefix)

            if (isPrefix)
                continue;

            var css = value.substring(index, end);
            end = css.indexOf(':');

            if (end === -1)
                continue;

            if (css.substring(0, end + 1).replace(/\s/g, '') !== property + ':')
                continue;

            builder.push({
                name: property,
                property: css
            });
        }
    }

    var output = [];
    var length = builder.length;

    for (var i = 0; i < length; i++) {

        var name = builder[i].name;
        property = builder[i].property;

        var plus = property;
        var delimiter = ';';
        var updated = plus + delimiter;

        if (name === 'opacity') {

            var opacity = parseFloat(plus.replace('opacity', '').replace(':', '').replace(/\s/g, ''));
            if (isNaN(opacity))
                continue;

            updated += 'filter:alpha(opacity=' + Math.floor(opacity * 100) + ');';

            value = value.replacer(property, '@[[' + output.length + ']]');
            output.push(updated);
            continue;
        }

        if (name === 'background' || name === 'background-image') {

            if (property.indexOf('linear-gradient') === -1)
                continue;

            updated = plus.replacer('linear-', '-webkit-linear-') + delimiter;
            updated += plus.replacer('linear-', '-moz-linear-') + delimiter;
            updated += plus.replacer('linear-', '-o-linear-') + delimiter;
            updated += plus.replacer('linear-', '-ms-linear-') + delimiter;
            updated += plus + delimiter;

            value = value.replacer(property, '@[[' + output.length + ']]');
            output.push(updated);
            continue;
        }

        if (name === 'text-overflow') {
            updated = plus + delimiter;
            updated += plus.replacer('text-overflow', '-ms-text-overflow');
            value = value.replacer(property, '@[[' + output.length + ']]');
            output.push(updated);
            continue;
        }

        if (name === 'display') {

            if (property.indexOf('box') === -1)
                continue;

            updated = plus + delimiter;
            updated += plus.replacer('box', '-webkit-box') + delimiter;
            updated += plus.replacer('box', '-moz-box');

            value = value.replacer(property, '@[[' + output.length + ']]');
            output.push(updated);
            continue;
        }

        updated += '-webkit-' + plus + delimiter;
        updated += '-moz-' + plus;

        if (name.indexOf('animation') === -1)
            updated += delimiter + '-ms-' + plus;

        updated += delimiter + '-o-' + plus;

        value = value.replacer(property, '@[[' + output.length + ']]');
        output.push(updated);
    }

    length = output.length;
    for (var i = 0; i < length; i++)
        value = value.replacer('@[[' + i + ']]', output[i]);

    output = null;
    builder = null;
    prefix = null;

    return value;
}

function autoprefixer_keyframes(value) {

    var builder = [];
    var index = 0;

    while (index !== -1) {

        index = value.indexOf('@keyframes', index + 1);
        if (index === -1)
            continue;

        var counter = 0;
        var end = -1;

        for (var indexer = index + 10; indexer < value.length; indexer++) {

            if (value[indexer] === '{')
                counter++;

            if (value[indexer] !== '}')
                continue;

            if (counter > 1) {
                counter--;
                continue;
            }

            end = indexer;
            break;
        }

        if (end === -1)
            continue;

        var css = value.substring(index, end + 1);
        builder.push({
            name: 'keyframes',
            property: css
        });
    }

    var output = [];
    var length = builder.length;

    for (var i = 0; i < length; i++) {

        var name = builder[i].name;
        var property = builder[i].property;

        if (name !== 'keyframes')
            continue;

        var plus = property.substring(1);
        var delimiter = '\n';

        var updated = '@' + plus + delimiter;

        updated += '@-webkit-' + plus + delimiter;
        updated += '@-moz-' + plus + delimiter;
        updated += '@-o-' + plus + delimiter;

        value = value.replacer(property, '@[[' + output.length + ']]');
        output.push(updated);
    }

    length = output.length;

    for (var i = 0; i < length; i++)
        value = value.replace('@[[' + i + ']]', output[i]);

    builder = null;
    output = null;

    return value;
}

exports.compile_css = function(value, minify) {

    if (framework.onCompileCSS !== null)
        return framework.onCompileCSS('', value);

    try {
        return compile_autovendor(value);
    } catch (ex) {
        framework.error(new Error('JS CSS exception: ' + ex.message));
        return '';
    }
};

// *********************************************************************************
// =================================================================================
// JavaScript compressor
// =================================================================================
// *********************************************************************************

// Copyright (c) 2002 Douglas Crockford  (www.crockford.com)
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

/*
    Minify JS
    @source {String}
    return {String}
*/
function JavaScript(source) {

    var EOF = -1;
    var sb = [];
    var theA; // int
    var theB; // int
    var theLookahead = EOF; // int
    var index = 0;

    function jsmin() {
        theA = 13;
        action(3);
        var indexer = 0;
        while (theA !== EOF) {
            switch (theA) {
                case 32:
                    if (isAlphanum(theB))
                        action(1);
                    else
                        action(2);
                    break;
                case 13:
                    switch (theB) {
                        case 123:
                        case 91:
                        case 40:
                        case 43:
                        case 45:
                            action(1);
                            break;
                        case 32:
                            action(3);
                            break;
                        default:
                            if (isAlphanum(theB))
                                action(1);
                            else
                                action(2);
                            break;
                    }
                    break;
                default:
                    switch (theB) {
                        case 32:
                            if (isAlphanum(theA)) {
                                action(1);
                                break;
                            }
                            action(3);
                            break;

                        case 13:
                            switch (theA) {
                                case 125:
                                case 93:
                                case 41:
                                case 43:
                                case 45:
                                case 34:
                                case 92:
                                    action(1);
                                    break;
                                default:
                                    if (isAlphanum(theA))
                                        action(1);
                                    else
                                        action(3);
                                    break;
                            }
                            break;
                        default:
                            action(1);
                            break;
                    }
                    break;
            }
        }
    }

    function action(d) {
        if (d <= 1) {
            put(theA);
        }
        if (d <= 2) {
            theA = theB;
            if (theA === 39 || theA === 34) {
                for (;;) {
                    put(theA);
                    theA = get();
                    if (theA === theB) {
                        break;
                    }
                    if (theA <= 13) {
                        //throw new Exception(string.Format("Error: JSMIN unterminated string literal: {0}\n", theA));
                        c = EOF;
                        return;
                    }
                    if (theA === 92) {
                        put(theA);
                        theA = get();
                    }
                }
            }
        }
        if (d <= 3) {
            theB = next();
            if (theB === 47 && (theA === 40 || theA === 44 || theA === 61 ||
                theA === 91 || theA === 33 || theA === 58 ||
                theA === 38 || theA === 124 || theA === 63 ||
                theA === 123 || theA === 125 || theA === 59 ||
                theA === 13)) {
                put(theA);
                put(theB);
                for (;;) {
                    theA = get();
                    if (theA === 47) {
                        break;
                    } else if (theA === 92) {
                        put(theA);
                        theA = get();
                    } else if (theA <= 13) {
                        c = EOF;
                        return;
                    }
                    put(theA);
                }
                theB = next();
            }
        }
    }

    function next() {
        var c = get();

        if (c !== 47)
            return c;

        switch (peek()) {
            case 47:
                for (;;) {
                    c = get();
                    if (c <= 13)
                        return c;
                }
                break;
            case 42:
                get();
                for (;;) {
                    switch (get()) {
                        case 42:
                            if (peek() === 47) {
                                get();
                                return 32;
                            }
                            break;
                        case EOF:
                            c = EOF;
                            return;
                    }
                }
                break;
            default:
                return c;
        }

        return c;
    }

    function peek() {
        theLookahead = get();
        return theLookahead;
    }

    function get() {
        var c = theLookahead;
        theLookahead = EOF;
        if (c === EOF) {
            c = source.charCodeAt(index++);
            if (isNaN(c))
                c = EOF;
        }
        if (c >= 32 || c === 13 || c === EOF) {
            return c;
        }
        if (c === 10)
            return 13;
        return 32;
    }

    function put(c) {
        if (c === 13 || c === 10)
            sb.push(' ');
        else
            sb.push(String.fromCharCode(c));
    }

    function isAlphanum(c) {
        return ((c >= 97 && c <= 122) || (c >= 48 && c <= 57) || (c >= 65 && c <= 90) || c === 95 || c === 36 || c === 92 || c > 126);
    }

    jsmin();
    return sb.join('');
}

exports.compile_javascript = function(source) {

    var isFramework = (typeof(framework) === OBJECT);

    try {
        if (isFramework) {
            if (framework.onCompileJS !== null)
                return framework.onCompileJS('', source);
        }

        return JavaScript(source);
    } catch (ex) {

        if (isFramework)
            framework.error(ex, 'JavaScript compressor');

        return source;
    }
};

exports.compile_html = function(source) {
    return compressHTML(source, true);
};

// *********************************************************************************
// =================================================================================
// MULTIPART PARSER
// =================================================================================
// *********************************************************************************

// Copyright (c) 2010 Hongli Lai
// Copyright (c) Felix Geisendörfer -> https://github.com/felixge/node-formidable

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

var Buffer = require('buffer').Buffer,
    s = 0,
    S = {
        PARSER_UNINITIALIZED: s++,
        START: s++,
        START_BOUNDARY: s++,
        HEADER_FIELD_START: s++,
        HEADER_FIELD: s++,
        HEADER_VALUE_START: s++,
        HEADER_VALUE: s++,
        HEADER_VALUE_ALMOST_DONE: s++,
        HEADERS_ALMOST_DONE: s++,
        PART_DATA_START: s++,
        PART_DATA: s++,
        PART_END: s++,
        END: s++
    },

    f = 1,
    F = {
        PART_BOUNDARY: f,
        LAST_BOUNDARY: f *= 2
    },

    LF = 10,
    CR = 13,
    SPACE = 32,
    HYPHEN = 45,
    COLON = 58,
    A = 97,
    Z = 122,

    lower = function(c) {
        return c | 0x20;
    };

for (s in S) {
    exports[s] = S[s];
}

function MultipartParser() {
    this.boundary = null;
    this.boundaryChars = null;
    this.lookbehind = null;
    this.state = S.PARSER_UNINITIALIZED;
    this.index = null;
    this.flags = 0;
}
exports.MultipartParser = MultipartParser;

MultipartParser.stateToString = function(stateNumber) {
    for (var state in S) {
        var number = S[state];
        if (number === stateNumber) return state;
    }
};

MultipartParser.prototype.initWithBoundary = function(str) {
    var self = this;
    self.boundary = new Buffer(str.length + 4);

    if (framework.versionNode >= 1111) {
        self.boundary.write('\r\n--', 0, 'ascii');
        self.boundary.write(str, 4, 'ascii');
    } else {
        self.boundary.write('\r\n--', 'ascii', 0);
        self.boundary.write(str, 'ascii', 4);
    }

    self.lookbehind = new Buffer(self.boundary.length + 8);
    self.state = S.START;

    self.boundaryChars = {};
    for (var i = 0; i < self.boundary.length; i++) {
        self.boundaryChars[self.boundary[i]] = true;
    }
};

MultipartParser.prototype.write = function(buffer) {
    var self = this,
        i = 0,
        len = buffer.length,
        prevIndex = self.index,
        index = self.index,
        state = self.state,
        flags = self.flags,
        lookbehind = self.lookbehind,
        boundary = self.boundary,
        boundaryChars = self.boundaryChars,
        boundaryLength = self.boundary.length,
        boundaryEnd = boundaryLength - 1,
        bufferLength = buffer.length,
        c,
        cl,

        mark = function(name) {
            self[name + 'Mark'] = i;
        },
        clear = function(name) {
            delete self[name + 'Mark'];
        },
        callback = function(name, buffer, start, end) {
            if (start !== undefined && start === end) {
                return;
            }

            var callbackSymbol = 'on' + name.substr(0, 1).toUpperCase() + name.substr(1);
            if (callbackSymbol in self) {
                self[callbackSymbol](buffer, start, end);
            }
        },
        dataCallback = function(name, clear) {
            var markSymbol = name + 'Mark';
            if (!(markSymbol in self)) {
                return;
            }

            if (!clear) {
                callback(name, buffer, self[markSymbol], buffer.length);
                self[markSymbol] = 0;
            } else {
                callback(name, buffer, self[markSymbol], i);
                delete self[markSymbol];
            }
        };

    for (i = 0; i < len; i++) {
        c = buffer[i];
        switch (state) {
            case S.PARSER_UNINITIALIZED:
                return i;
            case S.START:
                index = 0;
                state = S.START_BOUNDARY;
            case S.START_BOUNDARY:
                if (index == boundary.length - 2) {
                    if (c == HYPHEN) {
                        flags |= F.LAST_BOUNDARY;
                    } else if (c != CR) {
                        return i;
                    }
                    index++;
                    break;
                } else if (index - 1 == boundary.length - 2) {
                    if (flags & F.LAST_BOUNDARY && c == HYPHEN) {
                        callback('end');
                        state = S.END;
                        flags = 0;
                    } else if (!(flags & F.LAST_BOUNDARY) && c == LF) {
                        index = 0;
                        callback('partBegin');
                        state = S.HEADER_FIELD_START;
                    } else {
                        return i;
                    }
                    break;
                }

                if (c != boundary[index + 2]) {
                    index = -2;
                }
                if (c == boundary[index + 2]) {
                    index++;
                }
                break;
            case S.HEADER_FIELD_START:
                state = S.HEADER_FIELD;
                mark('headerField');
                index = 0;
            case S.HEADER_FIELD:
                if (c == CR) {
                    clear('headerField');
                    state = S.HEADERS_ALMOST_DONE;
                    break;
                }

                index++;
                if (c == HYPHEN) {
                    break;
                }

                if (c == COLON) {
                    if (index == 1) {
                        // empty header field
                        return i;
                    }
                    dataCallback('headerField', true);
                    state = S.HEADER_VALUE_START;
                    break;
                }

                cl = lower(c);
                if (cl < A || cl > Z) {
                    return i;
                }
                break;
            case S.HEADER_VALUE_START:
                if (c == SPACE) {
                    break;
                }

                mark('headerValue');
                state = S.HEADER_VALUE;
            case S.HEADER_VALUE:
                if (c == CR) {
                    dataCallback('headerValue', true);
                    callback('headerEnd');
                    state = S.HEADER_VALUE_ALMOST_DONE;
                }
                break;
            case S.HEADER_VALUE_ALMOST_DONE:
                if (c != LF) {
                    return i;
                }
                state = S.HEADER_FIELD_START;
                break;
            case S.HEADERS_ALMOST_DONE:
                if (c != LF) {
                    return i;
                }

                callback('headersEnd');
                state = S.PART_DATA_START;
                break;
            case S.PART_DATA_START:
                state = S.PART_DATA;
                mark('partData');
            case S.PART_DATA:
                prevIndex = index;

                if (index === 0) {
                    // boyer-moore derrived algorithm to safely skip non-boundary data
                    i += boundaryEnd;
                    while (i < bufferLength && !(buffer[i] in boundaryChars)) {
                        i += boundaryLength;
                    }
                    i -= boundaryEnd;
                    c = buffer[i];
                }

                if (index < boundary.length) {
                    if (boundary[index] == c) {
                        if (index === 0) {
                            dataCallback('partData', true);
                        }
                        index++;
                    } else {
                        index = 0;
                    }
                } else if (index == boundary.length) {
                    index++;
                    if (c == CR) {
                        // CR = part boundary
                        flags |= F.PART_BOUNDARY;
                    } else if (c == HYPHEN) {
                        // HYPHEN = end boundary
                        flags |= F.LAST_BOUNDARY;
                    } else {
                        index = 0;
                    }
                } else if (index - 1 == boundary.length) {
                    if (flags & F.PART_BOUNDARY) {
                        index = 0;
                        if (c == LF) {
                            // unset the PART_BOUNDARY flag
                            flags &= ~F.PART_BOUNDARY;
                            callback('partEnd');
                            callback('partBegin');
                            state = S.HEADER_FIELD_START;
                            break;
                        }
                    } else if (flags & F.LAST_BOUNDARY) {
                        if (c == HYPHEN) {
                            callback('partEnd');
                            callback('end');
                            state = S.END;
                            flags = 0;
                        } else {
                            index = 0;
                        }
                    } else {
                        index = 0;
                    }
                }

                if (index > 0) {
                    // when matching a possible boundary, keep a lookbehind reference
                    // in case it turns out to be a false lead
                    lookbehind[index - 1] = c;
                } else if (prevIndex > 0) {
                    // if our boundary turned out to be rubbish, the captured lookbehind
                    // belongs to partData
                    callback('partData', lookbehind, 0, prevIndex);
                    prevIndex = 0;
                    mark('partData');

                    // reconsider the current character even so it interrupted the sequence
                    // it could be the beginning of a new sequence
                    i--;
                }
                break;
            case S.END:
                break;
            default:
                return i;
        }
    }

    dataCallback('headerField');
    dataCallback('headerValue');
    dataCallback('partData');

    self.index = index;
    self.state = state;
    self.flags = flags;

    return len;
};

MultipartParser.prototype.end = function() {

    var self = this;

    var callback = function(self, name) {
        var callbackSymbol = 'on' + name.substr(0, 1).toUpperCase() + name.substr(1);
        if (callbackSymbol in self) {
            self[callbackSymbol]();
        }
    };

    if ((self.state == S.HEADER_FIELD_START && self.index === 0) ||
        (self.state == S.PART_DATA && self.index == self.boundary.length)) {
        callback(self, 'partEnd');
        callback(self, 'end');
    } else if (self.state != S.END) {
        callback(self, 'partEnd');
        callback(self, 'end');
        return new Error('MultipartParser.end(): stream ended unexpectedly: ' + self.explain());
    }
};

MultipartParser.prototype.explain = function() {
    return 'state = ' + MultipartParser.stateToString(this.state);
};

// *********************************************************************************
// =================================================================================
// VIEW ENGINE
// =================================================================================
// *********************************************************************************

/*
    View class
    return {View}
*/
function View() {}

/**
 * View parser
 * @param {String} content
 * @param {Boolean} minify
 * @return {Function}
 */
function view_parse(content, minify) {

    if (minify)
        content = removeComments(content);

    content = compressCSS(compressJS(content, 0), 0);

    var DELIMITER = '\'';
    var DELIMITER_UNESCAPE = 'unescape(\'';
    var DELIMITER_UNESCAPE_END = '\')';
    var SPACE = ' ';
    var builder = 'var $EMPTY=\'\';var $length=0;var $source=null;var $tmp=index;var $output=$EMPTY';
    var command = view_find_command(content, 0);
    var compressed = '';

    function escaper(value) {
        value = compressHTML(value, minify);
        if (value === '')
            return '$EMPTY';
        if (value.match(/\n|\t|\r|\'|\\/) !== null)
            return DELIMITER_UNESCAPE + escape(value) + DELIMITER_UNESCAPE_END
        return DELIMITER + value + DELIMITER;
    }

    if (command === null)
        builder += '+' + escaper(content);

    var old = null;
    var newCommand = '';
    var tmp = '';
    var index = 0;
    var counter = 0;
    var functions = [];
    var functionsName = [];
    var isFN = false;
    var isSECTION = false;
    var builderTMP = '';
    var sectionName = '';
    var isSitemap = false;

    while (command !== null) {

        if (old !== null) {
            var text = content.substring(old.end + 1, command.beg);
            if (text !== '') {
                if (view_parse_plus(builder))
                    builder += '+';
                builder += escaper(text);
            }
        } else {
            var text = content.substring(0, command.beg);
            if (text !== '') {
                if (view_parse_plus(builder))
                    builder += '+';
                builder += escaper(text);
            }
        }

        var cmd = content.substring(command.beg + 2, command.end);
        var cmd8 = cmd.substring(0, 8);

        if (cmd8 === 'section ' && cmd.lastIndexOf(')') === -1) {

            builderTMP = builder;
            builder = '+(function(){var $output=$EMPTY';
            sectionName = cmd.substring(8);
            isSECTION = true;
            isFN = true;

        } else if (cmd.substring(0, 7) === 'helper ') {

            builderTMP = builder;
            builder = 'function ' + cmd.substring(7).trim() + '{var $output=$EMPTY';
            isFN = true;
            functionsName.push(cmd.substring(7, cmd.indexOf('(', 7)).trim());

        } else if (cmd8 === 'foreach ') {

            counter++;

            if (cmd.indexOf('foreach var ') !== -1)
                cmd = cmd.replace(' var ', SPACE);

            newCommand = (cmd.substring(8, cmd.indexOf(SPACE, 8)) || '').trim();
            index = cmd.trim().indexOf(SPACE, newCommand.length + 10);
            builder += '+(function(){var $source=' + cmd.substring(index).trim() + ';if (!($source instanceof Array) || source.length === 0)return $EMPTY;var $length=$source.length;var $output=$EMPTY;var index=0;for(var i=0;i<$length;i++){index = i;var ' + newCommand + '=$source[i];$output+=$EMPTY';

        } else if (cmd === 'end') {

          if (isFN && counter <= 0) {

                counter = 0;

                if (isSECTION) {
                    builder = builderTMP + builder + ';repository[\'$section_' + sectionName + '\']=$output;return $EMPTY})()';
                    builderTMP = '';
                } else {
                    builder += ';return $output;}';
                    functions.push(builder);
                    builder = builderTMP;
                    builderTMP = '';
                }

                isSECTION = false;
                isFN = false;

            } else {
                counter--;
                builder += '}return $output;})()';
                newCommand = '';
            }

        } else if (cmd.substring(0, 3) === 'if ') {
            builder += ';if (' + cmd.substring(3) + '){$output+=$EMPTY';
        } else if (cmd === 'else') {
            builder += '} else {$output+=$EMPTY';
        } else if (cmd === 'endif') {
            builder += '}$output+=$EMPTY'
        } else {
            tmp = view_prepare(command.command, newCommand, functionsName);

            if (tmp.length > 0) {
                if (view_parse_plus(builder))
                    builder += '+';
                builder += tmp;
            }
        }

        old = command;
        command = view_find_command(content, command.end);
        if (command && command.command && command.command.indexOf('sitemap(') !== -1)
            isSitemap = true;
    }

    if (old !== null) {
        var text = content.substring(old.end + 1);
        if (text.length > 0)
            builder += '+' + escaper(text);
    }

    var fn = '(function(self,repository,model,session,get,post,url,global,helpers,user,config,functions,index,output,date){' + (isSitemap ? 'var sitemap = function() { return self.sitemap.apply(self, arguments);};' : '') + (functions.length > 0 ? functions.join('') + ';' : '') + 'var controller=self;' + builder + ';return $output;})';
    return eval(fn);
}

function view_parse_plus(builder) {
    var c = builder[builder.length - 1];
    if (c !== '!' && c !== '?' && c !== '+' && c !== '.' && c !== ':')
        return true;
    return false;
}

function view_prepare(command, dynamicCommand, functions) {

    var a = command.indexOf('.');
    var b = command.indexOf('(');
    var c = command.indexOf('[');

    var max = [];
    var tmp = 0;

    if (a !== -1)
        max.push(a);

    if (b !== -1)
        max.push(b);

    if (c !== -1)
        max.push(c);

    var index = Math.min.apply(this, max);

    if (index === -1)
        index = command.length;

    var name = command.substring(0, index);

    if (name === dynamicCommand)
        return '(' + command + ').toString().encode()';

    if (name[0] === '!' && name.substring(1) === dynamicCommand)
        return '(' + command.substring(1) + ').toString()';

    switch (name) {
        case 'foreach':
        case 'end':
            return '';

        case 'section':
            tmp = command.indexOf('(');
            if (tmp === -1)
                return '';
            return '(repository[\'$section_' + command.substring(tmp + 1, command.length - 1).replace(/\'/g, '') + '\'] || \'\')';

        case 'log':
        case 'LOG':
            return '(' + (name === 'log' ? 'framework.' : '') + command + '?$EMPTY:$EMPTY)';

        case 'console':
            return '(' + command + '?$EMPTY:$EMPTY)';

        case 'model':
        case 'repository':
        case 'get':
        case 'post':
        case 'query':
        case 'global':
        case 'session':
        case 'user':
        case 'config':
        case 'controller':

            if (view_is_assign(command))
                return 'self.$set(' + command + ')';

            return '$STRING(' + command + ').encode()';

        case 'body':

            if (view_is_assign(command))
                return 'self.$set(' + command + ')';

            if (command.lastIndexOf('.') === -1)
                return 'output';

            return '$STRING(' + command + ').encode()';

        case 'CONFIG':
        case 'FUNCTION':
        case 'MODEL':
        case 'SCHEMA':
        case 'MODULE':
        case 'functions':
            return '$STRING(' + command + ').encode()';

        case '!controller':
        case '!repository':
        case '!get':
        case '!post':
        case '!body':
        case '!query':
        case '!global':
        case '!session':
        case '!user':
        case '!config':
        case '!functions':
        case '!model':
        case '!CONFIG':
        case '!SCHEMA':
        case '!FUNCTION':
        case '!MODEL':
        case '!MODULE':
            return '$STRING(' + command.substring(1) + ')';

        case 'resource':
        case 'RESOURCE':
            return '$STRING(self.' + command + ').encode()';

        case '!resource':
        case '!RESOURCE':
            return '$STRING(self.' + command.substring(1) + ')';

        case 'host':
        case 'hostname':
            if (command.indexOf('(') === -1)
                return 'self.host()';
            return 'self.' + command;

        case 'url':
            if (command.indexOf('(') !== -1)
                return 'self.$' + command;
            return command = 'url';

        case 'title':
        case 'description':
        case 'keywords':
            if (command.indexOf('(') !== -1)
                return 'self.$' + command;
            return '(repository[\'$' + command + '\'] || \'\').toString().encode()';

        case '!title':
        case '!description':
        case '!keywords':
            return '(repository[\'$' + command.substring(1) + '\'] || \'\')';

        case 'head':
            if (command.indexOf('(') !== -1)
                return 'self.$' + command;
            return 'self.' + command + '()';

        case 'sitemap':
        case 'place':
            if (command.indexOf('(') !== -1)
                return 'self.$' + command;
            return '(repository[\'$' + command + '\'] || \'\')';

        case 'meta':
            if (command.indexOf('(') !== -1)
                return 'self.$' + command;
            return 'self.$meta()';

        case 'js':
        case 'script':
        case 'css':
        case 'favicon':
            return 'self.$' + command + (command.indexOf('(') === -1 ? '()' : '');

        case 'index':
            return '(' + command + ')';

        case 'routeJS':
        case 'routeCSS':
        case 'routeImage':
        case 'routeFont':
        case 'routeDownload':
        case 'routeVideo':
        case 'routeStatic':
            return 'self.' + command;

        case 'json':
        case 'image':
        case 'layout':
        case 'template':
        case 'templateToggle':
        case 'view':
        case 'viewToggle':
        case 'helper':
        case 'download':
        case 'selected':
        case 'currentContent':
        case 'currentCSS':
        case 'currentDownload':
        case 'currentImage':
        case 'currentJS':
        case 'currentTemplate':
        case 'currentVideo':
        case 'currentView':
        case 'disabled':
        case 'checked':
        case 'etag':
        case 'header':
        case 'modified':
        case 'options':
        case 'readonly':
        case 'canonical':
        case 'dns':
        case 'next':
        case 'prefetch':
        case 'prerender':
        case 'prev':
            return 'self.$' + command;

        case 'radio':
        case 'text':
        case 'checkbox':
        case 'hidden':
        case 'textarea':
        case 'password':
            return 'self.$' + exports.appendModel(command);

        default:

            if (framework.helpers[name])
                return 'helpers.' + view_insert_call(command);

            return '$STRING(' + (functions.indexOf(name) === -1 ? command[0] === '!' ? command.substring(1) + ')' : command + ').encode()' : command + ')');
    }

    return command;
}

function view_insert_call(command) {

    var beg = command.indexOf('(');
    if (beg === -1)
        return command;

    var length = command.length;
    var count = 0;

    for (var i = beg + 1; i < length; i++) {

        var c = command[i];

        if (c !== '(' && c !== ')')
            continue;

        if (c === '(') {
            count++;
            continue;
        }

        if (count > 0) {
            count--;
            continue;
        }

        var arg = command.substring(beg + 1);
        return command.substring(0, beg) + '.call(self' + (arg.length > 1 ? ',' + arg : ')');
    }

    return command;
}

function view_is_assign(value) {

    var length = value.length;
    var skip = 0;
    var plus = 0;

    for (var i = 0; i < length; i++) {

        var c = value[i];

        if (c === '[') {
            skip++;
            continue;
        }

        if (c === ']') {
            skip--;
            continue;
        }

        var next = value[i + 1] || '';

        if (c === '+' && (next === '+' || next === '=')) {
            if (skip === 0)
                return true;
        }

        if (c === '-' && (next === '-' || next === '=')) {
            if (skip === 0)
                return true;
        }

        if (c === '*' && (next === '*' || next === '=')) {
            if (skip === 0)
                return true;
        }

        if (c === '=') {
            if (skip === 0)
                return true;
        }

    }

    return false;
}


function view_find_command(content, index) {

    var index = content.indexOf('@{', index);
    if (index === -1)
        return null;

    var length = content.length;
    var count = 0;

    for (var i = index + 2; i < length; i++) {
        var c = content[i];

        if (c === '{') {
            count++;
            continue;
        }

        if (c !== '}')
            continue;
        else {
            if (count > 0) {
                count--;
                continue;
            }
        }

        return {
            beg: index,
            end: i,
            command: content.substring(index + 2, i).trim()
        };
    }

    return null;
}

function removeCondition(text, beg) {

    if (beg) {
        if (text[0] === '+')
            return text.substring(1, text.length);
    } else {
        if (text[text.length - 1] === '+')
            return text.substring(0, text.length - 1);
    }

    return text;
}

function removeComments(html) {
    var tagBeg = '<!--';
    var tagEnd = '-->';
    var beg = html.indexOf(tagBeg);
    var end = 0;

    while (beg !== -1) {
        end = html.indexOf(tagEnd, beg + 4);

        if (end === -1)
            break;

        var comment = html.substring(beg, end + 3);

        if (comment.indexOf('[if') !== -1 || comment.indexOf('[endif') !== -1) {
            beg = html.indexOf(tagBeg, end + 3);
            continue;
        }

        html = html.replacer(comment, '');
        beg = html.indexOf(tagBeg, end + 3);
    }

    return html;
}

/**
 * Inline JS compressor
 * @private
 * @param  {String} html HTML.
 * @param  {Number} index Last index.
 * @return {String}
 */
function compressJS(html, index) {

    var strFrom = '<script type="text/javascript">';
    var strTo = '</script>';

    var indexBeg = html.indexOf(strFrom, index || 0);
    if (indexBeg === -1) {
        strFrom = '<script>';
        indexBeg = html.indexOf(strFrom, index || 0);
        if (indexBeg === -1)
            return html;
    }

    var indexEnd = html.indexOf(strTo, indexBeg + strFrom.length);
    if (indexEnd === -1)
        return html;

    var js = html.substring(indexBeg, indexEnd + strTo.length).trim();
    var beg = html.indexOf(js);
    if (beg === -1)
        return html;

    var val = js.substring(strFrom.length, js.length - strTo.length).trim();
    var compiled = exports.compile_javascript(val);
    html = html.replacer(js, strFrom + compiled.dollar().trim() + strTo.trim());
    return compressJS(html, indexBeg + compiled.length + 9);
}

/**
 * Inline CSS compressor
 * @private
 * @param  {String} html HTML.
 * @param  {Number} index Last index.
 * @return {String}
 */
function compressCSS(html, index) {
    var strFrom = '<style type="text/css">';
    var strTo = '</style>';

    var indexBeg = html.indexOf(strFrom, index || 0);
    if (indexBeg === -1) {
        strFrom = '<style>';
        indexBeg = html.indexOf(strFrom, index || 0);
        if (indexBeg === -1)
            return html;
    }

    var indexEnd = html.indexOf(strTo, indexBeg + strFrom.length);
    if (indexEnd === -1)
        return html;

    var css = html.substring(indexBeg, indexEnd + strTo.length);
    var val = css.substring(strFrom.length, css.length - strTo.length).trim();
    var compiled = exports.compile_css(val, true);
    html = html.replacer(css, (strFrom + compiled.trim() + strTo).trim());
    return compressCSS(html, indexBeg + compiled.length + 8);
}

/**
 * HTML compressor
 * @private
 * @param  {String} html HTML.
 * @param  {Boolean} minify Can minify?
 * @return {String}
 */
function compressHTML(html, minify) {

    if (html === null || html === '' || !minify)
        return html;

    html = removeComments(html);

    var tags = ['script', 'textarea', 'pre', 'code'];
    var id = '[' + new Date().getTime() + ']#';
    var cache = {};
    var indexer = 0;
    var length = tags.length;

    for (var i = 0; i < length; i++) {
        var o = tags[i];

        var tagBeg = '<' + o;
        var tagEnd = '</' + o;

        var beg = html.indexOf(tagBeg);
        var end = 0;
        var len = tagEnd.length;

        while (beg !== -1) {

            end = html.indexOf(tagEnd, beg + 3);
            if (end === -1)
                break;

            var key = id + (indexer++);
            var value = html.substring(beg, end + len);

            if (i === 0) {
                end = value.indexOf('>');
                len = value.indexOf('type="text/template"');
                if (len < end && len !== -1)
                    break;
                len = value.indexOf('type="text/html"');
                if (len < end && len !== -1)
                    break;
                len = value.indexOf('type="text/ng-template"');
                if (len < end && len !== -1)
                    break;
            }

            cache[key] = value;
            html = html.replacer(value, key);
            beg = html.indexOf(tagBeg, beg + tagBeg.length);
        }
    }

    html = html.replace(REG_1, '').replace(REG_2, '');

    var keys = Object.keys(cache);
    length = keys.length;

    for (var i = 0; i < length; i++) {
        var key = keys[i];
        html = html.replacer(key, cache[key]);
    }

    return html;
}

/**
 * Read file
 * @param {String} path
 * @return {Object}
 */
View.prototype.read = function(path) {

    var self = this;
    var config = framework.config;
    var isOut = path[0] === '.';
    var filename = isOut ? path.substring(1) : framework_utils.combine(config['directory-views'], path);

    if (fs.existsSync(filename))
        return view_parse(fs.readFileSync(filename).toString('utf8'), config['allow-compile-html']);

    if (isOut)
        return null;

    var index = path.lastIndexOf('/');
    if (index === -1)
        return null;

    filename = framework_utils.combine(config['directory-views'], path.substring(index + 1));

    if (fs.existsSync(filename))
        return view_parse(fs.readFileSync(filename).toString('utf8'), config['allow-compile-html']);

    return null;
};

/**
 * Load view
 * @param {String} name
 * @param {String} filename
 * @return {Objec}
 */
View.prototype.load = function(name, filename) {

    var self = this;

    // Is dynamic content?
    if (name.indexOf('@{') !== -1 || name.indexOf('<') !== -1)
        return self.dynamic(name);

    var precompiled = framework.routes.views[name];

    if (precompiled)
        filename = '.' + precompiled.filename;
    else
        filename += '.html';

    var key = 'view#' + filename;
    var generator = framework.temporary.views[key] || null;

    if (generator !== null)
        return generator;

    generator = self.read(filename);

    if (!framework.isDebug)
        framework.temporary.views[key] = generator;

    return generator;
};

/*
    Compile dynamic view
    @content {String}
    return {Object} :: return parsed HTML
*/
View.prototype.dynamic = function(content) {

    var self = this;
    var key = content.md5();
    var generator = framework.temporary.views[key] || null;

    if (generator !== null)
        return generator;

    generator = view_parse(content, framework.config['allow-compile-html']);

    if (!framework.isDebug)
        framework.temporary.views[key] = generator;

    return generator;
};

/*
    Render view from file
    @name {String}
    return {Object}
*/
exports.generateView = function(name, plus) {
    return new View().load(name, plus);
};

exports.appendModel = function(str) {
    var index = str.indexOf('(');
    if (index === -1)
        return str;

    var end = str.substring(index + 1);
    return str.substring(0, index) + '(model' + (end[0] === ')' ? end : ',' + end);
};