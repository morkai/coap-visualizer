'use strict';

var HTTP_PORT = 61616;
var DEFAULT_CLIENT_SOCKET_PORT = 1337;
var DEFAULT_CLIENT_ENDPOINT_PORT = 3865;
var DEFAULT_SERVER_ENDPOINT_PORT = 5683;

var dgram = require('dgram');
var express = require('express');
var app = express();
var server = require('http').createServer(app);
var io = require('socket.io').listen(server, {log: false});
var coap = require('h5.coap');
var Message = coap.Message;
var EndpointAddress = require('h5.coap/lib/EndpointAddress');
var codeRegistry = coap.codeRegistry;
var contentFormatRegistry = coap.contentFormatRegistry;
var optionNumberRegistry = coap.optionNumberRegistry;

var clientEndpointAddress =
  new EndpointAddress('127.0.0.1', DEFAULT_CLIENT_ENDPOINT_PORT);
var serverEndpointAddress =
  new EndpointAddress('127.0.0.1', DEFAULT_SERVER_ENDPOINT_PORT);
var capturing = false;
var captured = {};
var nextId = 0;

app.set('views', __dirname);
app.set('view engine', 'ejs');
app.use(app.router);
app.use(express.static(__dirname));

app.get('/', function(req, res)
{
  res.render('index.ejs', {
    open: '{{',
    close: '}}',
    capturing: capturing,
    captured: Object.keys(captured).map(function(id) { return captured[id]; }),
    clientEndpointAddress: clientEndpointAddress,
    serverEndpointAddress: serverEndpointAddress
  });
});

var clientSocket = dgram.createSocket('udp4');
var serverSocket4 = dgram.createSocket('udp4');
var serverSocket6 = dgram.createSocket('udp6');

clientSocket.on('message', function(messageBuffer, rinfo)
{
  setEndpointAddress('client', rinfo.address, rinfo.port);

  onMessage('client', messageBuffer);
});

clientSocket.bind(
  process.argv.length > 2
    ? parseInt(process.argv[2], 10)
    : DEFAULT_CLIENT_SOCKET_PORT,
  function()
  {
    console.log("Listening for CoAP requests on port %d", this.address().port);
  }
);

serverSocket4.on('message', onMessage.bind(null, 'server'));

serverSocket6.on('message', onMessage.bind(null, 'server'));

io.sockets.on('connection', function(socket)
{
  socket.on('toggle capture', function(state)
  {
    capturing = !!state;

    socket.broadcast.emit('capture toggled', capturing);

    console.log('Capturing turned %s', capturing ? 'ON': 'OFF');
  });

  socket.on('set endpoint address', function(type, address, port)
  {
    setEndpointAddress(type, address, port, socket);
  });

  socket.on('clear', function()
  {
    captured = {};

    socket.broadcast.emit('cleared');

    console.log('Cleared all captured messages');
  });

  socket.on('drop message', function(messageId)
  {
    var message = captured[messageId];

    if (typeof message === 'undefined' || message.state !== 'captured')
    {
      return;
    }

    message.state = 'dropped';
    message.actionTime = Date.now();

    socket.broadcast.emit('message dropped', messageId);

    console.log('Dropped a %s message #%d', message.source, messageId);
  });

  socket.on('forward message', function(messageId)
  {
    var message = captured[messageId];

    if (typeof message === 'undefined' || message.state !== 'captured')
    {
      return;
    }

    message.state = 'forwarded';
    message.actionTime = Date.now();

    socket.broadcast.emit('message forwarded', messageId);

    forwardMessage(message);
  });
});

server.listen(HTTP_PORT, function()
{
  console.log("Listening for HTTP requests on port %d", HTTP_PORT);
});

function onMessage(source, messageBuffer)
{
  var coapMessage = Message.fromBuffer(messageBuffer);
  var message = prepareMessage(source, coapMessage, messageBuffer);

  io.sockets.emit('message', message);

  captured[nextId] = message;

  if (capturing)
  {
    console.log('Captured a %s message #%d:', message.source, message.id);
    console.log(coapMessage.toString());
  }
  else
  {
    forwardMessage(message);

    console.log(coapMessage.toString());
  }
}

function prepareMessage(source, coapMessage, messageBuffer)
{
  var data = coapMessage.toJSON();

  data.typeString = Message.getTypeString(data.type);
  data.codeDescription = codeRegistry.get(data.code).description;
  data.buffer = messageBuffer.toJSON();
  data.options = data.options.map(function(option)
  {
    var optionDefinition = optionNumberRegistry.get(option.number);

    option.name = optionDefinition.name;
    option.dataString = optionDefinition.toString(new Buffer(option.data));

    return option;
  });

  var contentFormat = coapMessage.getContentFormat();

  if (contentFormat === -1)
  {
    data.payloadString = null;
  }
  else
  {
    data.payloadString = contentFormatRegistry.get(contentFormat).prettyPrint(coapMessage.getPayload());

    if (/^\\<Buffer( [0-9a-f]{2})*>$/.test(data.payloadString))
    {
      data.payloadString = null;
    }
  }

  return {
    id: ++nextId,
    source: source,
    coapMessage: data,
    time: Date.now(),
    state: capturing ? 'captured' : 'forwarded',
    actionTime: Date.now()
  };
}

function setEndpointAddress(type, address, port, socket)
{
  var endpointAddress = new EndpointAddress(address, port);

  if (type === 'client')
  {
    clientEndpointAddress = endpointAddress;
  }
  else
  {
    serverEndpointAddress = endpointAddress;
  }

  if (socket)
  {
    socket.broadcast.emit('endpoint address set', type, endpointAddress.toString());
  }
  else
  {
    io.sockets.emit('endpoint address set', type, endpointAddress.toString());
  }

  console.log(
    '%s endpoint address changed to %s',
    type === 'client' ? 'Client' : 'Server',
    endpointAddress
  );
}

function forwardMessage(message)
{
  var socket;
  var endpointAddress;

  if (message.source === 'client')
  {
    socket = serverEndpointAddress.isIPv6() ? serverSocket6 : serverSocket4;
    endpointAddress = serverEndpointAddress;
  }
  else
  {
    socket = clientSocket;
    endpointAddress = clientEndpointAddress;
  }

  var buffer = new Buffer(message.coapMessage.buffer);

  socket.send(
    buffer,
    0,
    buffer.length,
    endpointAddress.getPort(),
    endpointAddress.getAddress()
  );

  console.log('Forwarded a %s message #%d', message.source, message.id);
}
