/* jshint strict:true */
/* jslint node: true */
/* jslint esversion: 6 */
'use strict';

/**
 *      Serial port module for iobroker.elv-sup2
 *      Licensed under GPL v2
 *      Copyright (c) 2022 pdbjjens <jjensen@t-online.de>
 *
 */


const EventEmitter = require('events').EventEmitter;


class Sup extends EventEmitter {

	constructor(opts) {
		super();

		const options = opts || {};

		//options.connectionMode = opts.connectionMode || 'serial';
		//options.serialport = opts.serialport || 'COM8';
		//options.baudrate = opts.baudrate || 19200;
		//options.databits = opts.databits || 8;
		//options.stopbits = opts.stopbits || 1;
		//options.parity = opts.parity || 'even';
		//options.debug = opts.debug  || false;
		//options.parse = opts.parse || true;
		//options.logger = opts.logger;

		const that = this;


		// Serial connection
		if (options.connectionMode === 'serial') {
			const { SerialPort } = require('serialport');
			const { InterByteTimeoutParser } = require('@serialport/parser-inter-byte-timeout');
			const spOptions = {
				path: options.serialport,
				baudRate: options.baudrate,
				dataBits: options.databits,
				stopBits: options.stopbits,
				parity: options.parity
			};
			if (options.debug) options.logger('Open Serial Port: ' + JSON.stringify(spOptions));
			const serialPort = new SerialPort(spOptions,
				(err) => {
					if (err) {
						if (options.debug) options.logger('Error: ' + err.message);
						this.close();
					}
				});
			const parser = new InterByteTimeoutParser({ interval: 300 });

			serialPort.pipe(parser);

			this.close = function (callback) {
				if (!serialPort.isOpen) {
					return;
				}
				serialPort.close(callback);
				if (options.debug) options.logger('closed Serial Port: ' + options.serialport);
			};


			serialPort.on('close', (err) => {
				this.emit('close', err);
			});

			serialPort.on('open', () => {
				parser.on('data', parse);
				if (options.debug) options.logger('Serial Port ready: ' + JSON.stringify(spOptions));
				this.emit('ready');
			});

			serialPort.on('error', (ex) => {
				this.emit('error', ex);
			});

			this.write = function (data, callback) {
				if (options.debug) options.logger('Write to port: ' + data);
				serialPort.write(data);
				serialPort.drain(callback);
			};

		} else {
		// If an unknown connection is defined
			throw new Error('connection mode \'' + options.connectionMode + '\' is not implemented!');
		}

		function parse(data) {
			if (!data) {
				return;
			}

			data = data.toString();
			if (options.debug) options.logger('Received data: ' + data);
			let response = '';

			if (data !== '*A\n') {
				if (options.parse) {
					response = data.replace(/\*([A-Z0-9]+):([0-9]+)\n|\*([A-Z0-9]+):([\w\s]+)\n/g, function ($1, $2, $3, $4, $5) {
						if ($3 == null) {
							return ('"' + $4 + '"' + ':"' + $5 + '",');
						} else {
							return ('"' + $2 + '"' + ':' + $3 + ',');
						}
					}).replace(/^/, '{').replace(/,$/g, '}');
				}

			} else {
				response = data.replace('\n', '');
			}
			if (options.debug) options.logger('Received response: ' + response);
			that.emit('data', response);
		}

	}
}


module.exports = Sup;
