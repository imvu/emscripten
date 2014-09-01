var LibraryTracing = {
  $EmscriptenTrace__deps: ['emscripten_get_now', 'emscripten_trace_js_configure', 'emscripten_trace_js_log_message'],
  $EmscriptenTrace: {
    configured: false,
    worker: null,
    enabled: false,

    EVENT_ALLOCATE: 'allocate',
    EVENT_ANNOTATE_TYPE: 'annotate-type',
    EVENT_APPLICATION_NAME: 'application-name',
    EVENT_ENTER_CONTEXT: 'enter-context',
    EVENT_EXIT_CONTEXT: 'exit-context',
    EVENT_FRAME_END: 'frame-end',
    EVENT_FRAME_RATE: 'frame-rate',
    EVENT_FRAME_START: 'frame-start',
    EVENT_FREE: 'free',
    EVENT_LOG_MESSAGE: 'log-message',
    EVENT_MEMORY_LAYOUT: 'memory-layout',
    EVENT_OFF_HEAP: 'off-heap',
    EVENT_REALLOCATE: 'reallocate',
    EVENT_REPORT_ERROR: 'report-error',
    EVENT_SESSION_NAME: 'session-name',
    EVENT_USER_NAME: 'user-name',

    worker_script: [
      'var collector_url = "";\n',
      'var session_id = "";\n',
      'var queue = [];\n',
      'var timeout = undefined;\n',
      'var SEND_TIMEOUT = 500;\n',
      'var CLOSE_TIMEOUT = 1000;\n',
      'function send(entry) {\n',
      '  queue.push(entry);\n',
      '  if (timeout == undefined) {\n',
      '    timeout = setTimeout(sendToServer, SEND_TIMEOUT);\n',
      '  }\n',
      '};\n',
      'function sendToServer() {\n',
      '  var request = new XMLHttpRequest();\n',
      '  request.open("POST", collector_url);\n',
      '  request.onreadystatechange = function() {\n',
      '    if (request.readyState === 4) {\n',
      '        if (queue.length > 0) {\n',
      '          timeout = setTimeout(sendToServer, SEND_TIMEOUT);\n',
      '        } else {\n',
      '          timeout = undefined;\n',
      '        }\n',
      '    }\n',
      '  };\n',
      ' request.setRequestHeader("Content-Type", "application/json");\n',
      ' var q = queue;\n',
      ' queue = [];\n',
      ' request.send(JSON.stringify([session_id, q]));\n',
      '};\n',
      'function attemptClose() {\n',
      '  if ((timeout == undefined) && (queue.length == 0)) {\n',
      '    self.close();\n',
      '  } else {\n',
      '    setTimeout(attemptClose, CLOSE_TIMEOUT);\n',
      '  }\n',
      '};\n',
      'self.addEventListener("message", function(e) {\n',
      '  var message = e.data;\n',
      '  var cmd = message.cmd;\n',
      '  if (cmd == "post") {\n',
      '    send(message.entry);\n',
      '  } else if (cmd == "configure") {\n',
      '    collector_url = message.url;\n',
      '    session_id = message.session_id;\n',
      '  } else if (cmd == "close") {\n',
      '    attemptClose();\n',
      '  }\n',
      '}, false);\n',
    ],

    configure: function(collector_url, application) {
      var now = new Date();
      var session_id = now.getTime().toString() + '_' +
                          Math.floor((Math.random() * 100) + 1).toString();
      var blob = new Blob(EmscriptenTrace.worker_script, { type: 'text/javascript' });
      var blob_url = window.URL.createObjectURL(blob);
      EmscriptenTrace.worker = new Worker(blob_url);
      EmscriptenTrace.worker.addEventListener('error', function (e) {
        console.log('TRACE WORKER ERROR:');
        console.log(e);
      }, false);
      EmscriptenTrace.worker.postMessage({'cmd': 'configure',
                                          'session_id': session_id,
                                          'url': collector_url});
      EmscriptenTrace.configured = true;
      EmscriptenTrace.enabled = true;
      EmscriptenTrace.post([EmscriptenTrace.EVENT_APPLICATION_NAME, application]);
      EmscriptenTrace.post([EmscriptenTrace.EVENT_SESSION_NAME, now.toISOString()]);
    },

    post: function(entry) {
      if (EmscriptenTrace.configured && EmscriptenTrace.enabled) {
        EmscriptenTrace.worker.postMessage({'cmd': 'post',
                                            'entry': entry});
      }
    },
  },

  emscripten_trace_js_configure: function(collector_url, application) {
    EmscriptenTrace.configure(collector_url, application);
  },

  emscripten_trace_configure: function(collector_url, application) {
    EmscriptenTrace.configure(Pointer_stringify(collector_url),
                              Pointer_stringify(application));
  },

  emscripten_trace_set_enabled: function(enabled) {
    EmscriptenTrace.enabled = !!enabled;
  },

  emscripten_trace_set_session_username: function(username) {
    EmscriptenTrace.post(EmscriptenTrace.EVENT_USER_NAME, Pointer_stringify(username));
  },

  emscripten_trace_record_frame_start: function() {
    if (EmscriptenTrace.enabled) {
      var now = _emscripten_get_now();
      EmscriptenTrace.post([EmscriptenTrace.EVENT_FRAME_START, now]);
    }
  },

  emscripten_trace_record_frame_end: function() {
    if (EmscriptenTrace.enabled) {
      var now = _emscripten_get_now();
      EmscriptenTrace.post([EmscriptenTrace.EVENT_FRAME_END, now]);
    }
  },

  emscripten_trace_js_log_message: function(channel, message) {
    if (EmscriptenTrace.enabled) {
      var now = _emscripten_get_now();
      EmscriptenTrace.post([EmscriptenTrace.EVENT_LOG_MESSAGE, now,
                            channel, message]);
    }
  },

  emscripten_trace_log_message: function(channel, message) {
    if (EmscriptenTrace.enabled) {
      var now = _emscripten_get_now();
      EmscriptenTrace.post([EmscriptenTrace.EVENT_LOG_MESSAGE, now,
                            Pointer_stringify(channel),
                            Pointer_stringify(message)]);
    }
  },

  emscripten_trace_report_error: function(error) {
    var now = _emscripten_get_now();
    var callstack = (new Error).stack;
    EmscriptenTrace.post([EmscriptenTrace.EVENT_REPORT_ERROR, now,
                          Pointer_stringify(error), callstack]);
  },

  emscripten_trace_record_allocation: function(address, size) {
    if (EmscriptenTrace.enabled) {
      var now = _emscripten_get_now();
      EmscriptenTrace.post([EmscriptenTrace.EVENT_ALLOCATE,
                            now, address, size]);
    }
  },

  emscripten_trace_record_reallocation: function(old_address, new_address, size) {
    if (EmscriptenTrace.enabled) {
      var now = _emscripten_get_now();
      EmscriptenTrace.post([EmscriptenTrace.EVENT_REALLOCATE,
                            now, old_address, new_address, size]);
    }
  },

  emscripten_trace_record_free: function(address) {
    if (EmscriptenTrace.enabled) {
      var now = _emscripten_get_now();
      EmscriptenTrace.post([EmscriptenTrace.EVENT_FREE,
                            now, address]);
    }
  },

  emscripten_trace_annotate_address_type: function(address, type_name) {
    if (EmscriptenTrace.enabled) {
      EmscriptenTrace.post([EmscriptenTrace.EVENT_ANNOTATE_TYPE, address,
                            Pointer_stringify(type_name)]);
    }
  },

  emscripten_trace_report_memory_layout: function() {
    if (EmscriptenTrace.enabled) {
      var memory_layout = {
        'static_base':  STATIC_BASE,
        'static_top':   STATICTOP,
        'stack_base':   STACK_BASE,
        'stack_top':    STACKTOP,
        'stack_max':    STACK_MAX,
        'dynamic_base': DYNAMIC_BASE,
        'dynamic_top':  DYNAMICTOP,
        'total_memory': TOTAL_MEMORY
      };
      var now = _emscripten_get_now();
      EmscriptenTrace.post([EmscriptenTrace.EVENT_MEMORY_LAYOUT,
                            now, memory_layout]);
    }
  },

  emscripten_trace_report_off_heap_data: function () {
    function openal_audiodata_size() {
      if (typeof AL == 'undefined' || !AL.currentContext) {
        return 0;
      }
      var totalMemory = 0;
      for (var i in AL.currentContext.buf) {
        var buffer = AL.currentContext.buf[i];
        for (var channel = 0; channel < buffer.numberOfChannels; ++channel) {
          totalMemory += buffer.getChannelData(channel).length * 4;
        }
      }
      return totalMemory;
    }
    if (EmscriptenTrace.enabled) {
      var off_heap_data = {
        'openal': openal_audiodata_size()
      }
      var now = _emscripten_get_now();
      EmscriptenTrace.post([EmscriptenTrace.EVENT_OFF_HEAP, now, off_heap_data]);
    }
  },

  emscripten_trace_enter_context: function(name) {
    if (EmscriptenTrace.enabled) {
      var now = _emscripten_get_now();
      EmscriptenTrace.post([EmscriptenTrace.EVENT_ENTER_CONTEXT,
                            now, Pointer_stringify(name)]);
    }
  },

  emscripten_trace_exit_context: function() {
    if (EmscriptenTrace.enabled) {
      var now = _emscripten_get_now();
      EmscriptenTrace.post([EmscriptenTrace.EVENT_EXIT_CONTEXT, now]);
    }
  },

  emscripten_trace_close: function() {
    EmscriptenTrace.configured = false;
    EmscriptenTrace.enabled = false;
    EmscriptenTrace.worker.postMessage({'cmd': 'close'});
    EmscriptenTrace.worker = null;
  },
};

autoAddDeps(LibraryTracing, '$EmscriptenTrace');
mergeInto(LibraryManager.library, LibraryTracing);
