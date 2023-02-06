'use strict';

/*
 * Created with @iobroker/create-adapter v2.1.1
 */

// The adapter-core module gives you access to the core ioBroker functions
// you need to create an adapter
const utils = require('@iobroker/adapter-core');
const Sup = require('./lib/sup.js');
const { Queue } = require('async-await-queue');


// Load your modules here, e.g.:
// const fs = require("fs");


//let SerialPort;
let sup = {};
const objects   = {};
const tasks = [];
let connectTimeout;
let checkConnectionTimer;
let timeoutId;
/**
 * No more than 1 concurrent tasks with
 * at least 100ms between two tasks
 * (measured from task start to task start)
 */
//const scq = new Queue(1, 100); //state change queue
//const myPriority = -1;
//const pscq =[];



//SUP parameters which are not included in response message
const supControl = {
	FREQ: 88.5,
	RDST: 'First text',
	TA: false,
	TP: false,
	MUTE: false,
	RF: true,
};
/*
// SUP2 command list
// https://files2.elv.com/public/09/0910/091048/Internet/91048_sup2_bedienhinweise.pdf
const commands = {
	get: 'GET',
	inpl: 'INPL',
	lim: 'LIM',
	inpm: 'INPM',
	freq: 'FREQ',
	adev: 'ADEV',
	pow: 'POW',
	pree: 'PREE',
	rds: 'RDS',
	rdsy: 'RDSY',
	rdsp: 'RDSP',
	ta: 'TA',
	tp: 'TP',
	mute: 'MUTE',
	rf: 'RF',
	rdst: 'RDST'
};
*/

const serialformat = /^(COM|com)[0-9][0-9]?$|^\/dev\/tty.*$/;


class ElvSup2 extends utils.Adapter {

	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	constructor(options) {
		super({
			...options,
			name: 'elv-sup2',
		});
		this.on('ready', this.onReady.bind(this));
		this.on('stateChange', this.onStateChange.bind(this));
		// this.on('objectChange', this.onObjectChange.bind(this));
		// this.on('message', this.onMessage.bind(this));
		this.on('unload', this.onUnload.bind(this));
	}


	/**
	 * Is called when databases are connected and adapter received configuration.
	 */
	async onReady() {
		// Initialize your adapter here

		try {
			require('serialport').SerialPort;
		} catch (err) {
			this.log.warn('serialport module is not available');
			if (this.supportsFeature && !this.supportsFeature('CONTROLLER_NPM_AUTO_REBUILD')) {
				// re throw error to allow rebuild of serialport in js-controller 3.0.18+
				throw err;
			}
		}

		// Reset the connection indicator during startup
		this.setState('info.connection', false, true);

		try {
			await this.checkPort();
			await this.connect();
			await this.initObjects();
			await this.subscribeStatesAsync('Config.*');
		} catch (err) {
			this.log.error('Cannot open port: ' + err);
		}



	}


	// check if serial port is available
	checkPort() {
		return new Promise((resolve,reject) => {
			const { SerialPort } = require('serialport');

			if (!this.config.connectionIdentifier) {
				reject (new Error ('Serial port is not selected'));
			}
			if (!this.config.connectionIdentifier.match(serialformat)) {
				reject (new Error ('Serial port ID not valid. Format: /dev/tty.usbserial or COM8'));
			}

			const sPort = new SerialPort({
				path: this.config.connectionIdentifier,
				baudRate: parseInt(this.config.baudrate, 10),
				autoOpen: false
			});

			sPort.open();

			sPort.on('error', (err) => {
				sPort.isOpen && sPort.close(()=>{
					//this.log.debug('Checkport Error: ' + err);
					reject (err);
				});
			});

			sPort.on( 'open', () => {
				//this.log.debug('sPort opened: ' + this.config.connectionIdentifier);
				sPort.isOpen && sPort.flush(()=>{
					sPort.close(()=>{
						resolve (true);
					});
				});
			});
		});
	}


