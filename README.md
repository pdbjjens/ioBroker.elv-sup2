![Logo](admin/elv-sup2.png)

# ioBroker.elv-sup2

[![NPM version](https://img.shields.io/npm/v/iobroker.elv-sup2.svg)](https://www.npmjs.com/package/iobroker.elv-sup2)
[![Downloads](https://img.shields.io/npm/dm/iobroker.elv-sup2.svg)](https://www.npmjs.com/package/iobroker.elv-sup2)
![Number of Installations](https://iobroker.live/badges/elv-sup2-installed.svg)
![Current version in stable repository](https://iobroker.live/badges/elv-sup2-stable.svg)
![Test and Release](https://github.com/pdbjjens/ioBroker.elv-sup2/workflows/Test%20and%20Release/badge.svg)

[![NPM](https://nodei.co/npm/iobroker.elv-sup2.png?downloads=true)](https://nodei.co/npm/iobroker.elv-sup2/)

## elv-sup2 adapter for ioBroker

This adapter connects the ELV HQ-Stereo-FM-Testgenerator SUP2 to ioBroker via USB serial port. It allows to retrieve and set certain configuration parameters of the testgenerator among them the RDS text, RDS program name and type. SUP2 updating is not supported. Use the Windows program which is provided by ELV for this purpose.

## Configuration hints

The only configuration parameter is the serial port Id of the port to which the SUP2 is connected.
The format should be e.g.: /dev/ttyUSBx on Linux- or COMx on Windows-based ioBroker installations.

## Changelog
<!--
	Placeholder for the next version (at the beginning of the line):
	### **WORK IN PROGRESS**
-->
### **WORK IN PROGRESS**

* (pdbjjens) Second release

### 0.0.4-alpha.0 (2023-02-17)

* (pdbjjens) Second pre-release

### 0.0.3 (2023-02-17)

* (pdbjjens) First release

### 0.0.3-alpha.0 (2023-02-13)

* (pdbjjens) pre-release

### 0.0.2 (2023-02-13)

* (pdbjjens) initial release

## Legal Notices

ELV and others are trademarks or registered trademarks of ELV Elektronik AG D-26787 Leer, Germany -
<https://de.elv.com/>

All other trademarks are the property of their respective owners.
The authors are in no way endorsed by or affiliated with ELV Elektronik AG, or any associated subsidiaries, logos or trademarks.

## License

MIT License

Copyright (c) 2023 pdbjjens <jjensen@t-online.de>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
