from flask import abort, jsonify, request
from trace_collector import app, sessions
from trace_collector.decorators import crossdomain


@app.route('/api/v1/upload', methods=['POST', 'OPTIONS'])
@crossdomain(origin='*', headers=['Content-Type'])
def upload_data():
  data = request.json
  sessionID = data[0]
  for entry in data[1]:
    sessions.add_entry(sessionID, entry)
  return jsonify([])


@app.route('/api/v1/sessions')
@crossdomain(origin='*')
def session_index():
  return jsonify(data=sessions.session_list())


@app.route('/api/v1/session/<sessionID>/heap/events/')
@crossdomain(origin='*')
def session_heap_events_api(sessionID):
  session = sessions.session(sessionID)
  if session:
    return jsonify(data=session.get_view('heap').entries)
  else:
    abort(404)

@app.route('/api/v1/session/<sessionID>/heap/layout/')
@crossdomain(origin='*')
def session_heap_layout_api(sessionID):
  session = sessions.session(sessionID)
  if session:
    return jsonify(session.get_view('heap').heap_layout())
  else:
    abort(404)