	// connect to SUP via serial port
	connect() {
		return new Promise((resolve, reject) => {
			const options = {
				connectionMode: 'serial' ,
				serialport: this.config.connectionIdentifier,
				baudrate:   parseInt(this.config.baudrate, 10),
				databits: 8,
				stopbits: 1,
				parity: 'even',
				debug:      true,
				parse:       true,
				logger:     this.log.debug
			};

			sup = new Sup(options);


			sup.on('close', (err) => {
				this.setState('info.connection', false, true);
				//this.log.debug('Sup port closed: ' + err);
				if (err) {
					connectTimeout = setInterval(() => {
						this.sup = null;
						this.log.error(err + ' \n - Trying to reconnect Sup... ');
						this.connect().then ( () => {
							clearInterval(connectTimeout);
							connectTimeout = null;
						})
							.catch ( (error) => {
								this.log.debug('Reconnect failed: ' + error);
							});
					}, 10000);
				}
			});

			sup.once('ready', () => {
				this.setState('info.connection', true, true);
				this.log.info('SUP connected: ' +  JSON.stringify(options));
				resolve (true);
			});

			sup.on('error', (err) => {
				this.setState('info.connection', false, true);
				this.log.error('Error on sup connection: ' +  err);
				reject (err);
			});
		});
	}



	// In order to get state updates, you need to subscribe to them. The following line adds a subscription for our variable we have created above.
	//this.subscribeStates('testVariable');
	// You can also add a subscription for multiple states. The following line watches all states starting with "lights."
	// this.subscribeStates('lights.*');
	// Or, if you really must, you can also watch all states. Don't do this if you don't need to. Otherwise this will cause a lot of unnecessary load on the system:
	// this.subscribeStates('*');

	/*
			setState examples
			you will notice that each setState will cause the stateChange event to fire (because of above subscribeStates cmd)
		*/
	/*// the variable testVariable is set to true as command (ack=false)
		await this.setStateAsync('testVariable', true);

		// same thing, but the value is flagged "ack"
		// ack should be always set to true if the value is received from or acknowledged from the target system
		await this.setStateAsync('testVariable', { val: true, ack: true });

		// same thing, but the state is deleted after 30s (getState will return null afterwards)
		await this.setStateAsync('testVariable', { val: true, ack: true, expire: 30 });

		// examples for the checkPassword/checkGroup functions
		let result = await this.checkPasswordAsync('admin', 'iobroker');
		this.log.info('check user admin pw iobroker: ' + result);

		result = await this.checkGroupAsync('admin', 'admin');
		this.log.info('check group user admin group admin: ' + result);
	*/

	/**
	 * Is called when adapter shuts down - callback has to be called under any circumstances!
	 * @param {() => void} callback
	 */
	async onUnload(callback) {
		connectTimeout && clearInterval(connectTimeout);
		connectTimeout = null;

		checkConnectionTimer && clearTimeout(checkConnectionTimer);
		checkConnectionTimer = null;

		timeoutId && clearTimeout(timeoutId);
		timeoutId = null;

		if (sup) {
			try {
				await sup.close();
				//sup = null;
			} catch (e) {
				this.log.error('Cannot close serial port: ' + e.message);
			}
		}
		callback();
	}

	// If you need to react to object changes, uncomment the following block and the corresponding line in the constructor.
	// You also need to subscribe to the objects with `this.subscribeObjects`, similar to `this.subscribeStates`.
	// /**
	//  * Is called if a subscribed object changes
	//  * @param {string} id
	//  * @param {ioBroker.Object | null | undefined} obj
	//  */
	// onObjectChange(id, obj) {
	// 	if (obj) {
	// 		// The object was changed
	// 		this.log.info(`object ${id} changed: ${JSON.stringify(obj)}`);
	// 	} else {
	// 		// The object was deleted
	// 		this.log.info(`object ${id} deleted`);
	// 	}
	// }

	/**
	 * Is called if a subscribed state changes
	 * @param {string} id
	 * @param {ioBroker.State | null | undefined} state
	 */
	async onStateChange(id, state) {
		try {
			await this.processStateChange(id, state);
		} catch (err) {
			this.log.error(err);
		}
	}


