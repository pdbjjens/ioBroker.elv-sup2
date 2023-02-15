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


let sup = {};
const objects   = {};
const Debug = false;
const channelId = 'configuration'; // SUP config channel
let connectTimeout;
let checkConnectionTimer;
//let refreshTimeout;
let timeoutId;
/**
 * No more than 1 concurrent tasks with
 * at least 100ms between two tasks
 * (measured from task start to task start)
 */
const scq = new Queue(1, 1000); //state change queue
const ocq = new Queue(1,100); //object create queue
const ssq = new Queue(1,100); //state set queue
const myPriority = -1; // priority -1 is higher priority than 0
//const pscq =[];
//const tqueue = [];
//let workingOnPromise = false;
//let item = [];


//SUP parameters which are not included in response message
const supControl = {
	FREQ: 8850,
	RDST: 'First text',
	MODE: 'STEREO',
	TA: 'OFF',
	TP: 'OFF',
	MUTE: 'OFF',
	RF: 'ON'
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
	mode: 'MODE',
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
		let portOk = true;
		try {
			portOk = await this.checkPort();
			//this.log.info('portOK: ' + portOk);
		} catch (err) {
			portOk = false;
			//this.log.info('portOK: ' + portOk);
			this.log.error('Cannot open port: ' + err.message);
			this.terminate ('Reason: ' + err.message);
		}

		if (portOk) {
			try {
				await this.connect();
				await this.initObjects();
				await this.subscribeStatesAsync(channelId + '.*');
			} catch (err) {
				this.log.error('Cannot connect to SUP: ' + err.message);
			}
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
				if (sPort.isOpen) {
					sPort.flush(()=>{
						sPort.close();
					});
				}
				reject (err);
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
				debug:      Debug,
				parse:       true,
				logger:     this.log.debug
			};

			sup = new Sup(options);


			sup.on('close', (err) => {
				this.setState('info.connection', false, true);

				if (err) {
					connectTimeout = setInterval(() => {
						this.sup = null;
						this.log.error(err + ' \n - Trying to reconnect Sup... ');
						this.connect().then ( () => {
							clearInterval(connectTimeout);
							connectTimeout = null;
						})
							.catch ( (error) => {
								if (Debug) this.log.debug('Reconnect failed: ' + error);
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

		//refreshTimeout && clearTimeout(refreshTimeout);
		//refreshTimeout = null;

		timeoutId && clearTimeout(timeoutId);
		timeoutId = null;

		if (sup && sup.isOpen) {
			sup.close((e) => {
				if (e) this.log.error('Cannot close serial port: ' + e.message);
			});
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
			this.log.error('Cannot process state change: ' + err.message);
		}
	}


	queuedSendCommand(cmd) {
		return new Promise((resolve, reject) => {
			const me = Symbol();
			scq
				.wait(me, myPriority)
				.then(() => {this.sendCommand(cmd).then((ack) => {resolve (ack);});})
				.catch((e) => {reject (e);})
				.finally(() => scq.end(me))
			;

		});
	}



	processStateChange(sid, state) {
		return new Promise((resolve, reject) => {
			if (Debug) this.log.debug('State Change ' + JSON.stringify(sid) + ', State: ' + JSON.stringify(state));

			if (state && !state.ack) {
				//  State Change "elv-sup2.0.Config.inpl" State: {"val":100,"ack":false,"ts":1581365531968,"q":0,"from":"system.adapter.admin.0","user":"system.user.admin","lc":1581365531968}
				const oCmnd = sid.split('.');
				if (oCmnd.length < 4) {
					reject (new Error ('Invalid object id in processStateChange'));
					//return;
				}
				// 0: elv-sup2; 1:0; 2:Config; 3:inpl;
				let supCommand = '';
				if (oCmnd[2] === channelId) {
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
						case 'MODE':
							supCommand = '*'+ 'MODE:' + (state.val.toString().substring(0,1)==='S' ? 'STEREO' : 'MONO') + '\n';
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
					this.queuedSendCommand (supCommand)
						.then (
							(ack) => {
								this.log.debug('Ack ' + ack );
								if (ack == '*A') {
									this.setStateAsync (sid , state.val, true);
									resolve(ack);
								} else {
									reject (new Error ('Unknown acknowledge from SUP2'));
								}
							})
						.catch ((err) => {
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
			timeoutId = setTimeout(() => reject(new Error ('Command Response Timeout')), 2000);

			sup.on('data', (data) => {
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
			if (Debug) this.log.debug('Send command: ' + cmd);

			sup.write(cmd, err => {
				if (!err) {
					this.waitForData()
						.then (
							(result) => {
								//this.log.debug('Response to Send command: ' + result);
								resolve(result);
							})
						.catch (
							(error) => {
							//this.log.error('Timeout waiting for response: ' + error);
								reject(error);
							});
				} else {
					//this.log.error('Cannot write to port: ' + err);
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

	getSupConfig() {
		return new Promise((resolve, reject) => {
			this.sendCommand('*GET:\n')
				.then ((response) => {
					if (response !== '*A') {
						resolve (JSON.parse(response));
					} else {
						reject (new Error ('Could not get SUP config'));
					}})
				.catch ((err) => {
					reject (err);
				});
		});
	}

	async initObjects() {
		let supConfig = {};
		try {
			supConfig = await this.getSupConfig();
			if (Debug) this.log.debug('In initObjects: ' + JSON.stringify(supConfig));
		} catch (err) {
			this.log.error(err);
		}
		if (!objects[this.namespace + '.' + channelId]) { //Channel does not yet exist
			//create new channel
			const newChannel = {
				_id:    this.namespace + '.' + channelId,
				type:   'channel',
				common: {
					name: 'SUP2 Configuration',
					type: 'string',
				},
				native: supConfig
			};
			objects[this.namespace + '.' + channelId] = newChannel;
			try {
				await this.createObjNotExists (newChannel);
			} catch (err) {
				this.log.error(`Error creating channel object  ${newChannel._id}:` + err.message);
			}
		}
		try {
			// create all objects and initialize states
			await this.createObjects(supConfig);
			await this.createObjects(supControl);
			await this.setStates(supConfig);
			await this.setStates(supControl);
		} catch (err) {
			this.log.error( err);
		}
	}

	async createObjects(config) {
		//const q = [];
		let common = {};
		for (const obj in config) {
			const me = Symbol();
			/* We wait in the line here */
			await ocq.wait(me, myPriority);

			switch(obj) {
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
				case 'MODE':
					common = {
						name: 'Mode',
						type: 'string',
						role: 'indicator',
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
					return (new Error('Unknown sup configuration parameter: ' + obj));
					//break;
			}
			const newState = {
				_id:    `${this.namespace}.${channelId}.${obj}`,
				type:   'state',
				common: common,
				native: {}
			};

			objects[`${this.namespace}.${channelId}.${obj}`] = newState;
			this.createObjNotExists (newState)
				.catch((e) => {return(e);})
				.finally(() => ocq.end(me));
		}
		return await ocq.flush();
	}

	async createObjNotExists (newState) {
		try {
			const obj = await this.getForeignObjectAsync(newState._id);
			if (!obj) { //object does not exist - create it!
				try {
					await this.setForeignObjectAsync(newState._id, newState);
					this.log.info(`Object ${newState._id} created`);
				} catch (err) {
					return (err);
				}
			}
		} catch (err) {
			return (err);
		}
	}

	async setStates(supStates) {
		let stateVal;

		for (const state in supStates) {
			const oid  = this.namespace + '.' + channelId + '.' + state;
			const me = Symbol();
			/* We wait in the line here */
			await ssq.wait(me, myPriority);

			switch(state) {
				case 'VERS':
					stateVal = supStates.VERS.toString().replace(/(?<=^.{1})/, '.');
					break;
				case 'FRE1':
					stateVal = supStates.FRE1/100;
					break;
				case 'FRE2':
					stateVal = supStates.FRE2/100;
					break;
				case 'FRE3':
					stateVal = supStates.FRE3/100;
					break;
				case 'POW':
					stateVal = supStates.POW;
					break;
				case 'INPL':
					stateVal = supStates.INPL;
					break;
				case 'PREE':
					stateVal = supStates.PREE;
					break;
				case 'ADEV':
					stateVal = supStates.ADEV/100;
					break;
				case 'LIM':
					stateVal = supStates.LIM === 'ON' ? true : false;
					break;
				case 'RDS':
					stateVal = supStates.RDS === 'ON' ? true : false;
					break;
				case 'INPM':
					stateVal = supStates.INPM === 'ANALOG'? 'Analog' : 'Digital';
					break;
				case 'MODE':
					stateVal = supStates.MODE === 'STEREO'? 'Stereo' : 'Mono';
					break;
				case 'RDSP':
					stateVal = supStates.RDSP;
					break;
				case 'RDST':
					stateVal = supStates.RDST;
					break;
				case 'RDSY':
					stateVal = supStates.RDSY;
					break;
				case 'FREQ':
					stateVal = supStates.FREQ/100;
					break;
				case 'TA':
					stateVal = supStates.TA === 'ON' ? true : false;
					break;
				case 'TP':
					stateVal = supStates.TP === 'ON' ? true : false;
					break;
				case 'MUTE':
					stateVal = supStates.MUTE === 'ON' ? true : false;
					break;
				case 'RF':
					stateVal = supStates.RF === 'ON' ? true : false;
					break;
				default:
					return (new Error('Unknown sup configuration state: ' + state));
					//break;
			}

			if (Debug) this.log.debug(`state ${oid} pushed with stateVal ${stateVal} ${typeof(stateVal)}`);
			this.setSupState(oid, stateVal)
				.catch((err) => {return (err);})
				.finally(() => ssq.end(me));
		}
		return await ssq.flush();
	}


	setSupState(oid, stateVal) {
		return new Promise((resolve, reject) => {

			this.setForeignStateAsync(oid, stateVal, true)
				.then (() => {
					if (Debug) this.log.debug(`state ${oid} set with value ${stateVal}`);
					resolve (true);
				})
				.catch ((err) => {
					reject (err);
				});
		});
	}


	/*
	async updateConfigFromDevice() {
		let supConfig = {};
		try {
			supConfig = await this.getSupConfig();
			if (Debug) this.log.debug('In updateDevice: ' + JSON.stringify(supConfig));

		} catch (err) {
			this.log.error('Error in updateDevice: ' + err.toString());
		}
		for (const state in supConfig) {
			const oid  = this.namespace + '.' + channelId + '.' + state;
			let localState;
			try {
				localState = await this.getStateAsync(oid);
			} catch (err) {
				return (err);
			}

			if (supConfig.state !== localState.val)  {
				try {
					await this.setSupState(oid,supConfig.state);
				} catch (err) {
					return (err);
				}

			}
	}

*/
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