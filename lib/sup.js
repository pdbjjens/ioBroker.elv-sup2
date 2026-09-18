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

const EventEmitter = require('node:events').EventEmitter;

/**
 * Serial connection handler for ELV SUP2 devices.
 */
class Sup extends EventEmitter {
    /**
     * Creates a SUP2 connection instance.
     *
     * @param {object} [opts] Connection settings.
     */
    constructor(opts) {
        super();

        const options = opts || {};
        const log = typeof options.logger === 'function' ? options.logger : () => {};
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const that = this;

        // Serial connection
        if (options.connectionMode === 'serial') {
            const { SerialPort } = require('serialport');
            const { InterByteTimeoutParser } = require('@serialport/parser-inter-byte-timeout');
            const spOptions = {
                path: typeof options.serialport === 'string' ? options.serialport : '',
                baudRate: Number(options.baudrate ?? 9600),
                dataBits: Number(options.databits ?? 8),
                stopBits: Number(options.stopbits ?? 1),
                parity: typeof options.parity === 'string' ? options.parity : 'none',
            };
            if (options.debug) {
                log(`Open Serial Port: ${JSON.stringify(spOptions)}`);
            }
            // @ts-expect-error -- SerialPort runtime validation is stricter than the generated JS typings.
            const serialPort = new SerialPort(spOptions, err => {
                if (err) {
                    if (options.debug) {
                        log(`Error: ${err.message}`);
                    }
                    this.close();
                }
            });
            const parser = new InterByteTimeoutParser({ interval: 300 });

            serialPort.pipe(parser);

            this.close = callback => {
                serialPort.flush(() => {
                    serialPort.close(callback);
                });
            };

            serialPort.on('close', err => {
                this.emit('close', err);
            });

            serialPort.on('open', () => {
                parser.on('data', parse);
                if (options.debug) {
                    log(`Serial Port ready: ${JSON.stringify(spOptions)}`);
                }
                this.emit('ready');
            });

            serialPort.on('error', ex => {
                this.emit('error', ex);
            });

            this.write = (data, callback) => {
                if (options.debug) {
                    log(`Write to port: ${data}`);
                }
                serialPort.write(data);
                serialPort.drain(callback);
            };
        } else {
            // If an unknown connection is defined
            throw new Error(`connection mode '${options.connectionMode}' is not implemented!`);
        }

        function parse(data) {
            if (!data) {
                return;
            }

            data = data.toString();
            if (options.debug) {
                log(`Received data: ${data}`);
            }
            let response = '';

            if (data !== '*A\n') {
                if (options.parse) {
                    response = data
                        .replace(/\*([A-Z0-9]+):([0-9]+)\n|\*([A-Z0-9]+):([\w\s]+)\n/g, function ($1, $2, $3, $4, $5) {
                            if ($3 == null) {
                                return `"${$4}"` + `:"${$5}",`;
                                // eslint-disable-next-line no-else-return
                            } else {
                                return `"${$2}"` + `:${$3},`;
                            }
                        })
                        .replace(/^/, '{')
                        .replace(/,$/g, '}');
                }
            } else {
                response = data.replace('\n', '');
            }
            if (options.debug) {
                log(`Received response: ${response}`);
            }
            that.emit('data', response);
        }
    }
}

module.exports = Sup;