	//scq.run(() => this.processStateChange(id, state).catch((err) => this.log.error(err)));
	//const me = Symbol();
	/* We wait in the line here */
	//await scq.wait(me, myPriority);
	/**
		 * Do your expensive async task here
		 * Queue will schedule it at
		 * no more than 2 requests running in parallel
		 * launched at least 100ms apart
		 */
	//try {
	//	await this.processStateChange(id, state);
	//} catch (err) {
	//	this.log.error(err);
	//} finally {
	/* Signal that we are finished */
	/* Do not forget to handle the exceptions! */
	//	scq.end(me);
	//}
	/*
		const me = Symbol();
		// We wait in the line here
		scq
			.wait(me, myPriority)
			.then(()  => this.processStateChange(id, state))
			.catch ( (err) => this.log.error(err))
			.finally (() => scq.end(me))//signal finished
		;
		*/





	async processStateChange(id, state) {
		return new Promise((resolve, reject) => {

			if (state && !state.ack) {
				this.log.debug('State Change ' + JSON.stringify(id) + ', State: ' + JSON.stringify(state));
				//  State Change "elv-sup2.0.Config.inpl" State: {"val":100,"ack":false,"ts":1581365531968,"q":0,"from":"system.adapter.admin.0","user":"system.user.admin","lc":1581365531968}
				const oCmnd = id.split('.');
				if (oCmnd.length < 4) {
					reject (new Error ('Invalid object id in processStateChange'));
					//return;
				}
				// 0: elv-sup2; 1:0; 2:Config; 3:inpl;
				let supCommand = '';
				if (oCmnd[2] === 'Config') {
					switch (oCmnd[3]) {
						case 'INPL':
							supCommand = '*'+ 'INPL:' + state.val + '\n';
							break;
						case 'LIM':
							supCommand = '*'+ 'LIM:' + (state.val===true ? 'ON' : 'OFF'  ) + '\n';
							break;
						case 'INPM':
							supCommand = '*'+ 'INPM:' + (state.val.toString().substring(0,1)==='A' ? 'ANALOG' : 'DIGITAL') + '\n';
							break;
						case 'FREQ':
							supCommand = '*'+ 'FREQ:' + state.val*100 + '\n';
							break;
						case 'ADEV':
							supCommand = '*'+ 'ADEV:' + state.val*100 + '\n';
							break;
						case 'POW':
							supCommand = '*'+ 'POW:' + state.val + '\n';
							break;
						case 'PREE':
							state.val = (state.val <= 49 ? 0 : (state.val <= 74 ? 50 : (state.val === 75 ? 75 : 50)));
							supCommand = '*'+ 'PREE:' + state.val + '\n';
							break;
						case 'RDS':
							supCommand = '*'+ 'RDS:' + (state.val===true ? 'ON' : 'OFF'  ) + '\n';
							break;
						case 'RDSY':
							supCommand = '*'+ 'RDSY:' + state.val + '\n';
							break;
						case 'RDSP':
							supCommand = '*'+ 'RDSP:' + state.val + '\n';
							break;
						case 'TA':
							supCommand = '*'+ 'TA:' + (state.val===true ? 'ON' : 'OFF'  ) + '\n';
							break;
						case 'TP':
							supCommand = '*'+ 'TP:' + (state.val===true ? 'ON' : 'OFF'  ) + '\n';
							break;
						case 'MUTE':
							supCommand = '*'+ 'MUTE:' + (state.val===true ? 'ON' : 'OFF'  ) + '\n';
							break;
						case 'RF':
							supCommand = '*'+ 'RF:' + (state.val===true ? 'ON' : 'OFF'  ) + '\n';
							break;
						case 'RDST':
							supCommand = '*'+ 'RDST:' + state.val.toString().padEnd(32) + '\n';
							break;

						default:
							reject (new Error (`Write of State ${oCmnd[3]} not implemented`));
							break;

					}
					this.sendCommand (supCommand)
						.then (
							ack => {
								if (ack.toString() == '*A') {
									this.setStateAsync (id , state.val, true);
									resolve(ack);
								} else {
									reject (new Error ('Unknown acknowledge from SUP2'));
								}
							})
						.catch (err => {
							reject ('Error in sendCommand: ' + err.message);
						});
				} else {
					reject (new Error ('Unknown SUP2 parameter'));
				}
			}
		});
	}


