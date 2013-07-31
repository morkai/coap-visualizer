$(function()
{
  /*jshint maxlen:999*/
  /*globals window,$,_,io*/
  'use strict';

  var socket = io.connect();

  var $capture = $('#capture');
  var $messages = $('#messages');
  var $br = $messages.children('br').first();
  var $arrowDown = $('#arrow-down');
  var $arrowRight = $('<div class="arrow arrow-right"></div>');
  var $arrowLeft = $('<div class="arrow arrow-left"></div>');
  var $actionDrop = $('<button class="message-action message-action-drop">Drop</button>');
  var $actionForward = $('<button class="message-action message-action-forward">Forward</button>');
  var renderMessageBoxInner = _.template($('#messageBoxInnerTpl').detach().html());

  socket.on('message', addMessage);

  socket.on('capture toggled', function(newState)
  {
    console.log('[capture toggled] newState= %s', newState);

    $capture[0].checked = newState;
  });

  socket.on('endpoint address set', function(type, address)
  {
    console.log('[endpoint address set] type= %s address= %s', type, address);

    $('#endpoint-' + type).val(address);
  });

  socket.on('cleared', clear);

  socket.on('message dropped', function(messageId)
  {
    changeMessageState(messageId, 'dropped');
  });

  socket.on('message forwarded', function(messageId)
  {
    changeMessageState(messageId, 'forwarded');
  });

  $capture.on('change', function()
  {
    socket.emit('toggle capture', this.checked);
  });

  $('#clear').on('click', function()
  {
    socket.emit('clear');

    clear();
  });

  $('#endpoint-client').on('change', function()
  {
    setEndpointAddress('client', this.value);
  });

  $('#endpoint-server').on('change', function()
  {
    setEndpointAddress('server', this.value);
  });

  $messages.on('click', '.message-action', function()
  {
    var $action = $(this);
    var action = $action.hasClass('message-action-forward') ? 'forward' : 'drop';
    var messageId = parseInt($action.closest('.message-container').attr('data-id'), 10);

    socket.emit(action + ' message', messageId);

    changeMessageState(messageId, action === 'forward' ? 'forwarded' : 'dropped');
  });

  $messages.on('click', '.message-payload-readable-toggle', function()
  {
    var $payload = $(this).closest('.message-payload');

    if (this.checked)
    {
      $payload.find('.message-payload-buffer').hide();
      $payload.find('.message-payload-readable').show();
    }
    else
    {
      $payload.find('.message-payload-readable').hide();
      $payload.find('.message-payload-buffer').show();
    }

    resizeArrow();
  });

  $(window).resize(function() { resizeArrow(); });

  resizeArrow();

  if (Array.isArray(window.CAPTURED_MESSAGES))
  {
    window.CAPTURED_MESSAGES.forEach(addMessage);
    delete window.CAPTURED_MESSAGES;
  }

  function changeMessageState(messageId, newState)
  {
    var $message = $messages.find('.message-container[data-id="' + messageId + '"]');

    if ($message.length === 0)
    {
      return;
    }

    $message
      .removeClass('message-captured')
      .addClass('message-' + newState);

    $message.find('.message-action').remove();

    var $actionTime = $('<div></div>')
      .addClass('message-time-action')
      .text(getTimeString(Date.now()));

    $message.find('.message-box').prepend($actionTime);

    $message.find('.arrow').attr('title', newState === 'dropped' ? 'Dropped' : 'Forwarded');
  }

  function addMessage(message)
  {
    console.log('[message] message=', message);

    var coapMessage = message.coapMessage;

    var messageBoxInner = renderMessageBoxInner({
      classNames: getClassNameForCoapMessage(coapMessage),
      typeBits: toBitsString(coapMessage.type, 2),
      typeName: coapMessage.typeString,
      tokenLengthBits: toBitsString(coapMessage.token.length, 4),
      tokenLength: coapMessage.token.length,
      tokenBytes: coapMessage.token.map(toHexString).join(' '),
      codeClassBits: toBitsString((coapMessage.code & 224) >> 5, 3),
      codeDetailBits: toBitsString(coapMessage.code & 31, 5),
      codeName: coapMessage.codeDescription,
      id: coapMessage.id,
      idHex: '0x' + lpad(coapMessage.id.toString(16), '0', 4).toUpperCase(),
      options: coapMessage.options,
      payloadLength: coapMessage.payload.length,
      payloadBytes: coapMessage.payload.map(toHexString).join(' '),
      payloadString: coapMessage.payloadString
    });

    var $arriveTime = $('<div></div>')
      .addClass('message-time-arrive')
      .attr('title', 'Arrived at')
      .text(getTimeString(message.time));

    var $arrow = (message.source === 'client' ? $arrowRight : $arrowLeft).clone();

    var $messageBox = $('<div></div>')
      .addClass('message-box')
      .append($arriveTime)
      .append($arrow)
      .append(messageBoxInner);

    if (message.state === 'captured')
    {
      $messageBox
        .prepend($actionDrop.clone())
        .prepend($actionForward.clone());

      $arrow.attr('title', 'Captured');
    }
    else
    {
      var $actionTime = $('<div></div>')
        .addClass('message-time-action')
        .attr('title', message.state === 'dropped' ? 'Dropped at' : 'Forwarded at')
        .text(getTimeString(message.actionTime));

      $messageBox.prepend($actionTime);

      $arrow.attr('title', message.state === 'dropped' ? 'Dropped' : 'Forwarded');
    }

    var $messageContainer = $('<div></div>')
      .attr('data-id', message.id)
      .addClass('message-container message-' + message.source + ' message-' + message.state)
      .append($messageBox)
      .hide()
      .insertBefore($br)
      .fadeIn();

    if (coapMessage.payloadString === null)
    {
      $messageContainer
        .find('.message-payload-readable-toggle')
        .click()
        .attr('disabled', true);
    }

    resizeArrow();
  }

  function resizeArrow()
  {
    $arrowDown.height($messages.height() + 60);
  }

  function clear()
  {
    var $messageContainers = $messages.find('.message-container');

    if ($messageContainers.length > 10)
    {
      $messageContainers.remove();
      resizeArrow();
    }
    else
    {
      $messageContainers.fadeOut(function()
      {
        $messageContainers.remove();
        resizeArrow();
      });
    }

    console.log('[cleared]');
  }

  function setEndpointAddress(type, address)
  {
    var bracketPos = address.lastIndexOf(']');
    var host;
    var port;

    if (bracketPos === -1)
    {
      address = address.split(':');
      host = address[0];
      port = address[1];
    }
    else
    {
      host = address.substring(1, bracketPos);
      port = address.substr(bracketPos + 2);
    }

    socket.emit(
      'set endpoint address', type, host, parseInt(port || 0, 10)
    );
  }


  function getClassNameForCoapMessage(message)
  {
    /*jshint bitwise:false*/

    if (message.code === 0)
    {
      return 'message-empty';
    }

    if (message.code <= 31)
    {
      return 'message-request';
    }

    var className = 'message-response';

    switch ((message.code & 226) >>> 5)
    {
      case 2:
        return className + ' ' + 'message-response-success';

      case 4:
        return className + ' ' + 'message-response-error-client';

      case 5:
        return className + ' ' + 'message-response-error-server';

      default:
        return className;
    }
  }

  function getTimeString(time)
  {
    var date = new Date(time);

    return lpad(date.getHours(), '0', 2)
      + ':' + lpad(date.getMinutes(), '0', 2)
      + ':' + lpad(date.getSeconds(), '0', 2)
      + '.' + lpad(date.getMilliseconds(), '0', 3);
  }

  function lpad(str, chr, length)
  {
    str = String(str);

    if (typeof chr === 'undefined')
    {
      chr = '0';
    }

    if (typeof length === 'undefined')
    {
      length = str.length + 1;
    }

    while (str.length < length)
    {
      str = chr + str;
    }

    return str;
  }

  function toHexString(val, prefix)
  {
    var str = val.toString(16);

    if (str.length % 2 !== 0)
    {
      str = '0' + str;
    }

    return (prefix === true ? '0x' : '') + str.toUpperCase();
  }

  function toBitsString(val, length)
  {
    return lpad(val.toString(2), '0', length).split('').join(' ');
  }
});
