# CoAP Visualizer

Simple application for visualizing the communication between the CoAP client
and the CoAP server.

## Requirements

### node.js

Node.js is a server side software system designed for writing scalable
Internet applications in JavaScript.

  * __Version__: ~0.10.10
  * __Website__: http://nodejs.org/
  * __Download__: http://nodejs.org/download/
  * __Installation guide__: https://github.com/joyent/node/wiki/Installation

### CoAP

The Constrained Application Protocol (CoAP) is a specialized web
transfer protocol for use with constrained nodes and constrained
(e.g., low-power, lossy) networks.

This project uses the [h5.coap](http://github.com/morkai/h5.coap)
library to forward messages between the client and the server.
h5.coap implements
[draft-ietf-core-coap-18](http://tools.ietf.org/html/draft-ietf-core-coap-18)
(which is pretty much the same from version -13), so the server must speak
the same version.

## Installation

Clone the repository:

```
git clone git://github.com/morkai/coap-visualizer.git
```

or [download](https://github.com/morkai/coap-visualizer/zipball/master)
and extract it.

Go to the project's directory and install the dependencies:

```
cd coap-visualizer/
npm install
```

## Starting

Start the application server:

```
cd coap-visualizer/
npm start
```

Application server should be listening for HTTP requests on port `61616`
and for CoAP requests on port `1337`.

## Usage

1. Go to [127.0.0.1:61616](http://127.0.0.1:61616/).
2. Set the server endpoint to a host:port pair of a running CoAP server
   (e.g. coap.me:5683).
3. Send CoAP requests to coap://127.0.0.1:1337/.
4. Observe as the CoAP messages are exchanged between your client
   and the configured server.

If the *Capture* checkbox is checked, you are in control of what messages
go through (individual messages can be delayed, dropped or forwarded).
It's a useful feature for forcing retransmissions and timeouts.

## License

This project is released under the
[MIT License](https://raw.github.com/morkai/coap-visualizer/master/license.md).