	waitForData () {
		return new Promise((resolve, reject) => {
			timeoutId = setTimeout(() => reject('Command Write Timeout'), 2000);

			sup.once('data', (data) => {
				clearTimeout(timeoutId);
				//this.log.debug('Response to Send command: ' + data);
				resolve(data);
			});
		});
	}

	/***
 * Send a command to the sup module and return response
 * sendCommand("*INPL:20\n");
* response: "*A" || '{"VERS":11,"FRE1":8850,"FRE2":8751,"FRE3":8752,"POW":118,"INPM":"ANALOG","INPL":18,"PREE":50,"ADEV":9000,"LIM":"ON","RDS":"ON","RDSP":"NDR KULTNDR KULT","RDSY":13,}'
 *
 */
	sendCommand(cmd) {
		return new Promise((resolve, reject) => {
			this.log.debug('Send command: ' + cmd);

			sup.write(cmd, err => {
				if (!err) {
					this.waitForData().then(
						result => {
							this.log.debug('Response to Send command: ' + result);
							resolve(result);
						},
						error => {
							this.log.error('Timeout waiting for response: ' + error);
							reject(error);
						});
				} else {
					this.log.error('Cannot write to port: ' + err);
					reject(err);

				}

			});
		});
	}



	/***
 * Send a command to the sup module
 * sendRaw("*INPL:20\n");
 *

	async sendRaw(cmd) {
		//
		this.log.info('Send RAW command received. ' + cmd);
		//sup.write('*INPL:20\n'); // Raw command
		await sup.write(cmd);
	}
*/

	async initObjects() {
		let response = '';

		try {
			response = await this.sendCommand('*GET:\n');
			//this.log.debug('In initObjects: ' + response);
			if (response !== '*A') {
				const id = 'Config';
				const supConfig = JSON.parse(response);
				//isStart = !tasks.length;
				if (!objects[this.namespace + '.' + id]) {
					//create new channel
					const newChannel = {
						_id:    this.namespace + '.' + id,
						type:   'channel',
						common: {
							name: 'SUP2 Configuration'
						},
						native: supConfig
					};
					objects[this.namespace + '.' + id] = newChannel;
					tasks.push({type: 'object', id: newChannel._id, obj: newChannel});
					this.log.debug(`channel object  ${newChannel._id} pushed`);

					//create new state objects from SUP2 response
					let common;
					for (const _state in supConfig) {
						switch(_state) {
							case 'VERS':
								common = {
									name: 'SW Version',
									type: 'string',
									role: 'text',
									unit: '',
									read: true,
									write: false
								};
								break;
							case 'FRE1':
								common = {
									name: 'Preset Frequency 1',
									type: 'number',
									role: 'value',
									unit: 'MHz',
									min: 87.50,
									max: 108.00,
									read: true,
									write: false
								};
								break;
							case 'FRE2':
								common = {
									name: 'Preset Frequency 2',
									type: 'number',
									role: 'value',
									unit: 'MHz',
									min: 87.50,
									max: 108.00,
									read: true,
									write: false
								};
								break;
							case 'FRE3':
								common = {
									name: 'Preset Frequency 3',
									type: 'number',
									role: 'value',
									unit: 'MHz',
									min: 87.50,
									max: 108.00,
									read: true,
									write: false
								};
								break;
							case 'POW':
								common = {
									name: 'Output Power',
									type: 'number',
									role: 'power.level',
									unit: 'dB',
									min: 88,
									max: 118,
									read: true,
									write: true
								};
								break;
							case 'INPL':
								common = {
									name: 'Input Level',
									type: 'number',
									role: 'level.input',
									unit: '%',
									min: 0,
									max: 100,
									read: true,
									write: true
								};
								break;
							case 'PREE':
								common = {
									name: 'Preemphasis',
									type: 'number',
									role: 'value',
									unit: 'uS',
									min: 0,
									max: 75,
									read: true,
									write: true
								};
								break;
							case 'ADEV':
								common = {
									name: 'Audio Deviation',
									type: 'number',
									role: 'value',
									unit: 'kHz',
									min: 0.00,
									max: 90.00,
									read: true,
									write: true
								};
								break;
							case 'LIM':
								common = {
									name: 'Limiter',
									type: 'boolean',
									role: 'indicator',
									read: true,
									write: true
								};
								break;
							case 'RDS':
								common = {
									name: 'RDS On/Off',
									type: 'boolean',
									role: 'indicator',
									read: true,
									write: true
								};
								break;
							case 'INPM':
								common = {
									name: 'Input Mode',
									type: 'string',
									role: 'indicator',
									read: true,
									write: true
								};
								break;
							case 'RDSP':
								common = {
									name: 'RDS Program Name',
									type: 'string',
									role: 'text',
									read: true,
									write: true
								};
								break;
							case 'RDST':
								common = {
									name: 'RDS Text',
									type: 'string',
									role: 'text',
									read: true,
									write: true
								};
								break;
							case 'RDSY':
								common = {
									name: 'RDS Program Type',
									type: 'number',
									role: 'value',
									unit: '',
									min: 0,
									max: 31,
									read: true,
									write: true
								};
								break;
							default:
								this.log.error('Unknown sup configuration parameter: ' + _state);
								break;
						}
						const newState = {
							_id:    `${this.namespace}.${id}.${_state}`,
							type:   'state',
							common: common,
							native: {}
						};

						objects[`${this.namespace}.${id}.${_state}`] = newState;
						tasks.push({type: 'object', id: newState._id, obj: newState});
						this.log.debug(`state object  ${newState._id} pushed`);

					}

					//create new state objects which are not in SUP2 response
					for (const key in supControl) {
						switch(key) {
							case 'FREQ':
								common = {
									name: 'Frequency',
									type: 'number',
									role: 'value',
									unit: 'MHz',
									min: 87.50,
									max: 108.00,
									read: true,
									write: true
								};
								break;
							case 'RDST':
								common = {
									name: 'RDS Text',
									type: 'string',
									role: 'text',
									unit: '',
									read: true,
									write: true
								};
								break;
							case 'TA':
								common = {
									name: 'TA On/Off',
									type: 'boolean',
									role: 'indicator',
									read: true,
									write: true
								};
								break;
							case 'TP':
								common = {
									name: 'TP On/Off',
									type: 'boolean',
									role: 'indicator',
									read: true,
									write: true
								};
								break;
							case 'MUTE':
								common = {
									name: 'Mute On/Off',
									type: 'boolean',
									role: 'indicator',
									read: true,
									write: true
								};
								break;
							case 'RF':
								common = {
									name: 'RF On/Off',
									type: 'boolean',
									role: 'indicator',
									read: true,
									write: true
								};
								break;
							default:
								this.log.error('Unknown sup control parameter: ' + key);
								break;
						}

						const newState = {
							_id:    `${this.namespace}.${id}.${key}`,
							type:   'state',
							common: common,
							native: {}
						};

						objects[`${this.namespace}.${id}.${key}`] = newState;
						tasks.push({type: 'object', id: newState._id, obj: newState});
						this.log.debug(`state object  ${newState._id} pushed`);


					}
					await this.processTasks();
					await this.setStates(supConfig);
					await this.setStates(supControl);
					await this.processTasks();
				}
			}
		} catch (err) {
			this.log.error('Error in sendCommand: ' + err.toString());
		}
	}



	async processTasks() {
		// Set states or create objects
		while (tasks.length) {
			const task = tasks.shift();

			if (task.type === 'state') {
				try {
					await this.setForeignStateAsync(task.id, task.val, true);
					this.log.info(`state ${task.id} set with value ${task.val}`);
				} catch (err) {
					this.log.error('Unexpected error - ' + err);
				}
			} else if (task.type === 'object') {
				try {
					const obj = await this.getForeignObjectAsync(task.id);
					if (!obj) { //object does not exist - create it!
						try {
							await this.setForeignObjectAsync(task.id, task.obj);
							this.log.info(`object ${task.id} created`);
						} catch (err) {
							this.log.error('Unexpected error - ' + err);
						}
					} else { //check if object changed tbd.
						//let changed = false;
						/*if (JSON.stringify(obj.native) !== JSON.stringify(task.obj.native)) {
							obj.native = task.obj.native;
							changed = true;
						}

						if (changed) {
							try {
								await this.setForeignObjectAsync(obj._id, obj);
								this.log.info(`object ${this.namespace}.${obj._id} created`);
								setImmediate(this.processTasks);
							} catch (err) {
								this.log.error('Unexpected error - ' + err);
							}
*/
						//} else {

						//this.log.info('Object created - ' + JSON.stringify(obj));
						//setImmediateAsync(this.processTasks);
						//}

					}
				} catch (error) {
					this.log.error('Unexpected error - ' + JSON.stringify(error));
				}
			}
		}
	}


	async setStates(obj) {
		// Set all state values according to SUP2 response received
		const id = 'Config';
		//const isStart = !tasks.length;

		const supConfig = obj;
		let value;
		for (const state in obj) {
			const oid  = this.namespace + '.' + id + '.' + state;
			//this.log.info(`state ${state} with value ${obj.state} to be checked`);
			switch(state) {
				case 'VERS':
					supConfig[state] = supConfig.VERS.toString().replace(/(?<=^.{1})/, '.');
					value = supConfig.VERS;
					break;
				case 'FRE1':
					supConfig[state] = supConfig.FRE1/100;
					value = supConfig.FRE1;
					break;
				case 'FRE2':
					supConfig[state] = supConfig.FRE2/100;
					value = supConfig.FRE2;
					break;
				case 'FRE3':
					supConfig[state] = supConfig.FRE3/100;
					value = supConfig.FRE3;
					break;
				case 'POW':
				//supConfig[state] = supConfig.POW;
					value = supConfig.POW;
					break;
				case 'INPL':
				//supConfig[state] = supConfig.INPL;
					value = supConfig.INPL;
					break;
				case 'PREE':
				//supConfig[state] = supConfig.PREE;
					value = supConfig.PREE;
					break;
				case 'ADEV':
					supConfig[state] = supConfig.ADEV/100;
					value = supConfig.ADEV;
					break;
				case 'LIM':
					supConfig[state] = supConfig.LIM === 'ON' ? true : false;
					value = supConfig.LIM;
					break;
				case 'RDS':
					supConfig[state] = supConfig.RDS === 'ON' ? true : false;
					value = supConfig.RDS;
					break;
				case 'INPM':
					supConfig[state] = supConfig.INPM === 'ANALOG'? 'Analog' : 'Digital';
					value = supConfig.INPM;
					break;
				case 'RDSP':
				//supConfig[state] = supConfig.RDSP;
					value = supConfig.RDSP;
					break;
				case 'RDST':
				//supConfig[state] = supConfig.RDST;
					value = supConfig.RDST;
					break;
				case 'RDSY':
				//supConfig[state] = supConfig.RDSY;
					value = supConfig.RDSY;
					break;
				case 'FREQ':
					value = supConfig.FREQ;
					break;
				case 'TA':
					value = supConfig.TA;
					break;
				case 'TP':
					value = supConfig.TP;
					break;
				case 'MUTE':
					value = supConfig.MUTE;
					break;
				case 'RF':
					value = supConfig.RF;
					break;
				default:
					this.log.error('Unknown sup configuration state: ' + state);
					break;
			}
			tasks.push({type: 'state', id: oid, val: value});
			this.log.debug(`state ${oid} pushed with value ${value}`);
		}
	}


	// If you need to accept messages in your adapter, uncomment the following block and the corresponding line in the constructor.
	// /**
	//  * Some message was sent to this instance over message box. Used by email, pushover, text2speech, ...
	//  * Using this method requires "common.messagebox" property to be set to true in io-package.json
	//  * @param {ioBroker.Message} obj
	//  */
	// onMessage(obj) {
	// 	if (typeof obj === 'object' && obj.message) {
	// 		if (obj.command === 'send') {
	// 			// e.g. send email or pushover or whatever
	// 			this.log.info('send command');

	// 			// Send response in callback if required
	// 			if (obj.callback) this.sendTo(obj.from, obj.command, 'Message received', obj.callback);
	// 		}
	// 	}
	// }
}

if (require.main !== module) {
	// Export the constructor in compact mode
	/**
	 * @param {Partial<utils.AdapterOptions>} [options={}]
	 */
	module.exports = (options) => new ElvSup2(options);
} else {
	// otherwise start the instance directly
	new ElvSup2();
}